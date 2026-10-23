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
  getMenu: () => request('/api/menu'),
  getAvailability: () => request('/api/availability'),
  async createOrder(order) { return { ...(await request('/api/orders', { method: 'POST', body: order })).order, trackingToken: order.trackingToken }; },
  enableNotifications: order => request('/api/client/notifications', { method: 'POST', body: {
    id: order.id, telegramInitData: window.Telegram?.WebApp?.initData || '',
  } }),
  subscribe({ onInit, onAvailability, onMenu }) {
    if (import.meta.env.VITE_MENU_PREVIEW === 'true') return () => {};
    let stopped = false;
    let busy = false;
    let revision;
    async function refresh() {
      if (stopped || busy) return;
      busy = true;
      try {
        const [menu, availability] = await Promise.all([orderSync.getMenu(), orderSync.getAvailability()]);
        if (stopped) return;
        onAvailability?.(availability);
        if (revision !== menu.revision) { revision = menu.revision; onMenu?.(menu); }
        onInit?.({ menu, availability });
      } catch { /* Preserve the last known menu until connectivity recovers. */ }
      finally { busy = false; }
    }
    const interval = setInterval(refresh, 5000);
    refresh();
    return () => { stopped = true; clearInterval(interval); };
  },
};

// Uploaded media lives on Sync; bundled /menu photos remain on the frontend.
export const mediaUrl = url => url?.startsWith('/media/') ? baseUrl() + url : url;
