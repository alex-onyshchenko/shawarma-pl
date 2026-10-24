import assert from 'node:assert/strict';
import { initData, contact, testBotToken } from '../services/sync/test/fixtures/telegram.js';
import { webhookSecret } from '../services/sync/customers.js';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from '../apps/client/node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const child = spawn(process.execPath, ['services/sync/server.js'], {
  cwd: root,
  env: { ...process.env, TELEGRAM_BOT_TOKEN: testBotToken, HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: ':memory:', ADMIN_TOKEN: 'integration-admin-key' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const servers = [];
const controllers = [];
// Bound every network assertion and ensure failed checks release all processes.
const timeout = setTimeout(() => {
  console.error('Integration check timed out');
  child.kill();
  process.exit(1);
}, 30000);

async function freePort() {
  const listener = createHttpServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

try {
  const api = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/running on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.on('error', reject);
    child.once('exit', code => reject(new Error(`Sync exited (${code}): ${output}`)));
    child.stderr.on('data', data => { output += data; });
  });
  assert.equal((await fetch(api + '/api/telegram/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': webhookSecret(testBotToken) }, body: JSON.stringify(contact()) })).status, 200);
  process.env.SYNC_API_TARGET = api;
  const bases = {};
  for (const app of ['client', 'kitchen', 'analytics', 'admin']) {
    const appRoot = fileURLToPath(new URL(`../apps/${app}/`, import.meta.url));
    const server = await createServer({
      root: appRoot,
      mode: 'dev',
      configFile: `${appRoot}vite.config.js`,
      server: { host: '127.0.0.1', port: await freePort() },
      logLevel: 'error',
    });
    servers.push(server);
    await server.listen();
    bases[app] = `http://127.0.0.1:${server.httpServer.address().port}`;
    const page = await fetch(bases[app]);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/src\/main.jsx/);
    assert.equal((await fetch(`${bases[app]}/src/main.jsx`)).status, 200);
    assert.equal((await fetch(`${bases[app]}/api/health`)).status, 200);
    console.log(`PASS ${app}: independent HTML entry, source transform and API proxy`);
  }

  const adminLogin = await fetch(`${bases.admin}/api/admin/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: bases.admin }, body: JSON.stringify({ password: 'integration-admin-key' }),
  });
  assert.equal(adminLogin.status, 200);
  const cookie = adminLogin.headers.get('set-cookie').split(';')[0];
  const state = await fetch(`${bases.admin}/api/admin/state`, { headers: { Cookie: cookie } });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).points.filter(point => point.active).length, 1);
  console.log('PASS Admin same-origin session through its independent proxy');
  const hourOffset = 12 - new Date().getUTCHours();
  const timeZone = hourOffset === 0 ? 'Etc/GMT' : `Etc/GMT${hourOffset > 0 ? '-' : '+'}${Math.abs(hourOffset)}`;
  const schedule = await fetch(`${bases.admin}/api/admin/points/demo`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: bases.admin },
    body: JSON.stringify({ timeZone, weeklyHours: Array.from({ length: 7 }, () => ({ closed: false, open: '00:00', close: '24:00' })) }),
  });
  assert.equal(schedule.status, 200);


  async function subscribe(base) {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${base}/api/events`, { signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    async function next() {
      while (!buffer.includes('\n\n')) {
        const { value, done } = await reader.read();
        assert.equal(done, false);
        buffer += decoder.decode(value, { stream: true });
      }
      const end = buffer.indexOf('\n\n');
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      return {
        type: raw.match(/^event: (.+)$/m)[1],
        data: JSON.parse(raw.match(/^data: (.+)$/m)[1]),
      };
    }
    assert.equal((await next()).type, 'init');
    return next;
  }

  const kitchenEvent = await subscribe(bases.kitchen);
  const clientEvent = await subscribe(bases.client);
  const order = {
    id: 'cross-service-test', totalPrice: 150, telegramInitData: initData(),
    items: [{ productId: 'shawarma-classic', sizeId: 'small', name: 'Класична шаурма', qty: 1, added: [], removed: [] }],
  };
  const created = await fetch(`${bases.client}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
  assert.equal(created.status, 201);
  assert.equal((await kitchenEvent()).data.id, order.id);
  assert.equal((await clientEvent()).type, 'new_order');
  const acceptance = await fetch(`${bases.kitchen}/api/orders/${order.id}/accept`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delayMinutes: 5 }),
  });
  assert.equal(acceptance.status, 200);
  assert.ok((await kitchenEvent()).data.order.confirmedReadyAt);
  assert.ok((await clientEvent()).data.order.acceptedAt);
  const updated = await fetch(`${bases.kitchen}/api/orders/${order.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cooking' }),
  });
  assert.equal(updated.status, 200);
  const event = await clientEvent();
  assert.equal(event.type, 'order_status_updated');
  assert.equal(event.data.status, 'cooking');
  assert.equal((await fetch(`${bases.analytics}/api/analytics`)).status, 200);
  assert.equal((await kitchenEvent()).data.status, 'cooking');
  const availability = await (await fetch(`${bases.kitchen}/api/availability`)).json();
  const manual = await fetch(`${bases.kitchen}/api/kitchen/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ productId: 'shawarma-beef', sizeId: 'medium', qty: 1 }], requestedReadyAt: availability.slots[0], clientRequestId: 'integration-manual' }),
  });
  assert.equal(manual.status, 201);
  assert.equal((await kitchenEvent()).data.source, 'kitchen');
  assert.ok((await clientEvent()).data.confirmedReadyAt);
  for (const acceptingOrders of [false, true]) {
    const state = await fetch(`${bases.kitchen}/api/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptingOrders }) });
    assert.equal(state.status, 200);
    assert.equal((await clientEvent()).data.acceptingOrders, acceptingOrders);
    assert.equal((await kitchenEvent()).data.acceptingOrders, acceptingOrders);
  }
  console.log('PASS Kitchen manual order -> Sync -> confirmed order SSE; cafe open/close -> client SSE');
  console.log('PASS Client POST -> Sync -> Kitchen SSE; Kitchen PATCH -> Sync -> Client SSE; Analytics GET');
} finally {
  clearTimeout(timeout);
  for (const controller of controllers) controller.abort();
  await Promise.all(servers.map(server => server.close()));
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
}
