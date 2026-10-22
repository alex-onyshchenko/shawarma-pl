import React from 'react';
import { tg } from '../utils/telegram';

export default function CategoryTabs({ categories, activeCategory, onSelectCategory, productsCountByCategory }) {
  return (
    <div className="sticky top-[57px] z-20 bg-zinc-950/95 backdrop-blur-md pt-3 pb-2 px-4 border-b border-zinc-900/80">
      <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
        {categories.map(cat => {
          const isActive = activeCategory === cat.name;
          const count = productsCountByCategory?.[cat.name] || 0;

          return (
            <button
              key={cat.id || cat.name}
              onClick={() => {
                tg.haptic.selection();
                onSelectCategory(cat.name);
              }}
              className={`whitespace-nowrap px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 active:scale-95 shrink-0 ${
                isActive
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25 ring-2 ring-orange-500/30'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-zinc-800/60'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
              {count > 0 && (
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-black/30 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
