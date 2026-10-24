import React, { useState } from 'react';
import { ArrowLeft, Info, MoreVertical, Trash2 } from 'lucide-react';
import { mediaUrl } from '../utils/orderSync';
import OpeningHoursDisplay from './OpeningHoursDisplay';
import { tg } from '../utils/telegram';

export default function TelegramHeader({ pointName, logoUrl, availability, view, setView, cartCount, onClearCart, onOpenAbout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="app-header sticky top-0 z-30 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80">
    <div className="h-16 px-3 sm:px-4 flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0">
        {view !== 'menu' && <button type="button" onClick={() => { tg.haptic.selection(); setView('menu'); }} aria-label="Назад до меню" className="w-8 h-10 shrink-0 -ml-1 flex items-center justify-center rounded-xl text-orange-400 hover:bg-zinc-900"><ArrowLeft size={22}/></button>}
        <img src={mediaUrl(logoUrl) || '/brand/shaurmisha.jpg'} alt="" width="40" height="40" className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-contain shrink-0"/>
        <div className="min-w-0"><h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">{pointName || 'ШаурМіша'}</h1><p className="text-[10px] sm:text-xs text-zinc-400 truncate">Замовлення із собою</p></div>
      </div>
      <OpeningHoursDisplay availability={availability}/>
      <div className="relative shrink-0">
        <button type="button" aria-label="Меню застосунку" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="w-8 h-11 flex items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-900"><MoreVertical size={22}/></button>
        {menuOpen && <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)}/>
          <div className="absolute right-0 top-12 w-56 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-xl z-50">
            <button type="button" onClick={() => { onOpenAbout(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm rounded-xl hover:bg-zinc-800 text-left"><Info size={18}/> Про заклад</button>
            {cartCount > 0 && <button type="button" onClick={() => { onClearCart(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm rounded-xl text-red-400 hover:bg-zinc-800 text-left"><Trash2 size={18}/> Очистити кошик</button>}
          </div>
        </>}
      </div>
    </div>
  </header>;
}
