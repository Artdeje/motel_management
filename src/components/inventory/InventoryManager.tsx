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
  Trash2,
  Download,
  BarChart3,
  Activity,
  Package,
  Wine,
  Wrench,
  ClipboardList,
} from 'lucide-react';
import { formatCurrency, CURRENCY_SYMBOL } from '../../utils/currency';
import { formatDateTimeCAT } from '../../utils/dates';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const LABEL_COLORS: Record<string, string> = {
  Drink: '#a78bfa',
  Food: '#34d399',
  'Kitchen ingredient': '#fbbf24',
  Tools: '#f97316',
};
const LABEL_BG: Record<string, string> = {
  Drink: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Food: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Kitchen ingredient': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Tools: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

export const InventoryManager: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'analytics' | 'items' | 'lowStock' | 'requests' | 'transactions'>('analytics');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stockRequests, setStockRequests] = useState<StockRequest[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedLabel, setSelectedLabel] = useState('all');
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'24h' | 'week' | 'month' | 'annual'>('month');
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Add/Edit Item Modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
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
  const [selectedItemForAdjust, setSelectedItemForAdjust] = useState<any | null>(null);
  // Refill-only form: quantity is always added as a positive 'Received' movement.
  const [adjustForm, setAdjustForm] = useState({
    quantity: '',
    unit_cost: '',
    notes: '',
  });
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [addStockForm, setAddStockForm] = useState({ item_id: '', quantity: '10', unit_cost: '', notes: 'Refill' });
  const [stockListPeriod, setStockListPeriod] = useState<'all' | '24h' | 'week' | 'month' | 'annual'>('all');

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

  const fetchAnalytics = async (period: string) => {
    try {
      setAnalyticsLoading(true);
      const res = await api.getInventoryAnalytics(period);
      setAnalytics(res);
    } catch (err:any) { /* ignore */ }
    finally { setAnalyticsLoading(false); }
  };

  useEffect(() => { fetchInventory(); }, []);
  useEffect(() => { fetchAnalytics(analyticsPeriod); }, [analyticsPeriod]);

  const handleOpenAdjust = (item: any) => {
    setSelectedItemForAdjust(item);
    setAdjustForm({
      quantity: '',
      unit_cost: String(item.unit_cost ?? ''),
      notes: '',
    });
    setShowAdjustModal(true);
  };

  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForAdjust) return;
    const qty = parseFloat(adjustForm.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return error('Enter a refill quantity greater than zero');
    setSubmitting(true);
    try {
      // Refill only: always a positive 'Received' movement. Other movement types
      // (waste, audit correction, usage) are handled elsewhere, not on this form.
      await api.recordInventoryTransaction({
        item_id: selectedItemForAdjust.id,
        transaction_type: 'Received',
        quantity: qty,
        unit_cost: parseFloat(adjustForm.unit_cost || String(selectedItemForAdjust.unit_cost || 0)),
        reason: adjustForm.notes || 'Stock refill',
      });
      success('Stock Refilled', `Added ${qty} ${selectedItemForAdjust.unit} to ${selectedItemForAdjust.name}`);
      setShowAdjustModal(false);
      fetchInventory();
      fetchAnalytics(analyticsPeriod);
    } catch (err: any) {
      error('Stock refill failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddStockGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStockForm.item_id) return error('Select a stock item');
    setSubmitting(true);
    try {
      const item = items.find(i=>i.id===addStockForm.item_id);
      await api.recordInventoryTransaction({
        item_id: addStockForm.item_id,
        transaction_type: 'Received',
        quantity: parseFloat(addStockForm.quantity),
        unit_cost: parseFloat(addStockForm.unit_cost || String(item?.unit_cost || 0)),
        reason: addStockForm.notes || 'Refill via Add Stock',
      });
      success('Stock Refilled', `Added ${addStockForm.quantity} to ${item?.name}`);
      setShowAddStockModal(false);
      setAddStockForm({ item_id: '', quantity: '10', unit_cost: '', notes: 'Refill' });
      fetchInventory();
      fetchAnalytics(analyticsPeriod);
    } catch(err:any){ error('Add stock failed', err.message); }
    finally{ setSubmitting(false); }
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

  const handleOpenEditItem = (item: any) => {
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
      fetchAnalytics(analyticsPeriod);
    } catch (err: any) {
      error(editingItem ? 'Item update failed' : 'Failed to add item', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (item: any) => {
    if (!window.confirm(`Remove "${item.name}" (${item.sku}) from stock? This cannot be undone.`)) return;
    try {
      await api.deleteInventoryItem(item.id);
      success('Item Removed', `"${item.name}" removed from stock`);
      fetchInventory();
      fetchAnalytics(analyticsPeriod);
    } catch (err: any) {
      error('Failed to remove item', err.message);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      await api.reviewStockRequest(requestId, { status: 'Approved' });
      success('Stock Request Approved & Stock Issued');
      fetchInventory();
      fetchAnalytics(analyticsPeriod);
    } catch (err: any) { error('Approval failed', err.message); }
  };
  const handleRejectRequest = async (requestId: string) => {
    const reason = window.prompt('Enter rejection reason:');
    if (reason === null) return;
    try {
      await api.reviewStockRequest(requestId, { status: 'Rejected', review_notes: reason });
      success('Stock Request Rejected');
      fetchInventory();
    } catch (err: any) { error('Rejection failed', err.message); }
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
    } catch (err: any) { error('Failed to submit request', err.message); }
    finally { setSubmitting(false); }
  };

  const lowStockItems = items.filter((it) => (it.available_quantity || 0) <= it.minimum_quantity);
  const filteredItems = items.filter((it) => {
    const matchDept = selectedDepartment === 'all' || it.department === selectedDepartment;
    const matchCat = selectedCategory === 'all' || it.category_id === selectedCategory;
    const matchLabel = selectedLabel === 'all' || (it.stock_label || '').toLowerCase() === selectedLabel.toLowerCase();
    const matchSearch = it.name.toLowerCase().includes(searchQuery.toLowerCase()) || it.sku.toLowerCase().includes(searchQuery.toLowerCase());
    let matchPeriod = true;
    if (stockListPeriod !== 'all') {
      const raw = it.updated_at || it.created_at;
      if (raw) {
        const d = new Date(raw);
        const now = new Date();
        const diffDays = (now.getTime() - d.getTime()) / (1000*60*60*24);
        if (stockListPeriod==='24h' && diffDays>1) matchPeriod=false;
        else if (stockListPeriod==='week' && diffDays>7) matchPeriod=false;
        else if (stockListPeriod==='month' && diffDays>30) matchPeriod=false;
        else if (stockListPeriod==='annual' && diffDays>365) matchPeriod=false;
      }
    }
    return matchDept && matchCat && matchLabel && matchSearch && matchPeriod;
  });

  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const canEditItem = (it: any) => {
    if (canManage) return true;
    if (user?.role === 'chef' && it.department === 'Kitchen') return true;
    if (user?.role === 'housekeeper' && it.department === 'Housekeeping') return true;
    if (user?.role === 'bartender' && it.department === 'Bar') return true;
    return false;
  };
  const canDeleteItem = (it: any) => {
    if (user?.role === 'admin' || user?.role === 'manager') return true;
    if (user?.role === 'chef' && it.department === 'Kitchen') return true;
    if (user?.role === 'housekeeper' && it.department === 'Housekeeping') return true;
    return false;
  };
  const canReceiveStock = (it: any) => {
    if (user?.role === 'admin' || user?.role === 'manager') return true;
    if (user?.role === 'chef' && it.department === 'Kitchen') return true;
    if (user?.role === 'housekeeper' && it.department === 'Housekeeping') return true;
    if (user?.role === 'bartender' && it.department === 'Bar') return true;
    return false;
  };
  const visibleCategories = categories.filter(c => ['Drink','Kitchen ingredient','Tools'].includes(c.name));

  const handleDownloadPDF = () => {
    const el = document.getElementById('inventory-analytics-printable');
    if (!el) return;
    const w = window.open('', '_blank', 'width=1000,height=800');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Live Stock Analytics - ${analyticsPeriod.toUpperCase()}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box} body{font-family:Segoe UI,Arial,sans-serif;color:#1e293b;background:#f8fafc;padding:24px;font-size:11px;line-height:1.5}
        h1{font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;text-align:center;color:#0f172a}
        h2{font-size:12px;font-weight:800;margin:16px 0 8px;padding-bottom:6px;border-bottom:3px solid #0f172a;text-transform:uppercase;letter-spacing:.05em}
        .sub{font-size:10px;color:#64748b;text-align:center;margin-top:4px}
        .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
        .kpi{border-radius:12px;padding:12px;border:1px solid #e2e8f0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        .kpi-label{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:.06em}
        .kpi-value{font-size:18px;font-weight:900;font-family:monospace;margin-top:4px}
        .kpi-sub{font-size:9px;color:#94a3b8;margin-top:2px}
        table{width:100%;border-collapse:collapse;margin:8px 0;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        th{tex-align:left;padding:8px 10px;background:#0f172a;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.05em}
        td{padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:10px}
        .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:9px;font-weight:800;border:1px solid}
        .bg-drink{background:#ede9fe;color:#6d28d9;border-color:#ddd6fe}
        .bg-kitchen{background:#fef3c7;color:#92400e;border-color:#fde68a}
        .bg-tools{background:#ffedd5;color:#9a3412;border-color:#fed7aa}
        .footer{margin-top:20px;padding-top:10px;border-top:2px solid #0f172a;text-align:center;font-size:8px;color:#94a3b8}
      </style></head><body>` + el.innerHTML + `</body></html>`);
    w.document.close();
    setTimeout(()=> w.print(), 500);
  };

  if (loading) return <div className="p-12 text-center text-slate-400 text-sm">Loading inventory...</div>;

  return (
    <div className="space-y-6 lg:space-y-8 max-w-[1600px] mx-auto">
      {/* Header Banner - Responsive: stacked on mobile, horizontal on desktop with larger typography */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-6 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3 lg:gap-4 flex-1 min-w-0">
          <div className="p-3 lg:p-3.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
            <Boxes className="w-6 h-6 lg:w-7 lg:h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl lg:text-2xl font-bold text-white tracking-tight leading-tight">Live Stock Management</h2>
            <p className="text-xs lg:text-sm text-slate-400 mt-1 leading-relaxed max-w-2xl">Professional live stock: every stock vs current, stock-out analytics, period filters & export. Optimized for desktop & mobile.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap shrink-0 lg:justify-end">
          {(user?.role === 'admin' || user?.role === 'manager') && (
            <button onClick={handleOpenAddItem} className="px-3.5 lg:px-4 py-2 lg:py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs lg:text-sm rounded-xl shadow flex items-center gap-1.5 whitespace-nowrap">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          )}
          <button onClick={()=> setShowAddStockModal(true)} className="px-3.5 lg:px-4 py-2 lg:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs lg:text-sm rounded-xl shadow flex items-center gap-1.5 whitespace-nowrap">
            <TrendingUp className="w-3.5 h-3.5"/> Add Stock
          </button>
          <button onClick={()=>{fetchInventory(); fetchAnalytics(analyticsPeriod);}} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 whitespace-nowrap">
            <RefreshCw className="w-3.5 h-3.5"/> <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={() => setShowRequestModal(true)} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 whitespace-nowrap">
            <Plus className="w-3.5 h-3.5"/> <span className="hidden sm:inline">Request Stock</span><span className="sm:hidden">Request</span>
          </button>
        </div>
      </div>

      {/* Tabs Row - Desktop: no scroll, wrap; Mobile: horizontal scroll */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto lg:overflow-visible no-scrollbar -mx-1 px-1">
        {[
          { id:'analytics', label:`Live Analytics`, shortLabel:'Analytics', icon: BarChart3 },
          { id:'items', label:`All Items (${items.length})`, shortLabel:`Items`, icon: Boxes },
          { id:'lowStock', label:`Low Stock (${lowStockItems.length})`, shortLabel:'Low Stock', icon: AlertTriangle },
          { id:'requests', label:`Requests (${stockRequests.length})`, shortLabel:'Requests', icon: FileCheck },
          { id:'transactions', label:`Audit Ledger`, shortLabel:'Ledger', icon: ArrowRightLeft },
        ].map(t=>(
          <button key={t.id} onClick={()=> setActiveTab(t.id as any)} className={`px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl text-xs lg:text-sm font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all ${activeTab===t.id?'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20':'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'}`}>
            <t.icon className="w-3.5 h-3.5"/> <span className="hidden lg:inline">{t.label}</span><span className="lg:hidden">{(t as any).shortLabel || t.label}</span>
          </button>
        ))}
      </div>

      {/* ANALYTICS TAB - Professional */}
      {activeTab==='analytics' && (
        <div className="space-y-6 lg:space-y-8">
          {/* Period Filter + Export - Professional Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 shadow-lg">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 lg:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                    <Filter className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold tracking-widest uppercase text-slate-300">Analytics Period</p>
                    <p className="text-[11px] text-slate-500 font-medium">Filter stock trends & valuation</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/60 border border-slate-800/60 overflow-x-auto no-scrollbar">
                  {(['24h','week','month','annual'] as const).map(p=>(
                    <button key={p} onClick={()=> setAnalyticsPeriod(p)} className={`px-3.5 lg:px-4 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-all ${analyticsPeriod===p?'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-900 shadow-md shadow-amber-500/20':'bg-transparent text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                      {p==='24h'?'24 Hours': p.charAt(0).toUpperCase()+p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-500 bg-slate-800/40 px-3 py-1.5 rounded-full border border-slate-700/30">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live • {analytics?.summary.totalItems || 0} items
                </div>
                <button onClick={handleDownloadPDF} className="px-4 py-2 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-bold text-xs lg:text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 whitespace-nowrap">
                  <Download className="w-4 h-4"/> <span className="hidden sm:inline">Download</span> PDF
                </button>
              </div>
            </div>
          </div>

          {analyticsLoading && <div className="text-center text-slate-400 text-xs py-8">Loading analytics...</div>}

          {analytics && !analyticsLoading && (
            <div id="inventory-analytics-printable" className="space-y-6">
              <div className="text-center pb-4" style={{borderBottom:'3px solid #0f172a'}}>
                <h1 className="text-xl font-black tracking-widest uppercase text-white">Live Stock Management Report</h1>
                <p className="text-xs text-slate-400 mt-1">Period: {analyticsPeriod.toUpperCase()} &mdash; Generated {new Date().toLocaleString()} &mdash; Grand Horizon Motel</p>
              </div>

              {/* KPI Grid - Professional & User Friendly */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
                <div className="group relative overflow-hidden p-4 lg:p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg hover:border-slate-700 hover:shadow-xl transition-all">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-cyan-500/0 via-cyan-500/30 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] lg:text-xs font-bold tracking-widest uppercase text-slate-400 truncate">Every Stock</p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">All-time In</p>
                    </div>
                    <span className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition-colors"><Package className="w-5 h-5 text-cyan-400"/></span>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black font-mono text-white mt-3 tracking-tight truncate" title={String(analytics.summary.everyStock)}>{Math.round(Number(analytics.summary.everyStock)).toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500 mt-1.5 font-medium truncate">Total ever received • All categories</p>
                </div>
                <div className="group relative overflow-hidden p-4 lg:p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg hover:border-emerald-500/30 hover:shadow-xl transition-all">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-emerald-500/0 via-emerald-500/30 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] lg:text-xs font-bold tracking-widest uppercase text-emerald-300/90 truncate">Current Stock</p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">{Number(analytics.summary.currentVsEvery).toFixed(1)}% of every stock</p>
                    </div>
                    <span className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors"><Boxes className="w-5 h-5 text-emerald-400"/></span>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black font-mono text-emerald-400 mt-3 tracking-tight truncate" title={String(analytics.summary.totalCurrentQty)}>{Math.round(Number(analytics.summary.totalCurrentQty)).toLocaleString()}</p>
                  <p className="text-[11px] text-slate-400 mt-1.5 font-mono font-semibold truncate">{formatCurrency(Math.round(Number(analytics.summary.totalValuation)))} valuation</p>
                </div>
                <div className="group relative overflow-hidden p-4 lg:p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg hover:border-rose-500/30 hover:shadow-xl transition-all">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-rose-500/0 via-rose-500/30 to-rose-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] lg:text-xs font-bold tracking-widest uppercase text-slate-400 truncate">Stock Out</p>
                      <p className="text-[10px] text-slate-500 font-medium capitalize truncate">{analyticsPeriod} • Out {Number(analytics.summary.stockOutVsCurrent).toFixed(1)}%</p>
                    </div>
                    <span className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center shrink-0 group-hover:bg-rose-500/20 transition-colors"><TrendingDown className="w-5 h-5 text-rose-400"/></span>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black font-mono text-rose-400 mt-3 tracking-tight truncate" title={String(analytics.summary.periodStockOut)}>{Math.round(Number(analytics.summary.periodStockOut)).toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500 mt-1.5 truncate">In period: <span className="font-bold text-emerald-400">+{Math.round(Number(analytics.summary.periodStockIn)).toLocaleString()}</span></p>
                </div>
                <div className="group relative overflow-hidden p-4 lg:p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/20 shadow-lg hover:border-amber-500/30 hover:shadow-xl transition-all">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-amber-500/0 via-amber-500/40 to-amber-500/0" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] lg:text-xs font-bold tracking-widest uppercase text-amber-300 truncate">Alerts</p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">{Math.round(Number(analytics.summary.totalItems)).toLocaleString()} active items</p>
                    </div>
                    <span className="w-10 h-10 rounded-xl bg-amber-500 text-slate-900 flex items-center justify-center shrink-0 shadow-md"><AlertTriangle className="w-5 h-5"/></span>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black font-mono text-amber-400 mt-3 tracking-tight truncate">{Math.round(Number(analytics.summary.lowStockCount)).toLocaleString()} <span className="text-[11px] font-bold text-slate-500">Low</span> • {Math.round(Number(analytics.summary.outOfStockCount)).toLocaleString()} <span className="text-[11px] font-bold text-slate-500">Out</span></p>
                  <p className="text-[11px] text-amber-300/70 mt-1.5 font-semibold truncate">Requires attention</p>
                </div>
              </div>

              {/* Charts - Professional */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 relative overflow-hidden p-6 lg:p-7 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-cyan-500/0 via-cyan-500/20 to-transparent" />
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center shrink-0">
                        <Activity className="w-5 h-5 text-cyan-400"/>
                      </div>
                      <div>
                        <h3 className="text-sm lg:text-[15px] font-bold text-white tracking-tight">Stock In vs Stock Out Trend</h3>
                        <p className="text-[11px] text-slate-500 font-medium capitalize">{analyticsPeriod} • Daily net movement • Live</p>
                      </div>
                    </div>
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full">Trend</span>
                  </div>
                  {analytics.trend?.length ? (
                    <ResponsiveContainer width="100%" height={290}>
                      <AreaChart data={analytics.trend}>
                        <defs>
                          <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.35}/><stop offset="95%" stopColor="#34d399" stopOpacity={0}/></linearGradient>
                          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.35}/><stop offset="95%" stopColor="#f87171" stopOpacity={0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false}/>
                        <XAxis dataKey="day" tick={{fontSize:11, fill:'#94a3b8', fontWeight:600}} axisLine={{stroke:'#334155'}} tickLine={false}/>
                        <YAxis tick={{fontSize:11, fill:'#94a3b8', fontWeight:600}} axisLine={false} tickLine={false}/>
                        <Tooltip contentStyle={{background:'#0f172a', border:'1px solid #334155', borderRadius:12, boxShadow:'0 10px 25px rgba(0,0,0,0.3)'}} labelStyle={{color:'#94a3b8', fontSize:11, fontWeight:700}} itemStyle={{fontSize:12, fontWeight:700}}/>
                        <Legend wrapperStyle={{fontSize:12, fontWeight:700, paddingTop:12}} iconType="circle"/>
                        <Area type="monotone" dataKey="stockIn" name="Stock In" stroke="#34d399" fill="url(#gIn)" strokeWidth={2.5} dot={false} activeDot={{r:5, strokeWidth:2, stroke:'#0f172a'}}/>
                        <Area type="monotone" dataKey="stockOut" name="Stock Out" stroke="#f87171" fill="url(#gOut)" strokeWidth={2.5} dot={false} activeDot={{r:5, strokeWidth:2, stroke:'#0f172a'}}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <div className="h-[290px] flex flex-col items-center justify-center text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-700/50"><Activity className="w-8 h-8 text-slate-600 mb-2"/><p className="text-xs font-semibold">No transactions in period</p><p className="text-[11px] text-slate-500">Try a different period</p></div>}
                  <div className="mt-5 p-3 lg:p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs lg:text-sm">
                    <span className="text-slate-400 font-medium">Current stock <strong className="text-emerald-400 font-black">{analytics.summary.currentVsEvery}%</strong> of every stock</span>
                    <span className="text-slate-400 font-medium">Period net <strong className={analytics.summary.periodStockIn - analytics.summary.periodStockOut >=0 ? 'text-emerald-400 font-black':'text-rose-400 font-black'}>{analytics.summary.periodStockIn - analytics.summary.periodStockOut >0 ? '+' : ''}{analytics.summary.periodStockIn - analytics.summary.periodStockOut}</strong> units</span>
                  </div>
                </div>
                <div className="relative overflow-hidden p-6 lg:p-7 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-purple-500/0 via-purple-500/20 to-transparent" />
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5 text-purple-400"/>
                    </div>
                    <div>
                      <h3 className="text-sm lg:text-[15px] font-bold text-white tracking-tight">Stock by Label</h3>
                      <p className="text-[11px] text-slate-500 font-medium">Distribution • Current qty</p>
                    </div>
                  </div>
                  {analytics.labelBreakdown ? (
                    <>
                      <ResponsiveContainer width="100%" height={210}>
                        <PieChart>
                          <Pie data={Object.entries(analytics.labelBreakdown).map(([k,v]:any)=>({name:k, value:v.currentQty}))} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value" nameKey="name" stroke="none">
                            {Object.keys(analytics.labelBreakdown).map((k,i)=> <Cell key={k} fill={LABEL_COLORS[k]||'#94a3b8'}/>)}
                          </Pie>
                          <Tooltip contentStyle={{background:'#0f172a', border:'1px solid #334155', borderRadius:10}} formatter={(v:number)=> v.toLocaleString()}/>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2.5 mt-4">
                        {Object.entries(analytics.labelBreakdown).map(([label, v]:any)=>(
                          <div key={label} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 border border-slate-800/60 hover:bg-slate-800/60 transition-colors">
                            <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full shadow-sm" style={{background: LABEL_COLORS[label], boxShadow:`0 0 8px ${LABEL_COLORS[label]}60`}}/><span className="text-[13px] font-bold text-white tracking-tight">{label}</span><span className="text-[11px] font-semibold text-slate-500 bg-slate-700/40 px-1.5 py-0.5 rounded-full">{v.count}</span></div>
                            <span className="text-[12px] font-black font-mono text-white">{v.currentQty.toLocaleString()} <span className="text-[10px] font-bold text-slate-400">• {formatCurrency(v.valuation)}</span></span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <div className="h-[290px] flex flex-col items-center justify-center text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-700/50"><Layers className="w-8 h-8 text-slate-600 mb-2"/><p className="text-xs font-semibold">No data</p></div>}
                </div>
              </div>

              {/* Live Stock Table - Professional & Horizontal Scrollable */}
              <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-slate-700/0 via-slate-600/20 to-slate-700/0" />
                <div className="p-5 lg:p-6 border-b border-slate-800/60">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      <ClipboardList className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm lg:text-[15px] font-bold text-white tracking-tight">Live Stock by Label</h2>
                      <p className="text-[11px] text-slate-500 font-medium">Current distribution • Horizontal scroll for long texts</p>
                    </div>
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-slate-400 bg-slate-800/60 border border-slate-700/50 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700">
                  <table className="w-full min-w-[520px] text-left">
                    <thead className="bg-slate-950/60 border-b border-slate-800">
                      <tr className="text-[11px] font-bold tracking-widest uppercase text-slate-400">
                        <th className="px-4 lg:px-6 py-3 whitespace-nowrap">Label</th>
                        <th className="px-3 py-3 text-right whitespace-nowrap">Items</th>
                        <th className="px-3 py-3 text-right whitespace-nowrap">Current Qty</th>
                        <th className="px-3 py-3 text-right whitespace-nowrap">Valuation</th>
                        <th className="px-4 lg:px-6 py-3 text-right whitespace-nowrap">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {analytics.labelBreakdown && Object.entries(analytics.labelBreakdown).map(([label, v]:any)=>(
                        <tr key={label} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 lg:px-6 py-3.5 whitespace-nowrap"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide border shadow-sm ${label.toLowerCase().includes('drink') ? 'bg-drink' : label.toLowerCase().includes('kitchen') ? 'bg-kitchen' : 'bg-tools'}`}>{label}</span></td>
                          <td className="px-3 py-3.5 text-right font-mono font-bold text-white whitespace-nowrap">{Math.round(Number(v.count)).toLocaleString()}</td>
                          <td className="px-3 py-3.5 text-right font-mono font-bold text-white whitespace-nowrap">{Math.round(Number(v.currentQty)).toLocaleString()}</td>
                          <td className="px-3 py-3.5 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">{formatCurrency(Math.round(Number(v.valuation)))}</td>
                          <td className="px-4 lg:px-6 py-3.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800/60 border border-slate-700/50 px-2.5 py-1 rounded-full">{analytics.summary.totalCurrentQty>0 ? (Math.round((Number(v.currentQty)/Number(analytics.summary.totalCurrentQty))*1000)/10).toFixed(1):'0'}% <span className="w-8 h-1.5 rounded-full bg-slate-700 overflow-hidden inline-block"><span className="block h-full bg-amber-500 rounded-full" style={{width: `${analytics.summary.totalCurrentQty>0 ? Math.round((Number(v.currentQty)/Number(analytics.summary.totalCurrentQty))*100) : 0}%`}} /></span></span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 lg:px-6 py-3 bg-slate-950/40 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
                  <span className="whitespace-nowrap">Every Stock: <strong className="text-white font-mono">{Math.round(Number(analytics.summary.everyStock)).toLocaleString()}</strong></span>
                  <span className="whitespace-nowrap">Current: <strong className="text-emerald-400 font-mono">{Math.round(Number(analytics.summary.totalCurrentQty)).toLocaleString()}</strong> ({Number(analytics.summary.currentVsEvery).toFixed(1)}%)</span>
                  <span className="whitespace-nowrap">Stock Out: <strong className="text-rose-400 font-mono">{Math.round(Number(analytics.summary.totalStockOut)).toLocaleString()}</strong></span>
                  <span className="whitespace-nowrap">Period <span className="uppercase font-bold text-slate-400">{analyticsPeriod}</span>: <span className="text-emerald-400 font-mono">+{Math.round(Number(analytics.summary.periodStockIn)).toLocaleString()}</span> / <span className="text-rose-400 font-mono">{Math.round(Number(analytics.summary.periodStockOut)).toLocaleString()}</span></span>
                </div>
                <div className="px-4 lg:px-6 py-2 bg-amber-500/5 border-t border-amber-500/10 flex items-center gap-2 text-[10px] text-amber-300/80">
                  <span className="hidden sm:inline">💡</span>
                  <span className="font-medium tracking-wide">Tip: Horizontal scroll for long texts • Numbers rounded, no trailing dots</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: ALL INVENTORY ITEMS - Desktop Responsive */}
      {activeTab === 'items' && (
        <div className="space-y-4 lg:space-y-5">
          <div className="flex flex-col gap-3 lg:gap-4 bg-slate-900/80 p-3 lg:p-4 rounded-2xl border border-slate-800 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4">
              <div className="relative w-full lg:w-80 xl:w-96 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search by SKU or item name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 lg:py-2.5 text-xs lg:text-sm text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all" />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto w-full lg:w-auto no-scrollbar lg:justify-end pb-1 lg:pb-0">
                <button onClick={() => setSelectedDepartment('all')} className={`px-3 lg:px-3.5 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold whitespace-nowrap transition-all ${selectedDepartment === 'all'?'bg-teal-500 text-white font-bold shadow-sm':'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/50'}`}>All Depts</button>
                {['Kitchen','Bar','Housekeeping','Manager'].map((dept) => (
                  <button key={dept} onClick={() => setSelectedDepartment(dept)} className={`px-3 lg:px-3.5 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold whitespace-nowrap transition-all ${selectedDepartment === dept?'bg-teal-500 text-white font-bold shadow-sm':'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/50'}`}>{dept}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:gap-2.5">
              <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 shrink-0"><ClipboardList className="w-3 h-3"/> Stock Category:</span>
              {['all','Drink','Kitchen ingredient','Tools'].map(l=>(
                <button key={l} onClick={()=> setSelectedLabel(l)} className={`px-3 lg:px-3.5 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${selectedLabel===l?'bg-amber-500 text-slate-950 font-bold shadow-sm':'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/50'}`}>
                  {l==='Drink' && <Wine className="w-3 h-3"/>}
                                    {l==='Kitchen ingredient' && <Layers className="w-3 h-3"/>}
                  {l==='Tools' && <Wrench className="w-3 h-3"/>}
                  {l==='all'?'All':l}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:gap-2.5">
              <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 shrink-0"><Filter className="w-3 h-3"/> Period:</span>
              {(['all','24h','week','month','annual'] as const).map(p=>(
                <button key={p} onClick={()=> setStockListPeriod(p)} className={`px-3 lg:px-3.5 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold whitespace-nowrap transition-all ${stockListPeriod===p?'bg-sky-500 text-white font-bold shadow-sm':'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/50'}`}>{p==='all'?'All Time': p==='24h'?'24 Hours': p.charAt(0).toUpperCase()+p.slice(1)}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:gap-2.5">
              <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0">Category:</span>
              <button onClick={() => setSelectedCategory('all')} className={`px-3 lg:px-3.5 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold whitespace-nowrap transition-all ${selectedCategory === 'all'?'bg-amber-500 text-slate-950 font-bold shadow-sm':'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/50'}`}>All Categories</button>
              {visibleCategories.map((c) => (
                <button key={c.id} onClick={() => setSelectedCategory(c.id)} className={`px-3 lg:px-3.5 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold whitespace-nowrap transition-all ${selectedCategory === c.id?'bg-amber-500 text-slate-950 font-bold shadow-sm':'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/50'}`}>{c.name}</button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700">
              <table className="w-full text-left min-w-[900px] lg:min-w-[1100px]">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr className="text-[11px] font-bold tracking-widest uppercase">
                    <th className="px-4 py-3.5 font-extrabold">Item & SKU</th>
                    <th className="px-3 py-3.5 font-extrabold">Stock Label</th>
                    <th className="px-3 py-3.5 font-extrabold">Department</th>
                    <th className="px-3 py-3.5 font-extrabold">Category</th>
                    <th className="px-3 py-3.5 font-extrabold text-right">Physical</th>
                    <th className="px-3 py-3.5 font-extrabold text-right">Reserved</th>
                    <th className="px-3 py-3.5 font-extrabold text-right">Available</th>
                    <th className="px-3 py-3.5 font-extrabold text-right">Unit Cost</th>
                    <th className="px-3 py-3.5 font-extrabold text-right">Valuation</th>
                    <th className="px-4 py-3.5 font-extrabold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.map((it) => {
                    const isLow = (it.available_quantity || 0) <= it.minimum_quantity;
                    const valuation = it.current_quantity * it.unit_cost;
                    return (
                      <tr key={it.id} className="group hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-4">
                          <div className="min-w-[180px]">
                            <p className="text-[13px] font-bold text-white leading-tight tracking-tight group-hover:text-amber-50 transition-colors line-clamp-1" title={it.name}>{it.name}</p>
                            <p className="text-[10px] font-mono font-semibold tracking-wider text-amber-400/90 mt-1 bg-slate-800/50 inline-block px-1.5 py-0.5 rounded border border-slate-700/30">{it.sku}</p>
                          </div>
                        </td>
                        <td className="px-3 py-4"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider border shadow-sm ${LABEL_BG[it.stock_label || 'Tools'] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>{it.stock_label || 'Tools'}</span></td>
                        <td className="px-3 py-4"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border ${it.department === 'Kitchen' ? 'bg-orange-500/15 text-orange-300 border-orange-500/25' : it.department === 'Bar' ? 'bg-purple-500/15 text-purple-300 border-purple-500/25' : it.department === 'Housekeeping' ? 'bg-sky-500/15 text-sky-300 border-sky-500/25' : it.department === 'Manager' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' : 'bg-slate-700/50 text-slate-300 border-slate-600/50'}`}>{it.department || 'General'}</span></td>
                        <td className="px-3 py-4"><span className="text-[12px] font-semibold text-slate-300 tracking-wide">{it.category_name}</span></td>
                        <td className="px-3 py-4 text-right"><span className="text-[13px] font-black text-white font-mono tracking-tight">{it.current_quantity} <span className="text-[10px] font-bold text-slate-400 tracking-wider">{it.unit}</span></span></td>
                        <td className="px-3 py-4 text-right"><span className="text-[12px] font-bold text-amber-400 font-mono">{it.reserved_quantity || 0} <span className="text-[10px] text-amber-300/60">{it.unit}</span></span></td>
                        <td className="px-3 py-4 text-right"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide border shadow-sm ${isLow?'bg-rose-500 text-white border-rose-600 shadow-rose-500/20':'bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/20'}`}><span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse" />{it.available_quantity} <span className="text-[10px] opacity-90">{it.unit}</span></span></td>
                        <td className="px-3 py-4 text-right"><span className="text-[12px] font-bold text-slate-300 font-mono tracking-tight">{formatCurrency(it.unit_cost)}</span></td>
                        <td className="px-3 py-4 text-right"><span className="text-[13px] font-black text-white font-mono tracking-tight">{formatCurrency(valuation)}</span></td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {canReceiveStock(it) && (<button onClick={() => handleOpenAdjust(it)} className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 tracking-wide">Add Stock</button>)}
                            {canEditItem(it) && (<button onClick={() => handleOpenEditItem(it)} className="w-8 h-8 bg-slate-800 hover:bg-sky-500/15 text-slate-400 hover:text-sky-400 rounded-xl border border-slate-700 hover:border-sky-500/30 flex items-center justify-center transition-all" title="Edit item"><Pencil className="w-3.5 h-3.5"/></button>)}
                            {canDeleteItem(it) && (<button onClick={() => handleDeleteItem(it)} className="w-8 h-8 bg-slate-800 hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-700 hover:border-rose-500/30 flex items-center justify-center transition-all" title="Remove item"><Trash2 className="w-3.5 h-3.5"/></button>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredItems.length === 0 && (
              <div className="p-12 text-center border-t border-slate-800">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center"><Search className="w-5 h-5 text-slate-500" /></div>
                <p className="text-sm font-bold text-white">No Items Found</p>
                <p className="text-xs text-slate-500 mt-1">Try adjusting your search or filters.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LOW STOCK - Professional Cards - Desktop: 4 cols on xl */}
      {activeTab === 'lowStock' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
          {lowStockItems.map((it) => (
            <div key={it.id} className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border border-amber-500/20 shadow-lg hover:shadow-xl hover:border-amber-500/30 transition-all duration-300 flex flex-col">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[14px] font-bold text-white leading-tight tracking-tight truncate" title={it.name}>{it.name}</h4>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-medium text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/50">{it.sku}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${LABEL_BG[it.stock_label || 'Tools'] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>{it.stock_label || 'Tools'}</span>
                    </div>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider bg-amber-500 text-slate-900 shadow-sm">LOW</span>
                </div>
                <div className="py-4 space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-rose-500/20 flex items-center justify-center"><AlertTriangle className="w-3.5 h-3.5 text-rose-400" /></div>
                      <span className="text-[11px] font-semibold text-slate-300 tracking-wide">Available</span>
                    </div>
                    <span className="text-[13px] font-black text-rose-400 font-mono tracking-tight">{it.available_quantity} <span className="text-[10px] font-semibold text-rose-300/80">{it.unit}</span></span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                      <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">Min Level</p>
                      <p className="text-[13px] font-bold text-white font-mono mt-1">{it.minimum_quantity} <span className="text-[10px] text-slate-400">{it.unit}</span></p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] font-semibold text-emerald-300/80 tracking-wider uppercase">Restock</p>
                      <p className="text-[13px] font-bold text-emerald-400 font-mono mt-1">{it.reorder_quantity} <span className="text-[10px] text-emerald-300/70">{it.unit}</span></p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 bg-slate-950/40 border-t border-slate-800/60 flex items-center justify-between gap-3">
                <p className="text-[10px] text-slate-500 font-medium leading-tight">Requires immediate attention</p>
                {canReceiveStock(it) && (<button onClick={() => handleOpenAdjust(it)} className="shrink-0 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-900 font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Add Stock</button>)}
              </div>
            </div>
          ))}
          {lowStockItems.length === 0 && (
            <div className="col-span-full p-12 text-center bg-gradient-to-br from-slate-900 to-emerald-950/10 rounded-2xl border border-slate-800 shadow-lg">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center"><CheckCircle2 className="w-7 h-7 text-emerald-400" /></div>
              <h4 className="text-sm font-bold text-white">All Stock Levels Healthy</h4>
              <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">Every inventory item is above its minimum safety threshold. No immediate restocking required.</p>
            </div>
          )}
        </div>
      )}

      {/* REQUESTS - Professional Cards - Desktop: 3 cols on xl */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
            {stockRequests.map((req) => (
              <div key={req.id} className="group relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-lg hover:border-slate-700 hover:shadow-xl transition-all flex flex-col">
                <div className={`absolute top-0 left-0 right-0 h-1 ${req.status === 'Approved' ? 'bg-emerald-500' : req.status === 'Pending' ? 'bg-amber-500' : 'bg-rose-500'} opacity-70 group-hover:opacity-100 transition-opacity`} />
                <div className="p-5 flex-1">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">#{req.request_number}</span>
                        <span className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase">{req.department}</span>
                      </div>
                      <h4 className="text-[14px] font-bold text-white leading-tight tracking-tight mt-1.5 truncate" title={`${req.department} Dept Request`}>{req.department} Department Request</h4>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider border ${req.status === 'Approved'?'bg-emerald-500 text-slate-900 border-emerald-500 shadow-sm': req.status === 'Pending'?'bg-amber-500 text-slate-900 border-amber-500 shadow-sm':'bg-rose-500 text-white border-rose-500'}`}>{req.status.toUpperCase()}</span>
                  </div>
                  <div className="py-4 space-y-3">
                    <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/30">
                      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">Reason</p>
                      <p className="text-[13px] font-semibold text-white leading-relaxed line-clamp-2" title={req.reason || 'Restocking'}>{req.reason || 'Restocking'}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Requested Items</p>
                      <div className="space-y-1.5">
                        {req.items?.map((it: any) => (
                          <div key={it.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 hover:bg-slate-900/60 transition-colors">
                            <span className="text-[13px] font-semibold text-white leading-tight flex-1 min-w-0 truncate pr-3" title={it.item_name}>{it.item_name}</span>
                            <span className="shrink-0 text-[12px] font-black text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">{it.quantity_requested} <span className="text-[10px] font-bold text-amber-300/70">{it.unit}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                {req.status === 'Pending' && canManage && (
                  <div className="px-5 py-3 bg-slate-950/40 border-t border-slate-800/60 flex items-center justify-end gap-2">
                    <button onClick={() => handleRejectRequest(req.id)} className="px-4 py-2 bg-slate-800 hover:bg-rose-500/10 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 text-xs font-bold rounded-xl transition-colors">Reject</button>
                    <button onClick={() => handleApproveRequest(req.id)} className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95">Approve & Issue</button>
                  </div>
                )}
              </div>
            ))}
            {stockRequests.length === 0 && (
              <div className="col-span-full p-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center"><FileCheck className="w-6 h-6 text-slate-400" /></div>
                <p className="text-sm font-semibold text-white">No Stock Requests</p>
                <p className="text-xs text-slate-500 mt-1">Department requests will appear here when submitted.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr><th className="p-3.5">Date / Time</th><th className="p-3.5">Item</th><th className="p-3.5">Type</th><th className="p-3.5">Qty Change</th><th className="p-3.5">Unit Cost</th><th className="p-3.5">Actor</th><th className="p-3.5">Notes</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-800/50">
                    <td className="p-3.5 text-slate-400">{formatDateTimeCAT(txn.created_at)}</td>
                    <td className="p-3.5 font-bold text-white">{txn.item_name}</td>
                    <td className="p-3.5"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">{txn.transaction_type}</span></td>
                    <td className="p-3.5 font-bold"><span className={txn.quantity >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{txn.quantity > 0 ? `+${txn.quantity}` : txn.quantity}</span></td>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-full sm:max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><Boxes className="w-5 h-5 text-amber-400"/>{editingItem ? `Edit Stock Item: ${editingItem.name}` : 'Add New Stock Item'}</h3>
            <p className="text-xs text-slate-400 mt-1">{editingItem ? 'Update the specifications of this stock item.' : 'Register a new item to be tracked in the motel stock.'}</p>
            <form onSubmit={handleConfirmItemSave} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">SKU (Auto-Generated)</label><div className="flex items-center gap-2"><input type="text" placeholder="Auto-generated ID" value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono" required/><button type="button" onClick={() => setItemForm({ ...itemForm, sku: generateSku(itemForm.category_id) })} title="Regenerate SKU" className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700"><RefreshCw className="w-3.5 h-3.5"/></button></div></div>
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Unit</label><input type="text" placeholder="e.g. kg, liters, portions" value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Item Name</label><input type="text" placeholder="e.g. Fresh Chicken Breast" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Category * (Drink / Food / Kitchen ingredient / Tools)</label><select value={itemForm.category_id} onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required>{visibleCategories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Department</label><select value={itemForm.department} onChange={(e) => setItemForm({ ...itemForm, department: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required><option value="Kitchen">Kitchen</option><option value="Bar">Bar</option><option value="Housekeeping">Housekeeping</option><option value="Manager">Manager</option><option value="General">General</option></select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Supplier</label><select value={itemForm.supplier_id} onChange={(e) => setItemForm({ ...itemForm, supplier_id: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"><option value="">-- No supplier --</option>{suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}</select></div><div></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Opening Quantity</label><input type="number" min="0" step="0.1" value={itemForm.current_quantity} onChange={(e) => setItemForm({ ...itemForm, current_quantity: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Unit Cost ({CURRENCY_SYMBOL})</label><input type="number" min="0" step="0.01" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Minimum Par Level</label><input type="number" min="0" step="0.1" value={itemForm.minimum_quantity} onChange={(e) => setItemForm({ ...itemForm, minimum_quantity: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Reorder Quantity</label><input type="number" min="0" step="0.1" value={itemForm.reorder_quantity} onChange={(e) => setItemForm({ ...itemForm, reorder_quantity: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Storage Location</label><input type="text" placeholder="e.g. Cold Storage Freezer 1" value={itemForm.storage_location} onChange={(e) => setItemForm({ ...itemForm, storage_location: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/></div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setShowItemModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow disabled:opacity-50">{submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {showAdjustModal && selectedItemForAdjust && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-400"/>Refill Stock: {selectedItemForAdjust.name}</h3>
            <p className="text-xs text-slate-400 mt-1">Current Available: {selectedItemForAdjust.available_quantity} {selectedItemForAdjust.unit} &bull; Label: {selectedItemForAdjust.stock_label}</p>
            <form onSubmit={handleConfirmAdjust} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Quantity to Refill ({selectedItemForAdjust.unit})</label>
                <input type="number" min="0.1" step="0.1" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" autoFocus required/>
                <p className="text-[10px] text-slate-500 mt-1">New total after refill: <span className="font-bold text-emerald-300">{(Number(selectedItemForAdjust.available_quantity || 0) + (parseFloat(adjustForm.quantity) || 0)).toLocaleString()} {selectedItemForAdjust.unit}</span></p>
              </div>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Unit Cost ({CURRENCY_SYMBOL}) <span className="text-slate-500 font-normal">– optional</span></label><input type="number" step="0.01" value={adjustForm.unit_cost} onChange={(e) => setAdjustForm({ ...adjustForm, unit_cost: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/></div>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Notes / Invoice Ref <span className="text-slate-500 font-normal">– optional</span></label><input type="text" value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/></div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setShowAdjustModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow disabled:opacity-50">{submitting ? 'Refilling...' : 'Refill Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Stock (Refill) Modal – global */}
      {showAddStockModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-400"/> Add Stock – Refill</h3>
            <p className="text-xs text-slate-400 mt-1">Select a stock material and refill it anytime. Stock categories: Drink, Kitchen ingredient, Tools.</p>
            <form onSubmit={handleAddStockGlobal} className="mt-4 space-y-4">
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Stock Material</label><select value={addStockForm.item_id} onChange={e=> { const it=items.find(x=>x.id===e.target.value); setAddStockForm({...addStockForm, item_id:e.target.value, unit_cost: it? String(it.unit_cost): ''}); }} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required><option value="">Select stock material...</option>{items.map(it=> <option key={it.id} value={it.id}>{it.name} [{it.stock_label}] – {it.current_quantity} {it.unit} ({it.category_name})</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Quantity to Add</label><input type="number" min="0.1" step="0.1" value={addStockForm.quantity} onChange={e=> setAddStockForm({...addStockForm, quantity:e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Unit Cost ({CURRENCY_SYMBOL})</label><input type="number" step="0.01" value={addStockForm.unit_cost} onChange={e=> setAddStockForm({...addStockForm, unit_cost:e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/></div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Notes</label><input type="text" placeholder="e.g. Delivery from supplier" value={addStockForm.notes} onChange={e=> setAddStockForm({...addStockForm, notes:e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/></div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button type="button" onClick={()=> setShowAddStockModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow disabled:opacity-50">{submitting?'Adding...':'Add Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><Plus className="w-5 h-5 text-amber-400"/>New Department Stock Request</h3>
            <form onSubmit={handleCreateRequest} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Department</label><select value={requestForm.department} onChange={(e) => setRequestForm({ ...requestForm, department: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"><option value="Kitchen">Kitchen</option><option value="Housekeeping">Housekeeping</option><option value="Bar">Bar & Drinks</option><option value="FrontDesk">Front Desk</option></select></div>
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label><select value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"><option value="Normal">Normal</option><option value="High">High</option><option value="Urgent">Urgent / Rush</option></select></div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Item to Request</label><select value={requestForm.items[0].item_id} onChange={(e) => setRequestForm({ ...requestForm, items: [{ ...requestForm.items[0], item_id: e.target.value }] })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required><option value="">Select item...</option>{items.map((it) => (<option key={it.id} value={it.id}>{it.name} ({it.stock_label}) - Avail: {it.available_quantity}</option>))}</select></div>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Quantity Requested</label><input type="number" min="0.5" step="0.5" value={requestForm.items[0].quantity_requested} onChange={(e) => setRequestForm({ ...requestForm, items: [{ ...requestForm.items[0], quantity_requested: e.target.value }] })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Reason / Purpose</label><input type="text" placeholder="e.g. Weekend dinner service rush" value={requestForm.reason} onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" required/></div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setShowRequestModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
