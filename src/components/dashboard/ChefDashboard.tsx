import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { NavView } from '../layout/Sidebar';
import {
  ChefHat,
  CheckCircle2,
  Flame,
  UtensilsCrossed,
  Trash2,
  Boxes,
  XCircle,
  RefreshCw,
  TrendingUp,
  Clock,
  DollarSign,
  AlertTriangle,
  BarChart3,
  Utensils
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { formatCurrency } from '../../utils/currency';

interface ChefDashboardProps {
  onNavigate: (view: NavView) => void;
}

type ChartPeriod = 'daily' | 'weekly' | 'monthly' | 'annual';

export const ChefDashboard: React.FC<ChefDashboardProps> = ({ onNavigate }) => {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('daily');
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteForm, setWasteForm] = useState({ inventory_item_id: '', quantity: '', reason: 'Spoiled', notes: '' });
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadInventoryItems = async () => {
    try {
      const res = await api.getInventoryItems();
      setInventoryItems(res.items || []);
    } catch (err: any) {
      error('Failed to load inventory items', err.message);
    }
  };

  const fetchDashboard = async () => {
    try {
      const [dashRes, statsRes, chartRes] = await Promise.all([
        api.getKitchenDashboard(),
        api.getKitchenStats(),
        api.getKitchenOrdersChart(chartPeriod),
      ]);
      setDashboardData(dashRes);
      setStats(statsRes);
      setChartData(chartRes.chartData || []);
    } catch (err: any) {
      error('Failed to load kitchen data', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    loadInventoryItems();
    const interval = setInterval(fetchDashboard, 12000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.getKitchenOrdersChart(chartPeriod).then((res) => {
      setChartData(res.chartData || []);
    }).catch(() => {});
  }, [chartPeriod]);

  const handleUpdateOrderStatus = async (orderId: string, nextStatus: string) => {
    try {
      await api.updateOrderStatus(orderId, nextStatus);
      success(`Order updated to ${nextStatus}`);
      fetchDashboard();
    } catch (err: any) {
      error('Update failed', err.message);
    }
  };

  const handleReactivateItem = async (itemId: string, itemName: string) => {
    try {
      await api.updateMenuAvailability(itemId, { is_available: true });
      success(`"${itemName}" reactivated on active menu`);
      fetchDashboard();
    } catch (err: any) {
      error('Could not reactivate item', err.message);
    }
  };

  const handleSubmitWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteForm.inventory_item_id || !wasteForm.quantity) {
      return error('Please select an ingredient and enter quantity');
    }
    setSubmitting(true);
    try {
      await api.recordKitchenWaste(wasteForm);
      success('Kitchen food waste logged and stock updated');
      setShowWasteModal(false);
      setWasteForm({ inventory_item_id: '', quantity: '', reason: 'Spoiled', notes: '' });
      fetchDashboard();
    } catch (err: any) {
      error('Failed to log food waste', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mr-3" />
        Loading Kitchen Chef Station...
      </div>
    );
  }

  const activeOrders = dashboardData?.activeOrders || [];
  const lowIngredients = dashboardData?.lowIngredients || [];
  const unavailableItems = dashboardData?.unavailableItems || [];

  const kpiCards = [
    {
      label: 'Active Orders',
      value: stats?.activeOrders ?? activeOrders.length,
      icon: Flame,
      color: 'amber',
      bgClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      valueClass: 'text-amber-400',
    },
    {
      label: 'Avg Prep Time',
      value: `${stats?.avgPrepTime ?? 0} min`,
      icon: Clock,
      color: 'sky',
      bgClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      valueClass: 'text-sky-400',
    },
    {
      label: 'Revenue Today',
      value: formatCurrency(stats?.todayRevenue ?? 0),
      icon: DollarSign,
      color: 'emerald',
      bgClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      valueClass: 'text-emerald-400',
      mono: true,
    },
    {
      label: 'Waste Cost',
      value: formatCurrency(stats?.todayWasteCost ?? 0),
      icon: AlertTriangle,
      color: 'rose',
      bgClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      valueClass: 'text-rose-400',
      mono: true,
    },
    {
      label: 'Usage Logs',
      value: stats?.todayUsageCount ?? 0,
      icon: Utensils,
      color: 'purple',
      bgClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      valueClass: 'text-purple-400',
    },
    {
      label: 'Low Stock',
      value: stats?.lowStockCount ?? lowIngredients.length,
      icon: Boxes,
      color: 'amber',
      bgClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      valueClass: 'text-amber-400',
    },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-5 min-h-0 lg:min-h-[calc(100vh-4rem)]">
      {/* Left Sidebar: KPI Cards — horizontal on mobile, vertical on desktop */}
      <div className="w-full lg:w-56 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">Kitchen KPIs</h2>
            <p className="text-[10px] text-slate-400">Today's metrics</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-1 space-y-3">

        {kpiCards.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{kpi.label}</p>
                <div className={`p-1.5 rounded-lg border ${kpi.bgClass}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className={`text-xl font-bold ${kpi.valueClass} ${kpi.mono ? 'font-mono' : ''}`}>
                {kpi.value}
              </p>
            </div>
          );
        })}
        </div>

        {/* Quick Nav Buttons */}
        <div className="pt-2 space-y-2">
          <button
            onClick={() => onNavigate('menu')}
            className="w-full px-3 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-transform active:scale-95 flex items-center justify-center gap-2"
          >
            <UtensilsCrossed className="w-3.5 h-3.5" /> Menu Controls
          </button>
          <button
            onClick={() => setShowWasteModal(true)}
            className="w-full px-3 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold text-xs rounded-xl border border-rose-500/30 flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Report Waste
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-5 min-w-0">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-5 rounded-2xl border border-amber-500/20 shadow-xl">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-amber-400" /> Kitchen Chef Station & Queue
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Live preparation tickets, performance metrics & ingredient tracking.
            </p>
          </div>
          <button
            onClick={fetchDashboard}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh All
          </button>
        </div>

        {/* Line Chart: Orders Completed Over Time */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Orders Completed Over Time</h3>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl">
              {(['daily', 'weekly', 'monthly', 'annual'] as ChartPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors capitalize ${
                    chartPeriod === p
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
              <TrendingUp className="w-5 h-5 mr-2 opacity-40" /> No completed kitchen orders in this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="period_label"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#e2e8f0',
                  }}
                  formatter={(value: number, name: string) => [
                    name === 'orders_completed' ? `${value} orders` : formatCurrency(value),
                    name === 'orders_completed' ? 'Orders' : 'Revenue',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="orders_completed"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#colorOrders)"
                  dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#fbbf24' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Main Grid: Live Kitchen Order Cards + Side Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Active Kitchen Tickets Stream */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                Live Preparation Queue ({activeOrders.length})
              </h3>
            </div>

            {activeOrders.length === 0 ? (
              <div className="p-12 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-slate-400 text-xs">
                <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                All orders prepared and served! Kitchen queue is clear.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeOrders.map((ord: any) => {
                  const isPreparing = ord.status === 'Preparing';
                  const isReady = ord.status === 'Ready';

                  return (
                    <div
                      key={ord.id}
                      className={`rounded-2xl p-4 border transition-all shadow-xl ${
                        isPreparing
                          ? 'bg-amber-950/20 border-amber-500/40 ring-1 ring-amber-500/30'
                          : isReady
                          ? 'bg-emerald-950/20 border-emerald-500/40'
                          : 'bg-slate-900/90 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div>
                          <span className="text-xs font-bold text-white">#{ord.order_number}</span>
                          <p className="text-[11px] text-amber-400 font-semibold">
                            {ord.order_type === 'Table' ? `📍 Table ${ord.table_number}` : `🛏️ Room ${ord.room_number}`}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ord.status === 'Ready'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : ord.status === 'Preparing'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </div>

                      <div className="py-3 space-y-2">
                        {ord.items?.map((it: any) => (
                          <div key={it.id} className="text-xs flex items-start justify-between">
                            <div>
                              <span className="font-semibold text-white">
                                {it.quantity}x {it.menu_item_name}
                              </span>
                              {it.special_notes && (
                                <p className="text-[10px] text-amber-300/80 italic mt-0.5">
                                  Note: "{it.special_notes}"
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                        {ord.notes && (
                          <p className="text-[11px] text-slate-400 bg-slate-800/60 p-2 rounded-lg mt-1">
                            General: {ord.notes}
                          </p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400">
                          Waiter: <strong className="text-slate-300">{ord.waiter_name}</strong>
                        </span>

                        {ord.status === 'Pending' || ord.status === 'Confirmed' ? (
                          <button
                            onClick={() => handleUpdateOrderStatus(ord.id, 'Preparing')}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-transform active:scale-95 flex items-center gap-1"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            Start Cooking
                          </button>
                        ) : ord.status === 'Preparing' ? (
                          <button
                            onClick={() => handleUpdateOrderStatus(ord.id, 'Ready')}
                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-transform active:scale-95 flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Mark Ready
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Pickup
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Sidebar: Menu Availability & Low Stock */}
          <div className="space-y-5">
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-bold text-white">Unavailable Items</h3>
                </div>
                <button
                  onClick={() => onNavigate('menu')}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
                >
                  Manage
                </button>
              </div>

              <div className="mt-3 space-y-2 max-h-48 lg:max-h-56 overflow-y-auto pr-1">
                {unavailableItems.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-xs flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-semibold text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-rose-400 truncate">
                        {item.deactivation_reason || 'Stock shortage'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleReactivateItem(item.id, item.name)}
                      className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold rounded-lg border border-emerald-500/30 shrink-0 transition-colors"
                    >
                      Reactivate
                    </button>
                  </div>
                ))}
                {unavailableItems.length === 0 && (
                  <p className="text-center py-4 text-emerald-400 text-xs flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> All items available
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Low Ingredients</h3>
                </div>
                <button
                  onClick={() => onNavigate('inventory')}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
                >
                  Stock
                </button>
              </div>

              <div className="mt-3 space-y-2 max-h-48 lg:max-h-56 overflow-y-auto pr-1">
                {lowIngredients.map((ing: any) => (
                  <div
                    key={ing.id}
                    className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-amber-200">{ing.name}</p>
                      <p className="text-[10px] text-amber-300/80">
                        Avail: {ing.available_stock} {ing.unit} (Min: {ing.minimum_quantity})
                      </p>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300">
                      Low
                    </span>
                  </div>
                ))}
                {lowIngredients.length === 0 && (
                  <p className="text-center py-4 text-emerald-400 text-xs flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Well stocked
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Report Food Waste */}
      {showWasteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Report Kitchen Food Waste
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Deducts damaged/expired ingredient from inventory and calculates exact cost loss.
            </p>

            <form onSubmit={handleSubmitWaste} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Ingredient</label>
                <select
                  value={wasteForm.inventory_item_id}
                  onChange={(e) => setWasteForm({ ...wasteForm, inventory_item_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                >
                  <option value="">Select ingredient...</option>
                  {inventoryItems.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit || 'units'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={wasteForm.quantity}
                    onChange={(e) => setWasteForm({ ...wasteForm, quantity: e.target.value })}
                    placeholder="e.g. 1.5"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Reason</label>
                  <select
                    value={wasteForm.reason}
                    onChange={(e) => setWasteForm({ ...wasteForm, reason: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Spoiled">Spoiled / Bad Quality</option>
                    <option value="Burned">Burned / Overcooked</option>
                    <option value="Expired">Expired</option>
                    <option value="Dropped">Dropped / Spilled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (optional)</label>
                <textarea
                  value={wasteForm.notes}
                  onChange={(e) => setWasteForm({ ...wasteForm, notes: e.target.value })}
                  placeholder="Details about the incident..."
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowWasteModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Record Waste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
