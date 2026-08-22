import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { MenuItem, MenuCategory, Room } from '../../types';
import {
  ConciergeBell,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { formatCurrency, CURRENCY_SYMBOL } from '../../utils/currency';

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  specialNotes: string;
}

export const WaiterPOS: React.FC = () => {
  const { success, error, warning } = useToast();
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<'Table' | 'Room Service'>('Table');
  const [tableNumber, setTableNumber] = useState('1');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPosData = async () => {
    try {
      setLoading(true);
      const [menuRes, roomRes] = await Promise.all([api.getMenuItems(), api.getRooms()]);
      setMenuItems(menuRes.items || []);
      setCategories(menuRes.categories || []);
      setRooms(roomRes.rooms || []);
    } catch (err: any) {
      error('Failed to load menu data', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosData();
  }, []);

  const handleAddToCart = (item: MenuItem) => {
    if (!item.can_order) {
      return warning('Item Unavailable', item.effective_reason || 'Out of stock');
    }

    const availableLimit = item.available_servings || 0;
    const existingIndex = cart.findIndex((c) => c.menuItem.id === item.id);

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (currentQty + 1 > availableLimit) {
        return warning(
          'Maximum Stock Limit Reached',
          `Only ${availableLimit} serving(s) of "${item.name}" can be prepared with available inventory.`
        );
      }
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      if (availableLimit < 1) {
        return warning('Insufficient Stock', 'Cannot prepare item due to ingredient shortage.');
      }
      setCart([...cart, { menuItem: item, quantity: 1, specialNotes: '' }]);
    }
  };

  const handleUpdateQty = (index: number, delta: number) => {
    const updated = [...cart];
    const item = updated[index];
    const newQty = item.quantity + delta;
    const availableLimit = item.menuItem.available_servings || 999;

    if (newQty <= 0) {
      updated.splice(index, 1);
    } else if (newQty > availableLimit) {
      return warning('Stock Limit', `Only ${availableLimit} portions available.`);
    } else {
      item.quantity = newQty;
    }
    setCart(updated);
  };

  const handleUpdateNotes = (index: number, notes: string) => {
    const updated = [...cart];
    updated[index].specialNotes = notes;
    setCart(updated);
  };

  const handleRemoveFromCart = (index: number) => {
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.menuItem.price * item.quantity, 0);
  const disc = parseFloat(discount || '0') || 0;
  const totalAmount = Math.max(0, subtotal - disc);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      return error('Your cart is empty', 'Add menu items to place an order.');
    }

    if (orderType === 'Table' && !tableNumber) {
      return error('Table Number Required', 'Please enter or select a table number.');
    }

    if (orderType === 'Room Service' && !selectedRoomId) {
      return error('Room Selection Required', 'Please select a room for room service.');
    }

    let occupantGuestId: string | undefined;
    if (orderType === 'Room Service' && selectedRoomId) {
      const room = rooms.find((r) => r.id === selectedRoomId);
      occupantGuestId = room?.current_occupant_id || undefined;
    }

    setSubmitting(true);
    try {
      const payload = {
        order_type: orderType,
        table_number: orderType === 'Table' ? tableNumber : null,
        room_id: orderType === 'Room Service' ? selectedRoomId : null,
        guest_id: occupantGuestId || null,
        payment_status: 'Unpaid',
        discount: disc,
        notes: orderNotes || null,
        items: cart.map((c) => ({
          menu_item_id: c.menuItem.id,
          quantity: c.quantity,
          special_notes: c.specialNotes || null,
        })),
      };

      const res = await api.createOrder(payload);
      success('Order Placed Successfully!', `Order #${res.order_number} has been sent to the Kitchen Chef.`);
      setCart([]);
      setOrderNotes('');
      setDiscount('0');
      fetchPosData();
    } catch (err: any) {
      error('Order Failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const occupiedRooms = rooms.filter((r) => r.status === 'Occupied');

  const CartContent = () => (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Order Destination Toggle */}
      <div className="pb-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            Active Order Ticket
          </h3>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
            >
              Clear
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800 rounded-xl">
          <button
            onClick={() => setOrderType('Table')}
            className={`py-2 rounded-lg text-xs font-semibold transition-all ${
              orderType === 'Table'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Table Service
          </button>
          <button
            onClick={() => setOrderType('Room Service')}
            className={`py-2 rounded-lg text-xs font-semibold transition-all ${
              orderType === 'Room Service'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Room Service
          </button>
        </div>

        <div className="mt-3">
          {orderType === 'Table' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 font-semibold shrink-0">Table:</span>
              <select
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
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
              <span className="text-xs text-slate-300 font-semibold shrink-0">Room:</span>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">Select occupied room...</option>
                {occupiedRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.room_number} - {r.occupant_name || 'Guest'}
                  </option>
                ))}
                {occupiedRooms.length === 0 && (
                  <option value="" disabled>
                    No rooms currently occupied
                  </option>
                )}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Cart Items List */}
      <div className="py-3 space-y-2.5 flex-1 overflow-y-auto pos-scroll">
        {cart.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs">
            <ConciergeBell className="w-7 h-7 mx-auto mb-2 text-slate-600" />
            Tap menu items to add to order ticket.
          </div>
        ) : (
          cart.map((item, index) => (
            <div
              key={item.menuItem.id}
              className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 pr-2">
                  <p className="font-semibold text-white truncate">{item.menuItem.name}</p>
                  <p className="text-[10px] text-amber-400">
                    {formatCurrency(item.menuItem.price)} each
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-white">
                    {formatCurrency(item.menuItem.price * item.quantity)}
                  </span>
                  <button
                    onClick={() => handleRemoveFromCart(index)}
                    className="p-1 text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  type="text"
                  placeholder="Special note..."
                  value={item.specialNotes}
                  onChange={(e) => handleUpdateNotes(index, e.target.value)}
                  className="flex-1 bg-slate-900/80 border border-slate-700/60 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500"
                />

                <div className="flex items-center gap-1.5 bg-slate-900 rounded-lg p-0.5 border border-slate-700/60">
                  <button
                    onClick={() => handleUpdateQty(index, -1)}
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 font-bold text-white text-xs">{item.quantity}</span>
                  <button
                    onClick={() => handleUpdateQty(index, 1)}
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart Footer Summary & Submit */}
      <div className="pt-3 border-t border-slate-800 space-y-2 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Subtotal</span>
          <span className="text-slate-200 font-semibold">{formatCurrency(subtotal)}</span>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Discount ({CURRENCY_SYMBOL})</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-right text-xs text-white"
          />
        </div>

        <div className="flex items-center justify-between text-sm font-bold text-white pt-2 border-t border-slate-800/80">
          <span>Total Payable</span>
          <span className="text-amber-400 font-mono text-base">{formatCurrency(totalAmount)}</span>
        </div>

        <button
          onClick={handlePlaceOrder}
          disabled={submitting || cart.length === 0}
          className="w-full mt-2 py-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-amber-500/25 transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          {submitting ? 'Placing...' : 'Confirm & Place Order'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* ========== MENU PANEL ========== */}
      <div className="flex-1 min-h-0 h-full bg-slate-900/60 rounded-none lg:rounded-2xl border-0 lg:border border-slate-800 flex flex-col overflow-hidden">
        {/* Search & Refresh Bar */}
        <div className="flex items-center gap-2 p-3 border-b border-slate-800 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search dishes, drinks, appetizers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
          <button
            onClick={fetchPosData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors shrink-0"
            title="Refresh Menu & Live Stock"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 overflow-x-auto no-scrollbar border-b border-slate-800/80 shrink-0">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            All Items ({menuItems.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Items Grid */}
        <div className="p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto pos-scroll">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
              Loading menu...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
              No items found
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredItems.map((item) => {
                const isAvailable = item.can_order;
                const servings = item.available_servings || 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => isAvailable && handleAddToCart(item)}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between select-none ${
                      isAvailable
                        ? 'bg-slate-800/70 border-slate-700/80 hover:border-amber-500/50 hover:bg-slate-800 cursor-pointer active:scale-[0.98]'
                        : 'bg-slate-900/50 border-slate-800/60 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-bold text-white leading-tight">{item.name}</h4>
                        <span className="text-sm font-bold text-amber-400 shrink-0">
                          {formatCurrency(item.price)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1.5 leading-snug">
                        {item.description || 'Prepared fresh in the motel bistro kitchen.'}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {isAvailable ? (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              servings <= 3
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {servings} portions left
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {item.effective_reason || 'Unavailable'}
                          </span>
                        )}
                      </div>

                      {isAvailable && (
                        <button
                          type="button"
                          className="p-2.5 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========== ACTIVE ORDER TICKET CARD ========== */}
      <div className="w-full lg:w-96 flex-1 min-h-0 lg:h-full shrink-0 flex flex-col bg-slate-900/60 rounded-none lg:rounded-2xl border-0 lg:border border-slate-800 overflow-hidden lg:ml-4 p-3 sm:p-4 lg:p-4">
        <CartContent />
      </div>
    </div>
  );
};
