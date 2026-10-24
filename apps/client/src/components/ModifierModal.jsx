import React, { useState } from 'react';
import { X, Plus, Minus, Check, Flame, Leaf } from 'lucide-react';
import { tg } from '../utils/telegram';
import ProductImage from './ProductImage';
import { mediaUrl } from '../utils/orderSync';

function IngredientPhoto({ ingredient }) {
  const [failed, setFailed] = useState(null);
  return <div className="w-[72px] h-[72px] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
    {ingredient.imageUrl && failed !== ingredient.imageUrl ? <img src={mediaUrl(ingredient.imageUrl)} alt={ingredient.name} width="72" height="72" loading="lazy" onError={() => setFailed(ingredient.imageUrl)} className="h-full w-full object-cover"/>
      : <Leaf size={24} className="text-zinc-600" role="img" aria-label={`Фото ${ingredient.name} ще не додано`}/>}
  </div>;
}

export default function ModifierModal({ product, onClose, onAdd, modifiers: MODIFIERS, orderingDisabled, orderingUnavailableLabel, previewOnly = false, maxQuantity = 5 }) {
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0] || null);
  const [addedMods, setAddedMods] = useState([]);
  const [removedMods, setRemovedMods] = useState([]);
  const [selectedLavash, setSelectedLavash] = useState(product.hasModifiers ? MODIFIERS.lavash[0] : null);
  const [selectedSpiciness, setSelectedSpiciness] = useState(product.availableSpiciness ? MODIFIERS.spiciness[0] : null);
  const [quantity, setQuantity] = useState(1);
  const [toastingLevel, setToastingLevel] = useState('normal');

  // Calculate price for single item
  const singleItemTotal =
    (selectedSize?.price ?? product.price) +
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
    if (orderingDisabled || previewOnly || quantity > maxQuantity) return;
    tg.haptic.impact('medium');
    onAdd({
      product,
      size: selectedSize,
      quantity,
      lavash: selectedLavash,
      spiciness: selectedSpiciness,
      addedModifiers: addedMods,
      removedModifiers: removedMods,
      toastingLevel: product.category === 'Шаурма' ? toastingLevel : null,
      comment: '',
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
      <div className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-zinc-900 border-t border-zinc-800 rounded-t-[28px] z-50 animate-slide-up max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Handle bar */}
        <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 bg-zinc-700/80 rounded-full" />
        </div>

        {/* Scrollable Content */}
        <div className="px-5 pb-6 overflow-y-auto flex-1 no-scrollbar space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start pt-2">
            <div className="flex items-center gap-3">
              <ProductImage product={product} className="w-20" />
              <div>
                {product.tag && <p className="text-xs font-bold text-orange-300 mb-1">{product.tag}</p>}
                <h2 className="text-xl font-bold text-white leading-tight">
                  {product.name}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-orange-400 font-bold text-base">
                    {selectedSize?.price ?? product.price} ₴
                  </span>
                  {(selectedSize?.weight || product.weight) && (
                    <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
                      {selectedSize?.weight || product.weight}
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

          {!!product.ingredients?.length && <section aria-label="Фото інгредієнтів">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Інгредієнти</h3>
            <div className="flex gap-3 overflow-x-auto pb-1">{product.ingredients.map(item => <div key={item.id} className="w-[72px] shrink-0 text-center">
              <IngredientPhoto ingredient={item}/>
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-400"><Leaf size={12} className="inline-block mr-1 text-orange-300/80" aria-hidden="true"/>{item.name}</p>
            </div>)}</div>
          </section>}

          {!!product.sizes?.length && (
            <fieldset>
              <legend className="font-semibold text-sm text-zinc-200 mb-2.5">Розмір шаурми</legend>
              <div className="grid grid-cols-3 gap-2">
                {product.sizes.map(size => <button key={size.id} type="button" aria-pressed={selectedSize?.id === size.id} onClick={() => { tg.haptic.selection(); setSelectedSize(size); }} className={`p-3 rounded-xl border text-left flex flex-col gap-1 ${selectedSize?.id === size.id ? 'border-orange-500 bg-orange-500/15 text-white ring-1 ring-orange-500' : 'border-zinc-800 bg-zinc-800/40 text-zinc-300'}`}>
                  <span className="text-xs font-semibold">{size.name}</span>
                  <span className="text-xs text-zinc-400">{size.weight}</span>
                  <span className="text-sm font-bold text-orange-400">{size.price} ₴</span>
                </button>)}
              </div>
            </fieldset>
          )}

          {/* Lavash Selection */}
          {product.hasModifiers && product.category === 'Шаурма' && (
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
          {product.hasModifiers && <div>
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
          </div>}

          {/* Remove Ingredients Section */}
          {product.hasModifiers && <div>
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
          </div>}

          {!previewOnly && product.category === 'Шаурма' && <fieldset>
            <legend className="font-semibold text-sm text-zinc-200 mb-2.5">Підсмажити лаваш</legend>
            <div className="grid grid-cols-3 gap-2">
              {[['light', 'Слабіше'], ['normal', 'Звичайна'], ['strong', 'Сильніше']].map(([value, label]) => <button key={value} type="button" aria-pressed={toastingLevel === value} onClick={() => { tg.haptic.selection(); setToastingLevel(value); }} className={`p-3 rounded-xl border text-sm font-semibold transition-colors ${toastingLevel === value ? 'border-orange-500 bg-orange-500/15 text-white ring-1 ring-orange-500' : 'border-zinc-800 bg-zinc-800/40 text-zinc-300'}`}>{label}</button>)}
            </div>
          </fieldset>}

        </div>

        {/* Sticky Footer */}
        {previewOnly ? <div className="safe-bottom p-4 border-t border-zinc-800 space-y-3">
          <p className="text-sm text-center text-amber-200">Замовлення незабаром</p>
          <button type="button" onClick={onClose} className="w-full rounded-2xl bg-zinc-800 py-3 text-sm font-semibold hover:bg-zinc-700">Повернутися до меню</button>
        </div> : <div className="safe-bottom p-4 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800/90 flex flex-col gap-3 shrink-0">
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
                aria-label="Збільшити кількість"
                disabled={quantity >= maxQuantity}
                onClick={() => {
                  tg.haptic.impact('light');
                  if (quantity < maxQuantity) setQuantity(quantity + 1);
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white active:scale-95 disabled:opacity-30"
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
            disabled={orderingDisabled || quantity > maxQuantity}
            className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-2xl text-base shadow-xl shadow-orange-500/25 flex items-center justify-between transition-all"
          >
            <span>{orderingDisabled ? orderingUnavailableLabel : 'Додати в кошик'}</span>
            <span className="bg-black/20 px-3 py-1 rounded-full text-sm font-semibold">
              {finalTotal} ₴
            </span>
          </button>
        </div>}
      </div>
    </>
  );
}
