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
    const { default: CafeStatus } = await server.ssrLoadModule('/src/components/CafeStatus.jsx');
    for (const [availability, label] of [
      [{ cafeOpen: true, onBreak: false }, 'Відчинено'],
      [{ cafeOpen: true, onBreak: true }, 'Обідня перерва'],
      [{ cafeOpen: false, onBreak: true, point: { acceptingOrders: true } }, 'Зачинено'],
      [{ cafeOpen: false, onBreak: false, point: { acceptingOrders: true } }, 'Зачинено'],
    ]) assert.ok(renderToStaticMarkup(React.createElement(CafeStatus, { availability })).includes(label));
    const workingWeek = Array.from({ length: 7 }, () => ({ closed: false, open: '10:00', close: '22:00' }));
    const scheduled = { cafeOpen: false, withinWorkingHours: false, closed: false, openMinute: 600, timeZone: 'Europe/Kyiv', serverNow: Date.parse('2026-10-24T22:00:00+03:00'), point: { acceptingOrders: true, weeklyHours: workingWeek, exceptions: [] } };
    const statusHtml = value => renderToStaticMarkup(React.createElement(CafeStatus, { availability: value }));
    assert.ok(statusHtml(scheduled).includes('Робочий час закінчився. Приходьте завтра.'));
    assert.ok(statusHtml({ ...scheduled, point: { ...scheduled.point, acceptingOrders: false } }).includes('Сьогодні вже не працюємо.</p>'));
    assert.ok(statusHtml({ ...scheduled, serverNow: Date.parse('2026-10-24T09:00:00+03:00') }).includes('Робочий час закінчився. Приходьте завтра.'));
    const holidayTomorrow = { ...scheduled, point: { ...scheduled.point, exceptions: [{ date: '2026-10-25', closed: true }] } };
    assert.ok(statusHtml(holidayTomorrow).includes('Робочий час закінчився. Приходьте завтра.'));
    assert.ok(!statusHtml(holidayTomorrow).includes('Чекаємо наступного робочого дня'));
    const closedSunday = workingWeek.map((day, index) => index === 6 ? { ...day, closed: true } : day);
    assert.ok(statusHtml({ ...scheduled, point: { ...scheduled.point, weeklyHours: closedSunday } }).includes('Робочий час закінчився. Приходьте завтра.'));
    assert.match(html, /Відстежувати статус/);
    assert.ok(!html.includes('імітація'));
    assert.deepEqual(paths.sort(), ['/api/availability', '/api/menu']);
    const { default: Modifier } = await server.ssrLoadModule('/src/components/ModifierModal.jsx');
    const { default: seed } = await server.ssrLoadModule('/src/preview-menu.json');
    const withIngredients = { ...seed.products[0], ingredients: [{ id: 'tomato', name: 'Томати', imageUrl: '' }, { id: 'cheese', name: 'Сир', imageUrl: '/media/00000000-0000-0000-0000-000000000000.webp' }] };
    const ingredientHtml = renderToStaticMarkup(React.createElement(Modifier, { product: withIngredients, modifiers: seed.modifiers, previewOnly: true }));
    assert.match(ingredientHtml, /aria-label="Інгредієнти"/);
    assert.match(ingredientHtml, /Томати/);
    assert.match(ingredientHtml, /Сир/);
    assert.ok(!ingredientHtml.includes('00000000-0000-0000-0000-000000000000.webp'));
  } finally {
    unsubscribe?.();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalEventSource === undefined) delete globalThis.EventSource; else globalThis.EventSource = originalEventSource;
    await server.close();
  }
});
