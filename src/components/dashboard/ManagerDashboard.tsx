import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { NavView } from '../layout/Sidebar';
import {
  BedDouble,
  DollarSign,
  TrendingUp,
  Boxes,
  AlertTriangle,
  Receipt,
  Users,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  UtensilsCrossed
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';

interface ManagerDashboardProps {
  onNavigate: (view: NavView) => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [finance, setFinance] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [stockRequests, setStockRequests] = useState<any[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [finRes, roomRes, ordRes, invRes, reqRes] = await Promise.all([
        api.getFinanceOverview().catch(() => null),
        api.getRooms().catch(() => ({ rooms: [] })),
        api.getOrders({ status: 'all' }).catch(() => ({ orders: [] })),
        api.getInventoryItems().catch(() => ({ items: [] })),
        api.getStockRequests().catch(() => ({ requests: [] })),
      ]);

      setFinance(finRes);
      setRooms(roomRes?.rooms || []);
      setOrders(ordRes?.orders || []);
      setInventoryItems(invRes?.items || []);
      setStockRequests(reqRes?.requests || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === 'Occupied').length;
  const availableRooms = rooms.filter((r) => r.status === 'Available').length;
  const dirtyRooms = rooms.filter((r) => r.status === 'Dirty').length;
  const cleaningRooms = rooms.filter((r) => r.status === 'Cleaning').length;
  const occupancyRate = ((occupiedRooms / totalRooms) * 100).toFixed(0);

  const lowStockCount = inventoryItems.filter((i) => i.available_quantity <= i.minimum_quantity).length;
  const pendingRequests = stockRequests.filter((r) => r.status === 'Pending').length;
  const activeOrdersCount = orders.filter((o) => ['Pending', 'Confirmed', 'Preparing', 'Ready'].includes(o.status)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mr-3" />
        Loading Motel Operations Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Management Operations Overview</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time occupancy, revenue breakdown, central inventory & order monitoring.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('pos')}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-transform active:scale-95"
          >
            Launch POS
          </button>
          <button
            onClick={() => onNavigate('rooms')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl border border-slate-700 transition-colors"
          >
            Front Desk & Rooms
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Occupancy Card */}
        <div
          onClick={() => onNavigate('rooms')}
          className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:translate-y-[-2px] shadow-lg group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Room Occupancy</span>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
              <BedDouble className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{occupancyRate}%</span>
            <span className="text-xs text-slate-400">
              ({occupiedRooms}/{totalRooms} rooms)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
            <span className="text-emerald-400 font-medium">{availableRooms} Available</span>
            <span className="text-amber-400 font-medium">{dirtyRooms + cleaningRooms} Housekeeping</span>
          </div>
        </div>

        {/* Revenue Card */}
        <div
          onClick={() => onNavigate('finance')}
          className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:translate-y-[-2px] shadow-lg group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Revenue</span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{formatCurrency(finance?.totalRevenue || 0)}</span>
            <span className="text-xs text-emerald-400 font-medium flex items-center">
              <TrendingUp className="w-3 h-3 mr-0.5" /> Net: {formatCurrency(finance?.netIncome || 0)}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
            <span>Rooms: {formatCurrency(finance?.roomRevenue || 0)}</span>
            <span>Food & Bar: {formatCurrency(finance?.foodRevenue || 0)}</span>
          </div>
        </div>

        {/* Food Cost % Card */}
        <div
          onClick={() => onNavigate('finance')}
          className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:translate-y-[-2px] shadow-lg group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Kitchen Food Cost</span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{finance?.foodCostPercentage || '0.0'}%</span>
            <span className="text-xs text-slate-400">Cost: {formatCurrency(finance?.foodCostAmount || 0)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
            <span className={finance?.foodCostPercentage > 35 ? 'text-amber-400' : 'text-emerald-400'}>
              {finance?.foodCostPercentage > 35 ? 'Above 35% benchmark' : 'Optimal target ratio (<35%)'}
            </span>
          </div>
        </div>

        {/* Stock & Supply Card */}
        <div
          onClick={() => onNavigate('inventory')}
          className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:translate-y-[-2px] shadow-lg group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Inventory Status</span>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-110 transition-transform">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{inventoryItems.length}</span>
            <span className="text-xs text-slate-400">Items tracked</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
            <span className={lowStockCount > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
              {lowStockCount} Low Stock
            </span>
            <span className={pendingRequests > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
              {pendingRequests} Requests Pending
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Room Status Matrix + Active Orders Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Room Grid Preview */}
        <div className="lg:col-span-2 rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">Live Rooms Status Board</h3>
              <p className="text-[11px] text-slate-400">Instant front-desk room state inspection</p>
            </div>
            <button
              onClick={() => onNavigate('rooms')}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"
            >
              Full Room Grid <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
            {rooms.slice(0, 12).map((room) => {
              const statusColors: Record<string, string> = {
                Available: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
                Occupied: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
                Dirty: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
                Cleaning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
                Clean: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
                Reserved: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
                Maintenance: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
              };

              return (
                <div
                  key={room.id}
                  onClick={() => onNavigate('rooms')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer hover:scale-105 ${
                    statusColors[room.status] || 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Room {room.room_number}</span>
                    <span className="text-[10px] font-semibold opacity-90">{room.room_type_code || 'STD'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider">{room.status}</span>
                    <span className="text-[10px] text-slate-400">{formatCurrency(room.price_per_night)}</span>
                  </div>
                  {room.occupant_name && (
                    <p className="text-[10px] truncate text-slate-300 mt-1">👤 {room.occupant_name}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Orders & Alerts Sidebar */}
        <div className="space-y-6">
          {/* Active Orders */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Active Orders</h3>
              </div>
              <button
                onClick={() => onNavigate('orders')}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
              >
                View All
              </button>
            </div>

            <div className="mt-3 space-y-2.5 max-h-48 sm:max-h-56 overflow-y-auto pr-1">
              {orders
                .filter((o) => ['Pending', 'Confirmed', 'Preparing', 'Ready'].includes(o.status))
                .slice(0, 5)
                .map((ord) => (
                  <div
                    key={ord.id}
                    onClick={() => onNavigate('orders')}
                    className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:bg-slate-800 cursor-pointer text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">#{ord.order_number}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300">
                        {ord.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{ord.order_type === 'Table' ? `Table ${ord.table_number}` : `Room ${ord.room_number}`}</span>
                      <span className="font-semibold text-slate-200">{formatCurrency(ord.total_amount)}</span>
                    </div>
                  </div>
                ))}
              {orders.filter((o) => ['Pending', 'Confirmed', 'Preparing', 'Ready'].includes(o.status)).length === 0 && (
                <p className="text-center py-6 text-slate-400 text-xs">No active orders in kitchen queue</p>
              )}
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-bold text-white">Low Stock Watchlist</h3>
              </div>
              <button
                onClick={() => onNavigate('inventory')}
                className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
              >
                Inventory
              </button>
            </div>

            <div className="mt-3 space-y-2 max-h-48 lg:max-h-56 overflow-y-auto pr-1">
              {inventoryItems
                .filter((i) => i.available_quantity <= i.minimum_quantity)
                .slice(0, 4)
                .map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onNavigate('inventory')}
                    className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs cursor-pointer hover:bg-rose-500/15"
                  >
                    <div>
                      <p className="font-semibold text-rose-200">{item.name}</p>
                      <p className="text-[10px] text-rose-300/80">
                        {item.current_quantity} {item.unit} (Min: {item.minimum_quantity})
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-rose-300 px-2 py-0.5 rounded bg-rose-500/20">
                      Reorder: +{item.recommended_reorder}
                    </span>
                  </div>
                ))}
              {inventoryItems.filter((i) => i.available_quantity <= i.minimum_quantity).length === 0 && (
                <p className="text-center py-4 text-emerald-400 text-xs flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> All stock levels healthy
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
