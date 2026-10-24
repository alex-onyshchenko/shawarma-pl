import { initData, contact, testBotToken } from './fixtures/telegram.js';
import { webhookSecret } from '../customers.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

let child;
let base;
const hourOffset = 12 - new Date().getUTCHours();
const testTimeZone = hourOffset === 0 ? 'Etc/GMT' : `Etc/GMT${hourOffset > 0 ? '-' : '+'}${Math.abs(hourOffset)}`;

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, TELEGRAM_BOT_TOKEN: testBotToken, HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: ':memory:', OPEN_HOUR: 'invalid', CLOSE_HOUR: 'invalid', STORE_TIMEZONE: 'Invalid/Zone', ADMIN_TOKEN: 'test-admin-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${output}`)), 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/running on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${output}`));
    });
  });
  assert.equal((await fetch(base + '/api/telegram/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': webhookSecret(testBotToken) }, body: JSON.stringify(contact()) })).status, 200);
  // Test hours are configured through the same database-backed API as Admin.
  const initial = await (await fetch(`${base}/api/availability`)).json();
  assert.equal(initial.timeZone, 'Europe/Kyiv');
  assert.equal(initial.openMinute, 600);
  assert.equal(initial.closeMinute, 1320);
  const login = await fetch(`${base}/api/admin/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-admin-key' }),
  });
  assert.equal(login.status, 200);
  const setupCookie = login.headers.get('set-cookie').split(';')[0];
  const configured = await fetch(`${base}/api/admin/points/demo`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: setupCookie },
    body: JSON.stringify({ timeZone: testTimeZone, weeklyHours: Array.from({ length: 7 }, () => ({ closed: false, open: '00:00', close: '24:00' })) }),
  });
  assert.equal(configured.status, 200);
  const updated = await (await fetch(`${base}/api/availability`)).json();
  assert.equal(updated.timeZone, testTimeZone);
  assert.equal(updated.openMinute, 0);
  assert.equal(updated.closeMinute, 1440);

});

after(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
});

test('standalone service exposes health, REST and live SSE without either frontend', { timeout: 15000 }, async () => {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const controller = new AbortController();
  const events = await fetch(`${base}/api/events`, { signal: controller.signal });
  assert.match(events.headers.get('content-type'), /text\/event-stream/);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  async function nextEvent() {
    while (!buffer.includes('\n\n')) {
      const { value, done } = await reader.read();
      assert.equal(done, false, 'SSE connection must remain open');
      buffer += decoder.decode(value, { stream: true });
    }
    const end = buffer.indexOf('\n\n');
    const event = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    return {
      type: event.match(/^event: (.+)$/m)[1],
      data: JSON.parse(event.match(/^data: (.+)$/m)[1]),
    };
  }

  try {
    const init = await nextEvent();
    assert.equal(init.type, 'init');
    assert.ok(Array.isArray(init.data.orders));
    assert.ok(Array.isArray(init.data.archivedOrders));

    const order = {
      id: 'service-contract-test',
      telegramInitData: initData(),
      customerName: 'Integration test',
      totalPrice: 150,
      items: [{ productId: 'shawarma-classic', sizeId: 'small', name: 'Класична шаурма', qty: 1, added: [], removed: [] }],
    };
    const created = await fetch(`${base}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).order.id, order.id);
    const incoming = await nextEvent();
    assert.equal(incoming.type, 'new_order');
    assert.equal(incoming.data.id, order.id);

    const acceptance = await fetch(`${base}/api/orders/${order.id}/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delayMinutes: 0 }),
    });
    assert.equal(acceptance.status, 200);
    assert.equal((await nextEvent()).data.order.acceptedAt > 0, true);

    for (const status of ['cooking', 'ready', 'archived']) {
      const updated = await fetch(`${base}/api/orders/${order.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      assert.equal(updated.status, 200);
      assert.equal((await updated.json()).order.status, status);
      const updateEvent = await nextEvent();
      assert.equal(updateEvent.type, 'order_status_updated');
      assert.equal(updateEvent.data.id, order.id);
      assert.equal(updateEvent.data.status, status);
    }

    const snapshot = await (await fetch(`${base}/api/orders`)).json();
    assert.ok(!snapshot.orders.some(o => o.id === order.id));
    assert.ok(snapshot.archivedOrders.some(o => o.id === order.id));
    assert.equal((await fetch(`${base}/api/analytics`)).status, 200);
    assert.equal((await fetch(`${base}/not-found`)).status, 404);
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
  }
});

async function request(path, method = 'GET', body, token) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(path === '/api/orders' && method === 'POST' ? { telegramInitData: initData(), ...body } : body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
const item = { productId: 'shawarma-classic', sizeId: 'small', name: 'Класична шаурма', qty: 1, added: [], removed: [] };

test('scheduled order: one confirmation, capped delay, protected early start and ready transitions', async () => {
  const availability = (await request('/api/availability')).data;
  const slot = availability.slots.find(value => value > Date.now() + 40 * 60000);
  assert.ok(slot);
  const created = await request('/api/orders', 'POST', { items: [item], timingMode: 'scheduled', requestedReadyAt: slot, clientRequestId: 'scheduled-test' });
  assert.equal(created.status, 201);
  const order = created.data.order;
  const path = `/api/orders/${order.id}`;
  assert.equal(order.paymentStatus, 'cash_due');
  assert.equal(order.confirmedReadyAt, null);
  assert.equal((await request(`${path}/status`, 'PATCH', { status: 'cooking' })).status, 409);
  assert.equal((await request(`${path}/accept`, 'POST', { delayMinutes: 20 })).status, 400);
  const accepted = await request(`${path}/accept`, 'POST', { delayMinutes: 15 });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.order.confirmedReadyAt, slot + 15 * 60000);
  assert.match(accepted.data.order.notification, /Новий час/);
  assert.equal(accepted.data.order.status, 'new');
  assert.equal((await request(`${path}/accept`, 'POST', { delayMinutes: 15 })).status, 200);
  assert.equal((await request(`${path}/accept`, 'POST', { delayMinutes: 5 })).status, 409);
  assert.equal((await request(`${path}/status`, 'PATCH', { status: 'ready', confirmEarly: true })).status, 409);
  const early = await request(`${path}/status`, 'PATCH', { status: 'cooking' });
  assert.equal(early.status, 409);
  assert.equal(early.data.code, 'EARLY_START');
  assert.equal((await request(`${path}/status`, 'PATCH', { status: 'cooking', confirmEarly: 'true' })).status, 409);
  assert.equal((await request(`${path}/status`, 'PATCH', { status: 'cooking', confirmEarly: true })).status, 200);
  assert.equal((await request(`${path}/status`, 'PATCH', { status: 'ready' })).data.code, 'EARLY_START');
  assert.equal((await request(`${path}/status`, 'PATCH', { status: 'ready', confirmEarly: true })).status, 200);
  assert.equal((await request(`${path}/status`, 'PATCH', { status: 'archived' })).status, 200);
});

test('ASAP uses a quarter-hour deadline and ignores removed toasting options in the order', async () => {
  const result = await request('/api/orders', 'POST', { items: [{ ...item, toastingLevel: 'strong' }], timingMode: 'asap' });
  assert.equal(result.status, 201);
  const order = result.data.order;
  assert.equal(order.time, new Intl.DateTimeFormat('uk-UA', { timeZone: order.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(order.createdAt));
  assert.equal(order.baselineReadyAt % (15 * 60000), 0);
  assert.ok(order.baselineReadyAt - order.createdAt >= 15 * 60000);
  assert.ok(order.baselineReadyAt - order.createdAt < 30 * 60000);
  assert.equal(order.items[0].toasting, undefined);
  assert.equal(order.items[0].unitPrice, 190);
  const accepted = await request(`/api/orders/${order.id}/accept`, 'POST', { delayMinutes: 0 });
  assert.equal(accepted.data.order.items[0].toastingLevel, undefined);
  assert.equal(accepted.data.order.confirmedReadyAt, order.baselineReadyAt);
});

test('stale slots adjust automatically; no duplicate simulated payment on retries', async () => {
  const availability = (await request('/api/availability')).data;
  const oldSlot = Math.floor(Date.now() / 900000) * 900000;
  const payload = { items: [item], timingMode: 'scheduled', requestedReadyAt: oldSlot, clientRequestId: 'retry-test' };
  const first = await request('/api/orders', 'POST', payload);
  assert.equal(first.status, 201);
  assert.equal(first.data.order.baselineReadyAt, availability.slots[0]);
  assert.equal(first.data.order.timingAdjusted, true);
  const second = await request('/api/orders', 'POST', payload);
  assert.equal(second.status, 200);
  assert.equal(first.data.order.id, second.data.order.id);
  assert.equal(first.data.order.paidAt, second.data.order.paidAt);
  assert.equal((await request('/api/orders', 'POST', { ...payload, clientRequestId: 'invalid-slot', requestedReadyAt: oldSlot + 60000 })).status, 400);
});

test('kitchen controls admission without an admin password; existing orders and retries recover', async () => {
  const existing = (await request('/api/orders', 'POST', { items: [item], clientRequestId: 'stop-test', paymentMethod: 'cash' })).data.order;
  assert.equal(existing.paymentStatus, 'cash_due');
  assert.equal((await request('/api/settings', 'PATCH', { acceptingOrders: false })).status, 200);
  assert.equal((await request('/api/settings', 'PATCH', { acceptingOrders: 'false' })).status, 400);
  try {
    assert.equal((await request('/api/settings', 'PATCH', { acceptingOrders: false }, 'test-admin-key')).status, 200);
    assert.equal((await request('/api/availability')).data.acceptingOrders, false);
    const blocked = await request('/api/orders', 'POST', { items: [item] });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.data.code, 'ORDERS_PAUSED');
    assert.equal((await request('/api/orders', 'POST', { items: [item], clientRequestId: 'stop-test' })).data.order.id, existing.id);
    const accepted = await request(`/api/orders/${existing.id}/accept`, 'POST', { delayMinutes: 0 });
    assert.equal(accepted.status, 200);
    assert.match(accepted.data.order.notification, /прийнято/);
    assert.doesNotMatch(accepted.data.order.notification, /успішно оплачено/);
    assert.equal((await request(`/api/orders/${existing.id}/status`, 'PATCH', { status: 'cooking' })).status, 200);
  } finally {
    await request('/api/settings', 'PATCH', { acceptingOrders: true }, 'test-admin-key');
  }
});

test('lunch break pauses only new orders, persists in point settings and ends without a password', async () => {
  const existing = (await request('/api/orders', 'POST', { items: [item], clientRequestId: 'before-lunch' })).data.order;
  try {
    const paused = await request('/api/settings', 'PATCH', { onBreak: true });
    assert.equal(paused.status, 200);
    assert.equal(paused.data.onBreak, true);
    assert.equal(paused.data.cafeOpen, true);
    assert.equal(paused.data.acceptingOrders, false);
    assert.equal((await request('/api/menu')).data.point.onBreak, true);
    assert.equal((await request('/api/orders', 'POST', { items: [item] })).data.code, 'LUNCH_BREAK');
    assert.equal((await request('/api/orders', 'POST', { items: [item], clientRequestId: 'before-lunch' })).data.order.id, existing.id);
    assert.equal((await request(`/api/orders/${existing.id}/accept`, 'POST', { delayMinutes: 0 })).status, 200);
    assert.equal((await request('/api/settings', 'PATCH', { onBreak: 'yes' })).status, 400);
    const resumed = await request('/api/settings', 'PATCH', { onBreak: false });
    assert.equal(resumed.data.acceptingOrders, true);
    assert.equal(resumed.data.onBreak, false);
    await request('/api/settings', 'PATCH', { onBreak: true });
    const closed = await request('/api/settings', 'PATCH', { acceptingOrders: false });
    assert.equal(closed.data.cafeOpen, false);
    assert.equal(closed.data.onBreak, false);
    assert.equal((await request('/api/settings', 'PATCH', { onBreak: true })).status, 409);
  } finally { await request('/api/settings', 'PATCH', { acceptingOrders: true }); }
});

test('manual kitchen orders atomically confirm selected sizes and deadlines without duplicates', async () => {
  const availability = (await request('/api/availability')).data;
  const slot = availability.slots.find(slot => slot > Date.now() + 40 * 60000);
  const payload = { items: [{ productId: 'shawarma-signature', sizeId: 'large', toastingLevel: 'strong', qty: 2 }], requestedReadyAt: slot, expectedTotal: 520, clientRequestId: 'manual-order-test' };
  const created = await request('/api/kitchen/orders', 'POST', payload);
  assert.equal(created.status, 201);
  const order = created.data.order;
  assert.equal(order.source, 'kitchen');
  assert.equal(order.status, 'new');
  assert.equal(order.timingMode, 'scheduled');
  assert.equal(order.confirmedReadyAt, slot);
  assert.ok(order.acceptedAt);
  assert.equal(order.totalPrice, 520);
  assert.equal(order.items[0].name, 'Фірмова шаурма · Велика (550 г)');
  assert.equal(order.items[0].toasting, undefined);
  assert.equal(order.paymentStatus, 'cash_due');
  assert.equal((await request(`/api/orders/${order.id}/accept`, 'POST', { delayMinutes: 5 })).status, 409);
  assert.equal((await request(`/api/orders/${order.id}/status`, 'PATCH', { status: 'cooking' })).data.code, 'EARLY_START');
  const repeated = await request('/api/kitchen/orders', 'POST', payload);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.order.id, order.id);
  assert.equal((await request('/api/orders')).data.orders.filter(item => item.clientRequestId === payload.clientRequestId).length, 1);
  assert.equal((await request('/api/kitchen/orders', 'POST', { ...payload, clientRequestId: 'missing-manual-time', requestedReadyAt: null })).status, 400);
  assert.equal((await request('/api/kitchen/orders', 'POST', { ...payload, clientRequestId: 'bad-manual-size', items: [{ productId: 'shawarma-beef', sizeId: 'small', qty: 1 }] })).status, 409);
  try {
    await request('/api/settings', 'PATCH', { acceptingOrders: false }, 'test-admin-key');
    assert.equal((await request('/api/kitchen/orders', 'POST', { ...payload, clientRequestId: 'closed-manual' })).status, 201);
    assert.equal((await request('/api/orders', 'POST', { ...payload, clientRequestId: 'closed-client' })).status, 409);
    await request('/api/settings', 'PATCH', { acceptingOrders: true });
    await request('/api/settings', 'PATCH', { onBreak: true });
    assert.equal((await request('/api/kitchen/orders', 'POST', { ...payload, clientRequestId: 'break-manual' })).status, 201);
    assert.equal((await request('/api/orders', 'POST', { ...payload, clientRequestId: 'break-client' })).data.code, 'LUNCH_BREAK');
    assert.equal((await request('/api/kitchen/orders', 'POST', payload)).data.order.id, order.id);
  } finally { await request('/api/settings', 'PATCH', { acceptingOrders: true }, 'test-admin-key'); }
});

let adminCookie = '';
async function admin(path, method = 'GET', body, extra = {}) {
  const response = await fetch(base + '/api/admin' + path, {
    method, headers: { 'Content-Type': 'application/json', Cookie: adminCookie, ...extra },
    body: body ? JSON.stringify(path === '/api/orders' && method === 'POST' ? { telegramInitData: initData(), ...body } : body) : undefined,
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

test('admin authentication uses an HttpOnly session and blocks foreign origins', async () => {
  assert.equal((await admin('/state')).status, 401);
  assert.equal((await admin('/session', 'POST', { password: 'incorrect' })).status, 401);
  assert.equal((await admin('/session', 'POST', { password: 'test-admin-key' }, { Origin: 'https://untrusted.example' })).status, 403);
  const login = await admin('/session', 'POST', { password: 'test-admin-key' });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /SameSite=Strict/);
  adminCookie = login.cookie.split(';')[0];
  assert.equal((await admin('/state')).status, 200);
});

test('one active demo point; new points editable but cannot be activated or publicly ordered', async () => {
  const created = await admin('/points', 'POST', { name: 'Future point', address: 'Future address' });
  assert.equal(created.status, 201);
  const point = created.data.point;
  assert.equal(point.active, false);
  assert.equal((await admin(`/points/${point.id}`, 'PATCH', { active: true })).status, 409);
  assert.equal((await admin('/points/demo', 'PATCH', { active: false })).status, 409);
  assert.equal((await admin(`/points/${point.id}`, 'PATCH', { name: 'Edited draft' })).data.point.name, 'Edited draft');
  assert.equal((await request('/api/points')).data.points.length, 1);
  assert.equal((await request('/api/orders', 'POST', { pointId: point.id, items: [item] })).status, 409);
  const newProduct = await admin(`/points/${point.id}/products`, 'POST', { name: 'Draft dish', category: 'Test', price: 99, hasModifiers: false, availableSpiciness: false });
  assert.equal(newProduct.status, 201);
  assert.ok(!(await request('/api/menu')).data.products.some(product => product.id === newProduct.data.product.id));
  const state = (await admin('/state')).data;
  assert.equal(state.points.filter(point => point.active).length, 1);
  assert.equal(state.menus[point.id].length, 1);
});

test('menu changes affect new quotes, reject stale totals, preserve old order snapshots', async () => {
  const original = (await request('/api/menu')).data.products.find(product => product.id === '12');
  const payload = { items: [{ productId: '12', qty: 1 }], expectedTotal: 40 };
  const first = await request('/api/orders', 'POST', payload);
  assert.equal(first.status, 201);
  assert.equal(first.data.order.totalPrice, 40);
  assert.equal(first.data.order.items[0].unitPrice, 40);
  try {
    assert.equal((await admin('/points/demo/menu/12', 'PATCH', { price: 75 })).status, 200);
    assert.equal((await request('/api/menu')).data.products.find(product => product.id === '12').price, 75);
    assert.equal((await request('/api/orders', 'POST', payload)).status, 409);
    const fresh = await request('/api/orders', 'POST', { ...payload, expectedTotal: 75 });
    assert.equal(fresh.status, 201);
    assert.equal(fresh.data.order.totalPrice, 75);
    assert.equal((await request('/api/orders')).data.orders.find(order => order.id === first.data.order.id).items[0].unitPrice, 40);
    await admin('/points/demo/menu/12', 'PATCH', { available: false });
    assert.equal((await request('/api/orders', 'POST', { items: [{ productId: '12', qty: 1 }] })).status, 409);
    await admin('/points/demo/menu/12', 'PATCH', { available: true, visible: false });
    assert.ok(!(await request('/api/menu')).data.products.some(product => product.id === '12'));
    assert.equal((await request('/api/orders', 'POST', { items: [{ productId: '12', qty: 1 }] })).status, 409);
  } finally {
    await admin('/points/demo/menu/12', 'PATCH', { price: original.price, visible: true, available: true });
  }
});

test('pickup checkout uses admin address, verified default phone, cutlery and receipt payment only', async () => {
  const menu = (await request('/api/menu')).data;
  assert.equal(menu.point.address, 'м. Полтава, вул. Соборності, 46');
  assert.equal(menu.point.metro, '');
  assert.equal(menu.point.pickupDiscountPercent, 0);
  assert.equal(menu.point.deliveryEnabled, false);
  assert.equal(menu.products.find(product => product.id === 'shawarma-signature').tag, '🔥 Найпопулярніша');
  const payload = { items: [item], paymentMethod: 'cash', cutlery: false, expectedTotal: 190 };
  const originalAddress = menu.point.address;
  try {
    await admin('/points/demo', 'PATCH', { address: 'Updated admin pickup address' });
    assert.equal((await request('/api/menu')).data.point.address, 'Updated admin pickup address');
    const result = await request('/api/orders', 'POST', { ...payload, selectedLocation: { name: 'Forged client address' } });
    assert.equal(result.status, 201);
    assert.equal(result.data.order.selectedLocation.name, 'Updated admin pickup address');
    assert.equal(result.data.order.phoneNumber, '+380501234567');
    assert.equal(result.data.order.cutlery, false);
    assert.equal(result.data.order.discount, 0);
    assert.equal(result.data.order.paymentStatus, 'cash_due');
    assert.equal(result.data.order.paidAt, null);
    assert.equal((await request('/api/orders', 'POST', { ...payload, paymentMethod: 'card' })).status, 409);
    assert.equal((await request('/api/orders', 'POST', { ...payload, paymentMethod: 'telegram' })).status, 409);
    assert.equal((await request('/api/orders', 'POST', { ...payload, orderType: 'delivery' })).status, 409);
    assert.equal((await request('/api/orders', 'POST', { ...payload, cutlery: 'false' })).status, 400);
  } finally { await admin('/points/demo', 'PATCH', { address: originalAddress }); }
});

test('schedule exceptions close ordering; minute-level schedules and modifier edits validate', async () => {
  const point = (await admin('/state')).data.points.find(point => point.id === 'demo');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: point.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format();
  try {
    assert.equal((await admin('/points/demo', 'PATCH', { exceptions: [{ date, closed: true, open: '10:30', close: '21:45' }] })).status, 200);
    assert.equal((await request('/api/availability')).data.closed, true);
    assert.deepEqual((await request('/api/availability')).data.slots, []);
    assert.equal((await request('/api/orders', 'POST', { items: [item] })).status, 400);
    const manualSlots = (await request('/api/availability')).data.manualSlots;
    const manualOnHoliday = await request('/api/kitchen/orders', 'POST', { items: [{ ...item, toastingLevel: 'normal' }], requestedReadyAt: manualSlots[0] });
    assert.equal(manualOnHoliday.status, 201);
    assert.equal(manualOnHoliday.data.order.items[0].toasting, undefined);
    assert.equal(manualOnHoliday.data.order.confirmedReadyAt, manualSlots[0]);
    await admin('/points/demo', 'PATCH', { exceptions: [], weeklyHours: point.weeklyHours.map(() => ({ closed: false, open: '00:00', close: '00:15' })) });
    assert.equal((await request('/api/availability')).data.asapAvailable, false);
    assert.equal((await request('/api/kitchen/orders', 'POST', { items: [item], requestedReadyAt: manualSlots[0] })).status, 201);
    assert.equal((await admin('/points/demo', 'PATCH', { weeklyHours: point.weeklyHours.map(rule => ({ ...rule, open: '22:00', close: '10:00' })) })).status, 400);
    const modifiers = (await admin('/state')).data.modifiers;
    const invalid = structuredClone(modifiers); invalid.lavash = [];
    assert.equal((await admin('/modifiers', 'PUT', invalid)).status, 400);
    assert.equal((await admin('/modifiers', 'PUT', modifiers)).status, 200);
  } finally { await admin('/points/demo', 'PATCH', { exceptions: point.exceptions, weeklyHours: point.weeklyHours }); }
  assert.equal((await admin('/session', 'DELETE')).status, 200);
  assert.equal((await admin('/state')).status, 401);
});


test('sales report exposes full issued-order statement and downloadable PDF; invalid filters fail', async () => {
  const history = (await request('/api/orders')).data.archivedOrders;
  const response = await request('/api/analytics/report?period=7&commission=5.25');
  assert.equal(response.status, 200);
  assert.equal(response.data.count, history.filter(order => order.status === 'archived').length);
  assert.ok(response.data.sales.every(sale => Number.isFinite(sale.soldAt)));
  assert.equal(response.data.totals.amountKopecks, response.data.sales.reduce((sum, sale) => sum + sale.amountKopecks, 0));
  assert.equal(response.data.totals.commissionKopecks, response.data.sales.reduce((sum, sale) => sum + sale.commissionKopecks, 0));
  const pdf = await fetch(`${base}/api/analytics/report?period=21&commission=0&format=pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.headers.get('cache-control'), 'no-store');
  assert.match(pdf.headers.get('content-disposition'), /attachment; filename="shaurmisha-sales-21d-/);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  for (const query of ['period=22', 'commission=-1', 'commission=100.01', 'format=html']) {
    assert.equal((await request('/api/analytics/report?' + query)).status, 400);
  }
});

test('client phone gating, quantity limits, cash boundary and permanent no-show restriction are enforced by API', async () => {
  const anonymous = await request('/api/orders', 'POST', { items: [item], telegramInitData: '' });
  assert.equal(anonymous.status, 401);
  const telegramInitData = initData(testBotToken, 22222);
  assert.equal((await request('/api/client/profile', 'POST', { telegramInitData })).data.phoneVerified, false);
  assert.equal((await request('/api/orders', 'POST', { telegramInitData, items: [item], phoneNumber: '+380671112233' })).status, 403);
  const shared = await fetch(base + '/api/telegram/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': webhookSecret(testBotToken) }, body: JSON.stringify(contact(22222)) });
  assert.equal(shared.status, 200);
  const create = items => request('/api/orders', 'POST', { telegramInitData, items });
  assert.equal((await create([{ productId: '12', qty: 6 }])).data.code, 'ORDER_LIMIT');
  assert.equal((await create([{ productId: '12', qty: 5 }, { productId: '13', qty: 5 }, { productId: '14', qty: 1 }])).data.code, 'ORDER_LIMIT');
  assert.equal((await create([{ ...item, qty: 3 }, { ...item, sizeId: 'medium', qty: 3 }])).data.code, 'ORDER_LIMIT');
  assert.equal((await create([{ ...item, sizeId: 'large', qty: 2 }])).status, 201); // exactly 500
  assert.equal((await create([{ productId: 'shawarma-signature', sizeId: 'large', qty: 2 }])).data.code, 'PREPAYMENT_REQUIRED');
  const created = await request('/api/orders', 'POST', { telegramInitData, items: [item], phoneNumber: '+380671112233' });
  assert.equal(created.status, 201);
  assert.equal(created.data.order.phoneNumber, '+380671112233');
  assert.equal((await request('/api/client/profile', 'POST', { telegramInitData })).data.phoneNumber, '+380501234567');
  const path = `/api/orders/${created.data.order.id}`;
  assert.equal((await request(path + '/no-show', 'POST', { confirmed: true })).status, 409);
  await request(path + '/accept', 'POST', { delayMinutes: 0 });
  await request(path + '/status', 'PATCH', { status: 'cooking', confirmEarly: true });
  await request(path + '/status', 'PATCH', { status: 'ready', confirmEarly: true });
  assert.equal((await request(path + '/no-show', 'POST', { confirmed: false })).status, 400);
  assert.equal((await request(path + '/no-show', 'POST', { confirmed: true })).data.order.status, 'no_show');
  assert.equal((await request(path + '/no-show', 'POST', { confirmed: true })).status, 200);
  assert.equal((await request(path + '/status', 'PATCH', { status: 'ready' })).status, 409);
  assert.equal((await request('/api/client/profile', 'POST', { telegramInitData })).data.prepaymentOnly, true);
  assert.equal((await create([{ productId: '12', qty: 1 }])).data.code, 'PREPAYMENT_REQUIRED');
  assert.equal((await request('/api/menu')).status, 200);
  assert.ok(!(await request('/api/analytics/report')).data.sales.some(sale => sale.id === created.data.order.id));
});

test('clear removes active and archived orders instead of generating demo history', async () => {
  assert.ok((await request('/api/orders')).data.orders.length > 0);
  assert.equal((await request('/api/reset', 'POST', {})).status, 200);
  const cleared = (await request('/api/orders')).data;
  assert.deepEqual(cleared.orders, []);
  assert.deepEqual(cleared.archivedOrders, []);
});


test('custom ready time accepts arbitrary future minutes, deduplicates retries and rejects stale edits', async () => {
  const created = await request('/api/orders', 'POST', { items: [item] });
  assert.equal(created.status, 201);
  const order = created.data.order;
  const path = `/api/orders/${order.id}/ready-time`;
  const readyAt = order.baselineReadyAt + 47 * 60000;
  const changed = await request(path, 'POST', { readyAt, expectedReadyAt: order.baselineReadyAt });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.order.confirmedReadyAt, readyAt);
  assert.equal(changed.data.order.timeRevision, 1);
  assert.equal((await request(path, 'POST', { readyAt, expectedReadyAt: order.baselineReadyAt })).data.order.timeRevision, 1);
  assert.equal((await request(path, 'POST', { readyAt: readyAt + 60000, expectedReadyAt: order.baselineReadyAt })).status, 409);
  for (const value of [0, '18:30', readyAt + 1, null]) assert.equal((await request(path, 'POST', { readyAt: value })).status, 400);
  assert.equal((await request(`/api/orders/${order.id}/status`, 'PATCH', { status: 'cooking', confirmEarly: true })).status, 200);
  const cookingChange = await request(path, 'POST', { readyAt: readyAt + 60000, expectedReadyAt: readyAt });
  assert.equal(cookingChange.status, 409);
  assert.equal((await request(`/api/orders/${order.id}/status`, 'PATCH', { status: 'ready', confirmEarly: true })).status, 200);
  assert.equal((await request(path, 'POST', { readyAt: readyAt + 60000 })).status, 409);
});

test('starting preparation implicitly confirms the displayed deadline', async () => {
  const created = await request('/api/orders', 'POST', { items: [item] });
  const order = created.data.order;
  const result = await request(`/api/orders/${order.id}/status`, 'PATCH', { status: 'cooking', confirmEarly: true });
  assert.equal(result.status, 200);
  assert.equal(result.data.order.confirmedReadyAt, order.baselineReadyAt);
  assert.ok(result.data.order.acceptedAt);
});


test('cancellation requires the new column; cooking and ready can return one column with their deadline intact', async () => {
  for (const status of ['new', 'cooking', 'ready', 'archived']) {
    const created = await request('/api/orders', 'POST', { items: [item] });
    assert.equal(created.status, 201);
    const id = created.data.order.id;
    const path = `/api/orders/${id}`;
    if (status !== 'new') assert.equal((await request(path + '/status', 'PATCH', { status: 'cooking', confirmEarly: true })).status, 200);
    if (['ready', 'archived'].includes(status)) assert.equal((await request(path + '/status', 'PATCH', { status: 'ready', confirmEarly: true })).status, 200);
    if (status === 'archived') assert.equal((await request(path + '/status', 'PATCH', { status: 'archived' })).status, 200);
    const result = await request(path + '/cancel', 'POST', { comment: status === 'cooking' ? 'Закінчилися інгредієнти' : '' });
    if (status === 'archived') { assert.equal(result.status, 404); continue; }
    if (['cooking', 'ready'].includes(status)) {
      assert.equal(result.status, 409);
      let back = await request(path + '/status', 'PATCH', { status: status === 'ready' ? 'cooking' : 'new' });
      assert.equal(back.status, 200);
      assert.equal(back.data.order.confirmedReadyAt, created.data.order.baselineReadyAt);
      if (status === 'ready') {
        assert.equal(back.data.order.status, 'cooking');
        assert.equal((await request(path + '/cancel', 'POST', {})).status, 409);
        back = await request(path + '/status', 'PATCH', { status: 'new' });
        assert.equal(back.status, 200);
      }
      assert.equal(back.data.order.status, 'new');
      const cancelled = await request(path + '/cancel', 'POST', { comment: status === 'cooking' ? 'Закінчилися інгредієнти' : '' });
      Object.assign(result, cancelled);
    }
    assert.equal(result.status, 200);
    assert.equal(result.data.order.status, 'cancelled');
    assert.equal(result.data.order.cancellationComment, status === 'cooking' ? 'Закінчилися інгредієнти' : '');
    assert.equal((await request(path + '/cancel', 'POST', {})).data.order.cancelledAt, result.data.order.cancelledAt);
    const snapshot = (await request('/api/orders')).data;
    assert.ok(!snapshot.orders.some(order => order.id === id));
    assert.equal(snapshot.archivedOrders.filter(order => order.id === id && order.status === 'cancelled').length, 1);
  }
});


test('new-order time edits respect the current database closing time and dated closures', async () => {
  const login = await admin('/session', 'POST', { password: 'test-admin-key' });
  adminCookie = login.cookie.split(';')[0];
  const point = (await request('/api/menu')).data.point;
  const created = await request('/api/orders', 'POST', { items: [item] });
  assert.equal(created.status, 201);
  const path = `/api/orders/${created.data.order.id}/ready-time`;
  const now = Date.now();
  const local = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: point.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
  const closingMinute = Number(local.hour) * 60 + Number(local.minute) + 4;
  const close = `${String(Math.floor(closingMinute / 60)).padStart(2,'0')}:${String(closingMinute % 60).padStart(2,'0')}`;
  const valid = (Math.floor(now / 60000) + 2) * 60000;
  try {
    assert.equal((await admin('/points/demo', 'PATCH', { weeklyHours: point.weeklyHours.map(() => ({ closed: false, open: '00:00', close })) })).status, 200);
    assert.equal((await request(path, 'POST', { readyAt: valid })).status, 200);
    assert.equal((await request(path, 'POST', { readyAt: valid + 5 * 60000 })).status, 400);
    assert.equal((await request(path, 'POST', { readyAt: valid + 24 * 60 * 60000 })).status, 400);
    const date = `${local.year}-${local.month}-${local.day}`;
    await admin('/points/demo', 'PATCH', { exceptions: [{ date, closed: true, open: '00:00', close }] });
    assert.equal((await request(path, 'POST', { readyAt: valid + 60000 })).status, 400);
  } finally {
    await admin('/points/demo', 'PATCH', { weeklyHours: point.weeklyHours, exceptions: point.exceptions });
  }
});
