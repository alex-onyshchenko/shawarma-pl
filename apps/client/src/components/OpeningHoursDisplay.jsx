import React from 'react';
import { closedDescription } from './CafeStatus';

const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export default function OpeningHoursDisplay({ availability }) {
  const known = availability && Number.isInteger(availability.openMinute) && Number.isInteger(availability.closeMinute);
  const open = availability?.acceptingOrders === true;
  const onBreak = availability?.cafeOpen !== false && availability?.onBreak;
  const unpowered = Boolean(availability) && !open && !onBreak;
  const status = !availability ? 'Уточнюємо статус' : open ? 'Відчинено' : onBreak ? 'Обідня перерва' : `Зачинено. ${closedDescription(availability)}`;
  const hours = availability?.closed ? 'Вихідний' : known ? `${clock(availability.openMinute)}–${clock(availability.closeMinute)}` : '--:--';

  return <div role="status" aria-live="polite" aria-label={`Години роботи сьогодні: ${hours}. ${status}`} title={`Сьогодні: ${hours}. ${status}`} className={`opening-hours ${unpowered ? 'opening-hours--unpowered' : ''} shrink-0 rounded-lg border px-2 py-1.5 ${open ? 'opening-hours--open border-emerald-500/20 bg-emerald-950/30' : 'border-zinc-800 bg-zinc-900/50'}`}>
    <span aria-hidden="true" className={`mb-0.5 flex items-center justify-center gap-1 text-[9px] leading-3 ${open ? 'text-emerald-400/80' : 'text-zinc-500'}`}><span className={`h-1 w-1 rounded-full ${open ? 'bg-emerald-400' : 'bg-zinc-600'}`}/>{onBreak && !open ? 'Перерва' : 'Сьогодні'}</span>
    <span aria-hidden="true" className={`block whitespace-nowrap font-mono text-[12px] font-semibold leading-4 tabular-nums tracking-tight sm:text-sm ${open ? 'text-emerald-300' : 'text-zinc-500'}`}>{Array.from(hours).map((digit, index) => <span key={index} className="opening-hours__digit" style={{ '--digit-delay': `${index * -1.7}s` }}>{digit}</span>)}</span>
  </div>;
}
