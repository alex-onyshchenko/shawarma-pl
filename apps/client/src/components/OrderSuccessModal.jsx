import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Clock, MapPin, ChefHat, Bike, RotateCcw, Send, ExternalLink, Sparkles } from 'lucide-react';
import { tg } from '../utils/telegram';
import { orderSync } from '../utils/orderSync';

export default function OrderSuccessModal({ order, onReset }) {
  const [currentStatus, setCurrentStatus] = useState(order.status || 'new');
  const [statusNotification, setStatusNotification] = useState(null);

  useEffect(() => {
    // Initial festive confetti
    try {
      confetti({
        particleCount: 65,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f97316', '#fbbf24', '#10b981', '#38bdf8']
      });
      tg.haptic.success();
    } catch (e) {}

    // Subscribe to live status changes from the Kitchen Display (port 3001)
    const unsubscribe = orderSync.subscribe({
      onStatusUpdate: ({ id, status }) => {
        if (id === String(order.id)) {
          setCurrentStatus(status);
          tg.haptic.impact('medium');

          if (status === 'cooking') {
            setStatusNotification('🔥 Кухар почав смажити ваше замовлення на вугіллі!');
            setTimeout(() => setStatusNotification(null), 4000);
          } else if (status === 'ready') {
            setStatusNotification('🎉 Ваше замовлення готове до видачі!');
            try {
              confetti({ particleCount: 40, spread: 50 });
            } catch (e) {}
            setTimeout(() => setStatusNotification(null), 5000);
          } else if (status === 'archived') {
            setStatusNotification('✅ Замовлення видано. Смачного!');
            setTimeout(() => setStatusNotification(null), 5000);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [order.id]);

  return (
    <div className="p-4 pb-24 space-y-4 animate-fade-in max-w-md mx-auto">
      {/* Live Telegram Push Notification Simulation */}
      <div className="bg-gradient-to-r from-sky-950/90 to-zinc-900 border border-sky-500/30 rounded-2xl p-3 shadow-lg flex items-start gap-3 animate-scale-up">
        <div className="w-10 h-10 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
          <Send size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-400">@ShawarmaCoalBot</span>
            <span className="text-[10px] text-zinc-400">зараз</span>
          </div>
          <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
            {statusNotification || (
              <>
                Дякуємо! Замовлення <span className="font-bold text-white">#{order.id}</span> передано на кухню.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Main Order Card */}
      <div className="bg-zinc-900/95 rounded-3xl p-5 border border-zinc-800 shadow-xl text-center space-y-4">
        {/* Status Icon */}
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400">
          {currentStatus === 'ready' || currentStatus === 'archived' ? (
            <CheckCircle2 size={38} strokeWidth={2.4} />
          ) : currentStatus === 'cooking' ? (
            <ChefHat size={34} className="text-orange-400 animate-pulse" />
          ) : (
            <CheckCircle2 size={38} strokeWidth={2.2} />
          )}
        </div>

        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
            {currentStatus === 'new' && 'Очікує підтвердження кухні'}
            {currentStatus === 'cooking' && '🔥 Готується на вугіллі'}
            {currentStatus === 'ready' && '🎉 Готово до видачі!'}
            {currentStatus === 'archived' && '✅ Замовлення завершено'}
          </span>
          <h2 className="text-2xl font-black text-white mt-1">
            Замовлення #{order.id}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Синхронізовано з планшетом кухаря (KDS) у реальному часі
          </p>
        </div>

        {/* Live Step Progress Tracker */}
        <div className="bg-zinc-950/80 rounded-2xl p-4 border border-zinc-800/80 text-left space-y-3.5">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
            <span className="text-xs font-bold text-zinc-300">Статус приготування:</span>
            <div className="flex items-center gap-1.5 text-orange-400 text-xs font-bold">
              <Clock size={13} />
              <span>
                {currentStatus === 'ready'
                  ? 'Вже готово!'
                  : currentStatus === 'cooking'
                  ? '~5-8 хв'
                  : '~12-15 хв'}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {/* Step 1: Прийнято */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-emerald-500/20">
                ✓
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold text-white">1. Замовлення прийнято</div>
                <div className="text-[11px] text-zinc-400">Оплату успішно проведено</div>
              </div>
            </div>

            {/* Step 2: Готується */}
            <div className={`flex items-center gap-3 transition-opacity ${currentStatus === 'new' ? 'opacity-40' : 'opacity-100'}`}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  currentStatus === 'cooking'
                    ? 'bg-orange-500 text-white animate-pulse shadow-md shadow-orange-500/30'
                    : currentStatus === 'ready' || currentStatus === 'archived'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {currentStatus === 'ready' || currentStatus === 'archived' ? '✓' : <ChefHat size={14} />}
              </div>
              <div className="flex-1">
                <div className={`text-xs font-bold ${currentStatus === 'cooking' ? 'text-orange-400' : 'text-white'}`}>
                  2. Смажиться на вугіллі
                </div>
                <div className="text-[11px] text-zinc-400">
                  {currentStatus === 'cooking' ? 'Кухар збирає вашу шаурму' : 'М\'ясо на мангалі та авторський соус'}
                </div>
              </div>
            </div>

            {/* Step 3: Готово на видачу */}
            <div className={`flex items-center gap-3 transition-opacity ${currentStatus === 'ready' || currentStatus === 'archived' ? 'opacity-100' : 'opacity-40'}`}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  currentStatus === 'ready' || currentStatus === 'archived'
                    ? 'bg-emerald-500 text-white animate-bounce shadow-md shadow-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {order.orderType === 'delivery' ? <Bike size={14} /> : <MapPin size={14} />}
              </div>
              <div className="flex-1">
                <div className={`text-xs font-bold ${currentStatus === 'ready' ? 'text-emerald-400' : 'text-white'}`}>
                  3. {order.orderType === 'delivery' ? 'Кур\'єр вирушив' : 'Готово до видачі!'}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {order.orderType === 'delivery'
                    ? (order.deliveryAddress || 'Доставка на вашу адресу')
                    : (order.selectedLocation?.name || 'Пункт самовивозу')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live sync test link to KDS */}
        <a
          href={import.meta.env.VITE_KITCHEN_URL || `${window.location.protocol}//${window.location.hostname}:3001`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 p-3 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/80 rounded-2xl text-xs text-amber-300 font-semibold transition-colors"
        >
          <span>👨‍🍳 Відкрити Термінал Кухаря (:3001)</span>
          <ExternalLink size={13} />
        </a>

        {/* Order Details Summary */}
        <div className="bg-zinc-950/40 rounded-2xl p-3 border border-zinc-800/40 text-xs text-left space-y-1.5">
          <div className="flex justify-between text-zinc-400">
            <span>Сума замовлення:</span>
            <span className="font-bold text-white">{order.totalPrice || order.finalTotal} ₴</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Спосіб отримання:</span>
            <span className="font-medium text-white">
              {order.orderType === 'delivery' || order.deliveryType === 'delivery' ? 'Кур\'єрська доставка' : 'Самовивіз'}
            </span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Позиції:</span>
            <span className="text-zinc-200">
              {order.items?.map(it => `${it.qty}x ${it.name}`).join(', ')}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => {
            tg.haptic.impact('medium');
            onReset();
          }}
          className="w-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold py-3.5 px-6 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 transition-all"
        >
          <RotateCcw size={16} />
          <span>Нове замовлення</span>
        </button>
      </div>
    </div>
  );
}
