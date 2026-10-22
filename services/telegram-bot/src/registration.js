import { getConfig, httpsUrl } from './config.js';
import { telegramRequest } from './telegram.js';

export async function registerWebhook(env = process.env, fetcher = fetch) {
  const config = getConfig(env);
  const base = new URL(httpsUrl(env.BOT_PUBLIC_URL, 'BOT_PUBLIC_URL'));
  if (base.pathname !== '/' || base.search || base.hash) throw new Error('BOT_PUBLIC_URL must be an HTTPS origin without a path');
  const me = await telegramRequest(env.TELEGRAM_BOT_TOKEN, 'getMe', {}, fetcher);
  if (me.username?.toLowerCase() !== config.username.toLowerCase()) throw new Error('TELEGRAM_BOT_USERNAME does not match the bot token');
  const webhookUrl = new URL('/api/webhook', base).href;
  try {
    const health = await fetcher(new URL('/api/health', base), { signal: AbortSignal.timeout(15000) });
    if (!health.ok || (await health.json()).service !== 'telegram-bot') throw new Error();
    // A no-op update checks the deployed endpoint without sending a message.
    const check = await fetcher(webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 0 }), signal: AbortSignal.timeout(15000),
    });
    if (!check.ok || (await check.json()).ok !== true) throw new Error();
  } catch { throw new Error('Deployment check failed; verify BOT_PUBLIC_URL, deployed env and webhook access'); }
  await telegramRequest(env.TELEGRAM_BOT_TOKEN, 'setWebhook', {
    url: webhookUrl, allowed_updates: ['message'], drop_pending_updates: false,
  }, fetcher);
  return { username: config.username, webhookUrl };
}
