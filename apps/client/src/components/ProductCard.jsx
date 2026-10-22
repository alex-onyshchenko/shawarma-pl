import React from 'react';
import { Plus, SlidersHorizontal, Check } from 'lucide-react';
import { tg } from '../utils/telegram';

export default function ProductCard({ product, onSelect, onQuickAdd, inCartCount }) {
  const handleClick = () => {
    if (product.hasModifiers) {
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
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 flex items-center justify-center text-4xl sm:text-5xl shrink-0 shadow-inner overflow-hidden select-none">
        <span className="transform group-hover:scale-110 transition-transform duration-300">
          {product.emoji}
        </span>

        {/* Tag badge (e.g. Хіт, Топ) */}
        {product.tag && (
          <span className="absolute top-1.5 left-1.5 bg-orange-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm backdrop-blur-sm">
            {product.tag}
          </span>
        )}

        {/* In-cart count badge on photo */}
        {inCartCount > 0 && (
          <div className="absolute bottom-1.5 right-1.5 bg-emerald-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-0.5">
            <Check size={11} strokeWidth={3} />
            <span>{inCartCount}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-start justify-between gap-1 mb-1">
            <h3 className="font-bold text-base sm:text-lg leading-tight text-white truncate">
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
        <div className="flex items-center justify-between mt-3 pt-1 border-t border-zinc-800/40">
          <div className="flex flex-col">
            <span className="font-extrabold text-lg text-white tracking-tight">
              {product.price} <span className="text-orange-400 font-semibold text-sm">₴</span>
            </span>
          </div>

          <button
            onClick={handleClick}
            className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 active:scale-95 flex items-center gap-1.5 ${
              product.hasModifiers
                ? 'bg-zinc-800 hover:bg-zinc-700 text-orange-400 border border-orange-500/30'
                : 'bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/20'
            }`}
          >
            {product.hasModifiers ? (
              <>
                <SlidersHorizontal size={13} />
                <span>Скласти</span>
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
