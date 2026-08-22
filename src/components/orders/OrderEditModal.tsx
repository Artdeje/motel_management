import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Order, MenuItem, MenuCategory, Room } from '../../types';
import {
  X,
  Plus,
  Minus,
  Trash2,
  Search,
  AlertTriangle,
  Save,
  Utensils,
  Clock,
  CheckCircle2,
  BedDouble,
  Receipt,
  Flame,
  Lock
} from 'lucide-react';
import { formatCurrency, CURRENCY_SYMBOL } from '../../utils/currency';
import { formatTimeCAT } from '../../utils/dates';

interface OrderEditModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: () => void;
}

interface EditableCartItem {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  special_notes: string;
  available_servings?: number;
}

export const OrderEditModal: React.FC<OrderEditModalProps> = ({
  order,
  isOpen,
  onClose,
  onOrderUpdated,
}) => {
  const { success, error, warning } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // Editable form state
  const [orderType, setOrderType] = useState<'Table' | 'Room Service' | 'Bar Takeaway'>('Table');
  const [tableNumber, setTableNumber] = useState('1');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [cartItems, setCartItems] = useState<EditableCartItem[]>([]);
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');

  // Catalog search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    if (isOpen && order) {
      loadInitialData();
      initializeForm(order);
    }
  }, [isOpen, order]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [menuRes, roomsRes] = await Promise.all([
        api.getMenuItems(),
        api.getRooms(),
      ]);
      setMenuItems(menuRes.items || []);
      setCategories(menuRes.categories || []);
      setRooms(roomsRes.rooms || []);
    } catch (err: any) {
      error('Failed to load menu items', err.message);
    } finally {
      setLoading(false);
    }
  };

  const initializeForm = (ord: Order) => {
    setOrderType(ord.order_type as any || 'Table');
    setTableNumber(ord.table_number || '1');
    setSelectedRoomId(ord.room_id || '');
    setDiscount(ord.discount?.toString() || '0');
    setNotes(ord.notes || '');

    // Map existing items
    const mapped: EditableCartItem[] = (ord.items || []).map((it) => ({
      menu_item_id: it.menu_item_id,
      name: it.menu_item_name,
      price: it.unit_price,
      quantity: it.quantity,
      special_notes: it.special_notes || '',
    }));
    setCartItems(mapped);
  };

  if (!isOpen || !order) return null;

  // Cooking status validation: Only editable if cooking hasn't started
  const isCookingStarted = !['Pending', 'Confirmed'].includes(order.status);

  const handleAddItem = (item: MenuItem) => {
    if (isCookingStarted) return;

    if (!item.can_order) {
      return warning('Item Unavailable', item.effective_reason || 'Out of stock');
    }

    const availableLimit = item.available_servings || 999;
    const existingIndex = cartItems.findIndex((c) => c.menu_item_id === item.id);

    if (existingIndex > -1) {
      const currentQty = cartItems[existingIndex].quantity;
      if (currentQty + 1 > availableLimit) {
        return warning(
          'Maximum Stock Limit',
          `Only ${availableLimit} portion(s) of "${item.name}" can be prepared with available inventory.`
        );
      }
      const updated = [...cartItems];
      updated[existingIndex].quantity += 1;
      setCartItems(updated);
    } else {
      if (availableLimit < 1) {
        return warning('Insufficient Stock', 'Cannot prepare item due to ingredient shortage.');
      }
      setCartItems([
        ...cartItems,
        {
          menu_item_id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          special_notes: '',
          available_servings: item.available_servings,
        },
      ]);
    }
  };

  const handleUpdateQty = (index: number, delta: number) => {
    if (isCookingStarted) return;

    const updated = [...cartItems];
    const item = updated[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      const menuItem = menuItems.find((m) => m.id === item.menu_item_id);
      const availableLimit = menuItem?.available_servings || 999;
      if (newQty > availableLimit) {
        return warning('Stock Limit', `Only ${availableLimit} portions available.`);
      }
      item.quantity = newQty;
    }
    setCartItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    if (isCookingStarted) return;
    const updated = [...cartItems];
    updated.splice(index, 1);
    setCartItems(updated);
  };

  const handleUpdateNotes = (index: number, val: string) => {
    if (isCookingStarted) return;
    const updated = [...cartItems];
    updated[index].special_notes = val;
    setCartItems(updated);
  };

  const subtotal = cartItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const parsedDiscount = parseFloat(discount || '0') || 0;
  const totalAmount = Math.max(0, subtotal - parsedDiscount);

  const handleSaveChanges = async () => {
    if (isCookingStarted) {
      return error('Editing Locked', 'Cannot edit this order because kitchen has already started cooking.');
    }

    if (cartItems.length === 0) {
      return error('Empty Order', 'Order must contain at least one item.');
    }

    if (orderType === 'Table' && !tableNumber) {
      return error('Table Required', 'Please provide a valid table number.');
    }

    if (orderType === 'Room Service' && !selectedRoomId) {
      return error('Room Required', 'Please select a room for room service delivery.');
    }

    let occupantGuestId: string | undefined;
    if (orderType === 'Room Service' && selectedRoomId) {
      const room = rooms.find((r) => r.id === selectedRoomId);
      occupantGuestId = room?.current_occupant_id || undefined;
    }

    setSaving(true);
    try {
      const payload = {
        order_type: orderType,
        table_number: orderType === 'Table' ? tableNumber : null,
        room_id: orderType === 'Room Service' ? selectedRoomId : null,
        guest_id: occupantGuestId || null,
        discount: parsedDiscount,
        notes: notes || null,
        items: cartItems.map((c) => ({
          menu_item_id: c.menu_item_id,
          quantity: c.quantity,
          special_notes: c.special_notes || null,
        })),
      };

      await api.updateOrder(order.id, payload);
      success('Order Updated Successfully!', `Order #${order.order_number} was modified and kitchen stock recalculated.`);
      onOrderUpdated();
      onClose();
    } catch (err: any) {
      error('Failed to Update Order', err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredMenuItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const occupiedRooms = rooms.filter((r) => r.status === 'Occupied');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-full sm:max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Edit Order #{order.order_number}</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    order.status === 'Pending'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      : order.status === 'Confirmed'
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {order.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Waiter: <strong className="text-slate-300">{order.waiter_name}</strong> • Placed at{' '}
                {formatTimeCAT(order.created_at)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lock Warning if Cooking Already Started */}
        {isCookingStarted ? (
          <div className="p-4 bg-rose-950/40 border-b border-rose-500/30 flex items-center gap-3 text-xs text-rose-300">
            <div className="p-2 bg-rose-500/20 rounded-xl text-rose-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-rose-200">
                Order Locked: Kitchen Preparation In Progress (Status: {order.status})
              </p>
              <p className="text-[11px] text-rose-300/80">
                Orders can only be modified before cooking begins. The chef has already started preparing this ticket.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-amber-950/30 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-300 px-5">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Pre-Cooking Modification Window Active — Stock reservations will update automatically upon saving.
            </span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Items & Details (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Destination Selector */}
            <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-3">
              <label className="text-xs font-bold text-slate-200 block">Order Destination:</label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isCookingStarted}
                  onClick={() => setOrderType('Table')}
                  className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    orderType === 'Table'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
                      : 'bg-slate-900/80 text-slate-300 hover:bg-slate-900'
                  } disabled:opacity-50`}
                >
                  Table Service
                </button>
                <button
                  type="button"
                  disabled={isCookingStarted}
                  onClick={() => setOrderType('Room Service')}
                  className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    orderType === 'Room Service'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
                      : 'bg-slate-900/80 text-slate-300 hover:bg-slate-900'
                  } disabled:opacity-50`}
                >
                  Room Service
                </button>
              </div>

              {orderType === 'Table' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold shrink-0">Table:</span>
                  <select
                    disabled={isCookingStarted}
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                      <option key={num} value={num}>
                        Table #{num} (Bistro / Patio)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold shrink-0">Room:</span>
                  <select
                    disabled={isCookingStarted}
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    <option value="">Select occupied room...</option>
                    {occupiedRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.room_number} - {r.occupant_name || 'Guest'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Order Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-amber-400" />
                  Order Dishes & Drinks ({cartItems.length})
                </span>
                <span className="text-[11px] text-slate-400">Modify quantities or add special instructions</span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {cartItems.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs rounded-2xl bg-slate-800/30 border border-slate-800">
                    No items in this order. Choose dishes from the catalog on the right.
                  </div>
                ) : (
                  cartItems.map((item, idx) => (
                    <div
                      key={`${item.menu_item_id}-${idx}`}
                      className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-bold text-white">{item.name}</p>
                          <p className="text-[10px] text-amber-400 font-mono">
                            {formatCurrency(item.price)} each
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold font-mono text-slate-200">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                          {!isCookingStarted && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-700 transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Controls & Special Note Input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          disabled={isCookingStarted}
                          placeholder="Special note (e.g. well-done, extra dressing, no salt)..."
                          value={item.special_notes}
                          onChange={(e) => handleUpdateNotes(idx, e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 disabled:opacity-50"
                        />

                        <div className="flex items-center gap-1.5 bg-slate-900 rounded-xl p-0.5 border border-slate-700">
                          <button
                            type="button"
                            disabled={isCookingStarted}
                            onClick={() => handleUpdateQty(idx, -1)}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-50"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-xs font-bold text-white font-mono">{item.quantity}</span>
                          <button
                            type="button"
                            disabled={isCookingStarted}
                            onClick={() => handleUpdateQty(idx, 1)}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* General Order Notes & Discount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  General Order Notes:
                </label>
                <input
                  type="text"
                  disabled={isCookingStarted}
                  placeholder="e.g. VIP guest, urgent preparation..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Discount ({CURRENCY_SYMBOL}):
                </label>
                <input
                  type="number"
                  disabled={isCookingStarted}
                  min="0"
                  step="0.5"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white text-right disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Menu Catalog Quick Add (5 cols) */}
          <div className="lg:col-span-5 flex flex-col bg-slate-950/60 rounded-2xl border border-slate-800 p-3.5">
            <span className="text-xs font-bold text-white block mb-2">
              Add More Items to Order:
            </span>

            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                disabled={isCookingStarted}
                placeholder="Search dish or beverage..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 disabled:opacity-50"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-850 text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === c.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-850 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Catalog Items List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-64 pr-1">
              {filteredMenuItems.map((item) => {
                const canOrder = item.can_order;
                const servings = item.available_servings || 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => !isCookingStarted && canOrder && handleAddItem(item)}
                    className={`p-2 rounded-xl border transition-all flex items-center justify-between text-xs select-none ${
                      isCookingStarted || !canOrder
                        ? 'bg-slate-900/40 border-slate-800 opacity-50 cursor-not-allowed'
                        : 'bg-slate-900/80 border-slate-800/80 hover:border-amber-500/50 hover:bg-slate-850 cursor-pointer active:scale-98'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-white truncate text-xs">{item.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-amber-400 font-mono">
                          {formatCurrency(item.price)}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                            canOrder ? 'text-emerald-300 bg-emerald-500/10' : 'text-rose-300 bg-rose-500/10'
                          }`}
                        >
                          {canOrder ? `${servings} left` : 'Out of stock'}
                        </span>
                      </div>
                    </div>

                    {!isCookingStarted && canOrder && (
                      <button
                        type="button"
                        className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-slate-950 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Summary & Action Buttons */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-400">Subtotal:</span>{' '}
              <strong className="text-slate-200 font-mono">{formatCurrency(subtotal)}</strong>
            </div>
            {parsedDiscount > 0 && (
              <div>
                <span className="text-emerald-400">Discount:</span>{' '}
                <strong className="text-emerald-400 font-mono">-{formatCurrency(parsedDiscount)}</strong>
              </div>
            )}
            <div>
              <span className="text-slate-400">New Total:</span>{' '}
              <strong className="text-amber-400 text-sm font-mono font-bold">{formatCurrency(totalAmount)}</strong>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>

            {!isCookingStarted && (
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={saving || cartItems.length === 0}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Updating & Recalculating Stock...' : 'Save Order Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
