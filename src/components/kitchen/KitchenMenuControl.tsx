import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { MenuItem, MenuCategory } from '../../types';
import {
  ChefHat,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  Boxes,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Lock,
  Layers,
  UtensilsCrossed
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';

export const KitchenMenuControl: React.FC = () => {
  const { user } = useAuth();
  const { success, error, info } = useToast();
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Deactivation Modal State
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [activeItemToDeactivate, setActiveItemToDeactivate] = useState<MenuItem | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('Ingredient stock unavailable');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Menu Item Create/Edit/Drop State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    category_id: '',
    description: '',
    price: '',
    preparation_duration: '15',
  });
  const [ingredientRows, setIngredientRows] = useState<{ inventory_item_id: string; quantity_required: string; unit: string }[]>([]);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      const res = await api.getMenuItems();
      setMenuItems(res.items || []);
      setCategories(res.categories || []);
    } catch (err: any) {
      error('Failed to load menu items', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const handleToggleAvailability = async (item: MenuItem) => {
    if (item.is_available === 1) {
      // Open modal to specify reason
      setActiveItemToDeactivate(item);
      setDeactivationReason('Ingredient stock unavailable');
      setCustomReason('');
      setShowDeactivateModal(true);
    } else {
      // Reactivate
      try {
        await api.updateMenuAvailability(item.id, { is_available: true });
        success(`"${item.name}" Reactivated`, 'Waiters can now order this dish again.');
        fetchMenuItems();
      } catch (err: any) {
        error('Reactivation failed', err.message);
      }
    }
  };

  const handleConfirmDeactivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItemToDeactivate) return;

    const finalReason = deactivationReason === 'Other' ? customReason : deactivationReason;
    if (!finalReason) {
      return error('Please provide a deactivation reason');
    }

    setSubmitting(true);
    try {
      await api.updateMenuAvailability(activeItemToDeactivate.id, {
        is_available: false,
        deactivation_reason: finalReason,
      });
      success(`"${activeItemToDeactivate.name}" Deactivated`, `Reason: ${finalReason}`);
      setShowDeactivateModal(false);
      setActiveItemToDeactivate(null);
      fetchMenuItems();
    } catch (err: any) {
      error('Deactivation failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const loadInventoryItems = async () => {
    try {
      const res = await api.getInventoryItems();
      setInventoryItems(res.items || []);
    } catch (err: any) {
      error('Failed to load inventory items for recipe', err.message);
    }
  };

  const openAddItem = async () => {
    await loadInventoryItems();
    setEditingItem(null);
    const defaultCat = isChef
      ? (categories.find((c) => c.name !== 'Drinks & Bar') || categories[0])
      : categories[0];
    setItemForm({
      name: '',
      category_id: defaultCat?.id || '',
      description: '',
      price: '',
      preparation_duration: '15',
    });
    setIngredientRows([]);
    setShowItemModal(true);
  };

  const openEditItem = async (item: MenuItem) => {
    await loadInventoryItems();
    setEditingItem(item);
    setItemForm({
      name: item.name,
      category_id: item.category_id,
      description: item.description || '',
      price: String(item.price),
      preparation_duration: String(item.preparation_duration ?? 15),
    });
    setIngredientRows(
      (item.ingredients || []).map((ing: any) => ({
        inventory_item_id: ing.inventory_item_id,
        quantity_required: String(ing.quantity_required),
        unit: ing.unit || 'units',
      }))
    );
    setShowItemModal(true);
  };

  const addIngredientRow = () => {
    setIngredientRows([...ingredientRows, { inventory_item_id: '', quantity_required: '1', unit: 'units' }]);
  };

  const updateIngredientRow = (idx: number, field: string, value: string) => {
    setIngredientRows(ingredientRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeIngredientRow = (idx: number) => {
    setIngredientRows(ingredientRows.filter((_, i) => i !== idx));
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.name || !itemForm.category_id || !itemForm.price) {
      return error('Name, category and price are required');
    }

    const validIngredients = ingredientRows.filter((r) => r.inventory_item_id);
    setSubmitting(true);
    try {
      const payload = {
        name: itemForm.name.trim(),
        category_id: itemForm.category_id,
        description: itemForm.description || null,
        price: parseFloat(itemForm.price),
        preparation_duration: parseInt(itemForm.preparation_duration || '15', 10),
        is_active: 1,
        ingredients: validIngredients.map((r) => ({
          inventory_item_id: r.inventory_item_id,
          quantity_required: parseFloat(r.quantity_required || '1'),
          unit: r.unit || 'units',
        })),
      };

      if (editingItem) {
        await api.updateMenuItem(editingItem.id, payload);
        success('Menu Item Updated', `"${payload.name}" updated successfully`);
      } else {
        await api.createMenuItem(payload);
        success('Menu Item Created', `"${payload.name}" added to the menu`);
      }
      setShowItemModal(false);
      fetchMenuItems();
    } catch (err: any) {
      error(editingItem ? 'Update failed' : 'Create failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteItem = (item: MenuItem) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    setSubmitting(true);
    try {
      await api.deleteMenuItem(itemToDelete.id);
      success('Menu Item Dropped', `"${itemToDelete.name}" removed from the menu`);
      setShowDeleteModal(false);
      setItemToDelete(null);
      fetchMenuItems();
    } catch (err: any) {
      error('Drop failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isChef = user?.role === 'chef';

  const filtered = menuItems.filter((it) => {
    const matchCat = selectedCategory === 'all' || it.category_id === selectedCategory;
    const matchSearch = it.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (isChef) {
      return (it.category_name !== 'Drinks & Bar') && matchCat && matchSearch;
    }
    return matchCat && matchSearch;
  });

  const kitchenCategories = categories.filter((c) => c.name !== 'Drinks & Bar');
  const formCategories = isChef ? kitchenCategories : categories;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-6 rounded-2xl border border-amber-500/20 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Menu & Recipe Ingredient Control</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isChef
                ? 'Chef: Create and edit kitchen menu items, adjust recipes, and control availability. Only kitchen items are shown.'
                : 'Create and update menu items, manage recipes, preparation times, and instant menu availability.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={openAddItem}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow flex items-center gap-1.5 transition-transform active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> New Menu Item
          </button>
          <button
            onClick={fetchMenuItems}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Live Stock
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search menu item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto no-scrollbar">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All ({menuItems.length})
          </button>
                    {formCategories.map((c) => (
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
      </div>

      {/* Menu Items Table / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((item) => {
          const isAvail = item.is_available === 1 && (item.available_servings || 0) > 0;

          return (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border transition-all shadow-lg flex flex-col justify-between ${
                isAvail
                  ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  : 'bg-rose-950/20 border-rose-500/30'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800">
                  <div>
                    <h4 className="text-sm font-bold text-white leading-snug">{item.name}</h4>
                    <span className="text-[10px] text-slate-400 font-semibold">{item.category_name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-amber-400 font-mono">{formatCurrency(item.price)}</span>
                    <p className="text-[10px] text-slate-400">⏱️ {item.preparation_duration} mins</p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 mt-2 leading-relaxed line-clamp-2">
                  {item.description || 'Prepared fresh in the motel kitchen.'}
                </p>

                {/* Recipe Ingredients & Live Stock */}
                <div className="mt-3 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                    <Boxes className="w-3 h-3 text-amber-400" />
                    Recipe Ingredients & Available Stock:
                  </p>
                  <div className="space-y-1">
                    {item.ingredients?.map((ing) => (
                      <div key={ing.id} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300">
                          {ing.quantity_required} {ing.unit} • {ing.inventory_name}
                        </span>
                        <span
                          className={`font-semibold ${
                            (ing.available_stock || 0) <= 0
                              ? 'text-rose-400'
                              : (ing.available_stock || 0) <= ing.quantity_required * 3
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          Stock: {ing.available_stock} {ing.inventory_unit}
                        </span>
                      </div>
                    ))}
                    {(!item.ingredients || item.ingredients.length === 0) && (
                      <p className="text-[10px] text-slate-400 italic">No inventory recipe linked.</p>
                    )}
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="mt-3 flex items-center justify-between">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                      isAvail
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {isAvail ? `${item.available_servings} Servings Available` : 'UNAVAILABLE'}
                  </span>

                  {item.deactivation_reason && (
                    <span className="text-[10px] text-rose-400 italic max-w-[140px] truncate">
                      "{item.deactivation_reason}"
                    </span>
                  )}
                </div>
              </div>

              {/* Chef Toggle Action */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {(!isChef || item.category_name !== 'Drinks & Bar') && (
                    <button
                      onClick={() => openEditItem(item)}
                      className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800 transition-colors"
                      title="Edit menu item & recipe"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {!isChef && (
                    <button
                      onClick={() => openDeleteItem(item)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                      title="Drop menu item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleToggleAvailability(item)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow ${
                    item.is_available === 1
                      ? 'bg-rose-600/90 hover:bg-rose-600 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {item.is_available === 1 ? (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> Deactivate Item
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate Item
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deactivation Reason Modal */}
      {showDeactivateModal && activeItemToDeactivate && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              Deactivate "{activeItemToDeactivate.name}"
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Specify the reason why this item is temporarily unavailable so waiters and guests are notified.
            </p>

            <form onSubmit={handleConfirmDeactivation} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reason</label>
                <select
                  value={deactivationReason}
                  onChange={(e) => setDeactivationReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="Ingredient stock unavailable">Ingredient stock unavailable</option>
                  <option value="Kitchen equipment maintenance (Grill/Oven)">Kitchen equipment maintenance</option>
                  <option value="Ingredient quality / freshness issue">Ingredient freshness issue</option>
                  <option value="Chef preparation capacity full">Kitchen rush / capacity full</option>
                  <option value="Other">Other reason (specify below)</option>
                </select>
              </div>

              {deactivationReason === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Custom Reason</label>
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="e.g. Awaiting morning fish delivery"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDeactivateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Deactivating...' : 'Confirm Deactivation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Menu Item Create/Edit Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-full sm:max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-amber-400" />
              {editingItem ? `Edit "${editingItem.name}"` : 'New Menu Item'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {editingItem
                ? 'Update details, price, or the recipe ingredients linked to inventory stock.'
                : 'Create a dish, link its recipe to inventory items, and set the serving price.'}
            </p>

            <form onSubmit={handleSaveItem} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Item Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Beef Brochette"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={itemForm.category_id}
                    onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  >
                    <option value="">Select category...</option>
          {formCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Grilled beef skewers with onions and pepper"
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Price ({formatCurrency(0)})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 8500"
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Prep Duration (mins)</label>
                  <input
                    type="number"
                    min="1"
                    value={itemForm.preparation_duration}
                    onChange={(e) => setItemForm({ ...itemForm, preparation_duration: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Recipe Ingredients */}
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Boxes className="w-3 h-3 text-amber-400" /> Recipe Ingredients
                  </p>
                  <button
                    type="button"
                    onClick={addIngredientRow}
                    className="px-2 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Ingredient
                  </button>
                </div>

                {ingredientRows.length === 0 && (
                  <p className="text-[10px] text-slate-500 italic mb-2">
                    No ingredients linked yet — the dish can still be created.
                  </p>
                )}

                <div className="space-y-2">
                  {ingredientRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                      <select
                        value={row.inventory_item_id}
                        onChange={(e) => updateIngredientRow(idx, 'inventory_item_id', e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white"
                      >
                        <option value="">Select stock item...</option>
                        {inventoryItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} [{inv.stock_label || 'Foods'}] (Stock: {inv.available_quantity ?? inv.current_quantity ?? 0} {inv.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.quantity_required}
                        onChange={(e) => updateIngredientRow(idx, 'quantity_required', e.target.value)}
                        placeholder="Qty"
                        title="Quantity required"
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white"
                      />
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(e) => updateIngredientRow(idx, 'unit', e.target.value)}
                        placeholder="Unit"
                        title="Unit"
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white"
                      />
                      <button
                        type="button"
                        onClick={() => removeIngredientRow(idx)}
                        className="p-1.5 text-slate-500 hover:text-rose-400"
                        title="Remove ingredient"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
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
                  {submitting ? 'Saving...' : editingItem ? 'Update Item' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drop Item Confirmation Modal */}
      {showDeleteModal && itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              Drop "{itemToDelete.name}"
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              This removes the dish from the menu permanently (including its recipe links). Waiters will no longer
              be able to order it. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-800">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteItem}
                disabled={submitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
              >
                {submitting ? 'Dropping...' : 'Drop Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
