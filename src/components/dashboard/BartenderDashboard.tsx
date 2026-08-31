import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { NavView } from '../layout/Sidebar';
import {
  ConciergeBell,
  PlusCircle,
  TrendingUp,
  DollarSign,
  Receipt,
  BarChart3,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { formatCurrency } from '../../utils/currency';

const DEPT_COLORS = ['#3b82f6', '#f59e0b', '#a855f7', '#10b981', '#ef4444'];
const BAR_COLORS = ['#f59e0b', '#34d399', '#3b82f6', '#a855f7', '#f87171', '#22d3ee', '#fb923c', '#e879f9'];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[10px] text-slate-400 font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-[11px] font-mono" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};


interface BartenderDashboardProps {
  onNavigate: (view: NavView) => void;
}

interface DailyStats {
  total_served: number;
  paid_count: number;
  revenue: number;
  payment_rate: number;
}

interface HourlyRevenue {
  hour: string;
  revenue: number;
  orders: number;
}

interface DeptRevenue {
  department: string;
  revenue: number;
  orders: number;
}

interface TopService {
  name: string;
  revenue: number;
  quantity: number;
}

interface RevenueTrendPoint {
  label: string;
  revenue: number;
  orders: number;
}

export const BartenderDashboard: React.FC<BartenderDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    total_served: 0,
    paid_count: 0,
    revenue: 0,
    payment_rate: 0,
  });
  const [hourlyRevenue, setHourlyRevenue] = useState<HourlyRevenue[]>([]);
  const [deptRevenue, setDeptRevenue] = useState<DeptRevenue[]>([]);
  const [topServices, setTopServices] = useState<TopService[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'annual' | 'custom'>('daily');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const failCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [ordRes, menuRes] = await Promise.all([
        api.getOrders({ waiter_id: user?.id }),
        api.getMenuItems(),
      ]);
      setOrders(ordRes.orders || []);
      setMenuItems(menuRes.items || []);

      // Calculate daily stats from orders
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      let served = 0;
      let paid = 0;
      let revenue = 0;

      // Filter orders by period
      let filteredOrders = [...ordRes.orders];

      if (period === 'custom' && customStart && customEnd) {
        const startD = new Date(customStart);
        const endD = new Date(customEnd);
        endD.setHours(23, 59, 59, 999);
        filteredOrders = filteredOrders.filter(
          (o) => { const d = new Date(o.created_at); return d >= startD && d <= endD; }
        );
      } else if (period === 'weekly') {
        filteredOrders = filteredOrders.filter(
          (o) => new Date(o.created_at) >= startOfWeek
        );
      } else if (period === 'monthly') {
        filteredOrders = filteredOrders.filter(
          (o) => new Date(o.created_at) >= startOfMonth
        );
      } else if (period === 'annual') {
        filteredOrders = filteredOrders.filter(
          (o) => new Date(o.created_at) >= startOfYear
        );
      }

      // Calculate stats
      filteredOrders.forEach((o) => {
        served += 1; // each order counts as served
        if (o.payment_status === 'Paid' || o.payment_status === 'ChargedToRoom') {
          paid += 1;
          revenue += o.total_amount || 0;
        }
      });

      const paymentRate = served > 0 ? (paid / served) * 100 : 0;

      setDailyStats({
        total_served: served,
        paid_count: paid,
        revenue: revenue,
        payment_rate: parseFloat((paymentRate / 100).toFixed(1)),
      });

      // Hourly revenue (last 24 hours or period-based)
      const hourlyData = filteredOrders.reduce((acc: HourlyRevenue[], o) => {
        const date = new Date(o.created_at);
        const hour = date.getHours().toString().padStart(2, '0');
        const existing = acc.find((h) => h.hour === hour);
        if (existing) {
          existing.revenue += o.total_amount || 0;
          existing.orders += 1;
        } else {
          acc.push({ hour, revenue: o.total_amount || 0, orders: 1 });
        }
        return acc;
      }, []);

      // Sort by hour and take top 24
      const sortedHourly = hourlyData
        .sort((a, b) => a.hour.localeCompare(b.hour))
        .slice(0, 24);
      setHourlyRevenue(sortedHourly);

      // Department revenue
      const deptData = filteredOrders.reduce((acc: DeptRevenue[], o) => {
        const dept = o.department || 'General';
        const existing = acc.find((d) => d.department === dept);
        if (existing) {
          existing.revenue += o.total_amount || 0;
          existing.orders += 1;
        } else {
          acc.push({ department: dept, revenue: o.total_amount || 0, orders: 1 });
        }
        return acc;
      }, []);

      setDeptRevenue(deptData);

      // Top selling services
      const serviceData = filteredOrders.reduce((acc: TopService[], o) => {
        o.items?.forEach(((it: any) => {
          const existing = acc.find((a) => a.name === it.menu_item_name);
          if (existing) {
            existing.revenue += it.total_price || 0;
            existing.quantity += it.quantity || 1;
          } else {
            acc.push({
              name: it.menu_item_name,
              revenue: it.total_price || 0,
              quantity: it.quantity || 1,
            });
          }
        }));
        return acc;
      }, []);

      // Sort by revenue desc, take top 8
      setTopServices(
        serviceData.sort((a, b) => b.revenue - a.revenue).slice(0, 8)
      );

      // Revenue trend — bucket by period granularity
      const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let trendBuckets: RevenueTrendPoint[] = [];

      if (period === 'daily') {
        // 24 hour buckets: 00 - 23
        trendBuckets = Array.from({ length: 24 }, (_, i) => ({
          label: i.toString().padStart(2, '0') + ':00',
          revenue: 0,
          orders: 0,
        }));
        filteredOrders.forEach((o) => {
          const h = new Date(o.created_at).getHours();
          trendBuckets[h].revenue += o.total_amount || 0;
          trendBuckets[h].orders += 1;
        });
      } else if (period === 'custom' && customStart && customEnd) {
        // Custom range: group by day
        const startD = new Date(customStart);
        const endD = new Date(customEnd);
        const dayMs = 86400000;
        const totalDays = Math.round((endD.getTime() - startD.getTime()) / dayMs) + 1;
        const cappedDays = Math.min(totalDays, 62);
        const customBuckets: Record<string, RevenueTrendPoint> = {};
        for (let i = 0; i < cappedDays; i++) {
          const d = new Date(startD.getTime() + i * dayMs);
          const key = `${d.getMonth() + 1}/${d.getDate()}`;
          customBuckets[key] = { label: key, revenue: 0, orders: 0 };
        }
        filteredOrders.forEach((o) => {
          const od = new Date(o.created_at);
          const key = `${od.getMonth() + 1}/${od.getDate()}`;
          if (customBuckets[key]) {
            customBuckets[key].revenue += o.total_amount || 0;
            customBuckets[key].orders += 1;
          }
        });
        trendBuckets = Object.values(customBuckets);
      } else if (period === 'weekly') {
        // 7 day buckets: Mon - Sun
        trendBuckets = DAY_NAMES.map((d) => ({ label: d, revenue: 0, orders: 0 }));
        filteredOrders.forEach((o) => {
          const d = new Date(o.created_at).getDay();
          trendBuckets[d].revenue += o.total_amount || 0;
          trendBuckets[d].orders += 1;
        });
      } else if (period === 'monthly') {
        // Up to 31 day buckets: 1 - 31
        const refDate = new Date();
        const daysInMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
        trendBuckets = Array.from({ length: daysInMonth }, (_, i) => ({
          label: `${i + 1}`,
          revenue: 0,
          orders: 0,
        }));
        filteredOrders.forEach((o) => {
          const d = new Date(o.created_at).getDate() - 1;
          if (d >= 0 && d < trendBuckets.length) {
            trendBuckets[d].revenue += o.total_amount || 0;
            trendBuckets[d].orders += 1;
          }
        });
      } else {
        // Annual: 12 month buckets: Jan - Dec
        trendBuckets = MONTH_NAMES.map((m) => ({ label: m, revenue: 0, orders: 0 }));
        filteredOrders.forEach((o) => {
          const m = new Date(o.created_at).getMonth();
          trendBuckets[m].revenue += o.total_amount || 0;
          trendBuckets[m].orders += 1;
        });
      }

      setRevenueTrend(trendBuckets);
    } catch (err: any) {
      failCountRef.current += 1;
      if (failCountRef.current <= 3) {
        error('Failed to load bartender dashboard data', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const scheduleNext = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const delay = failCountRef.current > 0 ? Math.min(60000, 15000 * Math.pow(2, Math.min(failCountRef.current, 3))) : 15000;
      intervalRef.current = setInterval(fetchData, delay);
    };
    scheduleNext();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [period, customStart, customEnd]);

  const handlePeriodChange = (newPeriod: 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom') => {
    setPeriod(newPeriod);
    failCountRef.current = 0;
    if (newPeriod !== 'custom') {
      setCustomStart('');
      setCustomEnd('');
    }
  };

  const handleCustomDateApply = () => {
    if (!customStart || !customEnd) return;
    failCountRef.current = 0;
    fetchData();
  };

  const myActiveOrders = orders.filter(
    (o) => ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Served'].includes(o.status)
  );
  const readyToServeOrders = orders.filter((o) => o.status === 'Ready');

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 p-6 rounded-2xl border border-rose-500/20 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
            <ConciergeBell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              bartender & Server Station
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Launch POS for tables & room service, check live ingredient servings & deliver orders.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('pos')}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/25 transition-transform active:scale-95 flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Open bartender POS
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {(['daily', 'weekly', 'monthly', 'annual'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                period === p
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <button
            onClick={() => handlePeriodChange('custom')}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
              period === 'custom'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Custom
          </button>
        </div>
        {period === 'custom' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3 pt-3 border-t border-slate-800">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 [color-scheme:dark]"
            />
            <span className="text-xs text-slate-400 hidden sm:inline">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 [color-scheme:dark]"
            />
            <button
              onClick={handleCustomDateApply}
              disabled={!customStart || !customEnd}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate-400">Orders Served</p>
              <p className="text-xl sm:text-2xl font-bold text-white">{dailyStats.total_served}</p>
            </div>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 hidden sm:block"
            >
              <path d="M3 13h2l7-7 7 7h2L3 21z" />
            </svg>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Total orders this period</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate-400">Payment Rate</p>
              <p className="text-xl sm:text-2xl font-bold text-white">
                {dailyStats.payment_rate}%
              </p>
            </div>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 hidden sm:block"
            >
              <path d="M12 2c1.1 0 2 .9 2 2v8c0 1.1-.89 2-2 2H5c-1.1 0-2-.9-2-2V4c0-1.1.89-2 2-2h9c1.1 0 2 .9 2 2v2zM7 9h2v2H7V9zm5 3h2v2h-2V12zm4 5c0 1.1-.89 2-2 2H9c-1.1 0-2-.9-2-2v-2z" />
            </svg>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Paid orders rate</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate-400">Revenue</p>
              <p className="text-xl sm:text-2xl font-bold text-white">
                {formatCurrency(dailyStats.revenue)}
              </p>
            </div>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 hidden sm:block"
            >
              <path d="M15 13h4l-7-4-7 4h4V9l7-4-7-4V5L19 4v6zM1 9h4l7 4 7-4H5v6zM5 17h6l-6-4-6 4H5v-6z" />
            </svg>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Revenue this period</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate-400">Revenue/Order</p>
              <p className="text-xl sm:text-2xl font-bold text-white">
                {dailyStats.revenue > 0 ? formatCurrency(dailyStats.revenue / dailyStats.total_served) : '0'}
              </p>
            </div>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 hidden sm:block"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2zM10 6l6 6v4L10 18V6z" />
            </svg>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Avg revenue per order</p>
        </div>
      </div>

      {/* Revenue Trend — Full Width Line Chart */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Revenue Trend</h3>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">
          {period === 'daily' && 'Hourly breakdown for today'}
          {period === 'weekly' && 'Daily breakdown for this week (Sun–Sat)'}
          {period === 'monthly' && 'Daily breakdown for this month'}
          {period === 'annual' && 'Monthly breakdown for this year'}
          {period === 'custom' && customStart && customEnd && `${customStart} to ${customEnd}`}
          {period === 'custom' && (!customStart || !customEnd) && 'Select dates and click Apply'}
        </p>
        <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueTrend} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  interval={period === 'daily' ? 2 : period === 'monthly' ? 4 : period === 'annual' ? 0 : undefined}
                  angle={-30}
                  textAnchor="end"
                  height={40}
                />
              <YAxis
                yAxisId="rev"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="ord"
                orientation="right"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
                      <p className="text-[10px] text-slate-400 font-semibold mb-1">{label}</p>
                      {payload.map((p: any, i: number) => (
                        <p key={i} className="text-[11px] font-mono" style={{ color: p.color }}>
                          {p.name}: {p.name === 'Revenue' ? formatCurrency(p.value) : p.value}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                formatter={(value) => <span className="text-slate-400">{value}</span>}
              />
              <Line
                yAxisId="rev"
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: '#0e7490', strokeWidth: 2 }}
              />
              <Line
                yAxisId="ord"
                type="monotone"
                dataKey="orders"
                name="Orders"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: '#b45309', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Hourly Revenue — Area Chart */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Hourly Revenue</h3>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Revenue by hour for {period} period
          </p>
          <div className="h-52 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyRevenue} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${v}:00`} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#f59e0b" strokeWidth={2} fill="url(#revenueGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Department Revenue — Pie Chart */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Dept. Revenue Split</h3>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Revenue by department for {period} period
          </p>
          <div className="h-52 sm:h-64">
            {deptRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deptRevenue}
                    dataKey="revenue"
                    nameKey="department"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    label={({ department, percent }) => `${department} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#475569', strokeWidth: 1 }}
                  >
                    {deptRevenue.map((_, idx) => (
                      <Cell key={idx} fill={DEPT_COLORS[idx % DEPT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                No department data yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Selling Services — Bar Chart + Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Top Selling Services</h3>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Top 8 services by revenue for {period} period
        </p>

        {topServices.length > 0 ? (
          <>
            <div className="h-48 sm:h-56 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topServices} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={80} tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="revenue" name="Revenue" radius={[0, 6, 6, 0]}>
                    {topServices.map((_, idx) => (
                      <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Service</th>
                    <th className="p-3 text-right">Revenue</th>
                    <th className="p-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {topServices.map((svc, idx) => (
                    <tr key={svc.name} className="hover:bg-slate-800/50">
                      <td className="p-3">
                        <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300">
                          {idx + 1}
                        </span>
                      </td>
                      <td className="p-3 font-medium">{svc.name}</td>
                      <td className="p-3 text-right font-bold text-white">
                        {formatCurrency(svc.revenue)}
                      </td>
                      <td className="p-3 text-right">{svc.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center text-slate-500 text-sm py-8">
            No sales data yet
          </div>
        )}
      </div>
    </div>
  );
};