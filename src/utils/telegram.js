/**
 * Telegram WebApp API helper
 * Gracefully degrades when opened in a regular web browser
 */

// Web Audio synthesizer for tactile UI sound simulation outside Telegram
let audioCtx = null;

function playSubtleClick(freq = 600, duration = 0.03) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // AudioContext blocked or not supported
  }
}

export const tg = {
  get isAvailable() {
    return typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp?.initData);
  },

  get webApp() {
    return typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  },

  init() {
    if (this.webApp) {
      try {
        this.webApp.ready();
        this.webApp.expand();
        this.webApp.enableClosingConfirmation();
      } catch (err) {
        console.warn('Telegram WebApp init error', err);
      }
    }
  },

  getUser() {
    return this.webApp?.initDataUnsafe?.user || {
      first_name: 'Олександр',
      last_name: 'Шевченко',
      username: 'olex_customer',
    };
  },

  // Haptic feedback with web fallback
  haptic: {
    impact(style = 'light') {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
      } else {
        if ('vibrate' in navigator) {
          navigator.vibrate(style === 'heavy' ? 25 : 12);
        }
        playSubtleClick(style === 'heavy' ? 300 : 600, 0.03);
      }
    },
    success() {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      } else {
        if ('vibrate' in navigator) {
          navigator.vibrate([15, 40, 25]);
        }
        playSubtleClick(800, 0.06);
      }
    },
    warning() {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
      } else {
        if ('vibrate' in navigator) {
          navigator.vibrate([30, 30, 30]);
        }
        playSubtleClick(350, 0.08);
      }
    },
    selection() {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
      } else {
        playSubtleClick(750, 0.015);
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
