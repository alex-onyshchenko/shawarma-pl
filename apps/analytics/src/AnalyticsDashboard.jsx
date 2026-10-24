import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, ShoppingBag, Banknote, Clock,
  BarChart2, Package, ListOrdered, RefreshCw, FileText
} from 'lucide-react';

import SalesReport from './SalesReport';

const API_BASE = (import.meta.env.VITE_SYNC_API_URL || '').replace(/\/+$/, '');

const ORANGE = '#f97316';
const COLORS = ['#f97316', '#fb923c', '#fdba74', '#fcd34d', '#a3e635', '#34d399', '#60a5fa', '#c084fc'];

// ── Small helpers ─────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('uk-UA').format(Math.round(n));
}

function usePeriodLabel(period) {
  return period === 'today' ? 'Сьогодні' : period === 'week' ? '7 днів' : '30 днів';
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = ORANGE }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-start gap-4">
      <div className="p-3 rounded-xl" style={{ background: color + '22' }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-zinc-400 text-sm mb-0.5">{label}</p>
        <p className="text-white text-2xl font-bold leading-none">{value}</p>
        {sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, unit = '₴' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-sm shadow-xl">
      <p className="text-zinc-300 mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || ORANGE }}>
          {p.name}: <span className="font-bold">{fmt(p.value)}{unit === '₴' && p.name?.toLowerCase().includes('виторг') ? ' ₴' : (unit !== '₴' ? ` ${unit}` : '')}</span>
        </p>
      ))}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-4">
      <Icon size={20} className="text-orange-500" />
      {children}
    </h2>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    archived: { label: 'Виконано', cls: 'bg-green-900/60 text-green-400' },
    ready:    { label: 'Готово',   cls: 'bg-blue-900/60 text-blue-400' },
    cooking:  { label: 'Готується',cls: 'bg-yellow-900/60 text-yellow-400' },
    new:      { label: 'Нове',     cls: 'bg-orange-900/60 text-orange-400' },
  };
  const s = map[status] || { label: status, cls: 'bg-zinc-800 text-zinc-400' };
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('week');
  const [reportVersion, setReportVersion] = useState(0);
  const [activeTab, setActiveTab] = useState('overview'); // overview | products | orders

  async function fetchAnalytics() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/analytics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAnalytics(); }, []);

  const periodData = data?.byPeriod?.[period] || { orders: 0, revenue: 0 };
  const periodLabel = period === 'today' ? 'Сьогодні' : period === 'week' ? '7 днів' : '30 днів';

  // For the bar chart: show daily for month, hourly for today/week
  const chartData = period === 'month'
    ? (data?.revenueByDay || [])
    : (data?.ordersByHour || []).map(b => ({ ...b, date: `${b.hour}:00` }));

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <h1 className="font-bold text-lg leading-none">Аналітика</h1>
            <p className="text-zinc-500 text-xs mt-0.5">ШаурМіша 🌯</p>
          </div>
        </div>
        <button
          onClick={() => { fetchAnalytics(); setReportVersion(value => value + 1); }}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-orange-500 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Оновити
        </button>
      </header>

      {/* Nav tabs */}
      <nav className="flex gap-1 overflow-x-auto px-4 sm:px-6 pt-4 pb-0" aria-label="Розділи аналітики">
        {[
          { id: 'overview', icon: BarChart2, label: 'Огляд' },
          { id: 'products', icon: Package,   label: 'Продукти' },
          { id: 'orders',   icon: ListOrdered, label: 'Замовлення' },
          { id: 'report', icon: FileText, label: 'Звіт' },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex shrink-0 items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-zinc-900 text-orange-500 border-t border-l border-r border-zinc-800'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      <main className="px-4 sm:px-6 py-6 space-y-8">
        {activeTab === 'report' && <SalesReport key={reportVersion}/>}
        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
            ❌ Не вдалося завантажити дані: {error}. Перевірте доступність сервісу синхронізації.
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 h-24 animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* ── OVERVIEW TAB ────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <>
                {/* Period toggle */}
                <div className="flex gap-2">
                  {[['today','Сьогодні'], ['week','7 днів'], ['month','30 днів']].map(([key, lbl]) => (
                    <button
                      key={key}
                      onClick={() => setPeriod(key)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        period === key
                          ? 'bg-orange-500 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    icon={ShoppingBag}
                    label={`Замовлень (${periodLabel})`}
                    value={fmt(periodData.orders)}
                    sub={`Всього: ${fmt(data.summary.totalOrders)}`}
                  />
                  <KpiCard
                    icon={Banknote}
                    label={`Виторг (${periodLabel})`}
                    value={`${fmt(periodData.revenue)} ₴`}
                    sub={`Всього: ${fmt(data.summary.totalRevenue)} ₴`}
                    color="#22c55e"
                  />
                  <KpiCard
                    icon={TrendingUp}
                    label="Серед. чек"
                    value={`${fmt(data.summary.avgOrderValue)} ₴`}
                    sub="За весь час"
                    color="#60a5fa"
                  />
                  <KpiCard
                    icon={Clock}
                    label="Сьогодні замовлень"
                    value={fmt(data.byPeriod.today.orders)}
                    sub={`${fmt(data.byPeriod.today.revenue)} ₴`}
                    color="#c084fc"
                  />
                </div>

                {/* Revenue chart */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <SectionTitle icon={BarChart2}>
                    {period === 'month' ? 'Виторг по днях (30 днів)' : 'Замовлення по годинах (7 днів)'}
                  </SectionTitle>
                  <ResponsiveContainer width="100%" height={260}>
                    {period === 'month' ? (
                      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11 }} width={55} tickFormatter={v => `${fmt(v)}₴`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="revenue" name="Виторг" fill={ORANGE} radius={[4,4,0,0]} />
                      </BarChart>
                    ) : (
                      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11 }} width={35} />
                        <Tooltip content={<CustomTooltip unit="шт" />} />
                        <Bar dataKey="orders" name="Замовлень" fill={ORANGE} radius={[4,4,0,0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>

                {/* Line chart – revenue trend */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <SectionTitle icon={TrendingUp}>Тренд виторгу (30 днів)</SectionTitle>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.revenueByDay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#71717a', fontSize: 11 }} width={55} tickFormatter={v => `${fmt(v)}₴`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="revenue" name="Виторг" stroke={ORANGE} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* ── PRODUCTS TAB ─────────────────────────────────────── */}
            {activeTab === 'products' && (
              <>
                {/* Pie chart */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <SectionTitle icon={Package}>Частка продажів (кількість)</SectionTitle>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={data.topProducts.slice(0, 7)}
                          dataKey="qty"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={95}
                          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {data.topProducts.slice(0, 7).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, name) => [`${fmt(v)} шт`, name]} contentStyle={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 12 }} />
                        <Legend formatter={v => <span className="text-zinc-300 text-xs">{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Bar chart — revenue per product */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <SectionTitle icon={Banknote}>Виторг по продуктах</SectionTitle>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={data.topProducts.slice(0, 6)}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={v => `${fmt(v)}₴`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} width={140} />
                        <Tooltip formatter={v => [`${fmt(v)} ₴`, 'Виторг']} contentStyle={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 12 }} />
                        <Bar dataKey="revenue" name="Виторг" fill={ORANGE} radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Products table */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-zinc-800">
                    <SectionTitle icon={Package}>Таблиця продуктів</SectionTitle>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                          <th className="px-5 py-3 font-medium">#</th>
                          <th className="px-5 py-3 font-medium">Продукт</th>
                          <th className="px-5 py-3 font-medium text-right">Кількість</th>
                          <th className="px-5 py-3 font-medium text-right">Виторг</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topProducts.map((p, i) => (
                          <tr key={p.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                            <td className="px-5 py-3 text-zinc-500">{i + 1}</td>
                            <td className="px-5 py-3 text-white font-medium">{p.name}</td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-orange-400 font-bold">{fmt(p.qty)}</span>
                              <span className="text-zinc-500 ml-1">шт</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-green-400 font-bold">{fmt(p.revenue)}</span>
                              <span className="text-zinc-500 ml-1">₴</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── ORDERS TAB ───────────────────────────────────────── */}
            {activeTab === 'orders' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
                  <SectionTitle icon={ListOrdered}>Останні замовлення</SectionTitle>
                  <span className="text-zinc-500 text-sm">{data.recentOrders.length} записів</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                        <th className="px-5 py-3 font-medium">ID</th>
                        <th className="px-5 py-3 font-medium">Клієнт</th>
                        <th className="px-5 py-3 font-medium">Тип</th>
                        <th className="px-5 py-3 font-medium">Позиції</th>
                        <th className="px-5 py-3 font-medium text-right">Сума</th>
                        <th className="px-5 py-3 font-medium">Статус</th>
                        <th className="px-5 py-3 font-medium">Час</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map(o => (
                        <tr key={o.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                          <td className="px-5 py-3 text-orange-500 font-mono font-medium">#{o.id}</td>
                          <td className="px-5 py-3 text-white">{o.customerName}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${o.orderType === 'delivery' ? 'bg-blue-900/60 text-blue-400' : 'bg-zinc-800 text-zinc-400'}`}>
                              {o.orderType === 'delivery' ? '🚴 Доставка' : '🏠 Самовивіз'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-zinc-400">
                            {(o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ')}
                          </td>
                          <td className="px-5 py-3 text-right text-green-400 font-bold">{fmt(o.totalPrice)} ₴</td>
                          <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                          <td className="px-5 py-3 text-zinc-500 text-xs">
                            {o.createdAt ? new Date(o.createdAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : o.time}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
