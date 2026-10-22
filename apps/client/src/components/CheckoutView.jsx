import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  MapPin,
  Clock,
  Sparkles,
  ShieldCheck,
  Check,
  Utensils,
  ChevronRight,
  CreditCard,
  Banknote,
  Send
} from 'lucide-react';
import { PICKUP_LOCATIONS } from '../data/menuData';
import { tg } from '../utils/telegram';

export default function CheckoutView({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onBackToMenu,
  onPlaceOrder,
  user
}) {
  const [deliveryType, setDeliveryType] = useState('pickup'); // 'pickup' | 'delivery'
  const [selectedLocation, setSelectedLocation] = useState(PICKUP_LOCATIONS[0]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+380 (97) 123-45-67');
  const [cutlery, setCutlery] = useState(true);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('telegram'); // 'telegram' | 'card' | 'cash'
  const [orderComment, setOrderComment] = useState('');

  // Subtotal calculation
  const subtotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  // Discount calculation
  let discount = 0;
  if (deliveryType === 'pickup') {
    discount += Math.round(subtotal * 0.1); // 10% discount for pickup
  }
  if (appliedPromo) {
    discount += Math.round(subtotal * appliedPromo.percent / 100);
  }

  // Delivery fee
  const deliveryFee = deliveryType === 'delivery' ? (subtotal >= 350 ? 0 : 50) : 0;

  const finalTotal = Math.max(0, subtotal - discount + deliveryFee);

  const handleApplyPromo = () => {
    tg.haptic.impact('light');
    const code = promoCode.trim().toUpperCase();
    if (code === 'LAVASH' || code === 'LAVASH10' || code === 'SHAVA10') {
      setAppliedPromo({ code, percent: 10 });
      setPromoError('');
      tg.haptic.success();
    } else if (code === 'VUHILLYA' || code === 'TOP') {
      setAppliedPromo({ code, percent: 15 });
      setPromoError('');
      tg.haptic.success();
    } else {
      setPromoError('Недійсний промокод. Спробуйте LAVASH10 або VUHILLYA');
      setAppliedPromo(null);
      tg.haptic.warning();
    }
  };

  const handleSubmitOrder = (e) => {
    e.preventDefault();
    if (deliveryType === 'delivery' && !deliveryAddress.trim()) {
      alert('Будь ласка, вкажіть адресу доставки');
      return;
    }

    tg.haptic.impact('heavy');
    onPlaceOrder({
      cart,
      subtotal,
      discount,
      deliveryFee,
      finalTotal,
      deliveryType,
      selectedLocation: deliveryType === 'pickup' ? selectedLocation : null,
      deliveryAddress: deliveryType === 'delivery' ? deliveryAddress : null,
      phoneNumber,
      cutlery,
      paymentMethod,
      orderComment,
      appliedPromo
    });
  };

  if (cart.length === 0) {
    return (
      <div className="p-6 text-center text-zinc-400 min-h-[70vh] flex flex-col items-center justify-center animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-500 shadow-inner">
          <ShoppingBag size={40} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Кошик порожній</h2>
        <p className="text-zinc-400 text-sm max-w-xs mb-6">
          Ви ще не додали жодної соковитої шаурми або смачного снеку до замовлення.
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
    <div className="p-4 pb-28 space-y-4 animate-fade-in max-w-md mx-auto">
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
                <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-2xl shrink-0">
                  {item.product.emoji}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm leading-tight">
                    {item.product.name}
                  </h4>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {item.unitPrice} ₴ / шт
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="text-right">
                <span className="font-bold text-white text-base">
                  {item.unitPrice * item.quantity} ₴
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
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white active:scale-95"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center font-bold text-xs text-white">
                  {item.quantity}
                </span>
                <button
                  onClick={() => {
                    tg.haptic.impact('light');
                    onUpdateQuantity(item.id, 1);
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white active:scale-95"
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
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              tg.haptic.selection();
              setDeliveryType('pickup');
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              deliveryType === 'pickup'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>🚶 Самовивіз</span>
            <span className="bg-black/30 text-[10px] px-1.5 py-0.2 rounded-full">-10%</span>
          </button>

          <button
            type="button"
            onClick={() => {
              tg.haptic.selection();
              setDeliveryType('delivery');
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              deliveryType === 'delivery'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>🛵 Доставка</span>
          </button>
        </div>

        {/* Pickup Location Selector */}
        {deliveryType === 'pickup' ? (
          <div className="space-y-2 pt-1">
            <label className="text-xs text-zinc-400 block font-medium">
              Оберіть заклад для самовивозу:
            </label>
            <div className="space-y-1.5">
              {PICKUP_LOCATIONS.map(loc => {
                const isSelected = selectedLocation.id === loc.id;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      tg.haptic.selection();
                      setSelectedLocation(loc);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/10 ring-1 ring-orange-500'
                        : 'border-zinc-800 bg-zinc-800/40 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <MapPin size={16} className={isSelected ? 'text-orange-500' : 'text-zinc-400'} />
                      <div>
                        <div className="text-xs font-semibold text-white">{loc.name}</div>
                        <div className="text-[11px] text-zinc-400">{loc.metro}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-orange-400 font-medium">
                      <Clock size={12} />
                      <span>{loc.time}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Delivery Address Form */
          <div className="space-y-2 pt-1">
            <label className="text-xs text-zinc-400 block font-medium">
              Адреса доставки у Києві:
            </label>
            <input
              type="text"
              value={deliveryAddress}
              onChange={e => setDeliveryAddress(e.target.value)}
              placeholder="Вулиця, номер будинку, квартира / офіс"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-orange-500 transition-colors"
            />
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Доставка кур'єром за 35-45 хв</span>
              <span className="text-emerald-400">
                {subtotal >= 350 ? 'Безкоштовно від 350 ₴' : '+50 ₴ до замовлення'}
              </span>
            </div>
          </div>
        )}

        {/* Contact Phone */}
        <div className="pt-2 border-t border-zinc-800/60">
          <label className="text-xs text-zinc-400 block mb-1 font-medium">
            Номер телефону для зв'язку:
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-hidden focus:border-orange-500"
          />
        </div>
      </div>

      {/* Extras: Cutlery & Comment */}
      <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800/80 space-y-3">
        {/* Cutlery toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils size={16} className="text-orange-400" />
            <div>
              <span className="text-xs font-semibold text-white block">Серветки та прилади</span>
              <span className="text-[11px] text-zinc-400 block">Покласти комплект до замовлення</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              tg.haptic.selection();
              setCutlery(!cutlery);
            }}
            className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
              cutlery ? 'bg-orange-500' : 'bg-zinc-800'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                cutlery ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Order Comment */}
        <div className="pt-2 border-t border-zinc-800/60">
          <input
            type="text"
            value={orderComment}
            onChange={e => setOrderComment(e.target.value)}
            placeholder="Коментар до замовлення (наприклад: домофон #34)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-orange-500"
          />
        </div>
      </div>

      {/* Promo Code Card */}
      <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800/80">
        <label className="text-xs font-semibold text-white block mb-1.5 flex items-center gap-1.5">
          <Sparkles size={14} className="text-amber-400" />
          <span>Промокод на знижку</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={e => setPromoCode(e.target.value)}
            placeholder="Введіть код (напр. LAVASH10)"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs uppercase text-white placeholder-zinc-500 focus:outline-hidden focus:border-orange-500"
          />
          <button
            type="button"
            onClick={handleApplyPromo}
            className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white text-xs font-semibold px-3 py-2 rounded-xl border border-zinc-700 transition-colors"
          >
            Застосувати
          </button>
        </div>

        {appliedPromo && (
          <div className="mt-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 flex items-center justify-between">
            <span>🎉 Промокод {appliedPromo.code} активовано (-{appliedPromo.percent}%)</span>
            <button
              onClick={() => {
                setAppliedPromo(null);
                setPromoCode('');
              }}
              className="text-zinc-400 hover:text-white ml-2"
            >
              ×
            </button>
          </div>
        )}

        {promoError && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
            {promoError}
          </div>
        )}
      </div>

      {/* Payment Method Selector */}
      <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800/80 space-y-2">
        <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
          <CreditCard size={15} className="text-sky-400" />
          <span>Спосіб оплати</span>
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              tg.haptic.selection();
              setPaymentMethod('telegram');
            }}
            className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
              paymentMethod === 'telegram'
                ? 'border-sky-500 bg-sky-500/10 text-sky-400 ring-1 ring-sky-500'
                : 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Send size={16} className="text-sky-400" />
            <span className="text-[11px] font-semibold leading-tight">Telegram Pay</span>
          </button>

          <button
            type="button"
            onClick={() => {
              tg.haptic.selection();
              setPaymentMethod('card');
            }}
            className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
              paymentMethod === 'card'
                ? 'border-orange-500 bg-orange-500/10 text-orange-400 ring-1 ring-orange-500'
                : 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <CreditCard size={16} className="text-orange-400" />
            <span className="text-[11px] font-semibold leading-tight">Картка онлайн</span>
          </button>

          <button
            type="button"
            onClick={() => {
              tg.haptic.selection();
              setPaymentMethod('cash');
            }}
            className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
              paymentMethod === 'cash'
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500'
                : 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Banknote size={16} className="text-emerald-400" />
            <span className="text-[11px] font-semibold leading-tight">При отриманні</span>
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
            <span>Знижка {deliveryType === 'pickup' ? '(самовивіз 10%)' : ''}</span>
            <span>-{discount} ₴</span>
          </div>
        )}

        <div className="flex justify-between items-center text-zinc-400">
          <span>Доставка</span>
          <span>
            {deliveryFee === 0 ? (
              <span className="text-emerald-400 font-medium">Безкоштовно</span>
            ) : (
              `${deliveryFee} ₴`
            )}
          </span>
        </div>

        <div className="h-px bg-zinc-800 my-1" />

        <div className="flex justify-between items-center font-black text-xl text-white pt-1">
          <span>Разом до сплати</span>
          <span className="text-orange-400">{finalTotal} ₴</span>
        </div>
      </div>

      {/* Sticky Native-like Telegram MainButton */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 z-30">
        <button
          onClick={handleSubmitOrder}
          className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold py-4 px-6 rounded-2xl shadow-xl shadow-orange-500/25 flex items-center justify-between transition-transform active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-amber-200" />
            <span className="text-base sm:text-lg">
              {paymentMethod === 'telegram'
                ? 'Оплатити через Telegram'
                : paymentMethod === 'card'
                ? 'Оплатити карткою'
                : 'Підтвердити замовлення'}
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
