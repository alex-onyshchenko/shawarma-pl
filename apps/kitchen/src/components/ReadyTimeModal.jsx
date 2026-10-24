import React, { useState } from 'react';
import { X } from 'lucide-react';

function localValue(timestamp, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(timestamp).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function timestampFor(value, timeZone) {
  const utc = Date.parse(value + 'Z');
  // Match the cafe's local clock, independently of the tablet's timezone, including DST.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = utc + offset * 60000;
    if (candidate > Date.now() && localValue(candidate, timeZone) === value) return candidate;
  }
  return null;
}
export default function ReadyTimeModal({ order, busy, error, onSave, onClose }) {
  const [value, setValue] = useState(() => localValue(Math.max(order.confirmedReadyAt || order.baselineReadyAt, Math.ceil((Date.now() + 60000) / 60000) * 60000), order.timeZone));
  const [validation, setValidation] = useState('');
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"><form role="dialog" aria-modal="true" aria-labelledby="ready-time-title" className="w-full max-w-lg space-y-5 rounded-2xl border border-zinc-700 bg-zinc-900 p-6" onSubmit={event => {
    event.preventDefault(); const timestamp = timestampFor(value, order.timeZone);
    if (!timestamp) { setValidation('Оберіть майбутні дату й час, які існують у часовому поясі закладу'); return; }
    setValidation(''); onSave(timestamp);
  }}><div className="flex items-center justify-between gap-3"><h2 id="ready-time-title" className="text-xl font-semibold">Час видачі #{order.id}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Закрити"><X size={21}/></button></div>
    <div className="flex gap-2">{[5, 10].map(minutes => <button key={minutes} type="button" disabled={busy} onClick={() => { setValidation(''); setValue(localValue(Math.max(order.confirmedReadyAt || order.baselineReadyAt, Math.ceil(Date.now() / 60000) * 60000) + minutes * 60000, order.timeZone)); }} className="rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-3 text-sm font-medium hover:bg-zinc-700">+{minutes} хв</button>)}</div>
    <label className="block text-sm text-zinc-300">Дата та час<input type="datetime-local" required step="60" value={value} disabled={busy} onChange={event => setValue(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white"/></label>
    <p className="text-xs leading-5 text-zinc-400">Час закладу · {order.timeZone}. При зміні часу клієнт отримає повідомлення в Telegram.</p>
    {(validation || error) && <p role="alert" className="text-sm text-red-300">{validation || error}</p>}
    <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl bg-zinc-800 px-4 py-3 text-sm">Скасувати</button><button disabled={busy} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Зберігаємо…' : 'Зберегти'}</button></div>
  </form></div>;
}
