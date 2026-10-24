import React from 'react';
import { PackagePlus, Check, X, UtensilsCrossed } from 'lucide-react';

export default function OrderExtras({ order }) {
  if (typeof order.cutlery !== 'boolean') return null;
  return <section aria-label="Додатки до замовлення" className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
    <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500"><PackagePlus size={14} />Додатки</h4>
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
        <UtensilsCrossed size={25} role="img" aria-label="Прибори" className="text-zinc-300"/>
      </div>
      <div className="min-w-0"><p className="text-sm font-medium text-zinc-200">Прибори</p><p className={`mt-1 flex items-center gap-1 text-xs ${order.cutlery ? 'text-emerald-300' : 'text-zinc-500'}`}>{order.cutlery ? <Check size={13}/> : <X size={13}/>} {order.cutlery ? 'Додати до замовлення' : 'Не додавати'}</p></div>
    </div>
  </section>;
}
