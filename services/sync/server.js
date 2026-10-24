import http from 'node:http';
import { salesReport, reportPdf } from './reports.js';
import { createCustomers } from './customers.js';
import { dirname, join } from 'node:path';
import { createMedia } from './media.js';
import { telegramUser, trackingHash, ownsOrder, publicJson } from './telegram.js';
import { createNotifications } from './notifications.js';
import { fileURLToPath } from 'node:url';
import { createStore, hoursForPoint, quoteOrder, DEMO_POINT_ID } from './store.js';
import { createAdminHandler } from './admin.js';
import { MINUTE, normalizeTiming, getSlots, asapAvailable, formatTime, earlyStart, getManualSlots, normalizeManualTiming, getReadyTimeSlots } from './timing.js';

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '0.0.0.0';
const adminToken = process.env.ADMIN_TOKEN || '';
const store = createStore(process.env.DATABASE_PATH || fileURLToPath(new URL('./data/shawarma.sqlite', import.meta.url)));
const media = createMedia(process.env.MEDIA_PATH || join(dirname(process.env.DATABASE_PATH || fileURLToPath(new URL('./data/shawarma.sqlite', import.meta.url))), 'media'));
const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
const notifications = createNotifications(store.db, { token: botToken });
const customers = createCustomers(store.db, botToken);
const notificationTimer = setInterval(() => notifications.tick().catch(() => console.error('Notification queue unavailable')), 1000);
notificationTimer.unref();
function availability() {
  const serverNow = Date.now();
  const point = store.activePoint();
  const hours = hoursForPoint(point, serverNow);
  const slots = getSlots(serverNow, hours);
  const acceptingOrders = point.acceptingOrders && !point.onBreak;
  return { ...hours, point, serverNow, telegramNotifications: notifications.configured, slots, manualSlots: getManualSlots(serverNow), cafeOpen: point.acceptingOrders, onBreak: point.onBreak, acceptingOrders, asapAvailable: acceptingOrders && asapAvailable(serverNow, hours) };
}
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(publicJson(body));
}
function announce(order, notificationKind) {
  broadcast('order_status_updated', { id: order.id, status: order.status, order, notificationKind });
}
function confirmationMessage(order) {
  const at = formatTime(order.confirmedReadyAt, order.timeZone);
  const payment = order.paymentStatus === 'cash_due' ? 'Оплата готівкою при отриманні.' : 'Усе оплачено (демо).';
  if (order.kitchenDelayMinutes > 0) return `⚠️ Замовлення #${order.id} вже в черзі! На кухні зараз дуже багато чеків, тому нам знадобиться трохи більше часу, щоб приготувати все ідеально. ⏱ Новий час вашої видачі: ${at}. Дякуємо за розуміння!`;
  if (order.timingMode === 'scheduled') return `🎯 Замовлення #${order.id} прийнято! ${payment} Почнемо готувати так, щоб віддати з пилу з жару рівно о ${at}. Чекаємо на вас!`;
  return `✅ Ваше замовлення #${order.id} ${order.paymentStatus === 'cash_due' ? 'прийнято!' : 'успішно оплачено (демо)!'} Кухня підтвердила час. ⏳ Орієнтовний час видачі: ${at} (~${Math.ceil((order.confirmedReadyAt - order.createdAt) / MINUTE)} хв). Ми надішлемо повідомлення, коли все буде готово!`;
}


// Empty by default; real orders are restored from SQLite without generating demo history.
const savedOrders = store.get('orders');
let orders = savedOrders?.orders || [];
let archivedOrders = savedOrders?.archivedOrders || [];
let nextOrderId = savedOrders?.nextOrderId || 1000;
if (!savedOrders) store.set('orders', { orders, archivedOrders, nextOrderId });

// SSE (Server-Sent Events) clients registry
const sseClients = new Set();

function broadcast(eventType, payload) {
  if (['new_order', 'order_status_updated', 'reset'].includes(eventType)) {
    store.db.exec('BEGIN IMMEDIATE');
    try {
      store.set('orders', { orders, archivedOrders, nextOrderId });
      if (eventType === 'reset') store.db.prepare("UPDATE telegram_outbox SET state='cancelled' WHERE state='pending'").run();
      const order = eventType === 'new_order' ? payload : payload.order;
      if (order && !payload.skipNotifications) {
        if (order.status === 'no_show') customers.restrict(order.telegramUserId, order.id);
        if (eventType === 'new_order') notifications.enqueue(order, 'placed');
        else if (payload.notificationKind) notifications.enqueue(order, payload.notificationKind);
        else if (order.status === 'new' && order.acceptedAt) notifications.enqueue(order, 'confirmed');
        else if (order.status === 'cancelled') notifications.enqueue(order, 'cancelled');
        else if (['cooking', 'ready', 'no_show'].includes(order.status)) notifications.enqueue(order, order.status);
      }
      store.db.exec('COMMIT');
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
  }
  const message = `event: ${eventType}\ndata: ${publicJson(payload)}\n\n`;
  console.log(`[BROADCAST] ${eventType} to ${sseClients.size} client(s)`);
  for (const res of sseClients) {
    try {
      res.write(message);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

// Read body helper
function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { reject(Object.assign(new Error('Запит завеликий'), { status: 413 })); return; }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const adminHandler = createAdminHandler({
  store, readJsonBody, adminToken, media,
  basicUser: process.env.ADMIN_BASIC_USER || 'admin', basicPassword: process.env.ADMIN_BASIC_PASSWORD || '',
  readOrders: () => [...orders, ...archivedOrders],
  onChange: () => { broadcast('menu_updated', store.publicMenu()); broadcast('availability_updated', availability()); },
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  console.log(`[REQ ${new Date().toLocaleTimeString()}] ${req.method} ${pathname}`);

  if (await media.serve(req, res, pathname)) return;
  if (pathname.startsWith('/api/admin/')) { await adminHandler(req, res, url); return; }

  // CORS headers for public API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'shawarma-sync' }));
    return;
  }

  if (pathname === '/api/menu' && req.method === 'GET') { json(res, 200, store.publicMenu()); return; }
  if (pathname === '/api/points' && req.method === 'GET') { json(res, 200, { points: [store.activePoint()] }); return; }

  if (pathname === '/api/availability' && req.method === 'GET') {
    json(res, 200, availability());
    return;
  }
  if (pathname === '/api/telegram/contact' && req.method === 'POST') {
    try { json(res, 200, customers.contact(await readJsonBody(req, 65536), req.headers['x-telegram-bot-api-secret-token'])); }
    catch (error) { json(res, error.status || 400, { error: error.message }); }
    return;
  }
  if (pathname === '/api/client/profile' && req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = await readJsonBody(req);
      const user = telegramUser(data.telegramInitData, botToken);
      if (!user) { json(res, 401, { error: 'Відкрийте застосунок у Telegram', code: 'PHONE_REQUIRED' }); return; }
      json(res, 200, customers.profile(user.id));
    } catch (error) { json(res, error.status || 400, { error: error.message }); }
    return;
  }

  if (pathname === '/api/client/notifications' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const user = telegramUser(data.telegramInitData, botToken);
      const order = [...orders, ...archivedOrders].find(item => item.id === String(data.id));
      if (!user || !order || order.telegramUserId !== user.id) { json(res, 404, { error: 'Замовлення не знайдено' }); return; }
      order.notificationsEnabled = true;
      // Queue only the current progress, and preserve event deduplication.
      store.db.exec('BEGIN IMMEDIATE');
      try {
        store.set('orders', { orders, archivedOrders, nextOrderId });
        if (order.status === 'cancelled') notifications.enqueue(order, 'cancelled');
        else if (['cooking', 'ready', 'no_show'].includes(order.status)) notifications.enqueue(order, order.status);
        else if (order.status === 'new') notifications.enqueue(order, order.acceptedAt ? 'confirmed' : 'placed');
        store.db.exec('COMMIT');
      } catch (error) { store.db.exec('ROLLBACK'); throw error; }
      json(res, 200, { enabled: true });
    } catch (error) { json(res, error.status || 400, { error: error.message }); }
    return;
  }
  if (pathname === '/api/settings' && req.method === 'PATCH') {
    try {
      const data = await readJsonBody(req);
      if (!('acceptingOrders' in data) && !('onBreak' in data)) throw new Error('Вкажіть статус кафе або обідньої перерви');
      const current = store.activePoint();
      const changes = {};
      if ('acceptingOrders' in data) {
        if (typeof data.acceptingOrders !== 'boolean') throw new Error('acceptingOrders must be boolean');
        changes.acceptingOrders = data.acceptingOrders;
        changes.onBreak = false;
      }
      if ('onBreak' in data) {
        if (typeof data.onBreak !== 'boolean') throw new Error('onBreak must be boolean');
        if (data.onBreak && !(changes.acceptingOrders ?? current.acceptingOrders)) { json(res, 409, { error: 'Спочатку відчиніть кафе' }); return; }
        changes.onBreak = data.onBreak;
      }
      store.updatePoint(DEMO_POINT_ID, changes);
      const state = availability();
      broadcast('availability_updated', state);
      json(res, 200, state);
    } catch (error) { json(res, 400, { error: error.message }); }
    return;
  }

  // 1. SSE Connection Endpoint: /api/events
  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(`event: init\ndata: ${publicJson({ orders, archivedOrders, availability: availability(), menu: store.publicMenu() })}\n\n`);
    sseClients.add(res);
    console.log(`[SSE CONNECTED] Active clients: ${sseClients.size}`);

    req.on('close', () => {
      sseClients.delete(res);
      console.log(`[SSE DISCONNECTED] Active clients: ${sseClients.size}`);
    });
    return;
  }

  // 2. GET /api/orders - list current active orders
  if (pathname === '/api/orders' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(publicJson({ orders, archivedOrders, availability: availability(), menu: store.publicMenu() }));
    return;
  }

  // Kitchen creation uses the same validation, with an atomically confirmed deadline.
  if (['/api/orders', '/api/kitchen/orders'].includes(pathname) && req.method === 'POST') {
    const manual = pathname === '/api/kitchen/orders';
    try {
      const data = await readJsonBody(req);
      const user = manual ? null : telegramUser(data.telegramInitData, botToken);
      const duplicate = data.clientRequestId && [...orders, ...archivedOrders].find(o => o.clientRequestId === data.clientRequestId);
      if (duplicate && duplicate.trackingTokenHash && !ownsOrder(duplicate, { ...data, user })) { json(res, 409, { error: 'Ключ запиту вже використано' }); return; }
      if (duplicate) { json(res, 200, { success: true, order: duplicate }); return; }
      const cafe = store.activePoint();
      if (!manual && (!cafe.acceptingOrders || cafe.onBreak)) { json(res, 409, { error: cafe.onBreak ? 'Обідня перерва. Прийом замовлень тимчасово призупинено' : 'Кафе зачинено. Прийом замовлень зупинено', code: cafe.onBreak ? 'LUNCH_BREAK' : 'ORDERS_PAUSED' }); return; }
      if (!Array.isArray(data.items) || !data.items.length) throw new Error('Замовлення не може бути порожнім');
      if (data.paymentMethod && data.paymentMethod !== 'cash') { json(res, 409, { error: 'Наразі доступна лише оплата при отриманні' }); return; }
      if (data.cutlery !== undefined && typeof data.cutlery !== 'boolean') { json(res, 400, { error: 'Перевірте вибір приборів' }); return; }
      const quote = quoteOrder(store, data);
      const phoneNumber = manual ? (typeof data.phoneNumber === 'string' ? data.phoneNumber.trim().slice(0, 50) : '') : customers.checkOrder(user, quote, data);
      const createdAt = Date.now();
      const timing = manual ? normalizeManualTiming(data, createdAt) : normalizeTiming(data, createdAt, hoursForPoint(store.activePoint(), createdAt));
      const newId = data.id ? String(data.id) : String(nextOrderId++);
      if ([...orders, ...archivedOrders].some(o => o.id === newId)) { json(res, 409, { error: 'Замовлення з таким ID вже існує' }); return; }
      const timeStr = formatTime(createdAt, store.activePoint().timeZone);

      const newOrder = {
        id: newId,
        time: timeStr,
        createdAt,
        status: 'new',
        ...timing,
        timeZone: store.activePoint().timeZone,
        clientRequestId: data.clientRequestId || null,
        source: manual ? 'kitchen' : 'client',
        telegramUserId: user?.id || null,
        notificationsEnabled: Boolean(user && data.notificationsEnabled === true),
        trackingTokenHash: !manual && typeof data.trackingToken === 'string' && data.trackingToken.length >= 32 && data.trackingToken.length <= 256 ? trackingHash(data.trackingToken) : null,
        confirmedReadyAt: manual ? timing.baselineReadyAt : null,
        acceptedAt: manual ? createdAt : null,
        kitchenDelayMinutes: 0,
        paymentMethod: 'cash',
        paymentStatus: 'cash_due',
        paymentSimulation: true,
        paidAt: null,
        cutlery: data.cutlery ?? true,
        notification: 'Замовлення оформлено. Очікуємо підтвердження часу кухнею.',
        orderType: data.orderType || 'pickup',
        customerName: user?.first_name ? [user.first_name, user.last_name].filter(Boolean).join(' ') : data.customerName || 'Telegram Замовник',
        phoneNumber,
        totalPrice: data.totalPrice || data.finalTotal || 0,
        deliveryAddress: data.deliveryAddress || null,
        selectedLocation: data.selectedLocation || null,
        orderComment: data.orderComment || '',
        ...quote
      };

      if (manual) newOrder.notification = confirmationMessage(newOrder);
      orders.unshift(newOrder);
      console.log(`[NEW ORDER CREATED] #${newOrder.id} - ${newOrder.customerName} - ${newOrder.items.length} item(s)`);

      // Broadcast to all connected clients (KDS tablets + customer apps)
      broadcast('new_order', newOrder);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(publicJson({ success: true, order: newOrder }));
    } catch (err) {
      console.error('[POST /api/orders error]', err.status || 400);
      res.writeHead(err.status || 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, code: err.code }));
    }
    return;
  }

  const acceptMatch = pathname.match(/^\/api\/orders\/([^/]+)\/accept$/);
  if (acceptMatch && req.method === 'POST') {
    try {
      const order = orders.find(o => o.id === decodeURIComponent(acceptMatch[1]));
      if (!order) { json(res, 404, { error: 'Замовлення не знайдено' }); return; }
      const { delayMinutes } = await readJsonBody(req);
      if (![0, 5, 10, 15].includes(delayMinutes)) throw new Error('Доступний зсув: 0, 5, 10 або 15 хвилин');
      if (order.acceptedAt) {
        if (order.kitchenDelayMinutes === delayMinutes) { json(res, 200, { success: true, order }); return; }
        json(res, 409, { error: 'Час уже підтверджено. Повторний зсув недоступний' }); return;
      }
      if (order.status !== 'new') { json(res, 409, { error: 'Підтвердити можна лише нове замовлення' }); return; }
      order.kitchenDelayMinutes = delayMinutes;
      order.confirmedReadyAt = order.baselineReadyAt + delayMinutes * MINUTE;
      order.acceptedAt = Date.now();
      order.notification = confirmationMessage(order);
      announce(order);
      json(res, 200, { success: true, order });
    } catch (error) { json(res, 400, { error: error.message }); }
    return;
  }

  const readyTimeMatch = pathname.match(/^\/api\/orders\/([^/]+)\/ready-time$/);
  if (readyTimeMatch && req.method === 'POST') {
    try {
      const order = orders.find(item => item.id === decodeURIComponent(readyTimeMatch[1]));
      if (!order) { json(res, 404, { error: 'Замовлення не знайдено' }); return; }
      if (order.status !== 'new') { json(res, 409, { error: 'Час можна змінити лише в колонці «Нові»' }); return; }
      const { readyAt, expectedReadyAt } = await readJsonBody(req);
      const previous = order.confirmedReadyAt || order.baselineReadyAt;
      if (expectedReadyAt !== undefined && expectedReadyAt !== previous && readyAt !== previous) { json(res, 409, { error: 'Час уже змінився. Перевірте актуальний час і повторіть дію' }); return; }
      // Retrying a successful request must not queue another Telegram message.
      if (readyAt === previous) { json(res, 200, { success: true, order }); return; }
      if (typeof readyAt !== 'number' || !Number.isFinite(readyAt) || !Number.isFinite(new Date(readyAt).getTime()) || readyAt % MINUTE !== 0 || readyAt <= Date.now()) {
        json(res, 400, { error: 'Оберіть майбутні дату та час із точністю до хвилини' }); return;
      }
      if (!getReadyTimeSlots(Date.now(), hoursForPoint(store.point(order.pointId || DEMO_POINT_ID), Date.now())).includes(readyAt)) {
        json(res, 400, { error: 'Оберіть час сьогодні до завершення робочого дня закладу' }); return;
      }
      const firstConfirmation = !order.acceptedAt;
      order.confirmedReadyAt = readyAt;
      order.acceptedAt ||= Date.now();
      order.kitchenDelayMinutes = (readyAt - order.baselineReadyAt) / MINUTE;
      order.timeRevision = (order.timeRevision || 0) + 1;
      order.notification = `Час видачі змінено: ${formatTime(readyAt, order.timeZone)}`;
      announce(order, firstConfirmation ? 'confirmed' : `time_changed:${order.timeRevision}`);
      json(res, 200, { success: true, order });
    } catch (error) { json(res, 400, { error: error.message }); }
    return;
  }

  const cancelMatch = pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === 'POST') {
    try {
      const id = decodeURIComponent(cancelMatch[1]);
      const { comment = '' } = await readJsonBody(req);
      if (typeof comment !== 'string' || comment.trim().length > 500) {
        json(res, 400, { error: 'Коментар має містити до 500 символів' }); return;
      }
      const previous = archivedOrders.find(order => order.id === id);
      if (previous?.status === 'cancelled') { json(res, 200, { success: true, order: previous }); return; }
      const index = orders.findIndex(order => order.id === id);
      if (index === -1) { json(res, 404, { error: 'Замовлення не знайдено' }); return; }
      const order = orders[index];
      if (order.status !== 'new') { json(res, 409, { error: 'Скасувати можна лише замовлення в колонці «Нові»' }); return; }
      const cancelled = { ...order, status: 'cancelled', cancellationComment: comment.trim(), cancelledAt: Date.now(), notification: comment.trim() ? `Замовлення скасовано. Причина: ${comment.trim()}` : 'Замовлення скасовано' };
      orders.splice(index, 1);
      archivedOrders.unshift(cancelled);
      broadcast('order_status_updated', { id, status: 'cancelled', order: cancelled });
      json(res, 200, { success: true, order: cancelled });
    } catch (error) { json(res, error.status || 400, { error: error.message }); }
    return;
  }

  const noShowMatch = pathname.match(/^\/api\/orders\/([^/]+)\/no-show$/);
  if (noShowMatch && req.method === 'POST') {
    try {
      const id = decodeURIComponent(noShowMatch[1]);
      const data = await readJsonBody(req);
      if (data.confirmed !== true) { json(res, 400, { error: 'Підтвердьте неявку клієнта' }); return; }
      const previous = archivedOrders.find(order => order.id === id);
      if (previous?.status === 'no_show') { json(res, 200, { success: true, order: previous }); return; }
      const index = orders.findIndex(order => order.id === id);
      if (index === -1) { json(res, 404, { error: 'Замовлення не знайдено' }); return; }
      const order = orders[index];
      if (order.status !== 'ready' || order.paymentStatus !== 'cash_due') { json(res, 409, { error: 'Неявку можна позначити лише для готового неоплаченого замовлення' }); return; }
      const noShow = { ...order, status: 'no_show', noShowAt: Date.now(), notification: 'Клієнт не прийшов за замовленням. Надалі потрібна передоплата.' };
      orders.splice(index, 1); archivedOrders.unshift(noShow);
      broadcast('order_status_updated', { id, status: 'no_show', order: noShow });
      json(res, 200, { success: true, order: noShow });
    } catch (error) { json(res, error.status || 400, { error: error.message }); }
    return;
  }

  // 4. PATCH /api/orders/:id/status - update order status
  const statusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'PATCH') {
    try {
      const orderId = decodeURIComponent(statusMatch[1]);
      const { status, confirmEarly } = await readJsonBody(req);

      console.log(`[STATUS UPDATE] Order #${orderId} -> ${status}`);

      const orderIndex = orders.findIndex(o => o.id === orderId);

      if (orderIndex === -1 && status === 'ready') {
        // Check if restoring from archived
        const archIndex = archivedOrders.findIndex(o => o.id === orderId);
        if (archIndex > -1) {
          const archived = archivedOrders[archIndex];
          if (['cancelled', 'no_show'].includes(archived.status)) { json(res, 409, { error: 'Закрите замовлення не можна відновити' }); return; }
          const restored = { ...archived, status: 'ready', timingMode: archived.timingMode || 'asap', acceptedAt: archived.acceptedAt || Date.now(), confirmedReadyAt: archived.confirmedReadyAt || Date.now() };
          archivedOrders.splice(archIndex, 1);
          orders.push(restored);
          broadcast('order_status_updated', { id: orderId, status: 'ready', order: restored });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(publicJson({ success: true, order: restored }));
          return;
        }
      }

      if (orderIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order not found' }));
        return;
      }

      const order = orders[orderIndex];
      const transitions = { new: ['cooking'], cooking: ['new', 'ready'], ready: ['cooking', 'archived'] };
      if (status === order.status) { json(res, 200, { success: true, order }); return; }
      if (!transitions[order.status]?.includes(status)) { json(res, 409, { error: 'Недозволена зміна статусу' }); return; }
      const goingBack = (order.status === 'ready' && status === 'cooking') || (order.status === 'cooking' && status === 'new');
      if (!goingBack && ['cooking', 'ready'].includes(status) && earlyStart(order, Date.now()) && confirmEarly !== true) {
        json(res, 409, { code: 'EARLY_START', error: 'Це замовлення на майбутнє. Підтвердьте раннє приготування', readyAt: order.confirmedReadyAt || order.baselineReadyAt }); return;
      }
      if (!goingBack && ['cooking', 'ready'].includes(status) && earlyStart(order, Date.now()) && confirmEarly === true) order.earlyStartConfirmedAt = Date.now();
      if (!order.acceptedAt) { order.acceptedAt = Date.now(); order.confirmedReadyAt = order.baselineReadyAt; }
      if (status === 'cooking') { order.cookingStartedAt = Date.now(); order.notification = '🔥 Кухар почав готувати ваше замовлення!'; }
      if (status === 'new') order.notification = 'Замовлення в черзі. Час видачі підтверджено.';
      if (status === 'ready') order.notification = '🎉 Ваше замовлення готове до видачі!';

      if (status === 'archived') {
        const completed = {
          ...order,
          status: 'archived',
          issuedAt: Date.now(),
          notification: '✅ Замовлення видано. Смачного!',
          completedAt: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
        };
        orders.splice(orderIndex, 1);
        archivedOrders.unshift(completed);

        broadcast('order_status_updated', { id: orderId, status: 'archived', order: completed });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(publicJson({ success: true, order: completed }));
        return;
      }

      order.status = status;
      broadcast('order_status_updated', { id: orderId, status, order, skipNotifications: goingBack });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(publicJson({ success: true, order }));
    } catch (err) {
      res.writeHead(err.status || 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. POST /api/reset - clear active and archived orders, preserving the ID sequence
  if (pathname === '/api/reset' && req.method === 'POST') {
    orders = [];
    archivedOrders = [];
    broadcast('reset', { orders, archivedOrders });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 6. GET /api/analytics - analytics data
  if (pathname === '/api/analytics/report' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    try {
      const format = url.searchParams.get('format') || 'json';
      if (!['json', 'pdf'].includes(format)) throw Object.assign(new Error('Невідомий формат звіту'), { status: 400 });
      const report = salesReport(archivedOrders, store.activePoint(), {
        period: url.searchParams.get('period') ?? '7', commission: url.searchParams.get('commission') ?? '0',
      });
      if (format === 'pdf') {
        const pdf = await reportPdf(report);
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="shaurmisha-sales-${report.period}d-${new Date(report.to).toISOString().slice(0, 10)}.pdf"`, 'Content-Length': pdf.length });
        res.end(pdf);
      } else json(res, 200, report);
    } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Не вдалося сформувати звіт' }); }
    return;
  }

  if (pathname === '/api/analytics' && req.method === 'GET') {
    const allOrders = [...orders, ...archivedOrders].filter(order => !['cancelled', 'no_show'].includes(order.status));
    const now = Date.now();
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    const startOfWeek = new Date(now - 7 * 86400000);
    const startOfMonth = new Date(now - 30 * 86400000);

    function filterPeriod(list, from) {
      return list.filter(o => o.createdAt >= from.getTime());
    }

    function sumRevenue(list) {
      return list.reduce((s, o) => s + (o.totalPrice || 0), 0);
    }

    const todayOrders = filterPeriod(allOrders, startOfToday);
    const weekOrders = filterPeriod(allOrders, startOfWeek);
    const monthOrders = filterPeriod(allOrders, startOfMonth);

    // Top products (from archived + active)
    const productMap = {};
    for (const o of allOrders) {
      for (const item of (o.items || [])) {
        if (!productMap[item.name]) productMap[item.name] = { name: item.name, qty: 0, revenue: 0 };
        const p = productMap[item.name];
        p.qty += (item.qty || 1);
        // estimate revenue from item — if totalPrice is per order, distribute proportionally (simplified: just count qty)
      }
    }
    // Compute revenue per product from archived orders only (have full price context)
    const revenuePerProduct = {};
    for (const o of archivedOrders.filter(order => !['cancelled', 'no_show'].includes(order.status))) {
      // approximate: distribute totalPrice evenly among items weighted by qty
      const totalQty = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
      for (const item of (o.items || [])) {
        if (!revenuePerProduct[item.name]) revenuePerProduct[item.name] = 0;
        revenuePerProduct[item.name] += (o.totalPrice || 0) * ((item.qty || 1) / totalQty);
      }
    }
    for (const name in revenuePerProduct) {
      if (productMap[name]) productMap[name].revenue = Math.round(revenuePerProduct[name]);
    }
    const topProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty);

    // Orders by hour (last 7 days)
    const hourBuckets = Array.from({length: 24}, (_, h) => ({ hour: h, orders: 0, revenue: 0 }));
    for (const o of weekOrders) {
      const h = new Date(o.createdAt).getHours();
      hourBuckets[h].orders += 1;
      hourBuckets[h].revenue += (o.totalPrice || 0);
    }
    const ordersByHour = hourBuckets.filter(b => b.hour >= 9 && b.hour <= 22);

    // Revenue by day (last 30 days)
    const dayMap = {};
    for (const o of monthOrders) {
      const d = new Date(o.createdAt);
      const key = `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`;
      if (!dayMap[key]) dayMap[key] = { date: key, orders: 0, revenue: 0, ts: o.createdAt };
      dayMap[key].orders += 1;
      dayMap[key].revenue += (o.totalPrice || 0);
    }
    const revenueByDay = Object.values(dayMap).sort((a, b) => a.ts - b.ts);

    // Recent orders list (last 50)
    const recentOrders = [...allOrders]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 50);

    const analytics = {
      summary: {
        totalOrders: allOrders.length,
        totalRevenue: sumRevenue(allOrders),
        avgOrderValue: allOrders.length ? Math.round(sumRevenue(allOrders) / allOrders.length) : 0,
      },
      byPeriod: {
        today: { orders: todayOrders.length, revenue: sumRevenue(todayOrders) },
        week:  { orders: weekOrders.length,  revenue: sumRevenue(weekOrders) },
        month: { orders: monthOrders.length, revenue: sumRevenue(monthOrders) },
      },
      topProducts,
      ordersByHour,
      revenueByDay,
      recentOrders,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(publicJson(analytics));
    return;
  }

  // 404 fallback
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Bind to port without forcing single IP interface
server.listen(PORT, HOST, () => {
  const listeningPort = server.address().port;
  console.log(`📡 Shawarma Sync Server is running on port ${listeningPort}`);
  console.log(`- SSE Events stream: http://localhost:${listeningPort}/api/events`);
  console.log(`- Orders REST API:   http://localhost:${listeningPort}/api/orders`);
});
