import http from 'node:http';

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '0.0.0.0';

// In-memory store initialized with realistic orders
let orders = [
  {
    id: '1042',
    time: '11:42',
    createdAt: Date.now() - 2 * 60 * 1000,
    status: 'new', // new | cooking | ready | archived
    orderType: 'pickup',
    customerName: 'Олександр (Telegram)',
    phoneNumber: '+380 (97) 123-45-67',
    totalPrice: 180,
    items: [
      {
        name: 'Класична Шаурма',
        qty: 2,
        lavash: 'Сирний лаваш',
        spiciness: 'Пікантна 🌶️',
        added: ['Сир Чеддер'],
        removed: ['Без цибулі'],
        comment: 'Більше соусу, будь ласка'
      }
    ]
  },
  {
    id: '1043',
    time: '11:45',
    createdAt: Date.now() - 45 * 1000,
    status: 'new',
    orderType: 'delivery',
    customerName: 'Марія (Telegram)',
    phoneNumber: '+380 (50) 987-65-43',
    totalPrice: 240,
    deliveryAddress: 'вул. Антоновича, 74, кв. 12',
    items: [
      {
        name: 'Гостра Шаурма BBQ',
        qty: 1,
        lavash: 'Звичайний лаваш',
        spiciness: 'Вогонь! 🔥🌶️',
        added: ['Халапеньйо', 'Подвійне м\'ясо на вугіллі'],
        removed: [],
        comment: ''
      },
      {
        name: 'Картопля Фрі з сіллю',
        qty: 1,
        lavash: null,
        spiciness: null,
        added: [],
        removed: [],
        comment: ''
      }
    ]
  },
  {
    id: '1039',
    time: '11:30',
    createdAt: Date.now() - 15 * 60 * 1000, // 15 mins ago (overdue)
    status: 'cooking',
    orderType: 'pickup',
    customerName: 'Дмитро (Telegram)',
    phoneNumber: '+380 (63) 555-12-34',
    totalPrice: 215,
    items: [
      {
        name: 'Сирна Шаурма',
        qty: 1,
        lavash: 'Шпинатний лаваш',
        spiciness: null,
        added: ['Хрусткий бекон гриль'],
        removed: ['Без часникового соусу', 'Без капусти'],
        comment: 'Добре підрум\'янити на грилі'
      }
    ]
  }
];

// --- Helper to generate rich mock historical data ---
function generateMockArchivedOrders() {
  const products = [
    { name: 'Класична Шаурма', price: 150 },
    { name: 'Сирна Шаурма', price: 180 },
    { name: 'Гостра Шаурма BBQ', price: 170 },
    { name: 'М\'ясна Шаурма Де Люкс', price: 210 },
    { name: 'Картопля Фрі з сіллю', price: 70 },
    { name: 'Сирні кульки', price: 90 },
    { name: 'Кола 0.5', price: 40 },
    { name: 'Сік Апельсиновий', price: 45 },
  ];
  const names = ['Олег', 'Марія', 'Дмитро', 'Аліна', 'Сергій', 'Катерина', 'Андрій', 'Юлія', 'Тарас', 'Оксана'];
  const types = ['pickup', 'pickup', 'pickup', 'delivery'];
  const archived = [];
  let idCounter = 900;
  const now = Date.now();

  for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
    const ordersPerDay = Math.floor(8 + Math.random() * 18 + (30 - daysAgo) * 0.3);
    for (let i = 0; i < ordersPerDay; i++) {
      const itemCount = Math.floor(1 + Math.random() * 3);
      const items = [];
      let total = 0;
      for (let j = 0; j < itemCount; j++) {
        const p = products[Math.floor(Math.random() * products.length)];
        const qty = Math.floor(1 + Math.random() * 2);
        items.push({ name: p.name, qty, lavash: null, spiciness: null, added: [], removed: [], comment: '' });
        total += p.price * qty;
      }
      const hour = Math.floor(10 + Math.random() * 11);
      const minute = Math.floor(Math.random() * 60);
      const dayTs = now - daysAgo * 86400000 + (hour * 3600 + minute * 60) * 1000;
      const name = names[Math.floor(Math.random() * names.length)];
      archived.push({
        id: String(idCounter++),
        time: `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,
        createdAt: dayTs,
        completedAt: `${String(hour).padStart(2,'0')}:${String(minute+8).padStart(2,'0')}`,
        status: 'archived',
        orderType: types[Math.floor(Math.random() * types.length)],
        customerName: `${name} (Telegram)`,
        phoneNumber: '+380 (97) 000-00-00',
        totalPrice: total,
        items,
      });
    }
  }
  return archived;
}

let archivedOrders = generateMockArchivedOrders();

// SSE (Server-Sent Events) clients registry
const sseClients = new Set();

function broadcast(eventType, payload) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
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
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  console.log(`[REQ ${new Date().toLocaleTimeString()}] ${req.method} ${pathname}`);

  // CORS headers for all origins
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

  // 1. SSE Connection Endpoint: /api/events
  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(`event: init\ndata: ${JSON.stringify({ orders, archivedOrders })}\n\n`);
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
    res.end(JSON.stringify({ orders, archivedOrders }));
    return;
  }

  // 3. POST /api/orders - create a new order (from Telegram Mini App or Demo button)
  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const newId = data.id || String(Math.floor(1044 + Math.random() * 50));
      const now = new Date();
      const timeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

      const newOrder = {
        id: newId,
        time: data.time || timeStr,
        createdAt: data.createdAt || Date.now(),
        status: 'new',
        orderType: data.orderType || 'pickup',
        customerName: data.customerName || 'Telegram Замовник',
        phoneNumber: data.phoneNumber || '+380 (97) 123-45-67',
        totalPrice: data.totalPrice || data.finalTotal || 0,
        deliveryAddress: data.deliveryAddress || null,
        selectedLocation: data.selectedLocation || null,
        orderComment: data.orderComment || '',
        items: data.items || []
      };

      orders.unshift(newOrder);
      console.log(`[NEW ORDER CREATED] #${newOrder.id} - ${newOrder.customerName} - ${newOrder.items.length} item(s)`);

      // Broadcast to all connected clients (KDS tablets + customer apps)
      broadcast('new_order', newOrder);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order: newOrder }));
    } catch (err) {
      console.error('[POST /api/orders error]', err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 4. PATCH /api/orders/:id/status - update order status
  const statusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'PATCH') {
    try {
      const orderId = statusMatch[1];
      const { status } = await readJsonBody(req);

      console.log(`[STATUS UPDATE] Order #${orderId} -> ${status}`);

      const orderIndex = orders.findIndex(o => o.id === orderId);

      if (orderIndex === -1 && status === 'ready') {
        // Check if restoring from archived
        const archIndex = archivedOrders.findIndex(o => o.id === orderId);
        if (archIndex > -1) {
          const restored = { ...archivedOrders[archIndex], status: 'ready' };
          archivedOrders.splice(archIndex, 1);
          orders.push(restored);
          broadcast('order_status_updated', { id: orderId, status: 'ready', order: restored });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, order: restored }));
          return;
        }
      }

      if (orderIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order not found' }));
        return;
      }

      const order = orders[orderIndex];

      if (status === 'archived') {
        const completed = {
          ...order,
          status: 'archived',
          completedAt: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
        };
        orders.splice(orderIndex, 1);
        archivedOrders.unshift(completed);

        broadcast('order_status_updated', { id: orderId, status: 'archived', order: completed });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, order: completed }));
        return;
      }

      order.status = status;
      broadcast('order_status_updated', { id: orderId, status, order });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. POST /api/reset - reset to initial state
  if (pathname === '/api/reset' && req.method === 'POST') {
    archivedOrders = generateMockArchivedOrders();
    broadcast('reset', { orders });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 6. GET /api/analytics - analytics data
  if (pathname === '/api/analytics' && req.method === 'GET') {
    const allOrders = [...orders, ...archivedOrders];
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
    for (const o of archivedOrders) {
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
    res.end(JSON.stringify(analytics));
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
