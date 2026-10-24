const baseUrl = () => (import.meta.env.VITE_SYNC_API_URL || '').replace(/\/+$/, '');

async function request(path, { method = 'GET', body, token } = {}) {
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
  async createManualOrder(order) { return (await request('/api/kitchen/orders', { method: 'POST', body: order })).order; },
  async acceptOrder(id, delayMinutes) {
    return (await request(`/api/orders/${encodeURIComponent(id)}/accept`, { method: 'POST', body: { delayMinutes } })).order;
  },
  async noShow(id) { return (await request(`/api/orders/${encodeURIComponent(id)}/no-show`, { method: 'POST', body: { confirmed: true } })).order; },
  async cancelOrder(id, comment) {
    return (await request(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { comment } })).order;
  },
  async updateStatus(id, status, options = {}) {
    return (await request(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status, ...options } })).order;
  },
  setAcceptingOrders: acceptingOrders => request('/api/settings', { method: 'PATCH', body: { acceptingOrders } }),
  setBreak: onBreak => request('/api/settings', { method: 'PATCH', body: { onBreak } }),
  subscribe({ onInit, onNewOrder, onStatusUpdate, onReset, onAvailability, onMenu }) {
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

// Uploaded media lives on Sync; bundled /menu photos remain on the frontend.
export const mediaUrl = url => url?.startsWith('/media/') ? baseUrl() + url : url;
