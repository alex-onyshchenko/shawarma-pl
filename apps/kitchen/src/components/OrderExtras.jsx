import React from 'react';
import { PackagePlus, Check, X } from 'lucide-react';

export default function OrderExtras({ order }) {
  if (typeof order.napkins !== 'boolean') return null;
  return <section aria-label="Додатки до замовлення" className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
    <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500"><PackagePlus size={14} />Додатки</h4>
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
        <svg role="img" aria-label="Серветки" width="32" height="32" viewBox="0 0 48 48" fill="none"><rect x="9" y="9" width="29" height="31" rx="3" transform="rotate(-8 9 9)" fill="#d6d3d1"/><path d="M10 8H31L39 16V36C39 37.7 37.7 39 36 39H13C11.3 39 10 37.7 10 36V8Z" fill="#fafaf9" stroke="#a8a29e"/><path d="M31 8V16H39" stroke="#a8a29e"/><path d="M16 22H32M16 27H32M16 32H27" stroke="#d6d3d1" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </div>
      <div className="min-w-0"><p className="text-sm font-medium text-zinc-200">Серветки</p><p className={`mt-1 flex items-center gap-1 text-xs ${order.napkins ? 'text-emerald-300' : 'text-zinc-500'}`}>{order.napkins ? <Check size={13}/> : <X size={13}/>} {order.napkins ? 'Додати до замовлення' : 'Не додавати'}</p></div>
    </div>
  </section>;
}
