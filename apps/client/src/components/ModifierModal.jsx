import React, { useState } from 'react';
import { X, Plus, Minus, Check, Flame, MessageSquare } from 'lucide-react';
import { MODIFIERS } from '../data/menuData';
import { tg } from '../utils/telegram';

export default function ModifierModal({ product, onClose, onAdd }) {
  const [addedMods, setAddedMods] = useState([]);
  const [removedMods, setRemovedMods] = useState([]);
  const [selectedLavash, setSelectedLavash] = useState(MODIFIERS.lavash[0]);
  const [selectedSpiciness, setSelectedSpiciness] = useState(MODIFIERS.spiciness[0]);
  const [quantity, setQuantity] = useState(1);
  const [customComment, setCustomComment] = useState('');

  // Calculate price for single item
  const singleItemTotal =
    product.price +
    (selectedLavash?.price || 0) +
    addedMods.reduce((sum, mod) => sum + mod.price, 0);

  const finalTotal = singleItemTotal * quantity;

  const toggleAddMod = (mod) => {
    tg.haptic.selection();
    if (addedMods.find(m => m.id === mod.id)) {
      setAddedMods(addedMods.filter(m => m.id !== mod.id));
    } else {
      setAddedMods([...addedMods, mod]);
    }
  };

  const toggleRemoveMod = (mod) => {
    tg.haptic.selection();
    if (removedMods.find(m => m.id === mod.id)) {
      setRemovedMods(removedMods.filter(m => m.id !== mod.id));
    } else {
      setRemovedMods([...removedMods, mod]);
    }
  };

  const handleLavashSelect = (lavash) => {
    tg.haptic.selection();
    setSelectedLavash(lavash);
  };

  const handleSpicinessSelect = (spiciness) => {
    tg.haptic.selection();
    setSelectedSpiciness(spiciness);
  };

  const handleConfirm = () => {
    tg.haptic.impact('medium');
    onAdd({
      product,
      quantity,
      lavash: selectedLavash,
      spiciness: selectedSpiciness,
      addedModifiers: addedMods,
      removedModifiers: removedMods,
      comment: customComment.trim(),
      totalPrice: finalTotal,
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 animate-fade-in"
        onClick={() => {
          tg.haptic.impact('light');
          onClose();
        }}
      />

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-zinc-900 border-t border-zinc-800 rounded-t-[28px] z-50 animate-slide-up max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Handle bar */}
        <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 bg-zinc-700/80 rounded-full" />
        </div>

        {/* Scrollable Content */}
        <div className="px-5 pb-6 overflow-y-auto flex-1 no-scrollbar space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start pt-2">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700/70 flex items-center justify-center text-3xl shadow-inner shrink-0">
                {product.emoji}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white leading-tight">
                  {product.name}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-orange-400 font-bold text-base">
                    від {product.price} ₴
                  </span>
                  {product.weight && (
                    <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
                      {product.weight}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                tg.haptic.impact('light');
                onClose();
              }}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
              aria-label="Закрити"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed bg-zinc-950/40 p-3 rounded-xl border border-zinc-800/60">
            {product.description}
          </p>

          {/* Lavash Selection */}
          {product.category === 'Шаурма' && (
            <div>
              <h3 className="font-semibold text-sm text-zinc-200 mb-2.5 flex items-center justify-between">
                <span>Оберіть лаваш:</span>
                <span className="text-xs font-normal text-zinc-400">1 варіант</span>
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {MODIFIERS.lavash.map(l => {
                  const isSelected = selectedLavash?.id === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => handleLavashSelect(l)}
                      className={`p-2.5 rounded-xl border text-left transition-all active:scale-95 flex flex-col justify-between ${
                        isSelected
                          ? 'border-orange-500 bg-orange-500/15 text-white ring-1 ring-orange-500'
                          : 'border-zinc-800 bg-zinc-800/40 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <span className="text-xs font-medium leading-tight">{l.name}</span>
                      <span className="text-[11px] text-orange-400 font-semibold mt-1">
                        {l.price > 0 ? `+${l.price} ₴` : 'Входить'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Spiciness Level */}
          {product.availableSpiciness && (
            <div>
              <h3 className="font-semibold text-sm text-zinc-200 mb-2.5 flex items-center gap-1.5">
                <Flame size={15} className="text-orange-500" />
                <span>Рівень гостроти:</span>
              </h3>
              <div className="grid grid-cols-4 gap-1.5">
                {MODIFIERS.spiciness.map(sp => {
                  const isSelected = selectedSpiciness?.level === sp.level;
                  return (
                    <button
                      key={sp.level}
                      type="button"
                      onClick={() => handleSpicinessSelect(sp)}
                      className={`py-2 px-1 rounded-xl border text-center transition-all active:scale-95 flex flex-col items-center justify-center gap-1 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-500/15 text-orange-400 ring-1 ring-orange-500'
                          : 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <span className="text-base">{sp.icon}</span>
                      <span className="text-[10px] font-medium leading-none">{sp.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Ingredients Section */}
          <div>
            <h3 className="font-semibold text-sm text-zinc-200 mb-2.5 flex items-center gap-1.5">
              <Plus size={16} className="text-emerald-400" />
              <span>Додати за смаком</span>
            </h3>
            <div className="flex flex-col gap-2">
              {MODIFIERS.add.map(mod => {
                const isSelected = Boolean(addedMods.find(m => m.id === mod.id));
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleAddMod(mod)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all active:scale-[0.99] ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{mod.icon}</span>
                      <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                        {mod.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-orange-400">
                        +{mod.price} ₴
                      </span>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                          isSelected
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'border-zinc-600 bg-zinc-800'
                        }`}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Remove Ingredients Section */}
          <div>
            <h3 className="font-semibold text-sm text-zinc-200 mb-2.5 flex items-center gap-1.5">
              <Minus size={16} className="text-red-400" />
              <span>Прибрати з рецепту</span>
            </h3>
            <div className="flex flex-col gap-2">
              {MODIFIERS.remove.map(mod => {
                const isSelected = Boolean(removedMods.find(m => m.id === mod.id));
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleRemoveMod(mod)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all active:scale-[0.99] ${
                      isSelected
                        ? 'border-red-500/60 bg-red-500/10'
                        : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-700'
                    }`}
                  >
                    <span
                      className={`text-sm font-medium transition-all ${
                        isSelected ? 'text-red-400 line-through' : 'text-zinc-300'
                      }`}
                    >
                      {mod.name}
                    </span>

                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                        isSelected
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'border-zinc-600 bg-zinc-800'
                      }`}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Special Kitchen Note */}
          <div>
            <label className="text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <MessageSquare size={13} className="text-zinc-400" />
              <span>Особливі побажання для кухаря:</span>
            </label>
            <input
              type="text"
              value={customComment}
              onChange={e => setCustomComment(e.target.value)}
              placeholder="Наприклад: сильніше підсмажити лаваш"
              className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-orange-500 transition-colors"
            />
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="p-4 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800/90 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            {/* Quantity Stepper */}
            <div className="flex items-center bg-zinc-800/80 rounded-xl p-1 border border-zinc-700/60">
              <button
                type="button"
                onClick={() => {
                  tg.haptic.impact('light');
                  if (quantity > 1) setQuantity(quantity - 1);
                }}
                disabled={quantity <= 1}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95"
              >
                <Minus size={15} />
              </button>
              <span className="w-8 text-center font-bold text-sm text-white">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => {
                  tg.haptic.impact('light');
                  setQuantity(quantity + 1);
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white active:scale-95"
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-zinc-400 block leading-tight">До сплати:</span>
              <span className="text-xl font-extrabold text-white">
                {finalTotal} <span className="text-orange-400 text-sm font-bold">₴</span>
              </span>
            </div>
          </div>

          <button
            onClick={handleConfirm}
            className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-bold py-3.5 px-6 rounded-2xl text-base shadow-xl shadow-orange-500/25 flex items-center justify-between transition-all"
          >
            <span>Додати в кошик</span>
            <span className="bg-black/20 px-3 py-1 rounded-full text-sm font-semibold">
              {finalTotal} ₴
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
