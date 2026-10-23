import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';

const token = 'notification-api-test-token';
function initData(id) {
  const params = new URLSearchParams({ user: JSON.stringify({ id, first_name: 'Test' }), auth_date: String(Math.floor(Date.now() / 1000)) });
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'));
  return params.toString();
}

test('API queues actual order events, validates identity and never exposes Telegram recipients', { timeout: 18000 }, async () => {
  // Stub Telegram in the child only. No real messages or external requests.
  const preload = `globalThis.fetch=async(url,options)=>{if(!String(url).startsWith('https://api.telegram.org/'))throw Error('Unexpected outbound request');console.log('BOT_MESSAGE:'+options.body);return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{status:200})}`;
  const child = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(preload), 'server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: ':memory:', ADMIN_TOKEN: 'test-admin', TELEGRAM_BOT_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const waitFor = async predicate => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; if (child.exitCode !== null) throw Error(output); await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error('Timed out: ' + output);
  };
  try {
    await waitFor(() => /running on port (\d+)/.test(output));
    const base = 'http://127.0.0.1:' + output.match(/running on port (\d+)/)[1];
    const call = async (path, method = 'GET', body, cookie = '') => {
      const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
    };
    const login = await call('/api/admin/session', 'POST', { password: 'test-admin' });
    const offset = 12 - new Date().getUTCHours();
    const zone = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
    assert.equal((await call('/api/admin/points/demo', 'PATCH', { timeZone: zone, weeklyHours: Array.from({ length: 7 }, () => ({ closed: false, open: '00:00', close: '24:00' })) }, login.cookie)).status, 200);
    const body = { items: [{ productId: 'shawarma-classic', sizeId: 'small', qty: 1 }], timingMode: 'asap', telegramInitData: initData(12345), notificationsEnabled: true, clientRequestId: 'notify-test', trackingToken: 'a'.repeat(64) };
    assert.equal((await call('/api/orders', 'POST', { ...body, telegramInitData: initData(12345).replace('Test', 'Forged') })).status, 401);
    const placed = await call('/api/orders', 'POST', body);
    assert.equal(placed.status, 201);
    assert.equal(placed.body.order.notificationsEnabled, true);
    assert.ok(!JSON.stringify(placed.body).includes('telegramUserId'));
    assert.ok(!JSON.stringify(placed.body).includes('trackingTokenHash'));
    assert.equal((await call('/api/orders', 'POST', body)).status, 200);
    assert.equal((await call('/api/orders', 'POST', { ...body, telegramInitData: initData(55555), trackingToken: 'b'.repeat(64) })).status, 409);
    const id = placed.body.order.id;
    assert.equal((await call('/api/orders/' + id + '/accept', 'POST', { delayMinutes: 0 })).status, 200);
    for (const status of ['cooking', 'new', 'cooking', 'ready', 'cooking', 'ready']) {
      const result = await call('/api/orders/' + id + '/status', 'PATCH', { status });
      assert.equal(result.status, 200); // backwards API remains supported
      assert.ok(!JSON.stringify(result.body).includes('telegramUserId'));
    }
    assert.equal((await call('/api/client/notifications', 'POST', { id, telegramInitData: initData(55555) })).status, 404);
    const feed = await call('/api/orders');
    assert.ok(!JSON.stringify(feed.body).includes('trackingTokenHash'));
    const sent = () => output.split('\n').filter(line => line.startsWith('BOT_MESSAGE:')).map(line => JSON.parse(line.slice('BOT_MESSAGE:'.length)));
    await waitFor(() => sent().length === 4);
    assert.ok(sent().every(message => message.chat_id === 12345));
    assert.match(sent()[2].text, /готується/);
    assert.match(sent()[3].text, /готове до видачі/);
    const declined = await call('/api/orders', 'POST', { ...body, clientRequestId: 'declined', notificationsEnabled: false });
    assert.equal(declined.body.order.notificationsEnabled, false);
    assert.equal((await call('/api/client/notifications', 'POST', { id: declined.body.order.id, telegramInitData: body.telegramInitData })).status, 200);
    await waitFor(() => sent().length === 5);
    const cancelled = await call('/api/orders', 'POST', { ...body, clientRequestId: 'cancel-test' });
    assert.equal(cancelled.status, 201);
    const cancelPath = '/api/orders/' + cancelled.body.order.id;
    for (const comment of ['', '   ', 'x'.repeat(501), 123]) {
      assert.equal((await call(cancelPath + '/cancel', 'POST', { comment })).status, 400);
    }
    const result = await call(cancelPath + '/cancel', 'POST', { comment: '  Закінчилася курка  ' });
    assert.equal(result.status, 200);
    assert.equal(result.body.order.status, 'cancelled');
    assert.equal(result.body.order.cancellationComment, 'Закінчилася курка');
    assert.ok(!JSON.stringify(result.body).includes('telegramUserId'));
    const repeated = await call(cancelPath + '/cancel', 'POST', { comment: 'Інша причина' });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.order.cancellationComment, 'Закінчилася курка');
    const snapshot = (await call('/api/orders')).body;
    assert.ok(!snapshot.orders.some(order => order.id === cancelled.body.order.id));
    assert.equal(snapshot.archivedOrders.filter(order => order.id === cancelled.body.order.id).length, 1);
    assert.equal((await call(cancelPath + '/status', 'PATCH', { status: 'ready' })).status, 409);
    assert.equal((await call('/api/orders/' + id + '/cancel', 'POST', { comment: 'Too late' })).status, 409);
    await waitFor(() => sent().some(message => message.text.includes('скасовано кухнею')));
    assert.equal(sent().filter(message => message.text.includes('скасовано кухнею')).length, 1);
    assert.match(sent().find(message => message.text.includes('скасовано кухнею')).text, /Закінчилася курка/);
    assert.equal((await call('/api/analytics')).body.summary.totalOrders, 2);
    assert.ok(!output.includes(token));
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
  }
});
