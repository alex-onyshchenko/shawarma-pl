export function httpsUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a public HTTPS URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|\[::1\])/.test(url.hostname)) throw new Error(`${name} must be a public HTTPS URL`);
  return url.href;
}

export function getConfig(env = process.env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error('TELEGRAM_WEBHOOK_SECRET must contain 32–256 letters, digits, underscores or hyphens');
  const username = (env.TELEGRAM_BOT_USERNAME || 'shaurmisha_pl_bot').replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new Error('Invalid TELEGRAM_BOT_USERNAME');
  return { secret, username, miniAppUrl: httpsUrl(env.MINI_APP_URL, 'MINI_APP_URL') };
}
