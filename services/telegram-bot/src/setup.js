import { registerWebhook } from './registration.js';

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });

export function createSetupHandler(readEnv = () => process.env, register = registerWebhook) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    const env = readEnv();
    if (env.VERCEL && env.VERCEL_ENV !== 'production') return json({ error: 'Відкрий сторінку підключення на основній production-адресі бота.' }, 403);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Запит має надходити зі сторінки цього бота.' }, 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return json({ error: 'JSON required' }, 415);
    let token;
    try {
      if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'Request too large' }, 413);
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > 4096) return json({ error: 'Request too large' }, 413);
      token = JSON.parse(Buffer.from(bytes).toString('utf8'))?.token;
    } catch { return json({ error: 'Не вдалося прочитати запит.' }, 400); }
    if (typeof token !== 'string' || !/^\d{5,15}:[A-Za-z0-9_-]{20,200}$/.test(token)) return json({ error: 'Встав повний токен, отриманий від BotFather.' }, 400);
    // Only trusted server configuration selects the target. Never use Host,
    // request URLs or caller-provided fields to select a webhook destination.
    const publicUrl = env.BOT_PUBLIC_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
    if (!publicUrl) return json({ error: 'Додай BOT_PUBLIC_URL з основною адресою цього бот-проєкту в налаштування Vercel і зроби Redeploy.' }, 503);
    try {
      // getMe validates the supplied token belongs to the configured bot before
      // setWebhook. No token is written to disk, process.env or response data.
      const result = await register({ ...env, BOT_PUBLIC_URL: publicUrl, TELEGRAM_BOT_TOKEN: token });
      return json({ ok: true, username: result.username });
    } catch (error) {
      if (error.message === 'TELEGRAM_BOT_USERNAME does not match the bot token') return json({ error: 'Цей токен належить іншому боту. Перевір токен у BotFather.' }, 403);
      return json({ error: 'Не вдалося підключити бота. Перевір токен BotFather та доступність сервісу й спробуй ще раз.' }, 502);
    } finally { token = ''; }
  };
}

export const handleSetup = createSetupHandler();
