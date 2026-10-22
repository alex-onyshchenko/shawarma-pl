import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  PlusCircle,
  RotateCcw,
  Bike,
  UserCheck,
  Bell,
  Archive,
  ChefHat,
  Sparkles,
  History,
  X
} from 'lucide-react';
import { kdsSound, requestScreenWakeLock, releaseScreenWakeLock } from './kdsSound';
import { orderSync } from './utils/orderSync';

// Initial orders from prompt with timestamp calculation for live ticking
const INITIAL_ORDERS = [
  {
    id: '1042',
    time: '11:42',
    createdAt: Date.now() - 2 * 60 * 1000, // 2 minutes ago
    status: 'new', // new, cooking, ready
    orderType: 'pickup', // pickup | delivery
    customerName: 'Олександр (Telegram)',
    items: [
      {
        name: 'Класична Шаурма',
        qty: 2,
        lavash: 'Сирний лаваш',
        spiciness: 'Пікантна 🌶️',
        added: ['Сир Чеддер'],
        removed: ['Без цибулі'],
        comment: 'Більше соусу, будь ласка'
      }
    ]
  },
  {
    id: '1043',
    time: '11:45',
    createdAt: Date.now() - 40 * 1000, // 40 seconds ago
    status: 'new',
    orderType: 'delivery',
    customerName: 'Марія (Telegram)',
    items: [
      {
        name: 'Гостра Шаурма BBQ',
        qty: 1,
        lavash: 'Звичайний лаваш',
        spiciness: 'Вогонь! 🔥🌶️',
        added: ['Халапеньйо', 'Подвійне м\'ясо на вугіллі'],
        removed: [],
        comment: ''
      },
      {
        name: 'Картопля Фрі з сіллю',
        qty: 1,
        lavash: null,
        spiciness: null,
        added: [],
        removed: [],
        comment: ''
      }
    ]
  },
  {
    id: '1039',
    time: '11:30',
    createdAt: Date.now() - 15 * 60 * 1000, // 15 minutes ago (OVERDUE!)
    status: 'cooking',
    orderType: 'pickup',
    customerName: 'Дмитро (Telegram)',
    items: [
      {
        name: 'Сирна Шаурма',
        qty: 1,
        lavash: 'Шпинатний лаваш',
        spiciness: null,
        added: ['Хрусткий бекон гриль'],
        removed: ['Без часникового соусу', 'Без капусти'],
        comment: 'Добре підрум\'янити на грилі'
      }
    ]
  }
];

export default function KitchenDisplayApp() {
  const [orders, setOrders] = useState(INITIAL_ORDERS);
  const [archivedOrders, setArchivedOrders] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState(null);

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
    // 1. Fetch initial orders
    orderSync.getOrders().then(data => {
      if (data?.orders) {
        setOrders(data.orders);
        if (data.archivedOrders) setArchivedOrders(data.archivedOrders);
      }
    });

    // 2. Subscribe to real-time events via SSE + broadcast
    const unsubscribe = orderSync.subscribe({
      onInit: (data) => {
        if (data.orders) {
          setOrders(prev => {
            const incomingNew = data.orders.filter(no => !prev.some(po => po.id === no.id));
            if (incomingNew.length > 0 && prev.length > 0) {
              const latest = incomingNew[0];
              if (isSoundEnabled) {
                kdsSound.playNewOrder();
              }
              setNewOrderAlert(`Нове замовлення #${latest.id}!`);
              setTimeout(() => setNewOrderAlert(null), 4000);
            }
            return data.orders;
          });
        }
        if (data.archivedOrders) setArchivedOrders(data.archivedOrders);
      },
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
        if (status === 'archived') {
          setOrders(prev => prev.filter(o => o.id !== id));
          if (order) {
            setArchivedOrders(prev => [order, ...prev.filter(o => o.id !== id)]);
          }
        } else {
          setOrders(prev => {
            const exists = prev.some(o => o.id === id);
            if (exists) {
              return prev.map(o => (o.id === id ? { ...o, status } : o));
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

  // Advance order status
  const advanceOrder = (orderId, currentStatus) => {
    if (isSoundEnabled) {
      kdsSound.playAdvance();
    }

    const nextStatus =
      currentStatus === 'new' ? 'cooking' : currentStatus === 'cooking' ? 'ready' : 'archived';

    // Optimistic local update
    if (nextStatus === 'archived') {
      const completed = orders.find(o => o.id === orderId);
      if (completed) {
        setArchivedOrders(prev => [
          { ...completed, completedAt: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) },
          ...prev
        ]);
      }
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } else {
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, status: nextStatus } : o))
      );
    }

    // Sync across all connected apps
    orderSync.updateStatus(orderId, nextStatus);
  };

  // Revert order status (Undo accidental tap)
  const revertOrder = (orderId, currentStatus, e) => {
    e.stopPropagation();
    const prevStatus = currentStatus === 'ready' ? 'cooking' : currentStatus === 'cooking' ? 'new' : 'new';
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: prevStatus } : o))
    );
    orderSync.updateStatus(orderId, prevStatus);
  };

  // Add new order (either demo or incoming from customer app)
  const addNewOrder = (customOrder = null) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    const orderId = customOrder?.id || String(Math.floor(1044 + Math.random() * 50));

    const sampleDishes = [
      {
        name: 'Класична Шаурма',
        qty: 1,
        lavash: 'Звичайний лаваш',
        spiciness: 'Пікантна 🌶️',
        added: ['Сир Чеддер'],
        removed: ['Без цибулі'],
        comment: 'Швидше, бо поспішаю'
      },
      {
        name: 'Сирна Шаурма',
        qty: 2,
        lavash: 'Сирний лаваш',
        spiciness: null,
        added: ['Подвійне м\'ясо на вугіллі', 'Хрусткий бекон'],
        removed: ['Без часникового соусу'],
        comment: 'Хрустку скоринку!'
      },
      {
        name: 'Веган Фалафель',
        qty: 1,
        lavash: 'Шпинатний лаваш',
        spiciness: null,
        added: ['Солодка кукурудза'],
        removed: ['Без помідорів'],
        comment: ''
      }
    ];

    const randomDish = sampleDishes[Math.floor(Math.random() * sampleDishes.length)];

    const createdOrder = customOrder || {
      id: orderId,
      time: timeStr,
      createdAt: Date.now(),
      status: 'new',
      orderType: Math.random() > 0.4 ? 'pickup' : 'delivery',
      customerName: 'Telegram Замовник',
      items: [randomDish]
    };

    // Optimistic local add
    setOrders(prev => [createdOrder, ...prev]);

    if (isSoundEnabled) {
      kdsSound.playNewOrder();
    }

    setNewOrderAlert(`Нове замовлення #${orderId}!`);
    setTimeout(() => setNewOrderAlert(null), 3500);

    // Broadcast through sync server so all tabs & screens see it
    orderSync.createOrder(createdOrder);
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

  // Restore archived order
  const restoreArchivedOrder = (order) => {
    setOrders(prev => [...prev, { ...order, status: 'ready' }]);
    setArchivedOrders(prev => prev.filter(o => o.id !== order.id));
  };

  const getOrdersByStatus = (status) => orders.filter(o => o.status === status);

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col selection:bg-orange-500 selection:text-white select-none">
      {/* Top Header Bar for Tablet KDS */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-5 py-3.5 flex justify-between items-center shrink-0 z-10 shadow-md">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center text-xl font-bold">
              👨‍🍳
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-none">
                  Термінал Кухаря
                </h1>
                <span className="text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  KDS LIVE
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Шаурма на Вугіллі • Точка: вул. Велика Васильківська
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
          {/* Link to Customer Telegram App */}
          <a
            href={import.meta.env.VITE_CLIENT_URL || `${window.location.protocol}//${window.location.hostname}:3000`}
            target="_blank"
            rel="noreferrer"
            className="hidden lg:flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold border border-zinc-750 transition-all"
            title="Відкрити клієнтський Telegram застосунок на порті 3000"
          >
            <span>📱 Меню клієнта (:3000)</span>
          </a>

          {/* Quick Demo Order Button */}
          <button
            onClick={() => addNewOrder()}
            className="hidden sm:flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all"
            title="Симулювати нове надходження з Telegram Mini App"
          >
            <PlusCircle size={15} />
            <span>+ Тестове замовлення</span>
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

          {/* Archive / History */}
          <button
            onClick={() => setShowArchive(true)}
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 rounded-xl transition-all relative active:scale-95"
            title="Архів виданих замовлень"
          >
            <Archive size={18} />
            {archivedOrders.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-zinc-700 text-zinc-300 border border-zinc-600 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {archivedOrders.length}
              </span>
            )}
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
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </span>
          </div>
        </div>
      </header>

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
                  onRevert={revertOrder}
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
                <p className="text-xs text-zinc-400 mt-1">Тапніть нове замовлення, щоб почати</p>
              </div>
            ) : (
              getOrdersByStatus('cooking').map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  currentTime={currentTime}
                  onAdvance={advanceOrder}
                  onRevert={revertOrder}
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
                  onRevert={revertOrder}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Archive Modal Drawer */}
      {showArchive && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 p-5 flex flex-col h-full shadow-2xl">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-800 mb-4">
              <div className="flex items-center gap-2">
                <Archive size={20} className="text-orange-400" />
                <h3 className="text-lg font-bold text-white">Архів виданих замовлень</h3>
              </div>
              <button
                onClick={() => setShowArchive(false)}
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
              {archivedOrders.length === 0 ? (
                <div className="text-center py-20 text-zinc-500">
                  <p>В архіві ще немає виданих замовлень за зміну.</p>
                </div>
              ) : (
                archivedOrders.map((ord, i) => (
                  <div key={i} className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-lg text-white">#{ord.id}</span>
                      <span className="text-xs text-emerald-400 font-medium">Видано о {ord.completedAt}</span>
                    </div>
                    <div className="text-xs text-zinc-300">
                      {ord.items.map((it, idx) => (
                        <div key={idx}>
                          {it.qty}x {it.name}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => restoreArchivedOrder(ord)}
                      className="text-xs text-orange-400 hover:underline pt-1 flex items-center gap-1"
                    >
                      <RotateCcw size={12} />
                      <span>Повернути в "Готові"</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ORDER CARD COMPONENT (Extra-large contrast)
// ==========================================
function OrderCard({ order, currentTime, onAdvance, onRevert }) {
  // Dynamically calculate elapsed minutes
  const elapsedMinutes = Math.floor(
    (currentTime.getTime() - (order.createdAt || currentTime.getTime())) / (60 * 1000)
  );
  const elapsedSeconds = Math.floor(
    ((currentTime.getTime() - (order.createdAt || currentTime.getTime())) / 1000) % 60
  );

  // Warning thresholds
  const isDelayed = elapsedMinutes >= 10 && order.status !== 'ready';
  const isCritical = elapsedMinutes >= 15 && order.status !== 'ready';

  return (
    <div
      onClick={() => onAdvance(order.id, order.status)}
      className={`relative rounded-2xl p-4 sm:p-5 cursor-pointer transition-all active:scale-[0.985] shadow-xl border-4 select-none ${
        order.status === 'new'
          ? 'bg-zinc-900 border-zinc-700/80 hover:border-blue-500'
          : order.status === 'cooking'
          ? isCritical
            ? 'bg-red-950/60 border-red-500 animate-pulse shadow-red-500/20'
            : isDelayed
            ? 'bg-amber-950/50 border-amber-500 shadow-amber-500/15'
            : 'bg-zinc-900 border-orange-500/60 hover:border-orange-500'
          : 'bg-zinc-900 border-emerald-500/60 hover:border-emerald-500'
      }`}
    >
      {/* Top Card Info Bar */}
      <div className="flex justify-between items-start mb-3 pb-3 border-b-2 border-zinc-700/60">
        <div className="flex items-center gap-2.5">
          {/* Order ID in MASSIVE typography */}
          <span className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono">
            #{order.id}
          </span>

          <div className="flex flex-col">
            {/* Delivery / Pickup Badge */}
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                order.orderType === 'delivery'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {order.orderType === 'delivery' ? (
                <>
                  <Bike size={12} />
                  <span>Доставка</span>
                </>
              ) : (
                <>
                  <UserCheck size={12} />
                  <span>Самовивіз</span>
                </>
              )}
            </span>
            <span className="text-xs text-zinc-400 font-mono mt-0.5">{order.time}</span>
          </div>
        </div>

        {/* Right: Elapsed Timer Badge (Turns RED on 10+ min!) */}
        <div className="flex items-center gap-2">
          {/* Undo Button if needed */}
          {order.status !== 'new' && (
            <button
              onClick={(e) => onRevert(order.id, order.status, e)}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-700 active:scale-90"
              title="Повернути статус назад"
            >
              <RotateCcw size={14} />
            </button>
          )}

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-black text-sm sm:text-base border ${
              isCritical
                ? 'bg-red-500 text-white border-red-400 animate-pulse'
                : isDelayed
                ? 'bg-amber-500 text-black border-amber-400'
                : 'bg-zinc-800 text-zinc-200 border-zinc-700'
            }`}
          >
            {isDelayed ? <AlertTriangle size={17} /> : <Clock size={17} />}
            <span>
              {elapsedMinutes}:{elapsedSeconds < 10 ? `0${elapsedSeconds}` : elapsedSeconds}
            </span>
          </div>
        </div>
      </div>

      {/* Customer items with HUGE readability and COLOR CODED MODIFIERS */}
      <div className="flex flex-col gap-3.5 my-2">
        {order.items.map((item, idx) => (
          <div key={idx} className="bg-zinc-950/70 p-3 rounded-xl border border-zinc-800/80 space-y-2">
            {/* Dish Title & Huge Quantity */}
            <div className="flex items-center gap-2.5">
              <span className="bg-white text-zinc-950 font-black text-xl sm:text-2xl px-2.5 py-0.5 rounded-lg shrink-0 shadow-sm">
                {item.qty}x
              </span>
              <span className="font-black text-lg sm:text-xl text-white tracking-tight leading-tight">
                {item.name}
              </span>
            </div>

            {/* Lavash & Spiciness row */}
            {(item.lavash || item.spiciness) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {item.lavash && (
                  <span className="bg-zinc-800 text-orange-300 text-xs font-bold px-2 py-0.5 rounded border border-orange-500/30">
                    🥖 {item.lavash}
                  </span>
                )}
                {item.spiciness && (
                  <span className="bg-red-500/20 text-red-300 text-xs font-bold px-2 py-0.5 rounded border border-red-500/30">
                    {item.spiciness}
                  </span>
                )}
              </div>
            )}

            {/* CRITICAL COLOR CODING: Modifiers */}
            {/* ADDED MODIFIERS (Vibrant Green) */}
            {item.added && item.added.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {item.added.map((mod, i) => (
                  <div
                    key={i}
                    className="text-emerald-300 bg-emerald-500/20 border border-emerald-500/50 font-black text-sm sm:text-base px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm"
                  >
                    <span className="text-emerald-400 font-extrabold text-lg leading-none">+</span>
                    <span>{mod}</span>
                  </div>
                ))}
              </div>
            )}

            {/* REMOVED MODIFIERS (Vibrant Alert Red - CRITICAL) */}
            {item.removed && item.removed.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {item.removed.map((mod, i) => (
                  <div
                    key={i}
                    className="text-red-200 bg-red-600/30 border-2 border-red-500 font-black text-sm sm:text-base px-2.5 py-1 rounded-lg uppercase tracking-wide flex items-center gap-1 shadow-sm"
                  >
                    <span className="text-red-400 font-extrabold text-lg leading-none">✕</span>
                    <span>{mod}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Customer Special Comment (Yellow Box) */}
            {item.comment && (
              <div className="bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-bold p-2 rounded-lg flex items-start gap-1.5 mt-1">
                <span className="text-base leading-none">⚠️</span>
                <span>«{item.comment}»</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 1-Tap Action Call to Action Button */}
      <div className="mt-4 pt-3 border-t-2 border-zinc-700/60">
        <div
          className={`w-full py-3.5 px-4 rounded-xl font-black text-base text-center uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-transform ${
            order.status === 'new'
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
              : order.status === 'cooking'
              ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/30'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
          }`}
        >
          {order.status === 'new' && (
            <>
              <ChefHat size={20} />
              <span>Тапніть, щоб почати готувати ➔</span>
            </>
          )}
          {order.status === 'cooking' && (
            <>
              <CheckCircle size={20} />
              <span>Тапніть, якщо готово ➔</span>
            </>
          )}
          {order.status === 'ready' && (
            <>
              <UserCheck size={20} />
              <span>Тапніть, щоб видати клієнту ✓</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
