import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('client reads only public menu/availability; tracking opens the bot without reading orders', async () => {
  const server = await createServer({ mode: 'prod', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalEventSource = globalThis.EventSource;
  const paths = [];
  let unsubscribe;
  try {
    globalThis.fetch = async url => {
      paths.push(new URL(url, 'http://test').pathname);
      return { ok: true, json: async () => String(url).endsWith('/api/menu') ? { revision: 1, products: [] } : { acceptingOrders: true } };
    };
    globalThis.EventSource = class { constructor() { assert.fail('Client must not subscribe to kitchen SSE'); } };
    const { orderSync } = await server.ssrLoadModule('/src/utils/orderSync.js');
    await new Promise((resolve, reject) => {
      unsubscribe = orderSync.subscribe({ onInit: result => { try { assert.ok(!('orders' in result)); resolve(); } catch (error) { reject(error); } } });
    });
    unsubscribe();
    assert.deepEqual(paths.sort(), ['/api/availability', '/api/menu']);
    let permitted = 0; const navigation = [];
    globalThis.window = { Telegram: { WebApp: {
      initData: 'test-data', initDataUnsafe: { user: {} },
      requestWriteAccess: callback => { permitted++; callback(true); },
      openTelegramLink: link => navigation.push(link), close: () => navigation.push('close'),
    } } };
    const { tg } = await server.ssrLoadModule('/src/utils/telegram.js');
    assert.equal(await tg.requestNotifications(), true);
    assert.equal(permitted, 1);
    window.Telegram.WebApp.initDataUnsafe.user.allows_write_to_pm = true;
    assert.equal(await tg.requestNotifications(), true);
    assert.equal(permitted, 1);
    tg.trackInBot();
    assert.deepEqual(navigation, ['https://t.me/shaurmisha_pl_bot', 'close']);
    const { default: Success } = await server.ssrLoadModule('/src/components/OrderSuccessModal.jsx');
    const html = renderToStaticMarkup(React.createElement(Success, { order: { id: '1001', notificationsEnabled: true, baselineReadyAt: Date.now(), timeZone: 'Europe/Kyiv', totalPrice: 200, items: [], pointName: 'ШаурМіша' }, telegramNotifications: true, onReset: () => {} }));
    assert.match(html, /Відстежувати статус/);
    assert.ok(!html.includes('імітація'));
    assert.deepEqual(paths.sort(), ['/api/availability', '/api/menu']);
    const { default: Modifier } = await server.ssrLoadModule('/src/components/ModifierModal.jsx');
    const { default: seed } = await server.ssrLoadModule('/src/preview-menu.json');
    const withIngredients = { ...seed.products[0], ingredients: [{ id: 'tomato', name: 'Томати', imageUrl: '' }, { id: 'cheese', name: 'Сир', imageUrl: '/media/00000000-0000-0000-0000-000000000000.webp' }] };
    const ingredientHtml = renderToStaticMarkup(React.createElement(Modifier, { product: withIngredients, modifiers: seed.modifiers, previewOnly: true }));
    assert.match(ingredientHtml, /Фото Томати ще не додано/);
    assert.match(ingredientHtml, /Фото інгредієнтів/);
    assert.match(ingredientHtml, /00000000-0000-0000-0000-000000000000.webp/);
  } finally {
    unsubscribe?.();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalEventSource === undefined) delete globalThis.EventSource; else globalThis.EventSource = originalEventSource;
    await server.close();
  }
});
