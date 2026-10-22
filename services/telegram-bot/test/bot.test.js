import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { getConfig } from '../src/config.js';
import { createWebhookHandler } from '../src/handler.js';
import { telegramRequest } from '../src/telegram.js';
import { registerWebhook } from '../src/registration.js';

const env = {
  TELEGRAM_BOT_USERNAME: 'shaurmisha_pl_bot',
  MINI_APP_URL: 'https://shawarma-pl-pe1y.vercel.app/',
  BOT_PUBLIC_URL: 'https://bot.example.com', TELEGRAM_BOT_TOKEN: '12345:unit_test_placeholder',
};
const handler = createWebhookHandler(() => getConfig(env));
const update = (text = '/start', extra = {}) => ({ update_id: 42, message: { message_id: 7, chat: { id: 123, type: 'private' }, text, ...extra } });
function request(body, contentType = 'application/json') {
  return new Request('https://bot.example.com/api/webhook', {
    method: 'POST', headers: { 'Content-Type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('/start and /help return an inline Mini App button without a bot token or outbound request', async () => {
  for (const command of ['/start', '/start qr_code', '/start@Shaurmisha_pl_bot campaign', '/help']) {
    const response = await handler(request(update(command)));
    assert.equal(response.status, 200);
    const reply = await response.json();
    assert.equal(reply.method, 'sendMessage');
    assert.equal(reply.chat_id, 123);
    assert.match(reply.text, /Вітаємо у ШаурМіша/);
    assert.deepEqual(reply.reply_markup.inline_keyboard, [[{ text: '🌯 Відкрити меню', web_app: { url: env.MINI_APP_URL } }]]);
  }
});

test('ignores groups, unrelated commands, edits, bots and non-message updates', async () => {
  const updates = [update('/start', { chat: { id: -123, type: 'group' } }), update('/start', { from: { is_bot: true } }), update('hello'), update('/startsomething'), update('/start@another_bot'), { update_id: 1 }, { update_id: 2, edited_message: update().message }];
  for (const value of updates) assert.deepEqual(await (await handler(request(value))).json(), { ok: true });
});

test('accepts requests without a secret but rejects malformed, oversized and misconfigured requests', async () => {
  assert.equal((await handler(request(update()))).status, 200);
  const legacy = request(update());
  legacy.headers.set('X-Telegram-Bot-Api-Secret-Token', 'old-value-is-ignored');
  assert.equal((await handler(legacy)).status, 200);
  assert.equal((await handler(new Request('https://bot.example.com/api/webhook'))).status, 405);
  assert.equal((await handler(request(update(), 'text/plain'))).status, 415);
  assert.equal((await handler(request('{broken'))).status, 400);
  for (const value of [null, [], {}, { update_id: '1' }]) assert.equal((await handler(request(JSON.stringify(value)))).status, 400);
  assert.equal((await handler(request(' '.repeat(65537)))).status, 413);
  const unconfigured = createWebhookHandler(() => getConfig({}));
  const response = await unconfigured(request(update()));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Bot is not configured' });
});

test('configuration requires a public HTTPS Mini App URL without a webhook secret', () => {
  for (const url of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://user:password@example.com', 'not a URL']) assert.throws(() => getConfig({ ...env, MINI_APP_URL: url }));
  assert.equal('secret' in getConfig(env), false);
  assert.equal(getConfig({ ...env, TELEGRAM_BOT_USERNAME: '@shaurmisha_pl_bot' }).username, env.TELEGRAM_BOT_USERNAME);
});

test('registration checks identity and deployment then registers without a secret', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, options, body });
    if (path.endsWith('/getMe')) return Response.json({ ok: true, result: { username: env.TELEGRAM_BOT_USERNAME } });
    if (path === '/api/health') return Response.json({ status: 'ok', service: 'telegram-bot' });
    if (path === '/api/webhook') return handler(request(body));
    if (path.endsWith('/setWebhook')) return Response.json({ ok: true, result: true });
    assert.fail('Unexpected URL');
  };
  const result = await registerWebhook(env, fakeFetch);
  assert.equal(result.webhookUrl, 'https://bot.example.com/api/webhook');
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[3].body, { url: result.webhookUrl, allowed_updates: ['message'], drop_pending_updates: false });
  assert.deepEqual(calls[2].body, { update_id: 0 });
  let mutated = false;
  await assert.rejects(registerWebhook(env, async url => {
    if (String(url).endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'wrong_bot' } });
    mutated = true;
  }), /does not match/);
  assert.equal(mutated, false);
  await assert.rejects(registerWebhook(env, async url => {
    if (String(url).endsWith('/getMe')) return Response.json({ ok: true, result: { username: env.TELEGRAM_BOT_USERNAME } });
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }), /Deployment check failed/);
});

test('Telegram connection failures do not expose tokens or upstream response details', async () => {
  await assert.rejects(telegramRequest(env.TELEGRAM_BOT_TOKEN, 'getMe', {}, async () => { throw new Error(env.TELEGRAM_BOT_TOKEN); }), error => !error.message.includes(env.TELEGRAM_BOT_TOKEN));
  await assert.rejects(telegramRequest(env.TELEGRAM_BOT_TOKEN, 'getMe', {}, async () => Response.json({ ok: false, description: env.TELEGRAM_BOT_TOKEN }, { status: 401 })), error => !error.message.includes(env.TELEGRAM_BOT_TOKEN));
});

test('standalone HTTP server exposes the same health and public webhook without Sync', async () => {
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...env, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.stdout.on('data', chunk => { const match = String(chunk).match(/port (\d+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
      child.on('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    const response = await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update()) });
    assert.equal((await response.json()).reply_markup.inline_keyboard[0][0].web_app.url, env.MINI_APP_URL);
    assert.equal((await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ update_id: 0 }) })).status, 200);
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  }
});
