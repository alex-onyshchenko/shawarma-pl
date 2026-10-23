import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const auth = 'Basic ' + Buffer.from('admin:admin').toString('base64');
test('Basic Auth protects admin APIs; optional ingredient photos, uploads and menu changes persist', { timeout: 20000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'admin-media-test-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: join(directory, 'test.sqlite'), MEDIA_PATH: join(directory, 'media'), ADMIN_BASIC_USER: 'admin', ADMIN_BASIC_PASSWORD: 'admin', TELEGRAM_BOT_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('Server timeout: ' + output)), 5000);
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/running on port (\d+)/); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); } });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', reject); child.once('exit', code => { clearTimeout(timer); reject(Error('Server exited ' + code + ': ' + output)); });
    });
  }
  async function stop() { if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
  async function call(path, method = 'GET', body, extra = {}) {
    const response = await fetch(base + path, { method, headers: { Authorization: auth, 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { response, status: response.status, data: await response.json() };
  }
  try {
    await start();
    const unauthorized = await call('/api/admin/state', 'GET', undefined, { Authorization: '' });
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.response.headers.get('www-authenticate'), /^Basic realm="Shaurmisha Admin"/);
    assert.equal((await call('/api/admin/state', 'GET', undefined, { Authorization: 'Basic ' + Buffer.from('admin:wrong').toString('base64') })).status, 401);
    assert.equal((await call('/api/admin/ingredients', 'POST', { name: 'Injected' }, { Origin: 'https://evil.example' })).status, 403);
    const initial = (await call('/api/admin/state')).data;
    assert.ok(initial.ingredients.length > 0);
    const ingredient = (await call('/api/admin/ingredients', 'POST', { name: 'Тестовий інгредієнт' })).data.ingredient;
    assert.equal(ingredient.imageUrl, '');
    assert.equal((await call('/api/admin/ingredients', 'POST', { name: 'тестовий інгредієнт' })).status, 409);
    assert.equal((await call('/api/admin/images', 'POST', { data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64') })).status, 400);
    assert.equal((await call('/api/admin/images', 'POST', { data: 'bad-data' })).status, 400);
    const png = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#e67e22' } }).png().toBuffer();
    const uploaded = await call('/api/admin/images', 'POST', { data: png.toString('base64') });
    assert.equal(uploaded.status, 201);
    assert.match(uploaded.data.imageUrl, /^\/media\/[a-f0-9-]+\.webp$/);
    const image = await fetch(base + uploaded.data.imageUrl);
    assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/webp');
    assert.match(image.headers.get('cache-control'), /immutable/);
    const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 1600);
    assert.equal((await fetch(base + '/media/unknown.webp')).status, 404);
    assert.equal((await fetch(base + '/media/%2e%2e/test.sqlite')).status, 404);
    const photo = uploaded.data.imageUrl;
    assert.equal((await call('/api/admin/ingredients/' + ingredient.id, 'PATCH', { imageUrl: photo })).status, 200);
    const product = initial.menus.demo.find(item => item.id === 'shawarma-signature');
    const updatedSizes = product.sizes.map(size => ({ ...size, price: size.price + 1 }));
    const edited = await call('/api/admin/points/demo/menu/' + product.id, 'PATCH', { product: { ingredientIds: [ingredient.id], imageUrl: photo }, sizes: updatedSizes });
    assert.equal(edited.status, 200);
    assert.equal((await call('/api/admin/points/demo/menu/' + product.id, 'PATCH', { product: { ingredientIds: ['missing'] } })).status, 400);
    const pointBefore = initial.points[0];
    await call('/api/admin/points/demo', 'PATCH', { weeklyHours: pointBefore.weeklyHours.map(day => ({ ...day, open: '11:15', close: '21:45' })) });
    const menu = (await call('/api/menu')).data.products.find(item => item.id === product.id);
    assert.equal(menu.description, 'Тестовий інгредієнт.');
    assert.equal(menu.imageUrl, photo); assert.equal(menu.ingredients[0].imageUrl, photo);
    assert.equal(menu.sizes[0].price, product.sizes[0].price + 1);
    await call('/api/admin/ingredients/' + ingredient.id, 'PATCH', { name: 'Нова назва', imageUrl: '' });
    await stop(); await start();
    const persisted = (await call('/api/menu')).data.products.find(item => item.id === product.id);
    assert.equal(persisted.description, 'Нова назва.');
    assert.equal(persisted.ingredients[0].imageUrl, '');
    assert.equal(persisted.imageUrl, photo);
    assert.equal((await fetch(base + photo)).status, 200);
    const pointAfter = (await call('/api/admin/state')).data.points[0];
    assert.equal(pointAfter.weeklyHours[0].open, '11:15');
    assert.equal(pointAfter.acceptingOrders, pointBefore.acceptingOrders);
  } finally { await stop(); rmSync(directory, { recursive: true, force: true }); }
});
