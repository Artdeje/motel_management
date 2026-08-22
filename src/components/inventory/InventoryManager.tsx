import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem, StockRequest } from '../../types';
import {
  Boxes,
  Search,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  Filter,
  FileCheck,
  RefreshCw,
  Layers,
  DollarSign,
  Pencil,
  Trash2
} from 'lucide-react';
import { formatCurrency, CURRENCY_SYMBOL } from '../../utils/currency';
import { formatDateTimeCAT } from '../../utils/dates';

export const InventoryManager: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'items' | 'lowStock' | 'requests' | 'transactions'>('items');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stockRequests, setStockRequests] = useState<StockRequest[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');

  // Add/Edit Item Modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({
    sku: '',
    name: '',
    category_id: '',
    department: 'General',
    unit: '',
    current_quantity: '0',
    minimum_quantity: '5',
    reorder_quantity: '20',
    unit_cost: '0',
    supplier_id: '',
    storage_location: '',
  });

  // Modals
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedItemForAdjust, setSelectedItemForAdjust] = useState<InventoryItem | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    transaction_type: 'Purchase',
    quantity: '',
    unit_cost: '',
    notes: '',
  });

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    department: 'Kitchen',
    priority: 'Normal',
    reason: '',
    items: [{ item_id: '', quantity_requested: '1', unit: 'units' }],
  });

  const [submitting, setSubmitting] = useState(false);

  const generateSku = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    const base = (cat?.name || 'STK').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 3) || 'STK';
    return `${base}-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  };

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const [invRes, reqRes, txnRes] = await Promise.all([
        api.getInventoryItems(),
        api.getStockRequests(),
        api.getInventoryTransactions(),
      ]);
      setItems(invRes.items || []);
      setCategories(invRes.categories || []);
      setSuppliers(invRes.suppliers || []);
      setStockRequests(reqRes.requests || []);
      setTransactions(txnRes.transactions || []);
    } catch (err: any) {
      error('Failed to load inventory', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleOpenAdjust = (item: InventoryItem) => {
    setSelectedItemForAdjust(item);
    setAdjustForm({
      transaction_type: 'Purchase',
      quantity: '10',
      unit_cost: String(item.unit_cost),
      notes: 'Supplier stock replenishment',
    });
    setShowAdjustModal(true);
  };

  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForAdjust) return;

    setSubmitting(true);
    try {
      await api.adjustStock({
        item_id: selectedItemForAdjust.id,
        transaction_type: adjustForm.transaction_type,
        quantity: parseFloat(adjustForm.quantity),
        unit_cost: parseFloat(adjustForm.unit_cost || '0'),
        notes: adjustForm.notes,
      });
      success('Inventory Updated Successfully');
      setShowAdjustModal(false);
      fetchInventory();
    } catch (err: any) {
      error('Stock adjustment failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAddItem = () => {
    setEditingItem(null);
    setItemForm({
      sku: generateSku(categories[0]?.id || ''),
      name: '',
      category_id: categories[0]?.id || '',
      department: 'General',
      unit: 'units',
      current_quantity: '0',
      minimum_quantity: '5',
      reorder_quantity: '20',
      unit_cost: '0',
      supplier_id: suppliers[0]?.id || '',
      storage_location: '',
    });
    setShowItemModal(true);
  };

  const handleOpenEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setItemForm({
      sku: item.sku,
      name: item.name,
      category_id: item.category_id,
      department: item.department || 'General',
      unit: item.unit,
      current_quantity: String(item.current_quantity),
      minimum_quantity: String(item.minimum_quantity),
      reorder_quantity: String(item.reorder_quantity),
      unit_cost: String(item.unit_cost),
      supplier_id: item.supplier_id || '',
      storage_location: item.storage_location || '',
    });
    setShowItemModal(true);
  };

  const handleConfirmItemSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.sku.trim() || !itemForm.name.trim() || !itemForm.category_id || !itemForm.unit.trim()) {
      return error('SKU, name, category and unit are required');
    }

    setSubmitting(true);
    try {
      const payload = {
        sku: itemForm.sku.trim(),
        name: itemForm.name.trim(),
        category_id: itemForm.category_id,
        department: itemForm.department,
        unit: itemForm.unit.trim(),
        current_quantity: parseFloat(itemForm.current_quantity || '0'),
        minimum_quantity: parseFloat(itemForm.minimum_quantity || '5'),
        reorder_quantity: parseFloat(itemForm.reorder_quantity || '20'),
        unit_cost: parseFloat(itemForm.unit_cost || '0'),
        supplier_id: itemForm.supplier_id || null,
        storage_location: itemForm.storage_location || null,
      };

      if (editingItem) {
        await api.updateInventoryItem(editingItem.id, payload);
        success('Item Updated', `Stock item "${payload.name}" updated successfully`);
      } else {
        await api.createInventoryItem(payload);
        success('Item Added', `New stock item "${payload.name}" created successfully`);
      }
      setShowItemModal(false);
      fetchInventory();
    } catch (err: any) {
      error(editingItem ? 'Item update failed' : 'Failed to add item', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!window.confirm(`Remove "${item.name}" (${item.sku}) from stock? This cannot be undone.`)) return;
    try {
      await api.deleteInventoryItem(item.id);
      success('Item Removed', `"${item.name}" removed from stock`);
      fetchInventory();
    } catch (err: any) {
      error('Failed to remove item', err.message);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      await api.updateStockRequestStatus(requestId, { status: 'Approved' });
      success('Stock Request Approved & Stock Issued');
      fetchInventory();
    } catch (err: any) {
      error('Approval failed', err.message);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    const reason = window.prompt('Enter rejection reason:');
    if (reason === null) return;
    try {
      await api.updateStockRequestStatus(requestId, { status: 'Rejected', rejection_reason: reason });
      success('Stock Request Rejected');
      fetchInventory();
    } catch (err: any) {
      error('Rejection failed', err.message);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.items[0].item_id) return error('Please select an item');

    setSubmitting(true);
    try {
      await api.createStockRequest(requestForm);
      success('Stock Request Submitted to Management');
      setShowRequestModal(false);
      fetchInventory();
    } catch (err: any) {
      error('Failed to submit request', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const lowStockItems = items.filter((it) => (it.available_quantity || 0) <= it.minimum_quantity);

  const filteredItems = items.filter((it) => {
    const matchDept = selectedDepartment === 'all' || it.department === selectedDepartment;
    const matchCat = selectedCategory === 'all' || it.category_id === selectedCategory;
    const matchSearch =
      it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      it.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchDept && matchCat && matchSearch;
  });

  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const canEditItem = (it: InventoryItem) => {
    if (canManage) return true;
    if (user?.role === 'chef' && it.department === 'Kitchen') return true;
    if (user?.role === 'housekeeper' && it.department === 'Housekeeping') return true;
    if (user?.role === 'waiter' && it.department === 'Bar') return true;
    return false;
  };
  const canDeleteItem = (it: InventoryItem) => {
    if (user?.role === 'admin' || user?.role === 'manager') return true;
    if (user?.role === 'chef' && it.department === 'Kitchen') return true;
    if (user?.role === 'housekeeper' && it.department === 'Housekeeping') return true;
    return false;
  };
  const canReceiveStock = (it: InventoryItem) => {
    if (user?.role === 'admin' || user?.role === 'manager') return true;
    if (user?.role === 'chef' && it.department === 'Kitchen') return true;
    if (user?.role === 'housekeeper' && it.department === 'Housekeeping') return true;
    if (user?.role === 'waiter' && it.department === 'Bar') return true;
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Motel Inventory & Supply Restocking</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live stock levels, reserved order quantities, automated food cost valuation & supply request approvals.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {user?.role === 'admin' || user?.role === 'manager' && (
            <button
              onClick={handleOpenAddItem}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          )}
          <button
            onClick={() => setShowRequestModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Request Stock
          </button>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('items')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'items'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          All Inventory Items ({items.length})
        </button>

        <button
          onClick={() => setActiveTab('lowStock')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'lowStock'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          Low Stock Alerts ({lowStockItems.length})
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'requests'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          Department Supply Requests ({stockRequests.length})
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'transactions'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Stock Audit Ledger
        </button>
      </div>

      {/* TAB 1: ALL INVENTORY ITEMS */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by SKU or item name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto no-scrollbar">
              <button
                onClick={() => setSelectedDepartment('all')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedDepartment === 'all'
                    ? 'bg-teal-500 text-white font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All Departments
              </button>
              {['Kitchen', 'Bar', 'Housekeeping', 'Manager'].map((dept) => (
                <button
                  key={dept}
                  onClick={() => setSelectedDepartment(dept)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedDepartment === dept
                      ? 'bg-teal-500 text-white font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All Categories
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === c.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                  <tr>
                    <th className="p-3.5">SKU / Item</th>
                    <th className="p-3.5">Department</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Total Physical</th>
                    <th className="p-3.5">Reserved (Orders)</th>
                    <th className="p-3.5">Net Available</th>
                    <th className="p-3.5">Unit Cost</th>
                    <th className="p-3.5">Total Valuation</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {filteredItems.map((it) => {
                    const isLow = (it.available_quantity || 0) <= it.minimum_quantity;
                    const valuation = it.current_quantity * it.unit_cost;

                    return (
                      <tr key={it.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-3.5">
                          <p className="font-bold text-white">{it.name}</p>
                          <p className="text-[10px] font-mono text-amber-400">{it.sku}</p>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            it.department === 'Kitchen' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                            it.department === 'Bar' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                            it.department === 'Housekeeping' ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' :
                            it.department === 'Manager' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                            'bg-slate-500/20 text-slate-300 border-slate-500/30'
                          }`}>
                            {it.department || 'General'}
                          </span>
                        </td>
                        <td className="p-3.5">{it.category_name}</td>
                        <td className="p-3.5 font-bold text-white">
                          {it.current_quantity} {it.unit}
                        </td>
                        <td className="p-3.5 text-amber-400 font-medium">
                          {it.reserved_quantity || 0} {it.unit}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isLow
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {it.available_quantity} {it.unit} {isLow && '(LOW)'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">{formatCurrency(it.unit_cost)}</td>
                        <td className="p-3.5 font-mono font-bold text-white">{formatCurrency(valuation)}</td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canReceiveStock(it) && (
                              <button
                                onClick={() => handleOpenAdjust(it)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs rounded-lg border border-slate-700 transition-colors"
                                >
                                  Receive / Adjust
                                </button>
                            )}
                            {canEditItem(it) && (
                              <button
                                onClick={() => handleOpenEditItem(it)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg border border-slate-700 transition-colors"
                                title="Edit item"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDeleteItem(it) && (
                              <button
                                onClick={() => handleDeleteItem(it)}
                                className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-slate-700 transition-colors"
                                title="Remove item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOW STOCK ALERTS */}
      {activeTab === 'lowStock' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {lowStockItems.map((it) => (
            <div
              key={it.id}
              className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 shadow-xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                  <div>
                    <h4 className="text-sm font-bold text-white">{it.name}</h4>
                    <p className="text-[10px] font-mono text-amber-400">{it.sku}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Below Threshold
                  </span>
                </div>

                <div className="py-3 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-300">
                    <span>Available Stock:</span>
                    <span className="font-bold text-rose-400">
                      {it.available_quantity} {it.unit}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Minimum Par Level:</span>
                    <span className="font-semibold text-white">
                      {it.minimum_quantity} {it.unit}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Target Restock Qty:</span>
                    <span className="font-semibold text-emerald-400">
                      {it.optimal_quantity} {it.unit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end">
                {canReceiveStock(it) && (
                  <button
                    onClick={() => handleOpenAdjust(it)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95"
                  >
                    Receive Stock
                  </button>
                )}
              </div>
            </div>
          ))}
          {lowStockItems.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-500 text-xs bg-slate-900/60 rounded-2xl border border-slate-800">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              All inventory levels are healthy and above minimum safety thresholds.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEPARTMENT STOCK REQUESTS */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stockRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                    <div>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        #{req.request_number}
                      </span>
                      <h4 className="text-sm font-bold text-white">{req.department} Dept Request</h4>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        req.status === 'Approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : req.status === 'Pending'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  <div className="py-3 text-xs space-y-2">
                    <p className="text-slate-300">
                      Reason: <strong className="text-white">{req.reason || 'Restocking'}</strong>
                    </p>
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1">
                      {req.items?.map((it: any) => (
                        <div key={it.id} className="flex justify-between text-slate-300">
                          <span>{it.item_name}</span>
                          <span className="font-bold text-amber-400">
                            {it.quantity_requested} {it.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {req.status === 'Pending' && canManage && (
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleRejectRequest(req.id)}
                      className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold rounded-xl border border-rose-500/30 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproveRequest(req.id)}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl shadow transition-transform active:scale-95"
                    >
                      Approve & Issue
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LEDGER */}
      {activeTab === 'transactions' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="p-3.5">Date / Time</th>
                  <th className="p-3.5">Item</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Qty Change</th>
                  <th className="p-3.5">Unit Cost</th>
                  <th className="p-3.5">Actor</th>
                  <th className="p-3.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-3.5 text-slate-400">
                      {formatDateTimeCAT(txn.created_at)}
                    </td>
                    <td className="p-3.5 font-bold text-white">{txn.item_name}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">
                        {txn.transaction_type}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold">
                      <span
                        className={txn.quantity >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                      >
                        {txn.quantity > 0 ? `+${txn.quantity}` : txn.quantity}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono">{formatCurrency(txn.unit_cost)}</td>
                    <td className="p-3.5">{txn.user_name || 'System'}</td>
                    <td className="p-3.5 text-slate-400">{txn.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-full sm:max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-amber-400" />
              {editingItem ? `Edit Stock Item: ${editingItem.name}` : 'Add New Stock Item'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {editingItem ? 'Update the specifications of this stock item.' : 'Register a new item to be tracked in the motel stock.'}
            </p>

            <form onSubmit={handleConfirmItemSave} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">SKU (Auto-Generated)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Auto-generated ID"
                      value={itemForm.sku}
                      onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setItemForm({ ...itemForm, sku: generateSku(itemForm.category_id) })}
                      title="Regenerate SKU"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700 transition-colors shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Unit</label>
                  <input
                    type="text"
                    placeholder="e.g. kg, liters, portions"
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Item Name</label>
                <input
                  type="text"
                  placeholder="e.g. Fresh Chicken Breast"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={itemForm.category_id}
                    onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Department</label>
                  <select
                    value={itemForm.department}
                    onChange={(e) => setItemForm({ ...itemForm, department: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  >
                    <option value="Kitchen">Kitchen</option>
                    <option value="Bar">Bar</option>
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Manager">Manager</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Supplier</label>
                  <select
                    value={itemForm.supplier_id}
                    onChange={(e) => setItemForm({ ...itemForm, supplier_id: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">-- No supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Opening Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={itemForm.current_quantity}
                    onChange={(e) => setItemForm({ ...itemForm, current_quantity: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Unit Cost ({CURRENCY_SYMBOL})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.unit_cost}
                    onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Minimum Par Level</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={itemForm.minimum_quantity}
                    onChange={(e) => setItemForm({ ...itemForm, minimum_quantity: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Reorder Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={itemForm.reorder_quantity}
                    onChange={(e) => setItemForm({ ...itemForm, reorder_quantity: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Storage Location</label>
                <input
                  type="text"
                  placeholder="e.g. Cold Storage Freezer 1"
                  value={itemForm.storage_location}
                  onChange={(e) => setItemForm({ ...itemForm, storage_location: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {showAdjustModal && selectedItemForAdjust && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-amber-400" />
              Adjust Stock: {selectedItemForAdjust.name}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Current Available: {selectedItemForAdjust.available_quantity} {selectedItemForAdjust.unit}
            </p>

            <form onSubmit={handleConfirmAdjust} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Transaction Type</label>
                <select
                  value={adjustForm.transaction_type}
                  onChange={(e) => setAdjustForm({ ...adjustForm, transaction_type: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="Purchase">Purchase / Supplier Stock Receipt (+)</option>
                  <option value="Adjustment">Physical Audit Correction (+/-)</option>
                  <option value="Waste">Damaged / Expired / Waste (-)</option>
                  <option value="Usage">Manual Department Usage (-)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Quantity ({selectedItemForAdjust.unit})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={adjustForm.quantity}
                    onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Unit Cost ({CURRENCY_SYMBOL})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjustForm.unit_cost}
                    onChange={(e) => setAdjustForm({ ...adjustForm, unit_cost: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes / Invoice Ref</label>
                <input
                  type="text"
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Save Stock Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-400" />
              New Department Stock Request
            </h3>

            <form onSubmit={handleCreateRequest} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Department</label>
                  <select
                    value={requestForm.department}
                    onChange={(e) => setRequestForm({ ...requestForm, department: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Kitchen">Kitchen</option>
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Bar">Bar & Drinks</option>
                    <option value="FrontDesk">Front Desk</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label>
                  <select
                    value={requestForm.priority}
                    onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent / Rush</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Item to Request</label>
                <select
                  value={requestForm.items[0].item_id}
                  onChange={(e) =>
                    setRequestForm({
                      ...requestForm,
                      items: [{ ...requestForm.items[0], item_id: e.target.value }],
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                >
                  <option value="">Select item...</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.unit}) - Avail: {it.available_quantity}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Quantity Requested</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={requestForm.items[0].quantity_requested}
                  onChange={(e) =>
                    setRequestForm({
                      ...requestForm,
                      items: [{ ...requestForm.items[0], quantity_requested: e.target.value }],
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reason / Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Weekend dinner service rush"
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
