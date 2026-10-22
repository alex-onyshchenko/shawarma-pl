import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import TelegramHeader from './components/TelegramHeader';
import CategoryTabs from './components/CategoryTabs';
import ProductCard from './components/ProductCard';
import ModifierModal from './components/ModifierModal';
import AboutModal from './components/AboutModal';
import menu from './preview-menu.json';
import { tg } from './utils/telegram';

export default function MenuPreviewApp() {
  const [category, setCategory] = useState(menu.categories[0].name);
  const [product, setProduct] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => { tg.init(); }, []);
  const counts = Object.fromEntries(menu.categories.map(c => [c.name, menu.products.filter(p => p.category === c.name).length]));
  return <div className="app-shell bg-zinc-950 text-white font-sans">
    <div className="app-content w-full max-w-2xl mx-auto relative flex flex-col">
      <TelegramHeader pointName={menu.point.name} view="menu" cartCount={0} onOpenAbout={() => setAboutOpen(true)}/>
      <main className="flex-1 relative flex flex-col">
        <p className="px-4 py-2 text-xs text-zinc-400">📍 {menu.point.address}</p>
        <div className="px-4 pt-1 pb-2">
          <div role="status" className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">
            <Eye size={22} className="shrink-0"/>
            <div><p className="text-sm font-semibold">Замовлення незабаром</p><p className="mt-1 text-xs text-zinc-400">Поки переглядайте меню, склад, розміри та ціни.</p></div>
          </div>
        </div>
        <CategoryTabs categories={menu.categories} activeCategory={category} onSelectCategory={setCategory} productsCountByCategory={counts}/>
        <div className="p-4 pb-10 flex flex-col gap-3.5">
          {menu.products.filter(p => p.category === category).map(p => <ProductCard key={p.id} product={p} previewOnly onSelect={setProduct} inCartCount={0}/>)}
        </div>
      </main>
      {product && <ModifierModal key={product.id} product={product} modifiers={menu.modifiers} previewOnly onClose={() => setProduct(null)}/>}
      {aboutOpen && <AboutModal point={menu.point} onClose={() => setAboutOpen(false)}/>}
    </div>
  </div>;
}
