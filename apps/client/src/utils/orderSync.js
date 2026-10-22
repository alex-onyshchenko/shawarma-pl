const baseUrl = () => (import.meta.env.VITE_SYNC_API_URL || '').replace(/\/+$/, '');

async function request(path, { method = 'GET', body, token } = {}) {
  if (import.meta.env.VITE_MENU_PREVIEW === 'true') throw new Error('Замовлення незабаром. Зараз доступний лише перегляд меню.');
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Не вдалося виконати запит');
    Object.assign(error, { code: data.code, status: response.status, readyAt: data.readyAt });
    throw error;
  }
  return data;
}

export const orderSync = {
  getOrders: () => request('/api/orders'),
  getMenu: () => request('/api/menu'),
  getAvailability: () => request('/api/availability'),
  async createOrder(order) { return (await request('/api/orders', { method: 'POST', body: order })).order; },
  async acceptOrder(id, delayMinutes) {
    return (await request(`/api/orders/${encodeURIComponent(id)}/accept`, { method: 'POST', body: { delayMinutes } })).order;
  },
  async updateStatus(id, status, options = {}) {
    return (await request(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status, ...options } })).order;
  },
  setAcceptingOrders: (acceptingOrders, token) => request('/api/settings', { method: 'PATCH', body: { acceptingOrders }, token }),
  subscribe({ onInit, onNewOrder, onStatusUpdate, onReset, onAvailability, onMenu }) {
    if (import.meta.env.VITE_MENU_PREVIEW === 'true') return () => {};
    let stopped = false;
    let polling = false;
    const source = new EventSource(`${baseUrl()}/api/events`);
    const callbacks = { init: onInit, new_order: onNewOrder, order_status_updated: onStatusUpdate, reset: onReset, availability_updated: onAvailability, menu_updated: onMenu };
    for (const [event, callback] of Object.entries(callbacks)) {
      source.addEventListener(event, message => {
        if (!stopped && callback) callback(JSON.parse(message.data));
      });
    }
    async function refresh() {
      if (polling || stopped) return;
      polling = true;
      try { const data = await orderSync.getOrders(); if (!stopped) onInit?.(data); }
      catch { /* Keep the last known state until the server is reachable again. */ }
      finally { polling = false; }
    }
    const interval = setInterval(refresh, 3000);
    refresh();
    return () => { stopped = true; clearInterval(interval); source.close(); };
  },
};
