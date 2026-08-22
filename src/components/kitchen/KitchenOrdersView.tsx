import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Order } from '../../types';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  Flame,
  RefreshCw,
  Search,
  Filter,
  ArrowUpCircle,
  UtensilsCrossed,
  AlertTriangle,
  Package
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { formatTimeCAT, formatDateTimeCAT } from '../../utils/dates';

export const KitchenOrdersView: React.FC = () => {
  const { success, error } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchOrders = async () => {
    try {
      const res = await api.getOrders();
      setOrders(res.orders || []);
    } catch (err: any) {
      error('Failed to load orders', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleAdvanceStatus = async (orderId: string, currentStatus: string) => {
    const nextMap: Record<string, string> = {
      'Pending': 'Confirmed',
      'Confirmed': 'Preparing',
      'Preparing': 'Ready',
    };
    const next = nextMap[currentStatus];
    if (!next) return;
    try {
      await api.updateOrderStatus(orderId, next);
      success(`Order advanced to ${next}`);
      fetchOrders();
    } catch (err: any) {
      error('Status update failed', err.message);
    }
  };

  const hasFoodItems = (order: Order): boolean => {
    if (!order.items || order.items.length === 0) return true;
    return order.items.some((it) => it.category_name !== 'Drinks & Bar');
  };

  const filteredOrders = orders.filter((o) => {
    if (!hasFoodItems(o)) return false;
    const matchStatus = statusFilter === 'all' || statusFilter === 'active'
      ? ['Pending', 'Confirmed', 'Preparing', 'Ready'].includes(o.status)
      : o.status === statusFilter;
    const matchSearch = searchQuery === '' ||
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.room_number && o.room_number.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const activeCount = orders.filter((o) =>
    hasFoodItems(o) && ['Pending', 'Confirmed', 'Preparing', 'Ready'].includes(o.status)
  ).length;

  const pendingCount = orders.filter((o) => hasFoodItems(o) && o.status === 'Pending').length;
  const preparingCount = orders.filter((o) => hasFoodItems(o) && o.status === 'Preparing').length;
  const readyCount = orders.filter((o) => hasFoodItems(o) && o.status === 'Ready').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Confirmed': return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      case 'Preparing': return 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse';
      case 'Ready': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Served': return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'Completed': return 'bg-slate-700/60 text-slate-300 border-slate-600';
      case 'Cancelled': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default: return 'bg-slate-800 text-slate-400';
    }
  };

  const getNextAction = (status: string) => {
    switch (status) {
      case 'Pending': return { label: 'Confirm', color: 'bg-indigo-500 hover:bg-indigo-400 text-white' };
      case 'Confirmed': return { label: 'Start Cooking', color: 'bg-amber-500 hover:bg-amber-400 text-slate-950' };
      case 'Preparing': return { label: 'Mark Ready', color: 'bg-emerald-500 hover:bg-emerald-400 text-white' };
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-6 rounded-2xl border border-amber-500/20 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Kitchen Orders</h2>
            <p className="text-xs text-slate-400 mt-0.5">Food orders only — advance orders through the kitchen pipeline</p>
          </div>
        </div>
        <button
          onClick={fetchOrders}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Orders', value: activeCount, icon: Flame, color: 'text-amber-400' },
          { label: 'Pending', value: pendingCount, icon: Clock, color: 'text-blue-400' },
          { label: 'Cooking', value: preparingCount, icon: UtensilsCrossed, color: 'text-orange-400' },
          { label: 'Ready', value: readyCount, icon: CheckCircle2, color: 'text-emerald-400' },
        ].map((stat) => (
          <div key={stat.label} className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-slate-800 ${stat.color}`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{stat.value}</p>
              <p className="text-[10px] text-slate-400 font-semibold uppercase">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order # or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto no-scrollbar">
          {[
            { id: 'active', label: 'Active' },
            { id: 'all', label: 'All' },
            { id: 'Pending', label: 'Pending' },
            { id: 'Confirmed', label: 'Confirmed' },
            { id: 'Preparing', label: 'Preparing' },
            { id: 'Ready', label: 'Ready' },
            { id: 'Completed', label: 'Completed' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === f.id
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800">
          <Package className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-400">No kitchen orders found</p>
          <p className="text-xs text-slate-500 mt-1">Food orders will appear here as they come in</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const action = getNextAction(order.status);
            const foodItems = (order.items || []).filter((it) => it.category_name !== 'Drinks & Bar');

            return (
              <div
                key={order.id}
                className={`p-4 rounded-2xl border transition-all shadow-lg ${
                  order.status === 'Preparing'
                    ? 'bg-amber-950/20 border-amber-500/30 shadow-amber-500/10'
                    : order.status === 'Ready'
                    ? 'bg-emerald-950/20 border-emerald-500/30 shadow-emerald-500/10'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4 className="text-sm font-bold text-white">{order.order_number}</h4>
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${getStatusBadge(order.status)}`}>
                        {order.status}
                      </span>
                      {order.room_number && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 text-slate-300 rounded-md border border-slate-700">
                          Room {order.room_number}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {formatDateTimeCAT(order.created_at)} · {order.waiter_name || 'N/A'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-white">{formatCurrency(order.total_amount)}</span>
                    {action && (
                      <button
                        onClick={() => handleAdvanceStatus(order.id, order.status)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl shadow transition-all active:scale-95 flex items-center gap-1.5 ${action.color}`}
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        {action.label}
                      </button>
                    )}
                  </div>
                </div>

                {foodItems.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
                    {foodItems.map((it) => (
                      <div key={it.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300 font-semibold">{it.menu_item_name}</span>
                          <span className="text-slate-500">×{it.quantity}</span>
                        </div>
                        <span className="text-slate-400">{formatCurrency(it.total_price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
