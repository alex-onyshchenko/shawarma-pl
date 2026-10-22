import React, { useState } from 'react';
import { ChevronLeft, X, MoreVertical, CheckCircle2, RotateCcw, Smartphone, Monitor, Info, Trash2 } from 'lucide-react';
import { tg } from '../utils/telegram';

export default function TelegramHeader({
  view,
  setView,
  cartCount,
  onClearCart,
  isMockupMode,
  setIsMockupMode,
  onOpenAbout
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleBack = () => {
    tg.haptic.impact('light');
    setView('menu');
  };

  const handleClose = () => {
    tg.haptic.impact('medium');
    if (tg.isAvailable) {
      tg.close();
    } else {
      alert('У Telegram цей хрестик закриває Mini App.');
    }
  };

  return (
    <>
      {/* iOS Style Status Bar (when previewing in desktop mockup frame) */}
      {isMockupMode && (
        <div className="bg-zinc-950 px-6 pt-3 pb-1 flex justify-between items-center text-xs text-zinc-400 select-none">
          <span className="font-semibold text-white tracking-tight">9:41</span>
          <div className="w-20 h-4 bg-zinc-900 rounded-full border border-zinc-800" />
          <div className="flex items-center gap-1.5 text-zinc-300">
            <span className="text-[10px]">5G</span>
            <div className="w-5 h-2.5 border border-zinc-400 rounded-sm p-0.5 flex items-center">
              <div className="h-full w-3/4 bg-white rounded-xs" />
            </div>
          </div>
        </div>
      )}

      {/* Main Telegram App Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 backdrop-blur-md sticky top-0 z-30 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          {view !== 'menu' ? (
            <button
              onClick={handleBack}
              className="p-1 -ml-1 hover:bg-zinc-800 active:scale-95 rounded-full text-orange-500 transition-transform flex items-center"
              aria-label="Назад"
            >
              <ChevronLeft size={24} />
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="p-1.5 -ml-1 hover:bg-zinc-800 active:scale-95 rounded-full text-zinc-400 hover:text-white transition-colors"
              aria-label="Закрити"
            >
              <X size={20} />
            </button>
          )}

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-base text-white tracking-tight leading-none">
                Шаурма на Вугіллі
              </h1>
              <span className="text-sm">🌯</span>
              <CheckCircle2 size={13} className="text-sky-400 fill-sky-400/20" />
            </div>
            <span className="text-[11px] text-zinc-400 leading-tight">
              бот • замовлення онлайн
            </span>
          </div>
        </div>

        {/* Telegram 3-dots Menu Button */}
        <div className="relative">
          <button
            onClick={() => {
              tg.haptic.selection();
              setMenuOpen(!menuOpen);
            }}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 active:scale-95 flex items-center justify-center text-zinc-300 transition-colors"
            aria-label="Меню"
          >
            <MoreVertical size={18} />
          </button>

          {/* Telegram-like Dropdown Menu */}
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-10 w-56 bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/60 rounded-2xl shadow-2xl p-1.5 z-50 text-sm animate-scale-up">
                <button
                  onClick={() => {
                    setIsMockupMode(!isMockupMode);
                    setMenuOpen(false);
                    tg.haptic.impact('light');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 text-left transition-colors text-zinc-200"
                >
                  {isMockupMode ? <Monitor size={16} className="text-orange-400" /> : <Smartphone size={16} className="text-orange-400" />}
                  <span>{isMockupMode ? 'На весь екран' : 'Вигляд як у смартфоні'}</span>
                </button>

                <button
                  onClick={() => {
                    onOpenAbout();
                    setMenuOpen(false);
                    tg.haptic.selection();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 text-left transition-colors text-zinc-200"
                >
                  <Info size={16} className="text-sky-400" />
                  <span>Про заклад та доставку</span>
                </button>

                {cartCount > 0 && (
                  <button
                    onClick={() => {
                      onClearCart();
                      setMenuOpen(false);
                      tg.haptic.warning();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-400 text-left transition-colors"
                  >
                    <Trash2 size={16} />
                    <span>Очистити кошик</span>
                  </button>
                )}

                <a
                  href={import.meta.env.VITE_KITCHEN_URL || `${window.location.protocol}//${window.location.hostname}:3001`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 text-left transition-colors text-amber-300"
                >
                  <span className="text-base">👨‍🍳</span>
                  <div className="flex flex-col">
                    <span className="font-semibold text-xs text-white">Термінал кухаря (KDS)</span>
                    <span className="text-[10px] text-zinc-400">Планшет кухні (порт 3001)</span>
                  </div>
                </a>

                <div className="h-px bg-zinc-800 my-1" />

                <button
                  onClick={() => {
                    window.location.reload();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-800 text-left transition-colors text-zinc-400 text-xs"
                >
                  <RotateCcw size={14} />
                  <span>Перезавантажити застосунок</span>
                </button>
              </div>
            </>
          )}
        </div>
      </header>
    </>
  );
}
