import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Phone,
  Coffee,
  LockKeyholeOpen,
  LockKeyhole,
  CheckCircle,
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  PlusCircle,
  Pencil,
  Hourglass,
  Play,
  Undo2,
  CircleAlert,
  UserCheck,
  Bell,
  ChefHat,
  Sparkles,
  X
} from 'lucide-react';
import { kdsSound, requestScreenWakeLock, releaseScreenWakeLock } from './kdsSound';
import { orderSync, mediaUrl } from './utils/orderSync';
import { formatTime, MINUTE } from './utils/timing';
import ReadyTimeModal from './components/ReadyTimeModal';
import ManualOrderModal from './components/ManualOrderModal';

export default function KitchenDisplayApp() {
  const [orders, setOrders] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState(null);

  const [availability, setAvailability] = useState(null);
  const [menu, setMenu] = useState(null);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [earlyAction, setEarlyAction] = useState(null);
  const [cancelOrderId, setCancelOrderId] = useState(null);
  const [timeOrder, setTimeOrder] = useState(null);
  const [cancelComment, setCancelComment] = useState('');

  const manualOpen = availability?.point?.acceptingOrders ?? availability?.cafeOpen ?? false;

  const applySnapshot = data => {
    setOrders(data.orders || []);
    if (data.availability) setAvailability(data.availability);
    if (data.menu) setMenu(data.menu);
  };

  const runAction = async action => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      applySnapshot(await orderSync.getOrders());
      return true;
    } catch (error) {
      if (error.code === 'EARLY_START') setEarlyAction(action.early);
      else setError(error.message || 'Не вдалося виконати дію');
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  };

  // Live digital clock ticker (every second)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Request screen wake lock for Android tablet / Kiosk mode
  useEffect(() => {
    requestScreenWakeLock().then(success => {
      setIsWakeLockActive(success);
    });

    return () => {
      releaseScreenWakeLock();
    };
  }, []);

  // Real-time synchronization with server and client apps
  useEffect(() => {
    // 2. Subscribe to real-time events via SSE + broadcast
    const unsubscribe = orderSync.subscribe({
      onInit: applySnapshot,
      onAvailability: setAvailability,
      onMenu: setMenu,
      onNewOrder: (newOrder) => {
        setOrders(prev => {
          if (prev.some(o => o.id === newOrder.id)) return prev;
          return [newOrder, ...prev];
        });

        if (isSoundEnabled) {
          kdsSound.playNewOrder();
        }

        setNewOrderAlert(`Нове замовлення #${newOrder.id}!`);
        setTimeout(() => setNewOrderAlert(null), 4000);
      },
      onStatusUpdate: ({ id, status, order }) => {
        if (['archived', 'cancelled', 'no_show'].includes(status)) {
          setOrders(prev => prev.filter(o => o.id !== id));
        } else {
          setOrders(prev => {
            const exists = prev.some(o => o.id === id);
            if (exists) {
              return prev.map(o => (o.id === id ? (order || { ...o, status }) : o));
            } else if (order) {
              return [order, ...prev];
            }
            return prev;
          });
        }
      },
      onReset: (data) => {
        if (data.orders) setOrders(data.orders);
      }
    });

    return () => unsubscribe();
  }, [isSoundEnabled]);

  const changeStatus = (orderId, status, confirmEarly = false) => {
    const order = orders.find(item => item.id === orderId);
    const action = () => orderSync.updateStatus(orderId, status, { confirmEarly });
    action.early = { orderId, status, readyAt: order?.confirmedReadyAt || order?.baselineReadyAt, timeZone: order?.timeZone };
    return runAction(action);
  };

  const advanceOrder = (orderId, currentStatus) => {
    if (currentStatus === 'ready' && !window.confirm(`Підтвердити видачу замовлення #${orderId}?`)) return;
    return changeStatus(orderId, currentStatus === 'new' ? 'cooking' : currentStatus === 'cooking' ? 'ready' : 'archived');
  };


  // Toggle fullscreen mode (Kiosk)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const getOrdersByStatus = status => orders.filter(order => order.status === status)
    .sort((a, b) => (a.confirmedReadyAt || a.baselineReadyAt || 0) - (b.confirmedReadyAt || b.baselineReadyAt || 0));

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col selection:bg-orange-500 selection:text-white select-none">
      {error && <div role="alert" className="bg-red-950 border border-red-700 text-red-200 p-4 flex justify-between gap-4"><span>{error}</span><button onClick={() => setError('')}>Закрити</button></div>}
      {/* Top Header Bar for Tablet KDS */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-5 py-3.5 flex flex-wrap gap-3 justify-between items-center shrink-0 z-10 shadow-md">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <img src={mediaUrl(menu?.point.logoUrl) || '/brand/shaurmisha.jpg'} alt="Логотип ШаурМіша" width="40" height="40" className="w-10 h-10 rounded-xl object-contain shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-none">
                  {availability?.point?.name || 'Термінал Кухаря'}
                </h1>
                <span className="text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  KDS LIVE
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {availability?.point?.address || 'Завантажуємо точку…'}
              </p>
            </div>
          </div>
        </div>

        {/* Center: Live Order Alert Banner */}
        {newOrderAlert && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-sm sm:text-base px-4 py-2 rounded-xl shadow-lg shadow-blue-500/30 flex items-center gap-2 animate-bounce">
            <Bell size={18} className="animate-spin" />
            <span>{newOrderAlert}</span>
          </div>
        )}

        {/* Right: Controls & Tablet Clock */}
        <div className="flex items-center gap-3">
          {/* Manual order */}
          <button
            onClick={() => setShowManualOrder(true)}
            disabled={!menu || busy}
            className="disabled:opacity-50 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all"
            title="Створити замовлення вручну"
          >
            <PlusCircle size={15} />
            <span>Створити замовлення</span>
          </button>

          <button disabled={!availability || busy} onClick={() => runAction(() => orderSync.setAcceptingOrders(!manualOpen))} aria-label={manualOpen ? 'Зачинити кафе' : 'Відчинити кафе'} title={manualOpen ? 'Зачинити кафе' : 'Відчинити кафе'} className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 ${manualOpen ? 'border-red-700 text-red-300 hover:bg-red-500/10' : 'border-emerald-600 text-emerald-300 hover:bg-emerald-500/10'}`}>
            {manualOpen ? <LockKeyhole size={20}/> : <LockKeyholeOpen size={20}/>}
          </button>
          <button disabled={!manualOpen || busy} onClick={() => runAction(() => orderSync.setBreak(!availability.onBreak))} aria-pressed={!!availability?.onBreak} aria-label={availability?.onBreak ? 'Завершити перерву' : 'Обідня перерва'} title={availability?.onBreak ? 'Завершити перерву' : 'Обідня перерва'} className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${availability?.onBreak ? 'border-amber-500 bg-amber-500/15 text-amber-200' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}>
            <Coffee size={20} />
          </button>
          {/* Sound Toggle */}
          <button
            onClick={() => {
              setIsSoundEnabled(!isSoundEnabled);
              if (!isSoundEnabled) kdsSound.playNewOrder();
            }}
            className={`p-2.5 rounded-xl border transition-all active:scale-95 ${
              isSoundEnabled
                ? 'bg-zinc-800 text-emerald-400 border-zinc-700 hover:bg-zinc-700'
                : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-white'
            }`}
            title={isSoundEnabled ? 'Звук увімкнено (дзвінок чека)' : 'Звук вимкнено'}
          >
            {isSoundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Fullscreen (Kiosk Mode) */}
          <button
            onClick={toggleFullscreen}
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 rounded-xl transition-all active:scale-95"
            title={isFullscreen ? 'Вийти з повноекранного режиму' : 'Повноекранний режим Кіоску'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {/* Digital Clock */}
          <div className="bg-zinc-950 border border-zinc-800 px-3.5 py-1.5 rounded-xl font-mono text-lg font-black tracking-widest text-white shadow-inner flex items-center gap-1.5">
            <Clock size={16} className="text-orange-400" />
            <span>
              {currentTime.toLocaleTimeString('uk-UA', {
                timeZone: 'Europe/Kyiv',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </span>
          </div>
        </div>
      </header>

      {availability && !availability.acceptingOrders && <div role="status" className="bg-amber-950 text-amber-200 px-5 py-3 font-bold">{availability.cafeOpen !== false && availability.onBreak ? 'Обідня перерва. Нові замовлення призупинено, вже оформлені — виконуємо.' : 'Кафе зачинено. Нові замовлення не приймаємо, вже оформлені — виконуємо.'}</div>}
      {cancelOrderId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"><form role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="w-full max-w-lg space-y-5 rounded-2xl border border-zinc-700 bg-zinc-900 p-6" onSubmit={async event => { event.preventDefault(); if (await runAction(() => orderSync.cancelOrder(cancelOrderId, cancelComment.trim()))) setCancelOrderId(null); }}>
        <h2 id="cancel-title" className="text-xl font-semibold">Скасувати замовлення #{cancelOrderId}?</h2>
        <p className="text-sm leading-6 text-zinc-400">Замовлення зникне з робочого екрана. Без коментаря клієнт не отримає повідомлення. Заповнений коментар надішлемо в Telegram.</p>
        <label className="block text-sm text-zinc-300">Коментар (необов’язково)<textarea autoFocus maxLength={500} rows={3} value={cancelComment} disabled={busy} onChange={event => setCancelComment(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white outline-none focus:border-orange-400" placeholder="Наприклад, закінчилася курка"/></label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} className="rounded-xl bg-zinc-800 px-4 py-3 text-sm font-medium" onClick={() => { setCancelOrderId(null); setError(''); }}>Залишити замовлення</button><button disabled={busy} className="rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold disabled:opacity-40">{busy ? 'Скасовуємо…' : 'Скасувати замовлення'}</button></div>
      </form></div>}
      {timeOrder && <ReadyTimeModal order={timeOrder} hours={availability} busy={busy} error={error} onClose={() => { setTimeOrder(null); setError(''); }} onSave={async readyAt => { if (await runAction(() => orderSync.changeReadyTime(timeOrder.id, readyAt, timeOrder.confirmedReadyAt || timeOrder.baselineReadyAt))) setTimeOrder(null); }}/>}
      {showManualOrder && <ManualOrderModal menu={menu} availability={availability} onClose={() => setShowManualOrder(false)} onCreated={order => { setOrders(previous => [order, ...previous.filter(item => item.id !== order.id)]); setShowManualOrder(false); }} />}
      {earlyAction && <div role="alertdialog" aria-modal="true" aria-labelledby="early-title" className="fixed inset-0 z-50 bg-red-950/95 flex items-center justify-center p-6">
        <div className="max-w-xl space-y-6 text-center">
          <AlertTriangle size={64} className="mx-auto text-amber-300" />
          <h2 id="early-title" className="text-3xl font-black">Увага! Це замовлення на {formatTime(earlyAction.readyAt, earlyAction.timeZone)}.</h2>
          <p className="text-xl">До видачі ще {Math.max(0, Math.ceil((earlyAction.readyAt - currentTime.getTime()) / MINUTE))} хв. Ви впевнені, що хочете почати готувати його зараз?</p>
          <div className="flex justify-center gap-4"><button disabled={busy} onClick={async () => { const action = earlyAction; setEarlyAction(null); await changeStatus(action.orderId, action.status, true); }} className="bg-red-600 rounded-xl px-6 py-4 font-bold">Так, підтверджую</button><button onClick={() => setEarlyAction(null)} className="bg-white text-zinc-950 rounded-xl px-6 py-4 font-bold">Скасувати дію</button></div>
        </div>
      </div>}

      {/* Main Kanban Board (Columns with huge touch cards) */}
      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-3 gap-5 overflow-hidden">
        {/* ================= COLUMN 1: НОВІ ================= */}
        <div className="flex flex-col bg-zinc-900/40 rounded-2xl border-2 border-blue-500/30 overflow-hidden shadow-xl">
          {/* Column Header */}
          <div className="bg-gradient-to-r from-blue-950/80 to-zinc-900 px-4 py-3 border-b-2 border-blue-500/40 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-3.5 h-3.5 rounded-full bg-blue-500 animate-pulse" />
              <h2 className="text-lg sm:text-xl font-black text-blue-200 tracking-tight">
                НОВІ (ОЧІКУЮТЬ)
              </h2>
            </div>
            <span className="bg-blue-500 text-white font-mono font-black text-base px-3 py-0.5 rounded-lg shadow-md shadow-blue-500/30">
              {getOrdersByStatus('new').length}
            </span>
          </div>

          {/* Orders List */}
          <div className="flex-1 p-3.5 overflow-y-auto no-scrollbar flex flex-col gap-3.5">
            {getOrdersByStatus('new').length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 py-16 text-center">
                <ChefHat size={44} className="mb-2 opacity-40" />
                <p className="text-sm font-semibold">Немає нових замовлень</p>
                <p className="text-xs text-zinc-400 mt-1">Очікуємо замовлення з Telegram...</p>
              </div>
            ) : (
              getOrdersByStatus('new').map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  currentTime={currentTime}
                  onAdvance={advanceOrder}
                  onReturn={(id, status) => changeStatus(id, status === 'ready' ? 'cooking' : 'new')}
                  onChangeTime={order => { setTimeOrder(order); setError(''); }}
                  onNoShow={id => { if (window.confirm(`Клієнт не прийшов за замовленням #${id}? Замовлення буде закрито. Для клієнта Telegram усі подальші замовлення будуть доступні лише за передоплатою, без обмеження строку.`)) runAction(() => orderSync.noShow(id)); }}
                  onCancel={id => { setCancelOrderId(id); setCancelComment(''); setError(''); }}
                  busy={busy}
                />
              ))
            )}
          </div>
        </div>

        {/* ================= COLUMN 2: ГОТУЮТЬСЯ ================= */}
        <div className="flex flex-col bg-zinc-900/40 rounded-2xl border-2 border-orange-500/30 overflow-hidden shadow-xl">
          {/* Column Header */}
          <div className="bg-gradient-to-r from-orange-950/80 to-zinc-900 px-4 py-3 border-b-2 border-orange-500/40 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2.5">
              <Flame size={20} className="text-orange-500 animate-pulse-subtle" />
              <h2 className="text-lg sm:text-xl font-black text-orange-200 tracking-tight">
                ГОТУЮТЬСЯ
              </h2>
            </div>
            <span className="bg-orange-500 text-white font-mono font-black text-base px-3 py-0.5 rounded-lg shadow-md shadow-orange-500/30">
              {getOrdersByStatus('cooking').length}
            </span>
          </div>

          {/* Orders List */}
          <div className="flex-1 p-3.5 overflow-y-auto no-scrollbar flex flex-col gap-3.5">
            {getOrdersByStatus('cooking').length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 py-16 text-center">
                <Flame size={44} className="mb-2 opacity-40" />
                <p className="text-sm font-semibold">На мангалі вільно</p>
                <p className="text-xs text-zinc-400 mt-1">Підтвердьте час і натисніть «Почати готувати»</p>
              </div>
            ) : (
              getOrdersByStatus('cooking').map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  currentTime={currentTime}
                  onAdvance={advanceOrder}
                  onReturn={(id, status) => changeStatus(id, status === 'ready' ? 'cooking' : 'new')}
                  onChangeTime={order => { setTimeOrder(order); setError(''); }}
                  onNoShow={id => { if (window.confirm(`Клієнт не прийшов за замовленням #${id}? Замовлення буде закрито. Для клієнта Telegram усі подальші замовлення будуть доступні лише за передоплатою, без обмеження строку.`)) runAction(() => orderSync.noShow(id)); }}
                  onCancel={id => { setCancelOrderId(id); setCancelComment(''); setError(''); }}
                  busy={busy}
                />
              ))
            )}
          </div>
        </div>

        {/* ================= COLUMN 3: ГОТОВІ ================= */}
        <div className="flex flex-col bg-zinc-900/40 rounded-2xl border-2 border-emerald-500/30 overflow-hidden shadow-xl">
          {/* Column Header */}
          <div className="bg-gradient-to-r from-emerald-950/80 to-zinc-900 px-4 py-3 border-b-2 border-emerald-500/40 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2.5">
              <CheckCircle size={20} className="text-emerald-400" />
              <h2 className="text-lg sm:text-xl font-black text-emerald-200 tracking-tight">
                ГОТОВІ НА ВИДАЧУ
              </h2>
            </div>
            <span className="bg-emerald-500 text-white font-mono font-black text-base px-3 py-0.5 rounded-lg shadow-md shadow-emerald-500/30">
              {getOrdersByStatus('ready').length}
            </span>
          </div>

          {/* Orders List */}
          <div className="flex-1 p-3.5 overflow-y-auto no-scrollbar flex flex-col gap-3.5">
            {getOrdersByStatus('ready').length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 py-16 text-center">
                <UserCheck size={44} className="mb-2 opacity-40" />
                <p className="text-sm font-semibold">Всі замовлення видано клієнтам</p>
                <p className="text-xs text-zinc-400 mt-1">Очікуйте завершення приготування</p>
              </div>
            ) : (
              getOrdersByStatus('ready').map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  currentTime={currentTime}
                  onAdvance={advanceOrder}
                  onReturn={(id, status) => changeStatus(id, status === 'ready' ? 'cooking' : 'new')}
                  onChangeTime={order => { setTimeOrder(order); setError(''); }}
                  onNoShow={id => { if (window.confirm(`Клієнт не прийшов за замовленням #${id}? Замовлення буде закрито. Для клієнта Telegram усі подальші замовлення будуть доступні лише за передоплатою, без обмеження строку.`)) runAction(() => orderSync.noShow(id)); }}
                  onCancel={id => { setCancelOrderId(id); setCancelComment(''); setError(''); }}
                  busy={busy}
                />
              ))
            )}
          </div>
        </div>
      </div>


    </div>
  );
}

// Order cards use a compact type scale with emphasis on ID, deadline and dishes.
function OrderCard({ order, currentTime, onAdvance, onReturn, onChangeTime, onCancel, onNoShow, busy }) {
  const readyAt = order.confirmedReadyAt || order.baselineReadyAt;
  const remaining = readyAt ? Math.ceil((readyAt - currentTime.getTime()) / MINUTE) : null;
  const longWait = remaining > 8 * 60;

  return <article aria-label={`Замовлення ${order.id}`} className={`relative rounded-3xl border p-4 shadow-[0_8px_28px_rgba(0,0,0,0.18)] transition-colors ${
    order.status === 'cooking' ? 'border-orange-500/30 bg-[#101011]' :
    order.status === 'ready' ? 'border-emerald-500/30 bg-[#101011]' : 'border-zinc-700/70 bg-[#101011] hover:border-zinc-600'
  }`}>
    <header className="mb-5">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="break-all text-[32px] font-bold leading-tight tracking-tight text-zinc-50 tabular-nums">#{order.id}</span>
          {order.source === 'kitchen' && <span className="text-[11px] text-zinc-500">Вручну</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
        {order.status === 'new' && <button type="button" disabled={busy} onClick={() => onCancel(order.id)} aria-label={`Скасувати замовлення #${order.id}`} title="Скасувати замовлення" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"><X size={21}/></button>}
        {['cooking', 'ready'].includes(order.status) && <button type="button" disabled={busy} onClick={() => onReturn(order.id, order.status)} aria-label={`${order.status === 'cooking' ? 'Повернути до нових' : 'Повернути до приготування'}: замовлення #${order.id}`} title={order.status === 'cooking' ? 'Повернути до нових' : 'Повернути до приготування'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-40"><Undo2 size={21}/></button>}
          {order.status === 'ready' && order.paymentStatus === 'cash_due' && <button type="button" disabled={busy} onClick={() => onNoShow(order.id)} aria-label={`Клієнт не прийшов: замовлення #${order.id}`} title="Клієнт не прийшов" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"><CircleAlert size={21}/></button>}
        </div>
      </div>

      <div className="mt-5 flex items-stretch justify-between gap-3">
        {readyAt && <ReadyTimeLabel order={order} readyAt={readyAt} currentTime={currentTime} busy={busy} onChangeTime={onChangeTime}>
          <span className="block text-xs leading-5 text-zinc-400">{order.acceptedAt ? 'Час видачі' : 'Попередня видача'}</span>
          <span className="flex items-center gap-2 text-[40px] font-bold leading-[1.2] tracking-tight text-[#f3d29b] tabular-nums">{formatTime(readyAt, order.timeZone)}{order.status === 'new' && <Pencil size={18} className="shrink-0 text-zinc-500 transition-colors group-hover:text-orange-300"/>}</span>
          {new Intl.DateTimeFormat('en-CA', { timeZone: order.timeZone }).format(readyAt) !== new Intl.DateTimeFormat('en-CA', { timeZone: order.timeZone }).format(currentTime) && <span className="mt-1 block text-xs text-zinc-400">{new Intl.DateTimeFormat('uk-UA', { timeZone: order.timeZone, day: 'numeric', month: 'long' }).format(readyAt)}</span>}
        </ReadyTimeLabel>}
        {remaining > 0 && <div aria-label={longWait ? 'До видачі понад 8 годин' : `До видачі ${remaining} хв`} className="flex shrink-0 flex-col items-end justify-center border-l border-zinc-800 pl-3 text-right">
          <p className="mb-1 text-xs leading-5 text-zinc-400">Залишилось</p>
          <p className="inline-flex items-center gap-1.5 rounded-xl bg-orange-400 px-2.5 py-1.5 text-[26px] font-bold leading-tight tracking-tight text-zinc-950 tabular-nums"><span className="sr-only">{longWait ? 'Понад 8 годин' : ''}</span>{longWait ? <span className="px-3 text-[32px] leading-none" aria-hidden="true">∞</span> : <><Hourglass size={20} strokeWidth={2.2}/>{remaining}<span className="text-sm font-semibold tracking-normal">хв</span></>}</p>
        </div>}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl border border-zinc-700/60 bg-zinc-800/70 px-3 py-2 text-[13px] leading-5">
        <span className="min-w-0 break-words text-zinc-200">{order.customerName || 'Клієнт'}</span>
        {order.phoneNumber && <a href={`tel:${order.phoneNumber.replace(/[^+0-9]/g, '')}`} className="flex shrink-0 items-center gap-1.5 text-zinc-200 transition-colors hover:text-white"><Phone size={12}/>{order.phoneNumber}</a>}
      </div>
    </header>

    <div className="space-y-3">
      {order.items.map((item, index) => {
        const suffix = item.sizeName && item.weight ? ` · ${item.sizeName} (${item.weight})` : '';
        const title = suffix && item.name.endsWith(suffix) ? item.name.slice(0, -suffix.length) : item.name;
        return <div key={index} className="rounded-2xl bg-zinc-800/75 p-3.5">
          <div className="flex items-start gap-3">
            <span className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-400 px-2 text-[24px] font-bold leading-none text-zinc-950 tabular-nums">{item.qty}<span className="ml-0.5 text-lg font-semibold text-zinc-950">×</span></span>
            <div className="min-w-0"><p className="text-lg font-bold leading-6 text-zinc-50">{title}</p>
              {item.sizeName && <p className="mt-0.5 text-[13px] leading-5 text-zinc-400">{item.sizeName}{item.weight ? ` · ${item.weight}` : ''}</p>}
            </div>
          </div>
          {(item.lavash || item.spiciness) && <div className="mt-2 flex flex-wrap gap-1.5">
            {item.lavash && <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-orange-200">{item.lavash}</span>}
            {item.spiciness && <span className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300">{item.spiciness}</span>}
          </div>}
          {!!item.added?.length && <div className="mt-2 flex flex-wrap gap-1.5">{item.added.map((mod, i) => <span key={i} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">+ {mod}</span>)}</div>}
          {!!item.removed?.length && <div className="mt-2 flex flex-wrap gap-1.5">{item.removed.map((mod, i) => <span key={i} className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200">✕ {mod}</span>)}</div>}
          {item.comment && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-5 text-amber-200">⚠️ {item.comment}</p>}
        </div>;
      })}
    </div>

    <div className="mt-4">
      <button disabled={busy} onClick={() => onAdvance(order.id, order.status)} className={`flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${order.status === 'new' ? 'border-blue-400/60 bg-blue-600 shadow-[0_4px_18px_rgba(37,99,235,0.25)] hover:bg-blue-500' : order.status === 'cooking' ? 'border-orange-300/40 bg-orange-500 hover:bg-orange-400' : 'border-emerald-400/40 bg-emerald-700 hover:bg-emerald-600'}`}>{order.status === 'new' && <Play size={17} fill="currentColor"/>}{order.status === 'new' ? 'Почати готувати' : order.status === 'cooking' ? 'Готово до видачі' : 'Підтвердити видачу'}</button>
    </div>
  </article>;
}

function ReadyTimeLabel({ order, busy, onChangeTime, children }) {
  if (order.status !== 'new') return <div className="-ml-1 min-w-0 px-1 text-left">{children}</div>;
  return <button type="button" disabled={busy} onClick={() => onChangeTime(order)} aria-label={`Змінити час видачі замовлення #${order.id}`} className="group -ml-1 min-w-0 rounded-lg px-1 text-left outline-offset-4 transition-colors hover:bg-zinc-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50">{children}</button>;
}
