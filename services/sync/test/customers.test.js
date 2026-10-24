import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCustomers, webhookSecret } from '../customers.js';
import { contact, testBotToken } from './fixtures/telegram.js';

test('only signed self-contacts verify a phone; old deliveries cannot overwrite it or reset a permanent restriction', () => {
  const directory = mkdtempSync(join(tmpdir(), 'customer-policy-')); const filename = join(directory, 'test.sqlite');
  let db = new DatabaseSync(filename);
  try {
    let customers = createCustomers(db, testBotToken);
    assert.throws(() => customers.contact(contact(), 'fake'), { status: 401 });
    const foreign = contact(); foreign.message.contact.user_id = 99;
    assert.equal(customers.contact(foreign, webhookSecret(testBotToken)).ignored, true);
    assert.equal(customers.profile(12345).phoneVerified, false);
    customers.contact(contact(), webhookSecret(testBotToken));
    assert.equal(customers.profile(12345).phoneNumber, '+380501234567');
    customers.restrict(12345, 'order-1');
    customers.contact(contact(12345, 2, '+380671112233'), webhookSecret(testBotToken));
    customers.contact(contact(), webhookSecret(testBotToken));
    assert.equal(customers.profile(12345).phoneNumber, '+380671112233');
    assert.equal(customers.profile(12345).prepaymentOnly, true);
    db.close(); db = new DatabaseSync(filename); customers = createCustomers(db, testBotToken);
    assert.equal(customers.profile(12345).prepaymentOnly, true);
    assert.equal(customers.get(12345).no_show_order_id, 'order-1');
    customers.restrict(777, 'old-order-without-contact');
    customers.contact(contact(777, 3), webhookSecret(testBotToken));
    assert.equal(customers.profile(777).prepaymentOnly, true);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('verified identity, aggregated product limits and cash threshold cannot be overridden by client payment fields', () => {
  const db = new DatabaseSync(':memory:'); const customers = createCustomers(db, testBotToken);
  try {
    const quote = { items: [{ productId: 'a', qty: 1 }], totalPrice: 500 };
    assert.throws(() => customers.checkOrder(null, quote, {}), { status: 401, code: 'PHONE_REQUIRED' });
    assert.throws(() => customers.checkOrder({ id: 12345 }, quote, { phoneNumber: '+380501234567' }), { status: 403 });
    customers.contact(contact(), webhookSecret(testBotToken));
    assert.equal(customers.checkOrder({ id: 12345 }, quote, {}), '+380501234567');
    assert.equal(customers.checkOrder({ id: 12345 }, quote, { phoneNumber: '+380 (67) 111-22-33' }), '+380671112233');
    assert.equal(customers.profile(12345).phoneNumber, '+380501234567');
    assert.throws(() => customers.checkOrder({ id: 12345 }, { ...quote, totalPrice: 500.01 }, { paid: true, paymentStatus: 'paid' }), { code: 'PREPAYMENT_REQUIRED' });
    assert.throws(() => customers.checkOrder({ id: 12345 }, { ...quote, items: [{ productId: 'a', qty: 3 }, { productId: 'a', qty: 3 }] }, {}), { code: 'ORDER_LIMIT' });
    assert.throws(() => customers.checkOrder({ id: 12345 }, { ...quote, items: [{ productId: 'a', qty: 5 }, { productId: 'b', qty: 5 }, { productId: 'c', qty: 1 }] }, {}), { code: 'ORDER_LIMIT' });
    customers.restrict(12345, 'no-show');
    assert.throws(() => customers.checkOrder({ id: 12345 }, { ...quote, totalPrice: 40 }, { phoneNumber: '+380671112233' }), { code: 'PREPAYMENT_REQUIRED' });
  } finally { db.close(); }
});
