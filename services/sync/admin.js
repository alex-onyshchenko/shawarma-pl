import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export function createAdminHandler({ store, readJsonBody, adminToken, onChange, readOrders }) {
  const attempts = new Map();
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const hash = value => createHash('sha256').update(value).digest('hex');
  const credentialVersion = hash(adminToken);
  if (store.get('adminCredentialVersion') !== credentialVersion) {
    store.db.prepare('DELETE FROM sessions').run();
    store.set('adminCredentialVersion', credentialVersion);
  }
  const sessionHash = req => {
    const value = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('shawarma_admin='))?.slice('shawarma_admin='.length);
    return value ? hash(value) : '';
  };
  const cookie = (req, value, age) => `shawarma_admin=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${age}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;
  return async (req, res, url) => {
    try {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { send(res, 403, { error: 'Недопустимое происхождение запроса' }); return; }
      if (['POST', 'PATCH', 'PUT'].includes(req.method) && !req.headers['content-type']?.startsWith('application/json')) { send(res, 415, { error: 'Ожидается JSON' }); return; }
      if (url.pathname === '/api/admin/session' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const previous = attempts.get(ip);
        const limit = previous && Date.now() - previous.start < 60000 ? previous : { start: Date.now(), count: 0 };
        if (++limit.count > 10) { send(res, 429, { error: 'Слишком много попыток. Подождите минуту.' }); return; }
        attempts.set(ip, limit);
        const { password } = await readJsonBody(req);
        const supplied = Buffer.from(typeof password === 'string' ? password : '');
        const expected = Buffer.from(adminToken);
        if (!adminToken || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(res, 401, { error: 'Неверный ключ администратора' }); return; }
        attempts.delete(ip);
        const value = randomBytes(32).toString('hex');
        store.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
        store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(hash(value), Date.now() + 8 * 60 * 60 * 1000);
        res.setHeader('Set-Cookie', cookie(req, value, 8 * 60 * 60));
        send(res, 200, { authenticated: true }); return;
      }
      const session = store.db.prepare('SELECT expires_at FROM sessions WHERE hash=?').get(sessionHash(req));
      if (!session || session.expires_at < Date.now()) { send(res, 401, { error: 'Войдите в панель администратора' }); return; }
      if (url.pathname === '/api/admin/session' && req.method === 'DELETE') {
        store.db.prepare('DELETE FROM sessions WHERE hash=?').run(sessionHash(req));
        res.setHeader('Set-Cookie', cookie(req, '', 0)); send(res, 200, { authenticated: false }); return;
      }
      if (url.pathname === '/api/admin/state' && req.method === 'GET') {
        const points = store.points();
        const orders = readOrders();
        send(res, 200, {
          points, catalog: store.products(), menus: Object.fromEntries(points.map(point => [point.id, store.menu(point.id)])),
          modifiers: store.get('modifiers'), audit: store.audit(), orders: orders.sort((a,b) => b.createdAt-a.createdAt).slice(0, 50),
          stats: { activeOrders: orders.filter(order => order.status !== 'archived').length, totalOrders: orders.length },
        }); return;
      }
      if (url.pathname === '/api/admin/points' && req.method === 'POST') {
        const point = store.createPoint(await readJsonBody(req)); onChange(); send(res, 201, { point }); return;
      }
      const pointRoute = url.pathname.match(/^\/api\/admin\/points\/([^/]+)$/);
      if (pointRoute && req.method === 'PATCH') {
        const point = store.updatePoint(decodeURIComponent(pointRoute[1]), await readJsonBody(req)); onChange(); send(res, 200, { point }); return;
      }
      const productsRoute = url.pathname.match(/^\/api\/admin\/points\/([^/]+)\/products$/);
      if (productsRoute && req.method === 'POST') {
        const product = store.createProduct(decodeURIComponent(productsRoute[1]), await readJsonBody(req)); onChange(); send(res, 201, { product }); return;
      }
      const menuRoute = url.pathname.match(/^\/api\/admin\/points\/([^/]+)\/menu\/([^/]+)$/);
      if (menuRoute && req.method === 'PATCH') {
        const product = store.updateMenu(decodeURIComponent(menuRoute[1]), decodeURIComponent(menuRoute[2]), await readJsonBody(req)); onChange(); send(res, 200, { product }); return;
      }
      if (url.pathname === '/api/admin/modifiers' && req.method === 'PUT') {
        const modifiers = store.updateModifiers(await readJsonBody(req)); onChange(); send(res, 200, { modifiers }); return;
      }
      send(res, 404, { error: 'Не найдено' });
    } catch (error) { send(res, error.status || 400, { error: error.message }); }
  };
}
