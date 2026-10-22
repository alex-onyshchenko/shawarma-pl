import React from 'react';
import { Coffee } from 'lucide-react';

export default function CafeStatus({ availability }) {
  const open = availability?.cafeOpen ?? availability?.point?.acceptingOrders ?? availability?.acceptingOrders;
  const mode = !availability ? 'loading' : availability.onBreak ? 'break' : open ? 'open' : 'closed';
  const styles = {
    loading: 'border-zinc-800 bg-zinc-900 text-zinc-400',
    open: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    closed: 'border-red-500/30 bg-red-500/10 text-red-300',
    break: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  };
  const labels = { loading: 'Уточнюємо статус кафе…', open: 'Відчинено', closed: 'Зачинено', break: 'Обідня перерва' };
  return <div role="status" aria-live="polite" className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${styles[mode]}`}>
    {mode === 'break' ? <Coffee size={21} className="shrink-0"/> : <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${mode === 'open' ? 'bg-emerald-400' : mode === 'closed' ? 'bg-red-400' : 'bg-zinc-500'}`}/>}
    <div><p className="text-sm font-bold">{labels[mode]}</p>{mode !== 'loading' && <p className="mt-0.5 text-xs text-zinc-400">{mode === 'open' ? 'Чекаємо на вас у закладі' : mode === 'break' ? 'Прийом замовлень тимчасово призупинено' : 'Нові замовлення поки не приймаємо'}</p>}</div>
  </div>;
}
