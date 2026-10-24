import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, hoursForPoint, quoteOrder } from '../store.js';
import { getSlots } from '../timing.js';

test('SQLite retains point settings, menus, draft-only invariant and order state after reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shawarma-store-'));
  let store;
  try {
    const filename = join(directory, 'test.sqlite');
    store = createStore(filename);
    const point = store.updatePoint('demo', { name: 'Saved name', acceptingOrders: false, timeZone: 'Europe/Warsaw', weeklyHours: Array.from({ length: 7 }, () => ({ closed: false, open: '11:15', close: '20:45' })) });
    const draft = store.createPoint({ name: 'Inactive future point', address: 'Another street' });
    store.updateMenu('demo', '12', { price: 175, available: false, product: { price: 175, name: 'Updated shared name' } });
    assert.equal(store.product('12').price, 40);
    assert.equal(store.product('12').name, 'Updated shared name');
    store.set('orders', { orders: [{ id: 'saved-order', pointId: point.id }], archivedOrders: [], nextOrderId: 2000 });
    store.close();
    store = createStore(filename);
    assert.equal(store.activePoint().name, 'Saved name');
    assert.equal(store.activePoint().timeZone, 'Europe/Warsaw');
    assert.deepEqual(store.activePoint().weeklyHours, point.weeklyHours);
    assert.equal(store.activePoint().acceptingOrders, false);
    assert.equal(store.point(draft.id).active, false);
    assert.equal(store.menu('demo').find(item => item.id === '12').price, 175);
    assert.equal(store.menu('demo').find(item => item.id === '12').available, false);
    assert.equal(store.get('orders').orders[0].id, 'saved-order');
    assert.equal(store.points().filter(point => point.active).length, 1);
    assert.throws(() => store.updatePoint(draft.id, { active: true }));
    assert.throws(() => store.db.prepare('INSERT INTO points VALUES(?,?,?)').run('invalid-active', 1, '{}'));
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('weekly minute-level schedule and dated exception produce correct slots', () => {
  const store = createStore(':memory:');
  try {
    const point = store.updatePoint('demo', { weeklyHours: Array.from({ length: 7 }, () => ({ closed: false, open: '10:30', close: '21:45' })), exceptions: [{ date: '2026-10-23', closed: true, open: '10:30', close: '21:45' }] });
    const now = Date.parse('2026-10-22T08:00:00+03:00');
    const slots = getSlots(now, hoursForPoint(point, now));
    assert.equal(slots[0], Date.parse('2026-10-22T10:30:00+03:00'));
    assert.equal(slots.at(-1), Date.parse('2026-10-22T21:45:00+03:00'));
    const tomorrow = Date.parse('2026-10-23T12:00:00+03:00');
    assert.deepEqual(getSlots(tomorrow, hoursForPoint(point, tomorrow)), []);
  } finally { store.close(); }
});

test('server computes prices from product and modifier IDs, ignoring supplied item prices', () => {
  const store = createStore(':memory:');
  try {
    const customizable = store.createProduct('demo', { name: 'Custom test dish', category: 'Test', price: 150, hasModifiers: true });
    const quote = quoteOrder(store, { items: [{ productId: customizable.id, qty: 2, unitPrice: 1, lavashId: 'l2', addedModifierIds: ['a1'] }], totalPrice: 1 });
    assert.equal(quote.items[0].unitPrice, 190);
    assert.equal(quote.subtotal, 380);
    assert.equal(quote.totalPrice, 380);
    assert.throws(() => quoteOrder(store, { items: [{ productId: '12', qty: 1 }], expectedTotal: 'invalid' }));
    const hidden = store.createProduct('demo', { name: 'Hidden draft dish', category: 'Test', price: 50, visible: false, available: false, sortOrder: 7 });
    const entry = store.menu('demo').find(item => item.id === hidden.id);
    assert.equal(entry.sortOrder, 7); assert.equal(entry.visible, false); assert.equal(entry.available, false);
    assert.throws(() => quoteOrder(store, { items: [{ productId: '12', qty: -1 }] }));
    assert.throws(() => quoteOrder(store, { items: [{ productId: '12', qty: 1, addedModifierIds: ['unknown'] }] }));
  } finally { store.close(); }
});

test('three replacement shawarmas have authoritative sizes and no recipe modifiers', () => {
  const store = createStore(':memory:');
  try {
    const shawarmas = store.publicMenu().products.filter(item => item.category === 'Шаурма');
    assert.deepEqual(shawarmas.map(item => [item.name, item.sizes.map(size => [size.price, size.weight])]), [
      ['Фірмова шаурма', [[200, '350 г'], [230, '450 г'], [260, '550 г']]],
      ['Класична шаурма', [[190, '350 г'], [220, '450 г'], [250, '550 г']]],
      ['Яловича шаурма', [[230, '450 г']]],
    ]);
    assert.deepEqual(shawarmas.map(item => item.imageUrl), ['/menu/signature.jpg', '/menu/classic.jpg', '/menu/beef.jpg']);
    assert.ok(shawarmas.every(item => !item.hasModifiers && !item.availableSpiciness));
    const input = { productId: 'shawarma-signature', sizeId: 'large', qty: 2, unitPrice: 1 };
    const snapshot = quoteOrder(store, { items: [input] });
    assert.equal(snapshot.items[0].unitPrice, 260);
    assert.equal(snapshot.items[0].name, 'Фірмова шаурма · Велика (550 г)');
    assert.equal(snapshot.items[0].sizeId, 'large');
    assert.equal(snapshot.totalPrice, 520);
    assert.throws(() => quoteOrder(store, { items: [{ ...input, sizeId: null }] }));
    assert.throws(() => quoteOrder(store, { items: [{ productId: 'shawarma-beef', sizeId: 'small', qty: 1 }] }));
    assert.throws(() => quoteOrder(store, { items: [{ ...input, lavashId: 'l2' }] }));
    assert.throws(() => quoteOrder(store, { items: [{ ...input, addedModifierIds: ['a1'] }] }));
    const sizes = shawarmas[0].sizes.map(size => ({ ...size, price: size.price + 10 }));
    store.updateMenu('demo', input.productId, { sizes });
    assert.equal(store.publicMenu().products[0].price, 210);
    assert.equal(quoteOrder(store, { items: [input] }).items[0].unitPrice, 270);
    assert.equal(snapshot.items[0].unitPrice, 260);
    assert.throws(() => quoteOrder(store, { items: [input], expectedTotal: snapshot.totalPrice }));
    const draft = store.createPoint({ name: 'Draft', address: 'Test' });
    store.updateMenu(draft.id, input.productId, {});
    assert.equal(store.menu(draft.id)[0].sizes[0].price, 200, 'size prices are local to a point');
    assert.throws(() => store.updateMenu('demo', input.productId, { sizes: [sizes[0], sizes[0]] }));
  } finally { store.close(); }
});

test('existing SQLite menu migrates once, preserving orders and subsequent admin edits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shawarma-migration-'));
  let store;
  try {
    const filename = join(directory, 'legacy.sqlite');
    store = createStore(filename);
    store.updatePoint('demo', { name: 'Existing business' });
    store.set('orders', { orders: [{ id: 'history', items: [{ name: 'Old shawarma', unitPrice: 150 }] }] });
    store.db.prepare("DELETE FROM state WHERE key='shawarmaMenuV2'").run();
    store.db.exec('ALTER TABLE point_menu DROP COLUMN sizes');
    store.db.prepare('INSERT INTO products VALUES(?,?)').run('old-shawarma', JSON.stringify({ id: 'old-shawarma', name: 'Old shawarma', category: 'Шаурма', price: 150 }));
    store.db.prepare('INSERT INTO point_menu VALUES(?,?,?,?,?,?)').run('demo', 'old-shawarma', 150, 1, 1, 0);
    store.close();
    store = createStore(filename);
    assert.equal(store.activePoint().name, 'Existing business');
    assert.equal(store.publicMenu().products.filter(item => item.category === 'Шаурма').length, 3);
    assert.equal(store.menu('demo').find(item => item.id === 'old-shawarma').visible, false);
    assert.equal(store.get('orders').orders[0].items[0].unitPrice, 150);
    const sizes = [{ id: 'medium', name: 'Середня', weight: '450 г', price: 245 }];
    store.updateMenu('demo', 'shawarma-beef', { sizes });
    store.close();
    store = createStore(filename);
    assert.deepEqual(store.menu('demo').find(item => item.id === 'shawarma-beef').sizes, sizes);
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});


test('removed toasting input is ignored without affecting the quoted price', () => {
  const store = createStore(':memory:');
  try {
    for (const toastingLevel of [undefined, 'normal', 'strong', 'light', 'burnt']) {
      const quote = quoteOrder(store, { items: [{ productId: 'shawarma-classic', sizeId: 'medium', qty: 1, toastingLevel }] });
      assert.equal(quote.totalPrice, 220);
      assert.equal(quote.items[0].toasting, undefined);
      assert.equal(quote.items[0].toastingLevel, undefined);
    }
  } finally { store.close(); }
});

test('point logo validates, persists and is returned in the public menu', () => {
  const store = createStore(':memory:');
  try {
    const url = '/media/12345678-abcd.webp';
    store.updatePoint('demo', { logoUrl: url });
    assert.equal(store.publicMenu().point.logoUrl, url);
    store.updatePoint('demo', { phone: '+380501234567' });
    assert.equal(store.point('demo').logoUrl, url);
    assert.throws(() => store.updatePoint('demo', { logoUrl: 'javascript:alert(1)' }));
    store.updatePoint('demo', { logoUrl: '' });
    assert.equal(store.point('demo').logoUrl, '');
  } finally { store.close(); }
});
