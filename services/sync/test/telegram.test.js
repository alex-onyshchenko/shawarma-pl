import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { telegramUser, publicJson, ownsOrder, trackingHash } from '../telegram.js';

const token = 'test-token';
const now = Date.parse('2026-10-23T09:00:00Z');
function signed(values) {
  const params = new URLSearchParams({ auth_date: String(now / 1000), user: JSON.stringify({ id: 12345, first_name: 'Test' }), ...values });
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('\n');
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
test('Telegram identity requires a valid signature, a fresh session and the correct bot token', () => {
  assert.equal(telegramUser(signed(), token, now).id, 12345);
  assert.equal(telegramUser('', token, now), null);
  assert.throws(() => telegramUser(signed(), '', now), { status: 503 });
  assert.throws(() => telegramUser(signed(), 'other-token', now), { status: 401 });
  assert.throws(() => telegramUser(signed().replace('Test', 'Forged'), token, now), { status: 401 });
  assert.throws(() => telegramUser(signed({ auth_date: String(now / 1000 - 86401) }), token, now), { status: 401 });
  assert.throws(() => telegramUser(signed({ auth_date: String(now / 1000 + 60) }), token, now), { status: 401 });
  assert.throws(() => telegramUser(signed() + '&user={}', token, now), { status: 401 });
  assert.throws(() => telegramUser(signed({ user: '{"id":-1}' }), token, now), { status: 401 });
});
test('public payloads redact internal Telegram recipients and retry credentials', () => {
  const order = { id: '1001', telegramUserId: 12345, trackingTokenHash: trackingHash('a'.repeat(64)) };
  assert.deepEqual(JSON.parse(publicJson({ order })), { order: { id: '1001' } });
  assert.ok(ownsOrder(order, { user: { id: 12345 } }));
  assert.ok(ownsOrder(order, { trackingToken: 'a'.repeat(64) }));
  assert.ok(!ownsOrder(order, { user: { id: 333 } }));
  assert.ok(!ownsOrder(order, { trackingToken: 'b'.repeat(64) }));
});
