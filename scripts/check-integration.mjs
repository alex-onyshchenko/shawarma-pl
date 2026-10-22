import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from '../apps/client/node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const child = spawn(process.execPath, ['services/sync/server.js'], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
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
  process.env.SYNC_API_TARGET = api;
  const bases = {};
  for (const app of ['client', 'kitchen', 'analytics']) {
    const appRoot = fileURLToPath(new URL(`../apps/${app}/`, import.meta.url));
    const server = await createServer({
      root: appRoot,
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
    id: 'cross-service-test', totalPrice: 150,
    items: [{ name: 'Шаурма', qty: 1, added: [], removed: [] }],
  };
  const created = await fetch(`${bases.client}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
  assert.equal(created.status, 201);
  assert.equal((await kitchenEvent()).data.id, order.id);
  assert.equal((await clientEvent()).type, 'new_order');
  const updated = await fetch(`${bases.kitchen}/api/orders/${order.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cooking' }),
  });
  assert.equal(updated.status, 200);
  const event = await clientEvent();
  assert.equal(event.type, 'order_status_updated');
  assert.equal(event.data.status, 'cooking');
  assert.equal((await fetch(`${bases.analytics}/api/analytics`)).status, 200);
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
