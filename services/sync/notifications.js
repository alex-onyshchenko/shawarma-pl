import { formatTime } from './timing.js';

export function notificationText(order, kind) {
  const at = formatTime(order.confirmedReadyAt || order.baselineReadyAt, order.timeZone);
  if (kind === 'placed') {
    const items = order.items.map(item => `${item.qty} × ${item.name}`).join('\n');
    return `✅ Замовлення #${order.id} оформлено!\n${items}\n\nСума: ${order.totalPrice} ₴. Оплата при отриманні.\nПопередній час видачі: ${at}. Повідомимо, коли почнемо готувати.\n📍 ${order.selectedLocation?.name || order.pointName}`.slice(0, 4000);
  }
  if (kind.startsWith('time_changed:')) return `⏱ Час видачі замовлення #${order.id} змінено: ${new Intl.DateTimeFormat('uk-UA', { timeZone: order.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(order.confirmedReadyAt)}. Чекаємо на вас!`;
  if (kind === 'cancelled') return `Замовлення #${order.id} скасовано.\n${order.cancellationComment.trim()}`;
  if (kind === 'confirmed') return order.kitchenDelayMinutes > 0
    ? `⚠️ Замовлення #${order.id} вже в черзі! Через навантаження кухні новий час видачі — ${at}. Дякуємо за розуміння!`
    : `🎯 Час видачі замовлення #${order.id} підтверджено: ${at}. Оплата при отриманні. Чекаємо на вас!`;
  if (kind === 'no_show') return `Замовлення #${order.id} позначене як невикуплене. Надалі замовлення доступні лише за повною онлайн-передоплатою. Поки онлайн-оплату не підключено, оформлення у застосунку тимчасово недоступне. Меню залишається доступним.`;
  if (kind === 'cooking') return `🔥 Ваше замовлення #${order.id} вже готується!\nОрієнтовний час видачі: ${at}.\nПовідомимо, щойно все буде готово.`;
  return `✅ Замовлення #${order.id} готове до видачі!\n📍 ${order.selectedLocation?.name || order.pointName}\nЧекаємо на вас. Смачного!`;
}

export function createNotifications(db, { token = '', fetcher = fetch, now = Date.now } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS telegram_outbox (
    id INTEGER PRIMARY KEY, order_key TEXT NOT NULL, kind TEXT NOT NULL,
    chat_id INTEGER NOT NULL, text TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    next_at INTEGER NOT NULL DEFAULT 0, message_id INTEGER,
    UNIQUE(order_key, kind)
  )`);
  const key = order => `${order.createdAt}:${order.id}`;
  let busy = false;
  function cancel(order) { db.prepare("UPDATE telegram_outbox SET state='cancelled' WHERE order_key=? AND state='pending'").run(key(order)); }
  function enqueue(order, kind) {
    if (kind === 'cancelled') {
      if (!order.cancellationComment?.trim()) { cancel(order); return; }
      db.prepare("UPDATE telegram_outbox SET state='cancelled' WHERE order_key=? AND state='pending' AND kind!='cancelled'").run(key(order));
    }
    if (!token || !order?.telegramUserId || !order.notificationsEnabled) return;
    if (kind === 'no_show') db.prepare("UPDATE telegram_outbox SET state='cancelled' WHERE order_key=? AND state='pending' AND kind!=?").run(key(order), kind);
    db.prepare('INSERT OR IGNORE INTO telegram_outbox(order_key,kind,chat_id,text,next_at) VALUES(?,?,?,?,?)')
      .run(key(order), kind, order.telegramUserId, notificationText(order, kind), now());
  }
  async function tick() {
    if (busy || !token) return;
    busy = true;
    try {
      // Keep per-order messages in order; different orders may continue independently.
      const job = db.prepare(`SELECT * FROM telegram_outbox q WHERE state='pending' AND next_at<=?
        AND NOT EXISTS(SELECT 1 FROM telegram_outbox older WHERE older.order_key=q.order_key AND older.id<q.id AND older.state='pending')
        ORDER BY id LIMIT 1`).get(now());
      if (!job) return;
      let retry = 0;
      let permanent = false;
      try {
        const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: job.chat_id, text: job.text }), signal: AbortSignal.timeout(10000),
        });
        const data = await response.json();
        if (response.ok && data.ok) {
          db.prepare("UPDATE telegram_outbox SET state='sent',message_id=? WHERE id=?").run(data.result?.message_id || null, job.id);
          return;
        }
        permanent = [400, 401, 403, 404].includes(response.status);
        retry = Number(data.parameters?.retry_after) || 0;
      } catch { /* Do not log fetch errors: their URL contains the bot token. */ }
      const attempts = job.attempts + 1;
      db.prepare('UPDATE telegram_outbox SET state=?,attempts=?,next_at=? WHERE id=?').run(
        permanent ? 'failed' : 'pending', attempts, now() + Math.max(retry * 1000, Math.min(3600000, 2000 * 2 ** Math.min(attempts, 10))), job.id);
    } finally { busy = false; }
  }
  return { enqueue, cancel, tick, configured: Boolean(token) };
}
