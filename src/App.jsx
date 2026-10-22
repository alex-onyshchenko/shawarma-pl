import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, Search, Sparkles, Flame, Check, X, Smartphone, Monitor } from 'lucide-react';
import { CATEGORIES, PRODUCTS } from './data/menuData';
import { tg } from './utils/telegram';
import TelegramHeader from './components/TelegramHeader';
import CategoryTabs from './components/CategoryTabs';
import ProductCard from './components/ProductCard';
import ModifierModal from './components/ModifierModal';
import CheckoutView from './components/CheckoutView';
import OrderSuccessModal from './components/OrderSuccessModal';
import AboutModal from './components/AboutModal';

export default function App() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].name);
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('menu'); // 'menu' | 'checkout' | 'order-status'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMockupMode, setIsMockupMode] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [user, setUser] = useState(null);

  // Initialize Telegram WebApp SDK
  useEffect(() => {
    tg.init();
    setUser(tg.getUser());

    // If running directly inside native Telegram Mini App on mobile, auto-disable mockup container
    if (tg.isAvailable) {
      setIsMockupMode(false);
    }
  }, []);

  // Show temporary toast message
  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    let list = PRODUCTS;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return list.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }
    return list.filter(p => p.category === activeCategory);
  }, [activeCategory, searchQuery]);

  // Products count per category
  const productsCountByCategory = useMemo(() => {
    const counts = {};
    PRODUCTS.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, []);

  // Cart calculations
  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  }, [cart]);

  const cartItemsCount = useMemo(() => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  }, [cart]);

  // In-cart count by product id
  const inCartCounts = useMemo(() => {
    const counts = {};
    cart.forEach(item => {
      counts[item.product.id] = (counts[item.product.id] || 0) + item.quantity;
    });
    return counts;
  }, [cart]);

  // Add customized item from ModifierModal
  const handleAddCustomizedItem = ({
    product,
    quantity,
    lavash,
    spiciness,
    addedModifiers,
    removedModifiers,
    comment,
  }) => {
    const unitPrice =
      product.price +
      (lavash?.price || 0) +
      addedModifiers.reduce((sum, mod) => sum + mod.price, 0);

    const configKey = JSON.stringify({
      productId: product.id,
      lavashId: lavash?.id,
      spicinessLevel: spiciness?.level,
      addedIds: addedModifiers.map(m => m.id).sort(),
      removedIds: removedModifiers.map(m => m.id).sort(),
      comment,
    });

    const existingIndex = cart.findIndex(item => item.configKey === configKey);

    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += quantity;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          configKey,
          product,
          quantity,
          unitPrice,
          lavash,
          spiciness,
          addedModifiers,
          removedModifiers,
          comment,
        },
      ]);
    }

    setSelectedProduct(null);
    tg.haptic.success();
    triggerToast(`Додано: ${product.name} (${quantity} шт) 🌯`);
  };

  // Quick add without modifiers
  const handleQuickAdd = (product) => {
    const configKey = JSON.stringify({ productId: product.id });
    const existingIndex = cart.findIndex(item => item.configKey === configKey);

    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          configKey,
          product,
          quantity: 1,
          unitPrice: product.price,
          lavash: null,
          spiciness: null,
          addedModifiers: [],
          removedModifiers: [],
          comment: '',
        },
      ]);
    }

    triggerToast(`Додано: ${product.name} 🍟`);
  };

  // Update item quantity in checkout
  const handleUpdateQuantity = (itemId, delta) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.id === itemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  // Remove item completely
  const handleRemoveItem = (itemId) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  // Clear entire cart
  const handleClearCart = () => {
    if (window.confirm('Очистити всі товари з кошика?')) {
      setCart([]);
      triggerToast('Кошик очищено 🗑️');
    }
  };

  // Order submission
  const handlePlaceOrder = (orderData) => {
    setLastPlacedOrder(orderData);
    setCart([]);
    setView('order-status');
  };

  // Reset to menu for new order
  const handleResetToMenu = () => {
    setLastPlacedOrder(null);
    setView('menu');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-orange-500 selection:text-white flex flex-col items-center justify-start p-0 md:p-6 transition-colors">
      {/* Desktop Helper Bar */}
      <div className="hidden md:flex items-center justify-between w-full max-w-md mb-3 px-2 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Telegram Mini App Simulator</span>
        </div>
        <button
          onClick={() => setIsMockupMode(!isMockupMode)}
          className="flex items-center gap-1.5 hover:text-white bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg transition-colors"
        >
          {isMockupMode ? <Monitor size={13} /> : <Smartphone size={13} />}
          <span>{isMockupMode ? 'Повний екран' : 'Смартфон-рамка'}</span>
        </button>
      </div>

      {/* Main Container / Mobile Mockup Frame */}
      <div
        className={`w-full transition-all duration-300 relative flex flex-col bg-zinc-950 min-h-screen ${
          isMockupMode
            ? 'max-w-md md:rounded-[40px] md:shadow-2xl md:border-4 md:border-zinc-800/80 md:min-h-[850px] md:max-h-[92vh] md:overflow-hidden'
            : 'max-w-2xl border-x border-zinc-900'
        }`}
      >
        {/* Telegram Header */}
        <TelegramHeader
          view={view}
          setView={setView}
          cartCount={cartItemsCount}
          onClearCart={handleClearCart}
          isMockupMode={isMockupMode}
          setIsMockupMode={setIsMockupMode}
          onOpenAbout={() => setAboutOpen(true)}
        />

        {/* Scrollable View Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col">
          {view === 'menu' && (
            <>
              {/* Promo Banner */}
              <div className="p-4 pb-2">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-600 via-amber-600 to-red-600 p-4 text-white shadow-lg">
                  <div className="relative z-10 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200 uppercase tracking-wide">
                        <Flame size={14} className="fill-amber-200" />
                        <span>Справжній мангал</span>
                      </div>
                      <h2 className="text-xl font-black mt-0.5 tracking-tight">
                        Шаурма на Вугіллі 🌯
                      </h2>
                      <p className="text-xs text-orange-100 mt-1 max-w-[240px]">
                        М'ясо маринується 24 години та смажиться на живому жарі!
                      </p>
                    </div>
                    <div className="text-4xl filter drop-shadow-md select-none animate-pulse-subtle">
                      🔥
                    </div>
                  </div>

                  {/* Discount tag badge */}
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-semibold text-white border border-white/10">
                    <Sparkles size={12} className="text-amber-300" />
                    <span>Знижка 10% на самовивіз</span>
                  </div>
                </div>
              </div>

              {/* Search Bar Toggle */}
              <div className="px-4 pt-1 pb-1 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Пошук страви або інгредієнта..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-orange-500 transition-colors"
                  />
                  <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2 text-zinc-500 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Category Tabs */}
              {!searchQuery && (
                <CategoryTabs
                  categories={CATEGORIES}
                  activeCategory={activeCategory}
                  onSelectCategory={setActiveCategory}
                  productsCountByCategory={productsCountByCategory}
                />
              )}

              {/* Product List */}
              <div className="p-4 flex flex-col gap-3.5 pb-28">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-16 text-zinc-500 space-y-2">
                    <p className="text-3xl">🔍</p>
                    <p className="text-sm font-medium">Нічого не знайдено за запитом</p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-xs text-orange-400 hover:underline"
                    >
                      Скинути пошук
                    </button>
                  </div>
                ) : (
                  filteredProducts.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={setSelectedProduct}
                      onQuickAdd={handleQuickAdd}
                      inCartCount={inCartCounts[product.id] || 0}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {view === 'checkout' && (
            <CheckoutView
              cart={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onBackToMenu={() => setView('menu')}
              onPlaceOrder={handlePlaceOrder}
              user={user}
            />
          )}

          {view === 'order-status' && lastPlacedOrder && (
            <OrderSuccessModal
              order={lastPlacedOrder}
              onReset={handleResetToMenu}
            />
          )}
        </main>

        {/* Floating Bottom Cart Bar for Menu View */}
        {view === 'menu' && cartItemsCount > 0 && (
          <div className="absolute bottom-4 left-4 right-4 z-30 animate-slide-up">
            <button
              onClick={() => {
                tg.haptic.impact('medium');
                setView('checkout');
              }}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-xl shadow-orange-500/30 py-3.5 px-5 rounded-2xl flex items-center justify-between font-bold transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 text-white px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 shadow-xs">
                  <ShoppingBag size={14} />
                  <span>{cartItemsCount}</span>
                </div>
                <span className="text-sm sm:text-base tracking-tight">Перейти до кошика</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-base sm:text-lg font-black">{cartTotal}</span>
                <span className="text-xs font-bold text-amber-200">₴</span>
              </div>
            </button>
          </div>
        )}

        {/* Modifier Modal (Bottom Sheet) */}
        {selectedProduct && (
          <ModifierModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onAdd={handleAddCustomizedItem}
          />
        )}

        {/* About Modal */}
        {aboutOpen && (
          <AboutModal onClose={() => setAboutOpen(false)} />
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/95 text-white text-xs font-medium px-4 py-2 rounded-full border border-zinc-700/80 shadow-2xl flex items-center gap-2 animate-scale-up pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
