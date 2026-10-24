import { getConfig } from './config.js';

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export function createWebhookHandler(readConfig = () => getConfig(), fetcher = fetch) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    let config;
    try { config = readConfig(); } catch { return json({ error: 'Bot is not configured' }, 503); }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return json({ error: 'JSON required' }, 415);
    if (Number(request.headers.get('content-length') || 0) > 65536) return json({ error: 'Update too large' }, 413);
    let update;
    try {
      const body = await request.arrayBuffer();
      if (body.byteLength > 65536) return json({ error: 'Update too large' }, 413);
      update = JSON.parse(Buffer.from(body).toString('utf8'));
    } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) return json({ error: 'Invalid update' }, 400);
    const message = update.message;
    if (message?.contact) {
      if (message.chat?.type !== 'private' || message.from?.is_bot || message.from?.id !== message.chat.id || message.contact.user_id !== message.from.id) return json({ ok: true });
      if (!config.syncApiUrl) return json({ error: 'Contact synchronization is not configured' }, 503);
      const secret = request.headers.get('x-telegram-bot-api-secret-token');
      if (!secret || !/^[a-f0-9]{64}$/.test(secret)) return json({ error: 'Webhook verification required' }, 401);
      try {
        const response = await fetcher(config.syncApiUrl + '/api/telegram/contact', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
          body: JSON.stringify({ update_id: update.update_id, message: { date: message.date, chat: message.chat, from: { id: message.from.id, is_bot: false }, contact: { user_id: message.contact.user_id, phone_number: message.contact.phone_number } } }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return json({ error: 'Contact synchronization failed' }, response.status === 401 ? 401 : 502);
        return json({ ok: true });
      } catch { return json({ error: 'Contact synchronization unavailable' }, 502); }
    }
    if (message?.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) || message.from?.is_bot || typeof message.text !== 'string') return json({ ok: true });
    const command = message.text.match(/^\/(start|help)(?:@([A-Za-z0-9_]+))?(?:\s[\s\S]*)?$/i);
    if (!command || (command[2] && command[2].toLowerCase() !== config.username.toLowerCase())) return json({ ok: true });
    // Telegram executes this Bot API method from the webhook response.
    // No polling, database, outbound sendMessage request or bot token is needed here.
    return json({
      method: 'sendMessage',
      chat_id: message.chat.id,
      text: 'Вітаємо у ШаурМіша! 🌯\n\nПерегляньте наше меню: склад, розміри та ціни. Натисніть кнопку нижче, щоб відкрити застосунок.',
      reply_markup: { inline_keyboard: [[{ text: '🌯 Відкрити меню', web_app: { url: config.miniAppUrl } }]] },
    });
  };
}

export const handleWebhook = createWebhookHandler();
export function handleHealth(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
  try { const config = getConfig(); return json({ status: 'ok', service: 'telegram-bot', contactSyncConfigured: Boolean(config.syncApiUrl) }); }
  catch { return json({ status: 'not_configured', service: 'telegram-bot' }, 503); }
}
