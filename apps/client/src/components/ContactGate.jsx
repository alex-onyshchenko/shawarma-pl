import React, { useEffect, useRef, useState } from 'react';
import { Phone, LoaderCircle, ShieldCheck } from 'lucide-react';
import { tg } from '../utils/telegram';
import { orderSync } from '../utils/orderSync';

export default function ContactGate({ children }) {
  const [profile, setProfile] = useState(null), [loading, setLoading] = useState(true), [sharing, setSharing] = useState(false), [error, setError] = useState('');
  const active = useRef(true), busy = useRef(false);
  useEffect(() => {
    active.current = true; tg.init();
    if (!tg.isAvailable) { setLoading(false); return () => { active.current = false; }; }
    orderSync.getProfile().then(value => { if (active.current) setProfile(value); })
      .catch(error => { if (active.current) setError(error.message); }).finally(() => { if (active.current) setLoading(false); });
    return () => { active.current = false; };
  }, []);
  const share = async () => {
    if (busy.current) return;
    busy.current = true; setSharing(true); setError('');
    try {
      if (!await tg.requestContact()) throw Error('Щоб відкрити меню, дозвольте Telegram передати ваш номер.');
      for (let attempt = 0; attempt < 15 && active.current; attempt++) {
        const value = await orderSync.getProfile();
        if (value.phoneVerified) { if (active.current) setProfile(value); return; }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw Error('Номер ще не надійшов від Telegram. Спробуйте ще раз за кілька секунд.');
    } catch (error) { if (active.current) setError(error.message); }
    finally { busy.current = false; if (active.current) setSharing(false); }
  };
  if (profile?.phoneVerified) return children(profile, setProfile);
  return <main className="min-h-screen bg-zinc-950 px-6 py-12 text-white flex items-center justify-center"><div className="w-full max-w-sm text-center">
    <img src="/brand/shaurmisha.jpg" alt="ШаурМіша" className="mx-auto mb-6 h-20 w-20 rounded-2xl"/>
    <h1 className="text-2xl font-bold tracking-tight">Вітаємо у ШаурМіша</h1>
    <p className="mt-4 text-sm leading-6 text-zinc-400">{tg.isAvailable ? 'Поділіться своїм номером Telegram, щоб відкрити меню. Він автоматично з’явиться в кошику; для дзвінків можна вказати інший.' : 'Відкрийте застосунок у Telegram, щоб підтвердити свій номер та переглянути меню.'}</p>
    {loading ? <p role="status" className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-400"><LoaderCircle size={18} className="animate-spin"/>Перевіряємо номер…</p> : tg.isAvailable ? <button disabled={sharing} onClick={share} className="mt-7 w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 p-4 text-sm font-semibold disabled:opacity-50">{sharing ? <LoaderCircle size={18} className="animate-spin"/> : <Phone size={18}/>} {sharing ? 'Отримуємо номер…' : 'Поділитися номером у Telegram'}</button> : <a className="mt-7 block rounded-xl bg-orange-500 p-4 text-sm font-semibold" href="https://t.me/shaurmisha_pl_bot?startapp">Відкрити у Telegram</a>}
    {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-300">{error}</p>}
    <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-zinc-500"><ShieldCheck size={14}/>Без окремої реєстрації та пароля</p>
  </div></main>;
}
