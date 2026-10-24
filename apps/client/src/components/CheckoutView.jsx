import React, { useState, useEffect, useRef } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  Clock,
  ShieldCheck,
  Check,
  CreditCard,
  Banknote
} from 'lucide-react';
import { LIMITS, maxAdditional } from '../utils/orderPolicy';
import { tg } from '../utils/telegram';
import ProductImage from './ProductImage';
import { orderSync } from '../utils/orderSync';
import { getSlots, formatTime, normalizeTiming, ceilQuarter, MINUTE } from '../utils/timing';

export default function CheckoutView({
  cart,
  point,
  profile,
  onProfileChange,
  onUpdateQuantity,
  onRemoveItem,
  onBackToMenu,
  onPlaceOrder,
  user
}) {
  const deliveryType = 'pickup';
  const selectedLocation = point ? { id: point.id, name: point.address, metro: point.metro } : null;
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber || '');
  const [napkins, setNapkins] = useState(true);
  const paymentMethod = 'cash';

  const [timingMode, setTimingMode] = useState('asap');
  const [requestedReadyAt, setRequestedReadyAt] = useState('');
  const [availability, setAvailability] = useState(null);
  const [clock, setClock] = useState(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    orderSync.getProfile().then(value => { if (active) onProfileChange?.(value); }).catch(() => {});
    const unsubscribe = orderSync.subscribe({
      onInit: data => setAvailability(data.availability),
      onAvailability: setAvailability,
    });
    const refreshClock = () => setClock(Date.now());
    const timer = setInterval(refreshClock, 15000);
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', refreshClock);
    return () => { active = false; unsubscribe(); clearInterval(timer); window.removeEventListener('focus', refreshClock); document.removeEventListener('visibilitychange', refreshClock); };
  }, []);

  const slots = availability ? getSlots(clock, availability) : [];
  const selectedSlot = requestedReadyAt || String(slots[0] || '');
  const hasUnavailableItems = cart.some(item => item.unavailableReason);
  const quantitiesValid = cart.every(item => cart.filter(row => row.product.id === item.product.id).reduce((sum, row) => sum + row.quantity, 0) <= LIMITS.perProduct) && cart.reduce((sum, item) => sum + item.quantity, 0) <= 10;
  const canSubmit = quantitiesValid && !hasUnavailableItems && availability?.acceptingOrders && (timingMode === 'scheduled' ? slots.length > 0 : availability.asapAvailable);

  // Subtotal calculation
  const subtotal = Math.round(cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0) * 100) / 100;

  const discount = Math.round(subtotal * (point?.pickupDiscountPercent ?? 0) / 100);
  const deliveryFee = 0;
  const finalTotal = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

  const prepaymentRequired = profile?.prepaymentOnly || finalTotal > LIMITS.cashMax;
  const prepaymentMessage = profile?.prepaymentOnly
    ? 'Після неявки замовлення доступні лише за передоплатою. Онлайн-оплату ще не підключено, тому оформлення тимчасово недоступне.'
    : 'Для замовлень понад 500 грн потрібна повна передоплата. Онлайн-оплату ще не підключено. Зменште кошик до 500 грн або замовте в закладі.';

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    setSubmitError('');
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const currentProfile = await orderSync.getProfile();
      onProfileChange?.(currentProfile);
      if (currentProfile.prepaymentOnly || finalTotal > LIMITS.cashMax) throw new Error(currentProfile.prepaymentOnly ? 'Для вас доступні лише замовлення з передоплатою. Онлайн-оплату ще не підключено.' : prepaymentMessage);
      if (!/^\+?[\d\s().-]{7,30}$/.test(phoneNumber.trim())) throw new Error('Вкажіть коректний номер для дзвінків');
      const notificationsEnabled = availability?.telegramNotifications && tg.isAvailable ? await tg.requestNotifications() : false;
      const current = await orderSync.getAvailability();
      setAvailability(current);
      if (!current.acceptingOrders) throw new Error(current.onBreak ? 'Обідня перерва. Прийом замовлень тимчасово призупинено' : 'Кафе зачинено. Прийом замовлень зупинено');
      const timing = normalizeTiming({ timingMode, requestedReadyAt: Number(selectedSlot) }, Date.now(), current);
      if (timingMode === 'scheduled') setRequestedReadyAt(String(timing.baselineReadyAt));
      await onPlaceOrder({
        cart, subtotal, discount, deliveryFee, finalTotal, deliveryType,
        selectedLocation, phoneNumber: phoneNumber.trim(), napkins, paymentMethod, notificationsEnabled,
        timingMode, requestedReadyAt: timing.requestedReadyAt,
      });
    } catch (error) {
      setSubmitError(error.message || 'Не вдалося оформити замовлення. Спробуйте ще раз');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="p-6 text-center text-zinc-400 min-h-[70vh] flex flex-col items-center justify-center animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-500 shadow-inner">
          <ShoppingBag size={40} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Кошик порожній</h2>
        <p className="text-zinc-400 text-sm max-w-xs mb-6">
          Додайте шаурму або напої з меню.
        </p>
        <button
          onClick={onBackToMenu}
          className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-orange-500/25 transition-all text-sm"
        >
          Перейти до меню
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 pb-28 space-y-4 animate-fade-in max-w-2xl mx-auto">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Ваше замовлення</h2>
          <p className="text-xs text-zinc-400">
            Клієнт: {user?.first_name || 'Гість'} {user?.username ? `(@${user.username})` : ''}
          </p>
        </div>
        <span className="text-xs font-semibold bg-zinc-800 text-orange-400 px-2.5 py-1 rounded-full border border-zinc-700/60">
          {cart.reduce((c, i) => c + i.quantity, 0)} поз.
        </span>
      </div>

      {/* Cart Items List */}
      <div className="space-y-3">
        {cart.map(item => (
          <div
            key={item.id}
            className="bg-zinc-900/90 rounded-2xl p-3.5 border border-zinc-800/80 shadow-md space-y-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ProductImage product={item.product} className="w-12" />
                <div>
                  <h4 className="font-bold text-white text-sm leading-tight">
                    {item.product.name}
                    {item.size && <span className="block text-xs text-zinc-400 mt-1">{item.size.name} · {item.size.weight}</span>}
                    {item.toastingLevel && <span className="block text-xs text-orange-300 mt-1">Підсмажити лаваш: {item.toastingLevel === 'strong' ? 'сильніше' : item.toastingLevel === 'light' ? 'слабіше' : 'звичайна піджарка'}</span>}
                  {item.unavailableReason && <span className="block text-xs text-red-300">{item.unavailableReason}</span>}
                  </h4>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {item.unitPrice} ₴ / шт
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="text-right">
                <span className="font-bold text-white text-base">
                  {Math.round(item.unitPrice * item.quantity * 100) / 100} ₴
                </span>
              </div>
            </div>

            {/* Modifiers List */}
            {(item.lavash?.price > 0 ||
              item.spiciness?.level > 0 ||
              item.addedModifiers?.length > 0 ||
              item.removedModifiers?.length > 0 ||
              item.comment) && (
              <div className="bg-zinc-950/50 rounded-xl p-2.5 border border-zinc-800/40 text-xs space-y-1">
                {item.lavash && item.lavash.id !== 'l1' && (
                  <div className="text-orange-300 flex items-center justify-between">
                    <span>Лаваш: {item.lavash.name}</span>
                    <span>+{item.lavash.price} ₴</span>
                  </div>
                )}

                {item.spiciness && item.spiciness.level > 0 && (
                  <div className="text-amber-400">
                    Гострота: {item.spiciness.label}
                  </div>
                )}

                {item.addedModifiers?.map(mod => (
                  <div key={mod.id} className="text-emerald-400 flex items-center justify-between">
                    <span>+ {mod.name}</span>
                    <span>+{mod.price} ₴</span>
                  </div>
                ))}

                {item.removedModifiers?.map(mod => (
                  <div key={mod.id} className="text-red-400 line-through">
                    - {mod.name}
                  </div>
                ))}

                {item.comment && (
                  <div className="text-zinc-400 italic text-[11px] pt-0.5 border-t border-zinc-800/40">
                    «{item.comment}»
                  </div>
                )}
              </div>
            )}

            {/* Quantity Stepper & Delete */}
            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
              <button
                onClick={() => {
                  tg.haptic.warning();
                  onRemoveItem(item.id);
                }}
                className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-1 text-xs"
              >
                <Trash2 size={14} />
                <span>Видалити</span>
              </button>

              <div className="flex items-center gap-2 bg-zinc-800/80 rounded-xl p-0.5 border border-zinc-700/60">
                <button
                  onClick={() => {
                    tg.haptic.impact('light');
                    onUpdateQuantity(item.id, -1);
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white active:scale-95 disabled:opacity-30"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center font-bold text-xs text-white">
                  {item.quantity}
                </span>
                <button
                  aria-label={`Збільшити кількість ${item.product.name}`}
                  disabled={maxAdditional(cart, item.product.id) === 0 || availability?.acceptingOrders !== true}
                  onClick={() => {
                    tg.haptic.impact('light');
                    onUpdateQuantity(item.id, 1);
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white active:scale-95 disabled:opacity-30"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delivery / Pickup Segmented Control */}
      <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800/80 space-y-3">
        <h3 className="font-bold text-sm text-white">Спосіб отримання</h3>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed="true" className="py-3 px-3 rounded-xl text-xs font-bold bg-orange-500 text-white">🚶 Самовивіз</button>
          <button type="button" disabled className="py-3 px-3 rounded-xl text-xs font-bold border border-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed">🛵 Доставка</button>
        </div>
        <div className="space-y-2 pt-1">
          <p className="text-xs text-zinc-400">Самовивіз із закладу:</p>
          <div className="rounded-xl border border-orange-500/50 bg-orange-500/10 p-3 text-sm">
            <strong className="block">{point?.name}</strong><span>{point?.address}</span>
            {point?.metro && <p className="text-xs text-zinc-400 mt-1">{point.metro}</p>}
          </div>
        </div>

        {/* Contact Phone */}
        <div className="pt-2 border-t border-zinc-800/60">
          <label htmlFor="contact-phone" className="text-xs text-zinc-400 block mb-1 font-medium">
            Номер для дзвінків:
          </label>
          <input
            id="contact-phone"
            type="tel"
            required
            maxLength={30}
            placeholder="+380…"
            autoComplete="tel"
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-hidden focus:border-orange-500"
          />
        </div>
      </div>

      <section className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 space-y-3" aria-label="Час видачі">
        <h3 className="font-bold flex items-center gap-2"><Clock size={18} className="text-orange-400" /> Коли приготувати?</h3>
        <div className="grid grid-cols-2 gap-2">
          {[['asap', 'Якнайшвидше'], ['scheduled', 'На точний час']].map(([mode, label]) => (
            <button key={mode} type="button" aria-pressed={timingMode === mode} onClick={() => { setTimingMode(mode); setClock(Date.now()); }}
              className={`rounded-xl p-3 text-sm font-bold border ${timingMode === mode ? 'bg-orange-500/15 border-orange-500 text-orange-300' : 'border-zinc-700 text-zinc-300'}`}>
              {label}
            </button>
          ))}
        </div>
        {timingMode === 'asap' ? <div className="space-y-1"><p className="text-xs text-zinc-400">Орієнтовний час приготування — від 15 хвилин</p>{availability?.asapAvailable && <p className="text-sm font-semibold text-orange-300">Найближча видача: {formatTime(ceilQuarter(clock + 15 * MINUTE), availability.timeZone)}</p>}</div> : (
          <div>
            <label htmlFor="ready-time" className="block text-xs text-zinc-400 mb-2">Сьогодні · місцевий час</label>
            <select id="ready-time" value={selectedSlot} onChange={event => setRequestedReadyAt(event.target.value)}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-700 p-3 text-white">
              {requestedReadyAt && !slots.includes(Number(requestedReadyAt)) && <option value={requestedReadyAt}>{formatTime(Number(requestedReadyAt), availability?.timeZone)} — буде оновлено перед оформленням</option>}
              {!slots.length && !requestedReadyAt && <option value="">Сьогодні немає доступних слотів</option>}
              {slots.map(slot => <option key={slot} value={slot}>{formatTime(slot, availability?.timeZone)}</option>)}
            </select>
            <p className="text-xs text-zinc-400 mt-2">Якщо час стане неактуальним, автоматично оберемо найближчий доступний слот.</p>
          </div>
        )}
        {!availability && <p className="text-xs text-amber-300">Перевіряємо доступність кухні…</p>}
        {availability && !availability.acceptingOrders && <p role="status" className="text-sm text-amber-300">{availability.onBreak ? 'Обідня перерва. Прийом замовлень тимчасово призупинено.' : 'Кафе зачинено. Прийом нових замовлень зупинено.'}</p>}
        {availability?.acceptingOrders && !canSubmit && <p role="status" className="text-xs text-amber-300">{timingMode === 'asap' && slots.length ? 'На зараз недоступно. Оберіть точний час.' : 'Сьогодні прийом замовлень завершено.'}</p>}
      </section>

      <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800/80 flex items-center justify-between">
        <div><span className="text-sm font-semibold text-white block">Додати серветки</span><span className="text-xs text-zinc-400">До вашого замовлення</span></div>
        <button type="button" role="switch" aria-label="Додати серветки" aria-checked={napkins} onClick={() => { tg.haptic.selection(); setNapkins(!napkins); }} className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${napkins ? 'bg-orange-500' : 'bg-zinc-800'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${napkins ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Payment Method Selector */}
      <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800/80 space-y-2">
        <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
          <CreditCard size={15} className="text-sky-400" />
          <span>Спосіб оплати</span>
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={prepaymentRequired} aria-pressed={!prepaymentRequired} className={`p-3 rounded-xl border flex flex-col items-center gap-1 ${prepaymentRequired ? 'border-zinc-800 bg-zinc-800/40 text-zinc-500 opacity-50 cursor-not-allowed' : 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500'}`}>
            <Banknote size={18} />
            <span className="text-xs font-semibold">При отриманні</span>
          </button>
          <button type="button" disabled className="p-3 rounded-xl border border-zinc-800 bg-zinc-800/40 text-zinc-500 opacity-50 cursor-not-allowed flex flex-col items-center gap-1">
            <CreditCard size={18} />
            <span className="text-xs font-semibold">Картка онлайн</span>
            <span className="text-[10px]">Незабаром</span>
          </button>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/80 space-y-2 text-sm">
        <div className="flex justify-between items-center text-zinc-400">
          <span>Вартість страв</span>
          <span>{subtotal} ₴</span>
        </div>

        {discount > 0 && (
          <div className="flex justify-between items-center text-emerald-400">
            <span>Знижка {deliveryType === 'pickup' ? `(самовивіз ${point?.pickupDiscountPercent ?? 0}%)` : ''}</span>
            <span>-{discount} ₴</span>
          </div>
        )}

        <div className="h-px bg-zinc-800 my-1" />

        <div className="flex justify-between items-center font-black text-xl text-white pt-1">
          <span>Разом до сплати</span>
          <span className="text-orange-400">{finalTotal} ₴</span>
        </div>
      </div>

      {hasUnavailableItems && <p role="alert" className="text-sm text-red-300">Деякі позиції недоступні. Видаліть їх або оберіть склад заново.</p>}
      {submitError && <p role="alert" className="rounded-xl border border-red-700 bg-red-950 p-3 text-sm text-red-200">{submitError}</p>}
      {/* Sticky Native-like Telegram MainButton */}
      <div className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto safe-bottom p-4 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 z-30">
        <button
          onClick={handleSubmitOrder}
          disabled={isSubmitting || !canSubmit || prepaymentRequired}
          className="disabled:opacity-50 disabled:cursor-not-allowed w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold py-4 px-6 rounded-2xl shadow-xl shadow-orange-500/25 flex items-center justify-between transition-transform active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-amber-200" />
            <span className="text-base sm:text-lg">
              {isSubmitting ? 'Оформлюємо…' : 'Підтвердити замовлення'}
            </span>
          </div>
          <span className="bg-black/25 px-3 py-1 rounded-xl text-base font-bold">
            {finalTotal} ₴
          </span>
        </button>
      </div>
    </div>
  );
}
