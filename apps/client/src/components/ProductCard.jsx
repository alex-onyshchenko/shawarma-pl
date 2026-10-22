import React from 'react';
import { Plus, SlidersHorizontal, Check, Eye } from 'lucide-react';
import { tg } from '../utils/telegram';
import ProductImage from './ProductImage';

export default function ProductCard({ product, onSelect, onQuickAdd, inCartCount, orderingDisabled, orderingUnavailableLabel, previewOnly = false }) {
  const customizable = product.hasModifiers || !!product.sizes?.length;
  const handleClick = () => {
    if (!product.available || orderingDisabled) return;
    if (customizable || previewOnly) {
      tg.haptic.impact('light');
      onSelect(product);
    } else {
      tg.haptic.impact('medium');
      onQuickAdd(product);
    }
  };

  return (
    <div className="bg-zinc-900/90 hover:bg-zinc-900 rounded-2xl p-3.5 sm:p-4 flex gap-3.5 border border-zinc-800/80 shadow-md hover:border-zinc-700/80 transition-all duration-200 relative group">
      {/* Product Image / Emoji */}
      <ProductImage product={product} className="w-28 sm:w-32 self-start">
        {/* In-cart count badge on photo */}
        {inCartCount > 0 && (
          <div className="absolute bottom-1.5 right-1.5 bg-emerald-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-0.5">
            <Check size={11} strokeWidth={3} />
            <span>{inCartCount}</span>
          </div>
        )}
      </ProductImage>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-between min-w-0">
        <div>
          {product.tag && <span className="inline-block mb-2 rounded-md bg-orange-500/15 border border-orange-500/30 px-2 py-1 text-[10px] font-bold text-orange-300">{product.tag}</span>}
          <div className="flex flex-col items-start gap-1.5 mb-2">
            <h3 className="font-bold text-base sm:text-lg leading-tight text-white">
              {product.name}
            </h3>
            {product.weight && (
              <span className="text-[11px] text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded shrink-0">
                {product.weight}
              </span>
            )}
          </div>
          <p className="text-zinc-400 text-xs leading-relaxed line-clamp-2">
            {product.description}
          </p>
        </div>

        {/* Price & Action Button */}
        <div className="flex flex-col items-start gap-2 mt-3 pt-2 border-t border-zinc-800/40">
          <div className="flex flex-col">
            <span className="font-extrabold text-lg text-white tracking-tight">
              {product.sizes?.length > 1 ? 'від ' : ''}{product.price} <span className="text-orange-400 font-semibold text-sm">₴</span>
            </span>
          </div>

          <button
            disabled={!product.available || orderingDisabled}
            onClick={handleClick}
            className={`disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 active:scale-95 flex items-center gap-1.5 ${
              customizable
                ? 'bg-zinc-800 hover:bg-zinc-700 text-orange-400 border border-orange-500/30'
                : 'bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/20'
            }`}
          >
            {!product.available ? <span>Немає в наявності</span> : previewOnly ? <><Eye size={15}/><span>Переглянути</span></> : orderingDisabled ? <span>{orderingUnavailableLabel}</span> : customizable ? (
              <>
                <SlidersHorizontal size={13} />
                <span>{product.sizes?.length ? 'Обрати' : 'Скласти'}</span>
              </>
            ) : (
              <>
                <Plus size={15} />
                <span>Додати</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
