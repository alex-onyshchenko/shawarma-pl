import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

let child;
let base;

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
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
      customerName: 'Integration test',
      totalPrice: 150,
      items: [{ name: 'Класична Шаурма', qty: 1, added: [], removed: [] }],
    };
    const created = await fetch(`${base}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).order.id, order.id);
    const incoming = await nextEvent();
    assert.equal(incoming.type, 'new_order');
    assert.equal(incoming.data.id, order.id);

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
