export function httpsUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a public HTTPS URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|\[::1\])/.test(url.hostname)) throw new Error(`${name} must be a public HTTPS URL`);
  return url.href;
}

export function getConfig(env = process.env) {
  const username = (env.TELEGRAM_BOT_USERNAME || 'shaurmisha_pl_bot').replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new Error('Invalid TELEGRAM_BOT_USERNAME');
  return { username, miniAppUrl: httpsUrl(env.MINI_APP_URL, 'MINI_APP_URL'), ...(env.SYNC_API_URL ? { syncApiUrl: httpsUrl(env.SYNC_API_URL, 'SYNC_API_URL').replace(/\/$/, '') } : {}) };
}
