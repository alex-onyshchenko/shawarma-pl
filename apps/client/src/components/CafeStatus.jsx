import React from 'react';
import { Coffee } from 'lucide-react';


export function closedDescription(availability) {
  if (availability?.point?.acceptingOrders === false) return 'Сьогодні не працюємо';
  if (availability?.withinWorkingHours !== false) return 'Нові замовлення поки не приймаємо';
  const timeZone = availability.timeZone || availability.point?.timeZone || 'Europe/Kyiv';
  const now = Number.isFinite(availability.serverNow) ? availability.serverNow : Date.now();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  if (!availability.closed && minute < availability.openMinute) {
    const opening = `${String(Math.floor(availability.openMinute / 60)).padStart(2, '0')}:${String(availability.openMinute % 60).padStart(2, '0')}`;
    return `Відчиняємося сьогодні о ${opening}`;
  }
  const tomorrow = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);
  const rule = availability.point?.exceptions?.find(rule => rule.date === date) || availability.point?.weeklyHours?.[(tomorrow.getUTCDay() + 6) % 7];
  const nextDay = rule?.closed === false ? 'Приходьте завтра.' : 'Чекаємо наступного робочого дня.';
  return `${availability.closed ? 'Сьогодні не працюємо за графіком.' : 'Сьогодні вже не працюємо.'} ${nextDay}`;
}

export default function CafeStatus({ availability }) {
  const open = availability?.cafeOpen ?? availability?.point?.acceptingOrders ?? availability?.acceptingOrders;
  const mode = !availability ? 'loading' : !open ? 'closed' : availability.onBreak ? 'break' : 'open';
  const styles = {
    loading: 'border-zinc-800 bg-zinc-900 text-zinc-400',
    open: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    closed: 'border-red-500/30 bg-red-500/10 text-red-300',
    break: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  };
  const labels = { loading: 'Уточнюємо статус кафе…', open: 'Відчинено', closed: 'Зачинено', break: 'Обідня перерва' };
  return <div role="status" aria-live="polite" className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${styles[mode]}`}>
    {mode === 'break' ? <Coffee size={21} className="shrink-0"/> : <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${mode === 'open' ? 'bg-emerald-400' : mode === 'closed' ? 'bg-red-400' : 'bg-zinc-500'}`}/>}
    <div><p className="text-sm font-bold">{labels[mode]}</p>{mode !== 'loading' && <p className="mt-0.5 text-xs text-zinc-400">{mode === 'open' ? 'Чекаємо на вас у закладі' : mode === 'break' ? 'Прийом замовлень тимчасово призупинено' : closedDescription(availability)}</p>}</div>
  </div>;
}
