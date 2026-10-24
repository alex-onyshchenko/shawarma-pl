import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { formatTime, getReadyTimeSlots, MINUTE } from '../utils/timing';

export default function ReadyTimeModal({ order, hours, busy, error, onSave, onClose }) {
  const [now, setNow] = useState(Date.now);
  const minute = Math.floor(now / MINUTE);
  const slots = useMemo(() => getReadyTimeSlots(now, hours), [minute, hours]);
  const zone = hours?.timeZone || order.timeZone;
  const [value, setValue] = useState(() => {
    const available = getReadyTimeSlots(Date.now(), hours);
    const current = order.confirmedReadyAt || order.baselineReadyAt;
    return available.length ? formatTime(available.includes(current) ? current : available[0], zone) : '';
  });
  const [validation, setValidation] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  const quickTime = minutes => Math.max(order.confirmedReadyAt || order.baselineReadyAt, Math.ceil(now / MINUTE) * MINUTE) + minutes * MINUTE;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"><form role="dialog" aria-modal="true" aria-labelledby="ready-time-title" className="w-full max-w-lg space-y-5 rounded-2xl border border-zinc-700 bg-zinc-900 p-6" onSubmit={event => {
    event.preventDefault();
    const timestamp = getReadyTimeSlots(Date.now(), hours).find(slot => formatTime(slot, zone) === value);
    if (!timestamp) { setValidation('Оберіть час сьогодні до закриття кафе'); return; }
    setValidation(''); onSave(timestamp);
  }}><div className="flex items-center justify-between gap-3"><h2 id="ready-time-title" className="text-xl font-semibold">Час видачі #{order.id}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Закрити"><X size={21}/></button></div>
    <div className="flex gap-2">{[5, 10].map(minutes => <button key={minutes} type="button" disabled={busy || !slots.includes(quickTime(minutes))} onClick={() => { setValidation(''); setValue(formatTime(quickTime(minutes), zone)); }} className="rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-40">+{minutes} хв</button>)}</div>
    <label className="block text-sm text-zinc-300">Час готовності<input type="time" required step="60" min={slots.length ? formatTime(slots[0], zone) : undefined} max={slots.length ? formatTime(slots.at(-1), zone) : undefined} value={value} disabled={busy || !slots.length} onChange={event => setValue(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white"/></label>
    <p className="text-xs leading-5 text-zinc-400">{slots.length ? `Сьогодні до ${formatTime(slots.at(-1), zone)} · час закладу. Про зміну повідомимо клієнту в Telegram.` : 'Сьогодні немає доступного часу до закриття кафе.'}</p>
    {(validation || error) && <p role="alert" className="text-sm text-red-300">{validation || error}</p>}
    <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl bg-zinc-800 px-4 py-3 text-sm">Скасувати</button><button disabled={busy || !slots.length} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Зберігаємо…' : 'Зберегти'}</button></div>
  </form></div>;
}
