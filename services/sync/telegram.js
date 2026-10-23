import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

const fail = (message, status = 401) => { throw Object.assign(new Error(message), { status }); };
export const trackingHash = token => createHash('sha256').update(String(token)).digest('hex');

export function telegramUser(initData, token, now = Date.now()) {
  if (!initData) return null;
  if (!token) fail('Сповіщення Telegram ще не налаштовані. Спробуйте пізніше.', 503);
  if (typeof initData !== 'string' || initData.length > 16000) fail('Невірні дані Telegram');
  const params = new URLSearchParams(initData);
  if (new Set(params.keys()).size !== [...params.keys()].length) fail('Невірні дані Telegram');
  const hash = params.get('hash') || '';
  const authDate = Number(params.get('auth_date')) * 1000;
  if (!Number.isFinite(authDate) || authDate > now + 30000 || now - authDate > 86400000) fail('Сесію Telegram завершено. Відкрийте меню заново.');
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  const supplied = Buffer.from(hash, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) fail('Не вдалося перевірити користувача Telegram');
  let user;
  try { user = JSON.parse(params.get('user')); } catch { fail('Невірні дані користувача Telegram'); }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) fail('Невірний користувач Telegram');
  return user;
}

export function ownsOrder(order, { trackingToken, user }) {
  if (user && order.telegramUserId === user.id) return true;
  return typeof trackingToken === 'string' && trackingToken.length >= 32 && order.trackingTokenHash === trackingHash(trackingToken);
}

// Internal identity and access credentials must never enter public REST/SSE payloads.
export const publicJson = value => JSON.stringify(value, (key, data) => ['telegramUserId', 'trackingTokenHash'].includes(key) ? undefined : data);
