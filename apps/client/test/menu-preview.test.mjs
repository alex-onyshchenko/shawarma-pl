import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the actual Vite env transformation used by the standalone build.
test('standalone preview renders the menu and blocks all Sync activity', async () => {
  const server = await createServer({ mode: 'dev', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;
  let networkCalls = 0;
  globalThis.fetch = () => { networkCalls++; throw new Error('Unexpected network request'); };
  globalThis.EventSource = class { constructor() { networkCalls++; throw new Error('Unexpected SSE connection'); } };
  try {
    const { default: Preview } = await server.ssrLoadModule('/src/MenuPreviewApp.jsx');
    const html = renderToStaticMarkup(React.createElement(Preview));
    for (const name of ['Фірмова шаурма', 'Класична шаурма', 'Яловича шаурма', 'Замовлення незабаром', 'Переглянути', 'Соборності, 46']) assert.ok(html.includes(name), name);
    assert.ok(!html.includes('Перейти до кошика'));
    const { default: menu } = await server.ssrLoadModule('/src/preview-menu.json');
    const { default: Modal } = await server.ssrLoadModule('/src/components/ModifierModal.jsx');
    const details = renderToStaticMarkup(React.createElement(Modal, { product: menu.products[0], modifiers: menu.modifiers, previewOnly: true }));
    for (const text of ['Маленька', 'Середня', 'Велика', '200', '230', '260', 'Повернутися до меню']) assert.ok(details.includes(text), text);
    assert.ok(!details.includes('Додати в кошик'));
    assert.ok(!details.includes('До сплати'));
    const { orderSync } = await server.ssrLoadModule('/src/utils/orderSync.js');
    await assert.rejects(orderSync.getMenu(), /лише перегляд меню/);
    await assert.rejects(orderSync.createOrder({}), /лише перегляд меню/);
    const unsubscribe = orderSync.subscribe({ onInit: () => assert.fail('Preview must not subscribe') });
    unsubscribe();
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEventSource === undefined) delete globalThis.EventSource; else globalThis.EventSource = originalEventSource;
    await server.close();
  }
});
