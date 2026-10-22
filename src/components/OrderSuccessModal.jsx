import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Clock, MapPin, ChefHat, Bike, RotateCcw, Send, Sparkles } from 'lucide-react';
import { tg } from '../utils/telegram';

export default function OrderSuccessModal({ order, onReset }) {
  const orderNumber = Math.floor(1000 + Math.random() * 9000);

  useEffect(() => {
    // Trigger festive confetti
    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f97316', '#fbbf24', '#10b981', '#38bdf8']
      });
      tg.haptic.success();
    } catch (e) {
      // Confetti fallback
    }
  }, []);

  return (
    <div className="p-4 pb-24 space-y-5 animate-fade-in max-w-md mx-auto">
      {/* Telegram Bot Notification Banner Simulation */}
      <div className="bg-gradient-to-r from-sky-950/80 to-zinc-900 border border-sky-500/30 rounded-2xl p-3 shadow-lg flex items-start gap-3 animate-scale-up">
        <div className="w-10 h-10 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
          <Send size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-400">@ShawarmaCoalBot</span>
            <span className="text-[10px] text-zinc-400">зараз</span>
          </div>
          <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
            Дякуємо! Замовлення <span className="font-bold text-white">#{orderNumber}</span> успішно прийнято в роботу.
          </p>
        </div>
      </div>

      {/* Main Success Card */}
      <div className="bg-zinc-900/90 rounded-3xl p-6 border border-zinc-800 shadow-xl text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <CheckCircle2 size={46} strokeWidth={2.2} />
        </div>

        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
            Оплата успішна
          </span>
          <h2 className="text-2xl font-black text-white mt-1">
            Готуємо з любов'ю!
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Номер замовлення: <span className="font-mono font-bold text-white">#{orderNumber}</span>
          </p>
        </div>

        {/* Live Order Tracker */}
        <div className="bg-zinc-950/70 rounded-2xl p-4 border border-zinc-800/80 text-left space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
            <span className="text-xs font-bold text-zinc-300">Статус замовлення</span>
            <div className="flex items-center gap-1.5 text-orange-400 text-xs font-bold">
              <Clock size={13} />
              <span>Орієнтовно: 15-20 хв</span>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {/* Step 1 */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-emerald-500/20">
                ✓
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold text-white">Замовлення підтверджено</div>
                <div className="text-[11px] text-zinc-400">Оплату отримано через Telegram Pay</div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold animate-pulse shadow-md shadow-orange-500/30">
                <ChefHat size={14} />
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold text-orange-400">Смажиться на вугіллі</div>
                <div className="text-[11px] text-zinc-400">Шеф готує соковите м'ясо та збирає лаваш</div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-3 opacity-40">
              <div className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-xs font-bold">
                {order.deliveryType === 'pickup' ? <MapPin size={14} /> : <Bike size={14} />}
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold text-white">
                  {order.deliveryType === 'pickup' ? 'Готово до видачі' : 'Передано кур\'єру'}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {order.deliveryType === 'pickup'
                    ? (order.selectedLocation?.name || 'Пункт видачі')
                    : (order.deliveryAddress || 'Адреса замовника')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Order Details Summary */}
        <div className="bg-zinc-950/40 rounded-2xl p-3 border border-zinc-800/40 text-xs text-left space-y-1.5">
          <div className="flex justify-between text-zinc-400">
            <span>Сума замовлення:</span>
            <span className="font-bold text-white">{order.finalTotal} ₴</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Спосіб отримання:</span>
            <span className="font-medium text-white">
              {order.deliveryType === 'pickup' ? 'Самовивіз' : 'Кур\'єрська доставка'}
            </span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Контактний телефон:</span>
            <span className="font-mono text-white">{order.phoneNumber}</span>
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
          <span>Зробити ще одне замовлення</span>
        </button>
      </div>
    </div>
  );
}
