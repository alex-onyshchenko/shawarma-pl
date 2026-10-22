import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Clock, ChefHat, CheckCircle2, Send, RotateCcw } from 'lucide-react';
import { tg } from '../utils/telegram';
import { orderSync } from '../utils/orderSync';
import { formatTime } from '../utils/timing';

export default function OrderSuccessModal({ order, onReset }) {
  const [liveOrder, setLiveOrder] = useState(order);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let lastStatus = order.status;
    const update = updated => {
      if (!updated || updated.id !== order.id || (order.clientRequestId ? updated.clientRequestId !== order.clientRequestId : updated.createdAt !== order.createdAt)) return;
      setMissing(false);
      setLiveOrder(updated);
      try { localStorage.setItem('shawarma_active_order', JSON.stringify(updated)); } catch {}
      if (updated.status === 'ready' && lastStatus !== 'ready') {
        confetti({ particleCount: 40, spread: 50 });
        tg.haptic.success();
      }
      lastStatus = updated.status;
    };
    return orderSync.subscribe({
      onInit: data => {
        const current = [...data.orders, ...data.archivedOrders].find(item => item.id === order.id && (order.clientRequestId ? item.clientRequestId === order.clientRequestId : item.createdAt === order.createdAt));
        setMissing(!current); update(current);
      },
      onStatusUpdate: data => update(data.order),
    });
  }, [order.id]);

  const readyAt = liveOrder.confirmedReadyAt || liveOrder.baselineReadyAt;
  const labels = { new: liveOrder.acceptedAt ? 'Час підтверджено · у черзі' : 'Очікуємо підтвердження часу кухнею', cooking: '🔥 Готується на вугіллі', ready: '🎉 Готово до видачі!', archived: '✅ Замовлення завершено' };
  return (
    <div className="p-4 pb-24 space-y-4 max-w-2xl mx-auto animate-fade-in">
      {missing && <p role="alert" className="rounded-xl bg-amber-950 border border-amber-700 p-3 text-xs text-amber-200">Це демозамовлення недоступне після оновлення сховища. Можна створити нове замовлення.</p>}
      <div role="status" aria-live="polite" className="rounded-2xl border border-sky-500/30 bg-sky-950/50 p-4">
        <div className="flex items-center gap-2 text-sky-400 text-xs font-bold mb-2"><Send size={16} /> ШаурМіша · Telegram · імітація</div>
        <p className="text-sm text-zinc-200 leading-relaxed">{liveOrder.notification || 'Замовлення оформлено. Очікуємо підтвердження часу кухнею.'}</p>
      </div>
      <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800 space-y-5 text-center">
        <div className="text-emerald-400 flex justify-center">{liveOrder.status === 'cooking' ? <ChefHat size={44} /> : <CheckCircle2 size={44} />}</div>
        <h2 className="text-2xl font-black">Замовлення #{liveOrder.id}</h2>
        <p className="text-sm text-orange-400 font-bold">{labels[liveOrder.status]}</p>
        <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
          <p className="text-xs text-zinc-400 flex justify-center gap-2 items-center"><Clock size={14} /> {liveOrder.acceptedAt ? 'Підтверджений час готовності' : 'Попередній час готовності'}</p>
          <p className="text-4xl font-black text-orange-400 my-2">{readyAt ? formatTime(readyAt, liveOrder.timeZone) : 'Уточнюємо'}</p>
          <p className="text-xs text-zinc-400">Сьогодні · місцевий час</p>
          {liveOrder.timingAdjusted && <p className="text-xs text-amber-300 mt-3">Обраний слот став неактуальним. Автоматично перенесли час на {formatTime(liveOrder.baselineReadyAt, liveOrder.timeZone)}.</p>}
          {!!liveOrder.kitchenDelayMinutes && <p className="text-xs text-amber-300 mt-2">Кухня додала {liveOrder.kitchenDelayMinutes} хвилин до базового часу.</p>}
        </div>
        <ul aria-label="Склад замовлення" className="space-y-3 text-left">
          {liveOrder.items?.map((item, index) => <li key={index} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <span className="shrink-0 rounded-lg bg-zinc-800 px-2 py-1 text-sm font-bold text-white">{item.qty} ×</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100 leading-relaxed">{item.name}</p>
              {item.toasting && <p className="mt-1 text-xs text-orange-300">Підсмажити лаваш: {item.toasting.toLowerCase()}</p>}
            </div>
          </li>)}
        </ul>
        <div className="text-sm text-left border-t border-zinc-800 pt-4 space-y-2">
          <p>Сума: <strong>{liveOrder.totalPrice} ₴</strong></p>
          <p className="text-xs text-zinc-400">{liveOrder.paymentStatus === 'cash_due' ? 'Оплата готівкою при отриманні' : 'Оплату успішно імітовано. Кошти не списувалися.'}</p>
          <p className="text-xs text-zinc-300">{liveOrder.orderType === 'delivery' ? `Доставка: ${liveOrder.deliveryAddress || ''}. Зазначено час готовності до передачі кур’єру.` : `Самовивіз: ${liveOrder.selectedLocation?.name || 'Заклад'}`}</p>
        </div>
        <button onClick={onReset} className="w-full bg-orange-500 rounded-xl p-3 font-bold flex items-center justify-center gap-2"><RotateCcw size={16} /> Нове замовлення</button>
      </div>
    </div>
  );
}
