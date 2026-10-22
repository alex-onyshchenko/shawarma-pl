import { getConfig } from './config.js';

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export function createWebhookHandler(readConfig = () => getConfig()) {
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
  try { getConfig(); return json({ status: 'ok', service: 'telegram-bot' }); }
  catch { return json({ status: 'not_configured', service: 'telegram-bot' }, 503); }
}
