import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSetupHandler } from '../src/setup.js';
import { registerWebhook } from '../src/registration.js';

const token = '12345:unit_test_placeholder';
const env = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'bot.example.com', MINI_APP_URL: 'https://menu.example.com', TELEGRAM_BOT_USERNAME: 'shaurmisha_pl_bot' };
const request = (body = { token }, headers = {}) => new Request('https://bot.example.com/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://bot.example.com', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('browser registration forwards the token only for the configured production destination', async () => {
  let received;
  const handler = createSetupHandler(() => env, async options => { received = options; return { username: 'shaurmisha_pl_bot' }; });
  const response = await handler(request({ token, BOT_PUBLIC_URL: 'https://attacker.example.com' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, username: 'shaurmisha_pl_bot' });
  assert.equal(received.TELEGRAM_BOT_TOKEN, token);
  assert.equal(received.BOT_PUBLIC_URL, 'https://bot.example.com');
  assert.equal(env.TELEGRAM_BOT_TOKEN, undefined);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('setup cannot run on preview or use caller Host as the webhook origin', async () => {
  let calls = 0;
  const register = async () => { calls++; throw new Error('Must not register'); };
  assert.equal((await createSetupHandler(() => ({ ...env, VERCEL_ENV: 'preview' }), register)(request())).status, 403);
  assert.equal((await createSetupHandler(() => ({}), register)(request())).status, 503);
  assert.equal((await createSetupHandler(() => env, register)(request({ token }, { Origin: 'https://attacker.example.com' }))).status, 403);
  assert.equal(calls, 0);
});

test('setup requires a token in the POST body and rejects oversized or malformed input', async () => {
  const handler = createSetupHandler(() => ({ ...env, TELEGRAM_BOT_TOKEN: token }), async () => assert.fail('Must not register'));
  assert.equal((await handler(new Request('https://bot.example.com/api/setup'))).status, 405);
  for (const body of [{}, { token: '' }, { token: 'not a token' }, { token: 123 }]) assert.equal((await handler(request(body))).status, 400);
  assert.equal((await handler(request('{broken'))).status, 400);
  assert.equal((await handler(request({ token }, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await handler(request(' '.repeat(4097)))).status, 413);
});

test('setup validates bot ownership through Telegram before registering; error responses never echo the token', async () => {
  let registered = false;
  const wrongBot = createSetupHandler(() => env, options => registerWebhook(options, async url => {
    if (String(url).endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'another_bot' } });
    registered = true;
    throw new Error('Must not reach setWebhook');
  }));
  const wrongResponse = await wrongBot(request());
  assert.equal(wrongResponse.status, 403);
  assert.equal(registered, false);
  const broken = createSetupHandler(() => env, async () => { throw new Error(token); });
  const response = await broken(request());
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes(token), false);
});
