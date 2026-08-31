import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { Order } from '../../types';
import { OrderEditModal } from './OrderEditModal';
import {
  ConciergeBell,
  Search,
  CheckCircle2,
  Clock,
  Flame,
  Receipt,
  Printer,
  DollarSign,
  User,
  BedDouble,
  CreditCard,
  RefreshCw,
  XCircle,
  Edit3,
  Lock,
  Trash2
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { formatTimeCAT, formatDateTimeCAT } from '../../utils/dates';

export const OrderManager: React.FC = () => {
  const { user } = useAuth();
  // Bartenders run their own service: they add items from the menu (pre-cooking
  // only), serve, and take payment. They never drive the kitchen — Start Cooking
  // and Mark Ready stay with the chef/manager, matching what the API allows.
  // Each flag mirrors exactly what the API grants, so no button can 403.
  const role = user?.role;
  // PUT /orders/:id/status — kitchen steps are admin/manager/chef only.
  const canRunKitchen = role === 'admin' || role === 'manager' || role === 'chef';
  // PUT /orders/:id — bartenders included, API limits them to their own
  // pre-cooking orders (and they only ever see their own orders).
  const canEditOrder = role === 'admin' || role === 'manager' || role === 'bartender';
  // 'Served' is allowed for the kitchen roles and for bartenders.
  const canServeOrder = canRunKitchen || role === 'bartender';
  // POST /orders/:id/pay — admin, manager, bartender.
  const canConfirmPayment = role === 'admin' || role === 'manager' || role === 'bartender';
  const { success, error } = useToast();
  const { getSetting } = useCms();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [confirmPayOrderId, setConfirmPayOrderId] = useState<string | null>(null);
  const [confirmPayMethod, setConfirmPayMethod] = useState('Cash');
  const [submittingQuickPay, setSubmittingQuickPay] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [clearAllText, setClearAllText] = useState('');
  const [clearingAll, setClearingAll] = useState(false);

  // Settlement
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const fetchOrders = async () => {
    try {
      setLoading(true);
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
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    try {
      await api.updateOrderStatus(orderId, nextStatus);
      success(`Order updated to ${nextStatus}`);
      fetchOrders();
      if (selectedReceiptOrder?.id === orderId) {
        setSelectedReceiptOrder((prev) => (prev ? { ...prev, status: nextStatus } : null));
      }
    } catch (err: any) {
      error('Update status failed', err.message);
    }
  };

  const handleSettlePayment = async (orderId: string) => {
    setSubmittingPayment(true);
    try {
      await api.processOrderPayment(orderId, {
        payment_method: paymentMethod,
        payment_status: 'Paid',
      });
      try {
        await api.updateOrderStatus(orderId, 'Completed');
      } catch (_) {}
      success('Payment received — order completed');
      fetchOrders();
      const updated = await api.getOrder(orderId);
      if (updated?.order) {
        setSelectedReceiptOrder({ ...selectedReceiptOrder, ...updated.order, items: updated.items || selectedReceiptOrder.items, payment_status: 'Paid' });
      }
    } catch (err: any) {
      error('Payment failed', err.message);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleQuickPayAndComplete = async (orderId: string) => {
    setSubmittingQuickPay(true);
    try {
      await api.processOrderPayment(orderId, {
        payment_method: confirmPayMethod,
        payment_status: 'Paid',
      });
      try {
        await api.updateOrderStatus(orderId, 'Completed');
      } catch (_) {}
      success('Payment received — order completed');
      setConfirmPayOrderId(null);
      fetchOrders();
    } catch (err: any) {
      error('Payment failed', err.message);
    } finally {
      setSubmittingQuickPay(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Delete this order permanently? This will also release reserved stock and cannot be undone.')) return;
    setDeletingOrderId(orderId);
    try {
      await api.deleteOrder(orderId);
      success('Order deleted');
      fetchOrders();
    } catch (err:any) {
      error('Delete failed', err.message);
    } finally {
      setDeletingOrderId(null);
    }
  };

  // Uses an in-app modal rather than window.confirm/prompt: browsers suppress
  // those in sandboxed frames and after repeated dialogs, in which case prompt()
  // returns null and the whole action was cancelled with no feedback at all.
  const handleClearAllOrders = () => {
    setClearAllText('');
    setShowClearAllModal(true);
  };

  const handleConfirmClearAll = async () => {
    if (clearAllText.trim().toUpperCase() !== 'DELETE') {
      return error('Confirmation required', 'Type DELETE to confirm');
    }
    setClearingAll(true);
    try {
      const res:any = await api.clearAllOrders();
      success(res.message || 'Order history cleared');
      setShowClearAllModal(false);
      setClearAllText('');
      fetchOrders();
    } catch (err:any) {
      error('Clear failed', err.message);
    } finally {
      setClearingAll(false);
    }
  };

  const handleDownloadBill = () => {
    const receipt = document.getElementById('printable-receipt');
    if (!receipt) return;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Bill #${selectedReceiptOrder?.order_number}</title>
<style>
  body { font-family: 'Georgia', 'Times New Roman', serif; margin: 0; padding: 20px; color: #000; background: #fff; font-size: 11px; line-height: 1.3; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { padding: 3px 4px; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .font-bold { font-weight: bold; }
  .font-mono { font-family: monospace; }
  .border-b { border-bottom: 1px solid #e5e7eb; }
  .border-b-2 { border-bottom: 2px solid #111; }
  .border-t-2 { border-top: 2px solid #111; }
  .pt-2 { padding-top: 8px; }
  .mt-1 { margin-top: 4px; }
  .mb-2 { margin-bottom: 8px; }
  .mb-3 { margin-bottom: 12px; }
  .pb-2 { padding-bottom: 8px; }
  .pb-3 { padding-bottom: 12px; }
  .py-1 { padding-top: 4px; padding-bottom: 4px; }
  .py-2 { padding-top: 8px; padding-bottom: 8px; }
  .flex { display: flex; }
  .justify-between { justify-content: space-between; }
  .justify-end { justify-content: flex-end; }
  .gap-4 { gap: 16px; }
  .gap-6 { gap: 24px; }
  .grid { display: grid; }
  .grid-cols-2 { grid-template-columns: 1fr 1fr; }
  .gap-x-6 { column-gap: 24px; }
  .gap-y-1 { row-gap: 4px; }
  .w-56 { width: 14rem; }
  .w-6 { width: 1.5rem; }
  .w-10 { width: 2.5rem; }
  .w-20 { width: 5rem; }
  .w-28 { width: 7rem; }
  .w-full { width: 100%; }
  .uppercase { text-transform: uppercase; }
  .tracking-widest { letter-spacing: 0.1em; }
  .tracking-wide { letter-spacing: 0.05em; }
  .italic { font-style: italic; }
</style></head><body>${receipt.innerHTML}</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const filteredOrders = orders.filter((o) => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchSearch =
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.waiter_name && o.waiter_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.table_number && o.table_number.includes(searchQuery)) ||
      (o.room_number && o.room_number.includes(searchQuery));
    return matchStatus && matchSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Confirmed':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      case 'Preparing':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse';
      case 'Ready':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Served':
        return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'Completed':
        return 'bg-slate-700/60 text-slate-300 border-slate-600';
      case 'Cancelled':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
            <ConciergeBell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Food & Beverage Orders Central</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live orders lifecycle, kitchen preparation status, table/room dispatching & bill printing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchOrders}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {user?.role === 'admin' && (
            <button
              onClick={handleClearAllOrders}
              disabled={orders.length === 0}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-600"
              title={orders.length === 0 ? 'Order history is already empty' : 'Empty all order history (admin only)'}
            >
              <Trash2 className="w-3.5 h-3.5" /> Empty All ({orders.length})
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order #, table, bartender..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto no-scrollbar">
          {['all', 'Pending', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {st === 'all' ? `All (${orders.length})` : st}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredOrders.map((ord) => {
          const isPending = ord.status === 'Pending';
          const isPreparing = ord.status === 'Preparing';
          const isReady = ord.status === 'Ready';
          const isServed = ord.status === 'Served';
          const isCompleted = ord.status === 'Completed';

          // A bar-only order never goes through the kitchen: drinks are poured
          // and handed over, so "Start Cooking" / "Mark Ready" do not apply.
          const orderItems = ord.items || [];
          const isBarOnly = orderItems.length > 0 && orderItems.every((it: any) => it.category_name === 'Drinks & Bar');

          return (
            <div
              key={ord.id}
              className={`p-4 rounded-2xl border transition-all shadow-xl flex flex-col justify-between ${
                isServed && ord.payment_status !== 'Paid'
                  ? 'bg-emerald-950/15 border-emerald-500/30 ring-1 ring-emerald-500/20'
                  : isReady
                  ? 'bg-emerald-950/25 border-emerald-500/40 ring-1 ring-emerald-500/30'
                  : isPreparing
                  ? 'bg-amber-950/20 border-amber-500/30'
                  : 'bg-slate-900/90 border-slate-800'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                  <div>
                    <span className="text-sm font-bold text-white">#{ord.order_number}</span>
                    <p className="text-xs text-amber-400 font-semibold">
                      {ord.order_type === 'Table' ? `📍 Table #${ord.table_number}` : `🛏️ Room #${ord.room_number}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(ord.status)}`}>
                      {ord.status}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {formatTimeCAT(ord.created_at)}
                    </p>
                  </div>
                </div>

                {/* Items preview */}
                <div className="py-3 space-y-1 text-xs">
                  {ord.items?.map((it) => (
                    <div key={it.id} className="flex justify-between text-slate-200">
                      <span>
                        {it.quantity}x {it.menu_item_name}
                      </span>
                      <span className="text-slate-400 font-mono">{formatCurrency(it.total_price)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-white">
                    <span>Total Amount</span>
                    <span className="text-amber-400 font-mono">{formatCurrency(ord.total_amount)}</span>
                  </div>
                </div>

                {/* bartender & Payment Status */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 py-1">
                  <span>
                    bartender: <strong className="text-slate-300">{ord.waiter_name}</strong>
                  </span>
                  <span
                    className={`font-semibold ${
                      ord.payment_status === 'Paid' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {ord.payment_status}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSelectedReceiptOrder(ord)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1 transition-colors"
                  >
                    <Receipt className="w-3.5 h-3.5" /> Bill
                  </button>
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => handleDeleteOrder(ord.id)}
                      disabled={deletingOrderId === ord.id}
                      className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
                      title="Delete order history (admin only)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Add items / edit before service. Bartenders may do this on
                      their own pre-cooking orders; the API enforces both rules. */}
                  {!canEditOrder ? null : ['Pending', 'Confirmed'].includes(ord.status) ? (
                    <button
                      onClick={() => setEditingOrder(ord)}
                      className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
                      title="Edit order items & details before cooking starts"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Order
                    </button>
                  ) : (
                    <span
                      className="px-2 py-1 bg-slate-800/40 text-slate-500 border border-slate-800 text-[10px] rounded-lg flex items-center gap-1 cursor-default"
                      title={isBarOnly ? 'Locked: order already served' : 'Locked: Kitchen preparation already started'}
                    >
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Bar-only orders skip the kitchen entirely: straight to served. */}
                  {canServeOrder && isBarOnly && !isServed && !isCompleted && ord.status !== 'Cancelled' && (
                    <button
                      onClick={() => handleUpdateStatus(ord.id, 'Served')}
                      className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                      title="Bar order — no kitchen preparation needed"
                    >
                      <ConciergeBell className="w-3 h-3" /> Serve Drinks
                    </button>
                  )}

                  {canRunKitchen && !isBarOnly && isPending && (
                    <button
                      onClick={() => handleUpdateStatus(ord.id, 'Preparing')}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                    >
                      <Flame className="w-3 h-3" /> Start Cooking
                    </button>
                  )}

                  {canRunKitchen && !isBarOnly && isPreparing && (
                    <button
                      onClick={() => handleUpdateStatus(ord.id, 'Ready')}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Mark Ready
                    </button>
                  )}

                  {canServeOrder && !isBarOnly && isReady && (
                    <button
                      onClick={() => handleUpdateStatus(ord.id, 'Served')}
                      className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                    >
                      <ConciergeBell className="w-3 h-3" /> Mark Served
                    </button>
                  )}

                  {/* Served + unpaid → combined Pay & Complete */}
                  {canConfirmPayment && isServed && ord.payment_status !== 'Paid' && (
                    confirmPayOrderId === ord.id ? (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <select
                          value={confirmPayMethod}
                          onChange={(e) => setConfirmPayMethod(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white"
                        >
                          <option value="Cash">Cash</option>
                          <option value="Credit Card">Credit Card</option>
                          <option value="Mobile Money">Mobile Money</option>
                          <option value="Room Charge">Room Charge</option>
                        </select>
                        <button
                          onClick={() => handleQuickPayAndComplete(ord.id)}
                          disabled={submittingQuickPay}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {submittingQuickPay ? 'Processing...' : 'Pay & Complete'}
                        </button>
                        <button
                          onClick={() => setConfirmPayOrderId(null)}
                          className="px-1.5 py-1 text-slate-400 hover:text-white"
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setConfirmPayOrderId(ord.id); setConfirmPayMethod('Cash'); }}
                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 ml-auto"
                      >
                        <CreditCard className="w-4 h-4" /> Pay & Complete
                      </button>
                    )
                  )}

                  {/* Served + already paid → just complete */}
                  {isServed && ord.payment_status === 'Paid' && (
                    <button
                      onClick={() => handleUpdateStatus(ord.id, 'Completed')}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1 ml-auto"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Complete
                    </button>
                  )}

                  {/* Unpaid non-Served orders → show Pay button (e.g. for orders delivered directly) */}
                  {!isServed && !isCompleted && ord.payment_status !== 'Paid' && (
                    confirmPayOrderId === ord.id ? (
                      <div className="flex items-center gap-1 ml-auto">
                        <select
                          value={confirmPayMethod}
                          onChange={(e) => setConfirmPayMethod(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white"
                        >
                          <option value="Cash">Cash</option>
                          <option value="Credit Card">Credit Card</option>
                          <option value="Mobile Money">Mobile Money</option>
                          <option value="Room Charge">Room Charge</option>
                        </select>
                        <button
                          onClick={() => handleQuickPayAndComplete(ord.id)}
                          disabled={submittingQuickPay}
                          className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[10px] rounded-lg shadow transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {submittingQuickPay ? '...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmPayOrderId(null)}
                          className="px-1.5 py-1 text-slate-400 hover:text-white"
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setConfirmPayOrderId(ord.id); setConfirmPayMethod('Cash'); }}
                        className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs rounded-xl flex items-center gap-1 ml-auto"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Pay
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Order Modal */}
      <OrderEditModal
        order={editingOrder}
        isOpen={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        onOrderUpdated={fetchOrders}
      />

      {/* Full-Screen Bill / Receipt */}
      {selectedReceiptOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
          {/* Top Bar */}
          <div className="no-print flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <Receipt className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white">
                Bill — Order #{selectedReceiptOrder.order_number}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadBill}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Download Bill
              </button>
              {canConfirmPayment && selectedReceiptOrder.payment_status !== 'Paid' && (
                <button
                  onClick={() => handleSettlePayment(selectedReceiptOrder.id)}
                  disabled={submittingPayment}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  {submittingPayment ? 'Processing...' : 'Pay & Complete'}
                </button>
              )}
              <button
                onClick={() => setSelectedReceiptOrder(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5" /> Close
              </button>
            </div>
          </div>

          {/* Scrollable Paper Area */}
          <div className="flex-1 overflow-y-auto flex justify-center py-4 px-4">
            <div
              id="printable-receipt"
              className="bg-white text-gray-900 w-full max-w-full sm:max-w-[520px] rounded-lg shadow-2xl p-6 print:shadow-none print:rounded-none print:p-0 print:max-w-none"
              style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
            >
              {/* Header */}
              <div className="text-center border-b-2 border-gray-900 pb-3 mb-3">
                <h1 className="text-lg font-bold tracking-widest text-gray-900 uppercase">
                  {getSetting('site_title', 'Grand Horizon Motel & Bistro')}
                </h1>
                <p className="text-[10px] text-gray-500 mt-0.5 tracking-wide">
                  Guest Food & Beverage Receipt
                </p>
                <div className="mt-2 flex justify-center gap-4 text-[10px] text-gray-600">
                  <span>
                    Order <strong className="text-gray-900 font-mono">#{selectedReceiptOrder.order_number}</strong>
                  </span>
                  <span>{formatDateTimeCAT(selectedReceiptOrder.created_at)}</span>
                </div>
              </div>

              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] mb-3 pb-3 border-b border-gray-200">
                <div className="flex justify-between">
                  <span className="text-gray-500">Destination</span>
                  <span className="font-bold text-gray-900">
                    {selectedReceiptOrder.order_type === 'Table'
                      ? `Table #${selectedReceiptOrder.table_number}`
                      : selectedReceiptOrder.order_type === 'Room Service'
                      ? `Room Service #${selectedReceiptOrder.room_number}`
                      : selectedReceiptOrder.order_type}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Guest</span>
                  <span className="font-bold text-gray-900">
                    {selectedReceiptOrder.guest_name || 'Walk-in Guest'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Served By</span>
                  <span className="font-semibold text-gray-700">{selectedReceiptOrder.waiter_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment Status</span>
                  <span
                    className={`font-bold ${
                      selectedReceiptOrder.payment_status === 'Paid'
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {selectedReceiptOrder.payment_status === 'Paid' ? '✓ PAID' : 'UNPAID'}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-3">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-900">
                      <th className="text-left py-1 font-bold text-gray-900 w-6">#</th>
                      <th className="text-left py-1 font-bold text-gray-900">Item</th>
                      {selectedReceiptOrder.items?.some((it) => it.special_notes) && (
                        <th className="text-left py-1 font-bold text-gray-900 w-28">Notes</th>
                      )}
                      <th className="text-center py-1 font-bold text-gray-900 w-10">Qty</th>
                      <th className="text-right py-1 font-bold text-gray-900 w-20">Price</th>
                      <th className="text-right py-1 font-bold text-gray-900 w-20">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReceiptOrder.items?.map((it, idx) => (
                      <tr key={it.id} className="border-b border-gray-100">
                        <td className="py-1 text-gray-400 font-mono">{idx + 1}</td>
                        <td className="py-1 font-semibold text-gray-900">{it.menu_item_name}</td>
                        {selectedReceiptOrder.items?.some((i) => i.special_notes) && (
                          <td className="py-1 text-gray-500 italic text-[9px]">
                            {it.special_notes || ''}
                          </td>
                        )}
                        <td className="py-1 text-center text-gray-700 font-mono">{it.quantity}</td>
                        <td className="py-1 text-right text-gray-700 font-mono">
                          {formatCurrency(it.unit_price)}
                        </td>
                        <td className="py-1 text-right text-gray-900 font-mono font-bold">
                          {formatCurrency(it.total_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Section */}
              <div className="flex justify-end mb-3">
                <div className="w-56 text-[10px]">
                  <div className="flex justify-between py-1 text-gray-500">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCurrency(selectedReceiptOrder.subtotal)}</span>
                  </div>
                  {selectedReceiptOrder.discount > 0 && (
                    <div className="flex justify-between py-1 text-emerald-600">
                      <span>Discount</span>
                      <span className="font-mono">-{formatCurrency(selectedReceiptOrder.discount)}</span>
                    </div>
                  )}
                  {selectedReceiptOrder.tax > 0 && (
                    <div className="flex justify-between py-1 text-gray-500">
                      <span>Tax (18%)</span>
                      <span className="font-mono">{formatCurrency(selectedReceiptOrder.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-t-2 border-gray-900 mt-1">
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">Total Due</span>
                    <span className="text-sm font-bold text-gray-900 font-mono">
                      {formatCurrency(selectedReceiptOrder.total_amount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment section inline if unpaid — hidden for view-only bartenders */}
              {canConfirmPayment && selectedReceiptOrder.payment_status !== 'Paid' && (
                <div className="no-print border-2 border-dashed border-amber-400 rounded-lg p-4 bg-amber-50 mb-3">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
                    Payment Required
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Mobile Money">Mobile Money (MTN/Airtel)</option>
                      <option value="Room Charge">Bill to Room Folio</option>
                    </select>
                    <button
                      onClick={() => handleSettlePayment(selectedReceiptOrder.id)}
                      disabled={submittingPayment}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow transition-transform active:scale-95 disabled:opacity-50"
                    >
                      {submittingPayment ? 'Processing...' : 'Pay & Complete'}
                    </button>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="text-center border-t-2 border-gray-900 pt-2 mt-1">
                <p className="text-[9px] text-gray-400 tracking-widest uppercase">
                  Thank you for dining with us
                </p>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  {getSetting('site_title', 'Grand Horizon Motel & Bistro')} — {getSetting('site_location', 'Kigali, Rwanda')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty All Order History — admin only, typed confirmation */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" /> Empty All Order History
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              This permanently deletes <strong className="text-rose-300">{orders.length} order{orders.length === 1 ? '' : 's'}</strong> and cannot be undone.
            </p>

            <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-1.5">
              <p className="text-[11px] font-bold text-rose-300 uppercase tracking-wider">What gets removed</p>
              <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                <li>All {orders.length} orders and their line items</li>
                <li>Every payment recorded against those orders</li>
              </ul>
              <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider pt-1.5">What is kept</p>
              <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                <li>On-hand stock levels — only reservations are released</li>
                <li>Menu, guests, rooms and room folios</li>
              </ul>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Type <span className="font-mono font-black text-rose-300">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={clearAllText}
                onChange={(e) => setClearAllText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && clearAllText.trim().toUpperCase() === 'DELETE') handleConfirmClearAll(); }}
                placeholder="DELETE"
                autoFocus
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white tracking-widest placeholder:text-slate-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => { setShowClearAllModal(false); setClearAllText(''); }}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                disabled={clearingAll || clearAllText.trim().toUpperCase() !== 'DELETE'}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {clearingAll ? 'Deleting...' : `Delete ${orders.length} Order${orders.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
