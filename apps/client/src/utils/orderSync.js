/** REST and SSE transport for the independently deployed sync service. */
function getBaseUrl() {
  return (import.meta.env.VITE_SYNC_API_URL || '').replace(/\/+$/, '');
}

let broadcastChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('shawarma_realtime_sync');
  }
} catch (e) {}

export const orderSync = {
  // Fetch current orders through the configured API endpoint.
  async getOrders() {
    const base = getBaseUrl();
    const urls = [`${base}/api/orders`];

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        // try next
      }
    }
    return null;
  },

  // Send a new order (from customer or demo button)
  async createOrder(order) {
    console.log('[orderSync] 🚀 Sending new order to kitchen:', order);
    const base = getBaseUrl();
    const urls = [`${base}/api/orders`];
    let sentSuccess = false;

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(order)
        });
        if (res.ok) {
          const data = await res.json();
          console.log('[orderSync] ✅ Order accepted by server:', data);
          sentSuccess = true;
          return data.order || order;
        }
      } catch (e) {
        // try next
      }
    }

    if (!sentSuccess) {
      console.warn('[orderSync] Server request failed, using local cross-tab fallback');
    }

    // Local broadcast fallback
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'new_order', order });
    }
    try {
      localStorage.setItem('shawarma_new_order_event', JSON.stringify({ order, timestamp: Date.now() }));
    } catch (e) {}

    return order;
  },

  // Update order status (from KDS: new -> cooking -> ready -> archived)
  async updateStatus(orderId, status) {
    console.log(`[orderSync] 🔄 Updating order #${orderId} -> ${status}`);
    const base = getBaseUrl();
    const urls = [`${base}/api/orders/${encodeURIComponent(orderId)}/status`];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[orderSync] ✅ Status #${orderId} updated on server:`, data);
          return data.order;
        }
      } catch (e) {}
    }

    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'order_status_updated', payload: { id: orderId, status } });
    }
    try {
      localStorage.setItem('shawarma_status_update_event', JSON.stringify({ id: orderId, status, timestamp: Date.now() }));
    } catch (e) {}

    return { id: orderId, status };
  },

  // Subscribe to real-time events via SSE + Parallel Polling
  subscribe({ onInit, onNewOrder, onStatusUpdate, onReset }) {
    let eventSource = null;
    const base = getBaseUrl();

    // 1. Setup SSE stream
    try {
      eventSource = new EventSource(`${base}/api/events`);

      eventSource.onopen = () => {
        console.log('[orderSync] 🟢 SSE stream connected to', `${base}/api/events`);
      };

      eventSource.addEventListener('init', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onInit) onInit(data);
        } catch (err) {}
      });

      eventSource.addEventListener('new_order', (e) => {
        try {
          const newOrder = JSON.parse(e.data);
          console.log('[orderSync] 🔔 Received new order via SSE:', newOrder);
          if (onNewOrder) onNewOrder(newOrder);
        } catch (err) {}
      });

      eventSource.addEventListener('order_status_updated', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[orderSync] 🔔 Order status updated via SSE:', data);
          if (onStatusUpdate) onStatusUpdate(data);
        } catch (err) {}
      });

      eventSource.addEventListener('reset', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onReset) onReset(data);
        } catch (err) {}
      });

      eventSource.onerror = () => {
        // EventSource reconnects automatically; polling refreshes snapshots.
      };
    } catch (e) {
      console.warn('[orderSync] EventSource init failed', e);
    }

    // 2. Refresh snapshots every 1.5 seconds alongside SSE.
    const pollInterval = setInterval(async () => {
      try {
        const data = await orderSync.getOrders();
        if (data && onInit) {
          onInit(data);
        }
      } catch (err) {}
    }, 1500);

    // 3. Listen to BroadcastChannel for local same-origin tabs
    const handleBroadcast = (e) => {
      const { type, order, payload } = e.data || {};
      if (type === 'new_order' && onNewOrder) onNewOrder(order);
      if (type === 'order_status_updated' && onStatusUpdate) onStatusUpdate(payload);
    };

    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', handleBroadcast);
    }

    // Cleanup subscription
    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(pollInterval);
      if (broadcastChannel) {
        broadcastChannel.removeEventListener('message', handleBroadcast);
      }
    };
  }
};
