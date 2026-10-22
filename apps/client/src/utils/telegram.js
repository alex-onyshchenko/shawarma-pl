/**
 * Telegram WebApp API helper
 * Gracefully degrades when opened in a regular web browser
 */

export const tg = {
  get isAvailable() {
    return typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp?.initData);
  },

  get webApp() {
    return typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  },

  init() {
    if (this.isAvailable) {
      try {
        this.webApp.ready();
        this.webApp.expand();
        this.webApp.setHeaderColor?.('#09090b');
        this.webApp.setBackgroundColor?.('#09090b');
      } catch (err) {
        console.warn('Telegram WebApp init error', err);
      }
    }
  },

  getUser() {
    return this.isAvailable ? this.webApp.initDataUnsafe?.user || null : null;
  },

  // Haptic feedback with web fallback
  haptic: {
    impact(style = 'light') {
      if (tg.isAvailable && tg.webApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
      } else {
        if ('vibrate' in navigator) {
          navigator.vibrate(style === 'heavy' ? 25 : 12);
        }
      }
    },
    success() {
      if (tg.isAvailable && tg.webApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      } else {
        if ('vibrate' in navigator) {
          navigator.vibrate([15, 40, 25]);
        }
      }
    },
    warning() {
      if (tg.isAvailable && tg.webApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
      } else {
        if ('vibrate' in navigator) {
          navigator.vibrate([30, 30, 30]);
        }
      }
    },
    selection() {
      if (tg.isAvailable && tg.webApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
      } else {
      }
    }
  },

  close() {
    if (this.webApp) {
      this.webApp.close();
    } else {
      console.log('Telegram.WebApp.close() called');
    }
  }
};
