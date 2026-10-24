import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, LoaderCircle } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_SYNC_API_URL || '').replace(/\/+$/, '');
const money = kopecks => new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kopecks / 100) + ' ₴';

export default function SalesReport() {
  const [period, setPeriod] = useState('7'), [commission, setCommission] = useState('0');
  const [report, setReport] = useState(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [downloading, setDownloading] = useState(false);
  const downloadLock = useRef(false);
  const validRate = /^(?:\d{1,3})(?:[.,]\d{1,2})?$/.test(commission) && Number(commission.replace(',', '.')) <= 100;
  const query = new URLSearchParams({ period, commission: commission.replace(',', '.') }).toString();

  useEffect(() => {
    setReport(null); setError('');
    if (!validRate) { setLoading(false); return; }
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    setLoading(true);
    fetch(`${API_BASE}/api/analytics/report?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error || 'Не вдалося завантажити звіт'); return data; })
      .then(data => { if (active) setReport(data); })
      .catch(error => { if (active) setError(error.name === 'AbortError' ? 'Не вдалося завантажити звіт. Спробуйте ще раз.' : error.message); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [query, validRate]);

  const download = async () => {
    if (downloadLock.current || !report || !validRate) return;
    downloadLock.current = true; setDownloading(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/api/analytics/report?${query}&format=pdf`, { signal: AbortSignal.timeout(60000), cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/pdf')) {
        const data = await response.json().catch(() => ({})); throw Error(data.error || 'Не вдалося сформувати PDF');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url;
      link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'shaurmisha-sales.pdf';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { setError(error.name === 'TimeoutError' ? 'Сервер не встиг сформувати PDF. Спробуйте ще раз.' : error.message); }
    finally { downloadLock.current = false; setDownloading(false); }
  };

  return <section className="space-y-5">
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-orange-500/10 p-3 text-orange-400"><FileText size={22}/></div><div><h2 className="text-lg font-semibold">Звіт про продажі</h2><p className="mt-1 text-xs leading-5 text-zinc-400">Усі видані замовлення за період. Скасовані та незавершені не враховуються.</p></div></div>
      <div className="flex flex-wrap items-end gap-5">
        <fieldset disabled={downloading}><legend className="mb-2 text-xs font-medium text-zinc-400">Період</legend><div className="flex flex-wrap gap-2">{[['7', '7 днів'], ['21', '21 день'], ['30', '1 місяць']].map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${period === value ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{label}</button>)}</div></fieldset>
        <label className="block"><span className="mb-2 block text-xs font-medium text-zinc-400">Комісія, %</span><input aria-invalid={!validRate} inputMode="decimal" value={commission} disabled={downloading} onChange={event => setCommission(event.target.value)} className="w-28 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-400"/></label>
        <button type="button" disabled={!report || loading || !validRate || downloading} onClick={download} className="flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-400 disabled:opacity-40 sm:ml-auto">{downloading ? <LoaderCircle size={17} className="animate-spin"/> : <Download size={17}/>} {downloading ? 'Формуємо PDF…' : 'Згенерувати PDF'}</button>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{period === '21' ? 'Останній 21 день' : `Останні ${period} днів`} до поточного моменту. 1 місяць = 30 днів. Комісія округлюється до копійок окремо для кожного чека.</p>
      {!validRate && <p role="alert" className="mt-3 text-sm text-red-300">Вкажіть комісію від 0 до 100%, до двох знаків після коми.</p>}
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}
    {loading && <div role="status" className="flex items-center gap-2 p-5 text-sm text-zinc-400"><LoaderCircle size={18} className="animate-spin"/>Рахуємо продажі…</div>}
    {report && !loading && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Продажів', report.count], ['Сума продажів', money(report.totals.amountKopecks)], [`Комісія ${report.commissionRate}%`, money(report.totals.commissionKopecks)], ['Після комісії', money(report.totals.netKopecks)]].map(([label, value]) => <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5" key={label}><p className="text-xs text-zinc-400">{label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}</p></div>)}</div>
      {!report.count && <p className="text-center text-sm text-zinc-500">За цей період виданих замовлень немає.</p>}
    </>}
  </section>;
}
