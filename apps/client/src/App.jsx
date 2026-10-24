import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingBag } from 'lucide-react';
import { tg } from './utils/telegram';
import TelegramHeader from './components/TelegramHeader';
import CategoryTabs from './components/CategoryTabs';
import ProductCard from './components/ProductCard';
import ModifierModal from './components/ModifierModal';
import CheckoutView from './components/CheckoutView';
import OrderSuccessModal from './components/OrderSuccessModal';
import AboutModal from './components/AboutModal';
import CafeStatus from './components/CafeStatus';
import { orderSync } from './utils/orderSync';
import ContactGate from './components/ContactGate';
import { maxAdditional } from './utils/orderPolicy';

export default function App() {
  return <ContactGate>{(profile, setProfile) => <MenuApp profile={profile} onProfileChange={setProfile}/>}</ContactGate>;
}

function MenuApp({ profile, onProfileChange }) {
  const requestRef = useRef(null);
  const [activeCategory, setActiveCategory] = useState('');
  const [menu, setMenu] = useState(null);
  const [menuError, setMenuError] = useState('');
  const [availability, setAvailability] = useState(null);
  const products = menu?.products || [];
  const categories = (menu?.categories || []).filter(category => ['Шаурма', 'Напої'].includes(category.name));
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('menu'); // 'menu' | 'checkout' | 'order-status'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [user, setUser] = useState(null);
  const canAddToCart = availability?.acceptingOrders === true;
  const orderingUnavailableLabel = !availability ? 'Уточнюємо статус…' : availability.onBreak ? 'Обідня перерва' : 'Кафе зачинено';

  const applyMenu = data => {
    if (!data) return;
    setMenu(data);
    setMenuError('');
    const availableCategories = data.categories.filter(category => ['Шаурма', 'Напої'].includes(category.name));
    setActiveCategory(previous => availableCategories.some(category => category.name === previous) ? previous : availableCategories[0]?.name || '');
  };
  const refreshMenu = async () => {
    try { applyMenu(await orderSync.getMenu()); } catch { setMenuError('Не вдалося завантажити меню. Перевірте з’єднання.'); }
  };
  useEffect(() => {
    refreshMenu();
    return orderSync.subscribe({
      onInit: data => { applyMenu(data.menu); if (data.availability) setAvailability(data.availability); },
      onMenu: applyMenu,
      onAvailability: setAvailability,
    });
  }, []);
  useEffect(() => {
    if (!menu) return;
    setCart(previous => previous.map(item => {
      const product = menu.products.find(product => product.id === item.product.id);
      const size = product?.sizes?.find(size => size.id === item.size?.id);
      const added = item.addedModifiers.map(mod => menu.modifiers.add.find(value => value.id === mod.id));
      const removed = item.removedModifiers.map(mod => menu.modifiers.remove.find(value => value.id === mod.id));
      const spiciness = item.spiciness && menu.modifiers.spiciness.find(value => value.level === item.spiciness.level);
      const lavash = item.lavash && menu.modifiers.lavash.find(value => value.id === item.lavash.id);
      const unavailableReason = !product || !product.available ? 'Товар тимчасово недоступний' : ((product.sizes?.length || item.size) && !size) ? 'Розмір недоступний. Додайте товар ще раз' : added.some(value => !value) || removed.some(value => !value) || (item.lavash && !lavash) || (item.spiciness && !spiciness) || (!product.hasModifiers && (added.length || removed.length || lavash)) ? 'Склад змінився. Видаліть товар і додайте його ще раз' : '';
      if (unavailableReason) return { ...item, unavailableReason };
      return { ...item, product, size: size || null, addedModifiers: added, removedModifiers: removed, spiciness: spiciness || null, lavash: lavash || null, unitPrice: Math.round(((size?.price ?? product.price) + (lavash?.price || 0) + added.reduce((sum, mod) => sum + mod.price, 0)) * 100) / 100, unavailableReason: '' };
    }));
  }, [menu]);

  // Initialize Telegram WebApp SDK
  useEffect(() => {
    tg.init();
    setUser(tg.getUser());
  }, []);

  useEffect(() => {
    const back = tg.isAvailable ? tg.webApp.BackButton : null;
    if (!back) return;
    const goToMenu = () => setView('menu');
    if (view === 'menu') back.hide(); else back.show();
    back.onClick(goToMenu);
    return () => { back.offClick(goToMenu); back.hide(); };
  }, [view]);

  // Show temporary toast message
  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  const filteredProducts = useMemo(() => products.filter(product => product.category === activeCategory), [activeCategory, products]);

  // Products count per category
  const productsCountByCategory = useMemo(() => {
    const counts = {};
    products.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [products]);

  // Cart calculations
  const cartTotal = useMemo(() => {
    return Math.round(cart.reduce((total, item) => total + item.unitPrice * item.quantity, 0) * 100) / 100;
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
    size,
    quantity,
    lavash,
    spiciness,
    addedModifiers,
    removedModifiers,
    comment,
  }) => {
    if (!canAddToCart) { triggerToast(orderingUnavailableLabel); return; }
    if (quantity > maxAdditional(cart, product.id)) { triggerToast('Ліміт: 5 одиниць однієї позиції та 10 товарів загалом'); return; }
    const unitPrice =
      (size?.price ?? product.price) +
      (lavash?.price || 0) +
      addedModifiers.reduce((sum, mod) => sum + mod.price, 0);

    const configKey = JSON.stringify({
      productId: product.id,
      sizeId: size?.id,
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
          size,
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
    if (!canAddToCart) { triggerToast(orderingUnavailableLabel); return; }
    if (!maxAdditional(cart, product.id)) { triggerToast('Ліміт: 5 одиниць однієї позиції та 10 товарів загалом'); return; }
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
    if (delta > 0 && !canAddToCart) { triggerToast(orderingUnavailableLabel); return; }
    setCart(prev => {
      const target = prev.find(item => item.id === itemId);
      if (delta > 0 && target && delta > maxAdditional(prev, target.product.id)) return prev;
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
  const handlePlaceOrder = async (orderData) => {
    const kdsOrder = {
      time: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      status: 'new',
      pointId: menu.point.id,
      expectedTotal: orderData.finalTotal,
      timingMode: orderData.timingMode,
      requestedReadyAt: orderData.requestedReadyAt,
      paymentMethod: orderData.paymentMethod,
      cutlery: orderData.cutlery,
      orderType: orderData.deliveryType,
      customerName: user?.first_name ? `${user.first_name} (Telegram)` : 'Клієнт Telegram',
      phoneNumber: orderData.phoneNumber,
      totalPrice: orderData.finalTotal,
      selectedLocation: orderData.selectedLocation,
      items: orderData.cart.map(item => ({
        productId: item.product.id,
        sizeId: item.size?.id || null,

        lavashId: item.lavash?.id || null,
        addedModifierIds: item.addedModifiers.map(mod => mod.id),
        removedModifierIds: item.removedModifiers.map(mod => mod.id),
        spicinessLevel: item.spiciness?.level ?? 0,
        name: item.product.name,
        qty: item.quantity,
        lavash: item.lavash?.name || null,
        spiciness: item.spiciness?.label || null,
        added: (item.addedModifiers || []).map(m => m.name),
        removed: (item.removedModifiers || []).map(m => m.name),
        comment: item.comment || ''
      }))
    };

    // Submit once; Sync queues the kitchen event and Telegram notifications.
    // Reuse the request key after an unknown network result, even if the displayed slot advanced.
    requestRef.current ||= { id: crypto.randomUUID(), token: crypto.randomUUID() + crypto.randomUUID() };
    let accepted;
    try { accepted = await orderSync.createOrder({ ...kdsOrder, clientRequestId: requestRef.current.id, trackingToken: requestRef.current.token, telegramInitData: tg.webApp?.initData || '', notificationsEnabled: orderData.notificationsEnabled }); }
    catch (error) { if (error.status === 409) { await refreshMenu(); try { onProfileChange(await orderSync.getProfile()); } catch {} } throw error; }
    requestRef.current = null;
    setLastPlacedOrder(accepted);
    setCart([]);
    setView('order-status');
  };

  // Reset to menu for new order
  const handleResetToMenu = () => {
    setLastPlacedOrder(null);
    setView('menu');
  };

  return (
    <div className="app-shell bg-zinc-950 text-white font-sans selection:bg-orange-500 selection:text-white">
      <div className="app-content w-full max-w-2xl mx-auto relative flex flex-col">
        {/* Telegram Header */}
        <TelegramHeader
          pointName={menu?.point.name}
          logoUrl={menu?.point.logoUrl}
          view={view}
          setView={setView}
          cartCount={cartItemsCount}
          onClearCart={handleClearCart}
          onOpenAbout={() => setAboutOpen(true)}
        />

        {/* Scrollable View Content */}
        <main className="flex-1 relative flex flex-col">
          {view === 'menu' && (
            <>
              {!menu && <p className="p-4 text-zinc-400 text-sm">Завантажуємо меню…</p>}
              {menuError && <div role="alert" className="p-4 text-red-300 text-sm">{menuError} <button onClick={refreshMenu} className="underline">Спробувати ще раз</button></div>}
              {menu && <p className="px-4 py-2 text-xs text-zinc-400">📍 {menu.point.address}</p>}
              <div className="px-4 pt-1 pb-2">
                <CafeStatus availability={availability} />
              </div>
              <CategoryTabs
                categories={categories}
                activeCategory={activeCategory}
                onSelectCategory={setActiveCategory}
                productsCountByCategory={productsCountByCategory}
              />

              {/* Product List */}
              <div className="p-4 flex flex-col gap-3.5 pb-28">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-16 text-zinc-500 space-y-2">
                    <p className="text-sm font-medium">У цій категорії поки немає страв</p>
                  </div>
                ) : (
                  filteredProducts.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={setSelectedProduct}
                      onQuickAdd={handleQuickAdd}
                      inCartCount={inCartCounts[product.id] || 0}
                      orderingDisabled={!canAddToCart || maxAdditional(cart, product.id) === 0}
                      orderingUnavailableLabel={!canAddToCart ? orderingUnavailableLabel : 'Досягнуто ліміту'}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {view === 'checkout' && (
            <CheckoutView
              point={menu?.point}
              profile={profile}
              onProfileChange={onProfileChange}
              cart={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onBackToMenu={() => setView('menu')}
              onPlaceOrder={handlePlaceOrder}
              user={user}
            />
          )}

          {view === 'order-status' && (
            <OrderSuccessModal
              order={lastPlacedOrder}
              telegramNotifications={availability?.telegramNotifications}
              onReset={handleResetToMenu}
            />
          )}
        </main>

        {/* Floating Bottom Cart Bar for Menu View */}
        {view === 'menu' && cartItemsCount > 0 && (
          <div className="cart-bar fixed left-4 right-4 max-w-[640px] mx-auto z-30 animate-slide-up">
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
            modifiers={menu.modifiers}
            maxQuantity={maxAdditional(cart, selectedProduct.id)}
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onAdd={handleAddCustomizedItem}
            orderingDisabled={!canAddToCart}
            orderingUnavailableLabel={orderingUnavailableLabel}
          />
        )}

        {/* About Modal */}
        {aboutOpen && (
          <AboutModal point={menu?.point} onClose={() => setAboutOpen(false)} />
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
