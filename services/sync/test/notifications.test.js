import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNotifications } from '../notifications.js';
const order = { id: '1001', createdAt: 1, telegramUserId: 12345, notificationsEnabled: true,
  timeZone: 'Europe/Kyiv', baselineReadyAt: Date.parse('2026-10-23T09:00:00Z'),
  confirmedReadyAt: Date.parse('2026-10-23T09:15:00Z'), kitchenDelayMinutes: 15,
  totalPrice: 200, items: [{ qty: 1, name: 'Фірмова шаурма', toasting: 'Сильніше' }], selectedLocation: { name: 'Полтава, Соборності, 46' } };
const success = { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 42 } }) };

test('durable queue survives restart and deduplicates cooking/ready even after backwards API transitions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'telegram-queue-'));
  let db = new DatabaseSync(join(directory, 'test.sqlite'));
  const sent = [];
  const options = { token: 'test-token', fetcher: async (_, request) => { sent.push(JSON.parse(request.body)); return success; } };
  try {
    let queue = createNotifications(db, options);
    for (const kind of ['placed', 'confirmed', 'cooking', 'ready', 'cooking', 'ready']) queue.enqueue(order, kind);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_outbox').get().count, 4);
    db.close(); db = new DatabaseSync(join(directory, 'test.sqlite'));
    queue = createNotifications(db, options);
    for (let i = 0; i < 6; i++) await queue.tick();
    assert.equal(sent.length, 4);
    assert.ok(sent.every(message => message.chat_id === 12345));
    assert.match(sent[0].text, /Фірмова шаурма/);
    assert.match(sent[0].text, /200 ₴/);
    assert.match(sent[1].text, /12:15/);
    assert.match(sent[2].text, /готується/);
    assert.match(sent[3].text, /готове до видачі/);
    assert.match(sent[3].text, /Соборності, 46/);
    queue.enqueue(order, 'ready'); await queue.tick();
    assert.equal(sent.length, 4);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('429 respects retry_after and keeps message order; no concurrent double send', async () => {
  const db = new DatabaseSync(':memory:'); let clock = 1000; let calls = 0;
  try {
    const queue = createNotifications(db, { token: 'test-token', now: () => clock, fetcher: async () => {
      calls++; return calls === 1 ? { ok: false, status: 429, json: async () => ({ parameters: { retry_after: 30 } }) } : success;
    } });
    queue.enqueue(order, 'placed'); queue.enqueue(order, 'cooking');
    await queue.tick(); await queue.tick();
    assert.equal(calls, 1);
    clock += 30001;
    await Promise.all([queue.tick(), queue.tick()]);
    assert.equal(calls, 2);
    await queue.tick(); assert.equal(calls, 3);
  } finally { db.close(); }
});
test('network errors retry, blocked bot becomes failed, browser/manual/declined orders do not send', async () => {
  const db = new DatabaseSync(':memory:'); let clock = 0; let fail = true;
  try {
    const queue = createNotifications(db, { token: 'test-token', now: () => clock, fetcher: async () => {
      if (fail) throw new Error('network failure');
      return { ok: false, status: 403, json: async () => ({ ok: false }) };
    } });
    queue.enqueue({ ...order, notificationsEnabled: false }, 'ready');
    queue.enqueue({ ...order, telegramUserId: null }, 'ready');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_outbox').get().count, 0);
    queue.enqueue(order, 'ready'); await queue.tick();
    assert.equal(db.prepare('SELECT state FROM telegram_outbox').get().state, 'pending');
    fail = false; clock = 100000; await queue.tick();
    assert.equal(db.prepare('SELECT state FROM telegram_outbox').get().state, 'failed');
    const disabled = createNotifications(db);
    disabled.enqueue({ ...order, id: 'other' }, 'placed');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_outbox').get().count, 1);
  } finally { db.close(); }
});
test('queue writes roll back with the order transaction', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const queue = createNotifications(db, { token: 'test-token' });
    db.exec('BEGIN'); queue.enqueue(order, 'placed'); db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_outbox').get().count, 0);
  } finally { db.close(); }
});
