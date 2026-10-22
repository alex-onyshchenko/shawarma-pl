import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { orderSync } from '../utils/orderSync';
import { formatTime, localParts } from '../utils/timing';

export default function ManualOrderModal({ menu, availability, onClose, onCreated }) {
  const products = (menu?.products || []).filter(product => product.category === 'Шаурма' && product.available);
  const [productId, setProductId] = useState(products[0]?.id || '');
  const product = products.find(product => product.id === productId);
  const [sizeId, setSizeId] = useState(product?.sizes?.[0]?.id || '');
  const size = product?.sizes?.find(size => size.id === sizeId);
  const [toastingLevel, setToastingLevel] = useState('normal');
  const [quantity, setQuantity] = useState(1);
  const [readyAt, setReadyAt] = useState(String(availability?.manualSlots?.[0] || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null), submitting = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const slots = availability?.manualSlots || [];
  const slotLabel = slot => {
    const zone = availability?.timeZone || menu?.point.timeZone;
    const today = localParts(availability?.serverNow || Date.now(), zone).day;
    const date = localParts(slot, zone).day === today ? 'Сьогодні' : new Intl.DateTimeFormat('uk-UA', { timeZone: zone, day: '2-digit', month: '2-digit' }).format(slot);
    return `${date} · ${formatTime(slot, zone)}`;
  };
  const subtotal = (size?.price ?? product?.price ?? 0) * quantity;
  const total = Math.round((subtotal - Math.round(subtotal * (menu?.point.pickupDiscountPercent || 0) / 100)) * 100) / 100;
  const canCreate = product && (!product.sizes?.length || size) && readyAt && slots.length;

  const submit = async event => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    pending.current ||= {
      clientRequestId: crypto.randomUUID(), pointId: menu.point.id,
      items: [{ productId, sizeId: size?.id || null, toastingLevel, qty: quantity }],
      timingMode: 'scheduled', requestedReadyAt: Number(readyAt),
      orderType: 'pickup', paymentMethod: 'cash', customerName: 'Клієнт у закладі', expectedTotal: total,
    };
    try { onCreated(await orderSync.createManualOrder(pending.current)); }
    catch (error) {
      if (error.status) { pending.current = null; setRetrying(false); }
      else setRetrying(true);
      setError(error.message || 'Не вдалося отримати відповідь. Повторіть спробу — дублікат не створиться.');
    } finally { submitting.current = false; setBusy(false); }
  };

  const fieldClass = 'mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white disabled:opacity-50';
  return <div role="dialog" aria-modal="true" aria-labelledby="manual-order-title" className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
    <form onSubmit={submit} className="w-full max-w-lg max-h-[95vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3"><h2 id="manual-order-title" className="text-xl font-bold">Створити замовлення</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Закрити" className="p-2 text-zinc-400"><X size={22}/></button></div>
      <p className="text-sm text-zinc-400">Самовивіз · оплата при отриманні. Обраний час одразу підтверджується кухнею.</p>
      <fieldset disabled={busy || retrying} className="space-y-4">
        <label className="block text-sm text-zinc-300">Тип шаурми<select className={fieldClass} value={productId} required onChange={event => { const next = products.find(product => product.id === event.target.value); setProductId(event.target.value); setSizeId(next?.sizes?.[0]?.id || ''); }}>{!products.length && <option value="">Немає доступної шаурми</option>}{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className="block text-sm text-zinc-300">Розмір<select className={fieldClass} value={sizeId} required={!!product?.sizes?.length} onChange={event => setSizeId(event.target.value)}>{!product?.sizes?.length && <option value="">Стандартний</option>}{product?.sizes?.map(size => <option key={size.id} value={size.id}>{size.name} · {size.weight} · {size.price} ₴</option>)}</select></label>
        <label className="block text-sm text-zinc-300">Підсмажити лаваш<select className={fieldClass} value={toastingLevel} onChange={event => setToastingLevel(event.target.value)}><option value="light">Слабіше</option><option value="normal">Звичайна піджарка</option><option value="strong">Сильніше</option></select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-zinc-300">Кількість<input className={fieldClass} type="number" min="1" max="99" step="1" required value={quantity} onChange={event => setQuantity(Number(event.target.value))}/></label>
          <label className="block text-sm text-zinc-300">Час готовності<select className={fieldClass} value={readyAt} required onChange={event => setReadyAt(event.target.value)}>{readyAt && !slots.includes(Number(readyAt)) && <option value={readyAt}>{slotLabel(Number(readyAt))} — оновимо</option>}{!slots.length && !readyAt && <option value="">Немає часу</option>}{slots.map(slot => <option key={slot} value={slot}>{slotLabel(slot)}</option>)}</select></label>
        </div>
      </fieldset>
      <p className="text-xs text-zinc-400">Ручні замовлення доступні навіть у зачиненому кафе, під час перерви та поза розкладом. Час — у найближчі 24 години, з кроком 15 хвилин і щонайменше через 15 хвилин.</p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex items-center justify-between border-t border-zinc-700 pt-4"><strong className="text-xl">{total} ₴</strong><button disabled={busy || (!retrying && !canCreate)} className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Створюємо…' : retrying ? 'Повторити спробу' : 'Створити замовлення'}</button></div>
    </form>
  </div>;
}
