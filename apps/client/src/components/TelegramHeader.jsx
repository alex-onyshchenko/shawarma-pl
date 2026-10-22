import React, { useState } from 'react';
import { ArrowLeft, Info, MoreVertical, Trash2 } from 'lucide-react';
import { tg } from '../utils/telegram';

export default function TelegramHeader({ pointName, view, setView, cartCount, onClearCart, onOpenAbout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="app-header sticky top-0 z-30 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80">
    <div className="h-16 px-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {view !== 'menu' && <button type="button" onClick={() => { tg.haptic.selection(); setView('menu'); }} aria-label="Назад до меню" className="w-11 h-11 -ml-2 flex items-center justify-center rounded-xl text-orange-400 hover:bg-zinc-900"><ArrowLeft size={22}/></button>}
        <img src="/brand/shaurmisha.jpg" alt="" width="40" height="40" className="w-10 h-10 rounded-xl object-contain shrink-0"/>
        <div className="min-w-0"><h1 className="text-lg font-semibold tracking-tight truncate">{pointName || 'ШаурМіша'}</h1><p className="text-xs text-zinc-400">Замовлення із собою</p></div>
      </div>
      <div className="relative">
        <button type="button" aria-label="Меню застосунку" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="w-11 h-11 flex items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-900"><MoreVertical size={22}/></button>
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
