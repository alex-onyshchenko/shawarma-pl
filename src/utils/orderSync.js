/**
 * Real-time synchronization service
 * Connects Telegram Mini App (:3000) and Kitchen Display System (:3001)
 * via Server-Sent Events (SSE) with BroadcastChannel & localStorage fallbacks.
 */

const SYNC_SERVER_URL = typeof window !== 'undefined' && window.location.port === '3002'
  ? ''
  : (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? '' : '');

let broadcastChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('shawarma_realtime_sync');
  }
} catch (e) {}

export const orderSync = {
  // Fetch current orders from API
  async getOrders() {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('API getOrders failed, fallback to local', err);
    }
    return null;
  },

  // Send a new order (from customer or demo button)
  async createOrder(order) {
    // 1. Send to backend sync server
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      if (res.ok) {
        const data = await res.json();
        return data.order || order;
      }
    } catch (e) {
      console.warn('Failed to post order to server, using local fallback', e);
    }

    // 2. Broadcast fallback
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
    // 1. Send to backend sync server
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const data = await res.json();
        return data.order;
      }
    } catch (e) {
      console.warn('Failed to update status on server, using local fallback', e);
    }

    // 2. Broadcast fallback
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'order_status_updated', payload: { id: orderId, status } });
    }
    try {
      localStorage.setItem('shawarma_status_update_event', JSON.stringify({ id: orderId, status, timestamp: Date.now() }));
    } catch (e) {}

    return { id: orderId, status };
  },

  // Subscribe to real-time events via SSE + fallbacks
  subscribe({ onInit, onNewOrder, onStatusUpdate, onReset }) {
    let eventSource = null;

    try {
      eventSource = new EventSource('/api/events');

      eventSource.addEventListener('init', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onInit) onInit(data);
        } catch (err) {}
      });

      eventSource.addEventListener('new_order', (e) => {
        try {
          const newOrder = JSON.parse(e.data);
          if (onNewOrder) onNewOrder(newOrder);
        } catch (err) {}
      });

      eventSource.addEventListener('order_status_updated', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onStatusUpdate) onStatusUpdate(data);
        } catch (err) {}
      });

      eventSource.addEventListener('reset', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onReset) onReset(data);
        } catch (err) {}
      });

      eventSource.onerror = (err) => {
        // EventSource will automatically retry connecting
      };
    } catch (e) {
      console.warn('EventSource failed, using BroadcastChannel only', e);
    }

    // Listen to BroadcastChannel for local cross-tab fallback
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
      if (broadcastChannel) {
        broadcastChannel.removeEventListener('message', handleBroadcast);
      }
    };
  }
};
