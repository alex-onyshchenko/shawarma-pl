import React from 'react';
import { X, Flame, MapPin, Clock, Phone, Instagram, Send, ShieldCheck } from 'lucide-react';
import { tg } from '../utils/telegram';

export default function AboutModal({ onClose }) {
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
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center text-xl">
              <Flame size={22} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">Шаурма на Вугіллі</h3>
              <p className="text-zinc-400 text-xs">Київ • Справжній мангал</p>
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
          Ми готуємо соковите м'ясо виключно на справжньому деревному вугіллі, використовуємо тільки свіжі овочі та авторські соуси без консервантів.
        </p>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Clock size={14} className="text-orange-400 shrink-0" />
            <span>Щодня з 10:00 до 22:30</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <MapPin size={14} className="text-orange-400 shrink-0" />
            <span>3 локації в Києві (центр, КПІ, Поділ)</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Phone size={14} className="text-orange-400 shrink-0" />
            <span>+380 (44) 777-88-99</span>
          </div>
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
