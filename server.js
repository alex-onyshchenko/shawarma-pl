import http from 'node:http';

const PORT = 3002;

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

let archivedOrders = [];

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
    orders = [...INITIAL_ORDERS];
    archivedOrders = [];
    broadcast('reset', { orders });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 404 fallback
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Bind to port without forcing single IP interface
server.listen(PORT, () => {
  console.log(`📡 Shawarma Sync Server is running on port ${PORT}`);
  console.log(`- SSE Events stream: http://localhost:${PORT}/api/events`);
  console.log(`- Orders REST API:   http://localhost:${PORT}/api/orders`);
});
