import { mediaUrl } from '../utils/orderSync';
import React from 'react';
import { X, Flame, MapPin, Clock, Phone, Instagram, Send, ShieldCheck } from 'lucide-react';
import { tg } from '../utils/telegram';

export default function AboutModal({ onClose, point }) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in"
        onClick={() => {
          tg.haptic.impact('light');
          onClose();
        }}
      />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-zinc-900 border border-zinc-700/80 rounded-3xl p-5 z-50 shadow-2xl animate-scale-up space-y-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <img src={mediaUrl(point?.logoUrl) || '/brand/shaurmisha.jpg'} alt="Логотип ШаурМіша" width="40" height="40" className="w-10 h-10 rounded-xl object-contain" />
            <div>
              <h3 className="font-bold text-white text-base leading-tight">{point?.name || 'ШаурМіша'}</h3>
              <p className="text-zinc-400 text-xs">Самовивіз • Готуємо для вас</p>
            </div>
          </div>
          <button
            onClick={() => {
              tg.haptic.impact('light');
              onClose();
            }}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
          {point?.description}
        </p>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Clock size={14} className="text-orange-400 shrink-0" />
            <div>{point?.weeklyHours.map((rule, index) => <div key={index}>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'][index]}: {rule.closed ? 'Вихідний' : `${rule.open}–${rule.close}`}</div>)}</div>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <MapPin size={14} className="text-orange-400 shrink-0" />
            <span>{point?.address}</span>
          </div>
          {point?.phone && <div className="flex items-center gap-2 text-zinc-300">
            <Phone size={14} className="text-orange-400 shrink-0" />
            <span>{point?.phone}</span>
          </div>}
        </div>

        <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-[11px] text-zinc-400">
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <ShieldCheck size={13} /> Telegram Mini App v1.2
          </span>
          <span className="text-zinc-400">Зроблено з любов'ю ❤️</span>
        </div>
      </div>
    </>
  );
}
