import React, { useState } from 'react';
import { Clock, CheckCircle2, Send } from 'lucide-react';
import { tg } from '../utils/telegram';
import { orderSync } from '../utils/orderSync';
import { formatTime } from '../utils/timing';

export default function OrderSuccessModal({ order, onReset, telegramNotifications }) {
  const [enabled, setEnabled] = useState(Boolean(order?.notificationsEnabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!order) return <div className="p-6"><button onClick={onReset}>До меню</button></div>;
  const track = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (!tg.isAvailable) { setError('Для сповіщень відкрийте меню в Telegram: @shaurmisha_pl_bot.'); return; }
      if (!telegramNotifications) { setError('Сповіщення тимчасово недоступні. Зверніться до закладу, щоб уточнити готовність.'); return; }
      if (!enabled) {
        const allowed = await tg.requestNotifications();
        if (!allowed) { setError('Дозвольте боту надсилати повідомлення, щоб отримувати статус замовлення.'); return; }
        await orderSync.enableNotifications(order);
        setEnabled(true);
      }
      tg.trackInBot();
    } catch (error) { setError(error.message || 'Не вдалося підключити сповіщення. Спробуйте ще раз.'); }
    finally { setBusy(false); }
  };
  const readyAt = order.confirmedReadyAt || order.baselineReadyAt;
  return (
    <div className="w-full min-w-0 px-2 pt-4 pb-12 animate-fade-in">
      <div className="w-full bg-zinc-900 rounded-2xl px-4 py-5 border border-zinc-800 space-y-5 text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-400" />
        <h2 className="text-2xl font-bold tracking-tight">Замовлення #{order.id} оформлено</h2>
        <p className="text-sm text-zinc-400">Кухня отримала замовлення. Оплата при отриманні.</p>
        <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-400 flex justify-center gap-2 items-center"><Clock size={14} /> Попередній час готовності</p>
          <p className="text-4xl font-semibold tracking-tight text-orange-400 my-2">{readyAt ? formatTime(readyAt, order.timeZone) : 'Уточнюємо'}</p>
          {order.timingAdjusted && <p className="text-xs text-amber-300">Обраний слот став неактуальним. Час автоматично оновлено.</p>}
        </div>
        <ul aria-label="Склад замовлення" className="space-y-3 text-left">
          {order.items?.map((item, index) => <li key={index} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <span className="shrink-0 rounded-lg bg-zinc-800 px-2 py-1 text-sm font-bold">{item.qty} ×</span>
            <div><p className="text-sm font-semibold leading-relaxed">{item.name}</p>
            </div>
          </li>)}
        </ul>
        <div className="text-sm text-left border-t border-zinc-800 pt-4 space-y-2">
          <p>Сума: <strong>{order.totalPrice} ₴</strong></p>
          <p className="text-zinc-400">📍 {order.selectedLocation?.name || order.pointName}</p>
        </div>
        {!enabled && <p className="text-xs text-amber-300">Сповіщення ще не підключені. Натисніть кнопку нижче та дозвольте повідомлення від бота.</p>}
        {error && <p role="alert" className="rounded-xl border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">{error}</p>}
        <button disabled={busy} onClick={track} className="w-full bg-orange-500 rounded-xl p-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"><Send size={17} />{busy ? 'Підключаємо…' : 'Відстежувати статус'}</button>
        <p className="text-xs text-zinc-400">{enabled ? 'Статус замовлення надходитиме в чат бота.' : 'Для відстеження потрібен дозвіл на повідомлення в Telegram.'}</p>
        <button onClick={onReset} className="text-sm text-zinc-400 underline underline-offset-4">Повернутися до меню</button>
      </div>
    </div>
  );
}
