import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { NavView } from '../layout/Sidebar';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  Check,
  Wrench,
  Boxes,
  PlusCircle,
  Clock,
  RefreshCw,
  BedDouble
} from 'lucide-react';
import { formatTimeCAT } from '../../utils/dates';

interface HousekeeperDashboardProps {
  onNavigate: (view: NavView) => void;
}

export const HousekeeperDashboard: React.FC<HousekeeperDashboardProps> = ({ onNavigate }) => {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<any[]>([]);
  const [supplyAlerts, setSupplyAlerts] = useState<any[]>([]);
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [showSupplyModal, setShowSupplyModal] = useState(false);

  const [maintForm, setMaintForm] = useState({
    room_id: '',
    issue_type: 'Plumbing',
    description: '',
    severity: 'Medium',
  });

  const [supplyForm, setSupplyForm] = useState({
    department: 'Housekeeping',
    priority: 'Normal',
    reason: 'Restocking floor linen and cleaning agents',
    items: [{ item_id: '', quantity_requested: '1', unit: 'pieces' }],
  });

  const [submitting, setSubmitting] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const [hkRes, invRes] = await Promise.all([
        api.getHousekeepingRooms(),
        api.getInventoryItems(),
      ]);
      setRooms(hkRes.rooms || []);
      setSupplyAlerts(hkRes.supplyAlerts || []);
      setInventoryItems((invRes.items || invRes || []).filter((i: any) => i.department === 'Housekeeping' && i.is_active));
    } catch (err: any) {
      error('Failed to load housekeeping data', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleStartCleaning = async (roomId: string, roomNumber: string) => {
    try {
      await api.startCleaning(roomId);
      success(`Started cleaning Room ${roomNumber}`);
      fetchRooms();
    } catch (err: any) {
      error('Failed to start cleaning', err.message);
    }
  };

  const handleCompleteCleaning = async (roomId: string, roomNumber: string) => {
    try {
      await api.completeCleaning(roomId);
      success(`Room ${roomNumber} marked as CLEAN!`);
      fetchRooms();
    } catch (err: any) {
      error('Failed to complete cleaning', err.message);
    }
  };

  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintForm.description) return error('Please provide a description of the issue');
    setSubmitting(true);
    try {
      await api.createMaintenanceTicket(maintForm);
      success('Maintenance ticket logged successfully');
      setShowMaintModal(false);
      setMaintForm({ room_id: '', issue_type: 'Plumbing', description: '', severity: 'Medium' });
      fetchRooms();
    } catch (err: any) {
      error('Failed to report maintenance issue', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSupplyRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createStockRequest(supplyForm);
      success('Supply request submitted to Management for approval');
      setShowSupplyModal(false);
      fetchRooms();
    } catch (err: any) {
      error('Failed to submit supply request', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const dirtyCount = rooms.filter((r) => r.status === 'Dirty').length;
  const cleaningCount = rooms.filter((r) => r.status === 'Cleaning').length;
  const cleanCount = rooms.filter((r) => r.status === 'Clean').length;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 p-6 rounded-2xl border border-emerald-500/20 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Housekeeping Operations Station</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Room cleaning lifecycle (Dirty → Cleaning → Clean), maintenance reports & supply restocking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowMaintModal(true)}
            className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs rounded-xl border border-amber-500/30 flex items-center gap-1.5 transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" />
            Report Issue / Damage
          </button>
          <button
            onClick={() => setShowSupplyModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Boxes className="w-3.5 h-3.5" />
            Request Supplies
          </button>
        </div>
      </div>

      {/* KPI Status Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs text-rose-300 font-medium">Dirty Rooms Awaiting Cleaning</p>
            <p className="text-2xl font-bold text-rose-100 mt-1">{dirtyCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/20 text-rose-300">
            <BedDouble className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs text-amber-300 font-medium">Cleaning In Progress</p>
            <p className="text-2xl font-bold text-amber-100 mt-1">{cleaningCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/20 text-amber-300">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs text-emerald-300 font-medium">Inspected & Clean Rooms</p>
            <p className="text-2xl font-bold text-emerald-100 mt-1">{cleanCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-300">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Grid: Rooms List + Supply Alert Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rooms Cleaning Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Room Cleaning Schedule & Status
            </h3>
            <button
              onClick={fetchRooms}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh List
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rooms.map((room) => {
              const isDirty = room.status === 'Dirty';
              const isCleaning = room.status === 'Cleaning';
              const isClean = room.status === 'Clean';

              const statusColor = isDirty
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                : isCleaning
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : isClean
                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                : 'bg-slate-800 text-slate-300 border-slate-700';

              return (
                <div
                  key={room.id}
                  className={`p-4 rounded-2xl border transition-all shadow-lg ${
                    isDirty
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : isCleaning
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <span className="text-sm font-bold text-white">Room {room.room_number}</span>
                      <p className="text-[11px] text-slate-400">
                        Floor {room.floor} • {room.room_type_name || 'Standard Room'}
                      </p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}`}>
                      {room.status}
                    </span>
                  </div>

                  <div className="py-2 text-xs text-slate-300 space-y-1">
                    {room.notes && <p className="text-[11px] text-slate-400 italic">"{room.notes}"</p>}
                    {room.last_cleaned_at && (
                      <p className="text-[10px] text-slate-400">
                        Last cleaned: {formatTimeCAT(room.last_cleaned_at)}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
                    {isDirty && (
                      <button
                        onClick={() => handleStartCleaning(room.id, room.room_number)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                      >
                        <Play className="w-3.5 h-3.5" /> Start Cleaning
                      </button>
                    )}

                    {isCleaning && (
                      <button
                        onClick={() => handleCompleteCleaning(room.id, room.room_number)}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Complete Cleaning
                      </button>
                    )}

                    {isClean && (
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Guests
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cleaning Supplies Alerts */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Housekeeping Supplies</h3>
              </div>
              <button
                onClick={() => setShowSupplyModal(true)}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
              >
                + Request
              </button>
            </div>

            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
              {supplyAlerts.map((item: any) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-xs flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="text-[10px] text-amber-300">
                      In Stock: {item.current_quantity} {item.unit}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{item.category_name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Maintenance Modal */}
      {showMaintModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-400" />
              Report Damage / Maintenance Issue
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Creates a maintenance trouble ticket. High/Critical tickets automatically set the room to Maintenance status.
            </p>

            <form onSubmit={handleCreateMaintenance} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Room (optional)</label>
                <select
                  value={maintForm.room_id}
                  onChange={(e) => setMaintForm({ ...maintForm, room_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">General Area / Not Room Specific</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number} (Floor {r.floor})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Issue Category</label>
                  <select
                    value={maintForm.issue_type}
                    onChange={(e) => setMaintForm({ ...maintForm, issue_type: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Plumbing">Plumbing / Water</option>
                    <option value="Electrical">Electrical / Lights</option>
                    <option value="AC / Heating">AC / HVAC</option>
                    <option value="Furniture">Furniture / Bedding</option>
                    <option value="Door / Lock">Door / Lock</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Severity</label>
                  <select
                    value={maintForm.severity}
                    onChange={(e) => setMaintForm({ ...maintForm, severity: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Low">Low (Minor)</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical (Room unusable)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  value={maintForm.description}
                  onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
                  placeholder="Describe the defect, leak, or damage..."
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMaintModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Log Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supply Request Modal */}
      {showSupplyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-emerald-400" />
              Request Housekeeping Supplies
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Submit replenishment request to Management for review & inventory issuance.
            </p>

            <form onSubmit={handleCreateSupplyRequest} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Item to Request</label>
                <select
                  value={supplyForm.items[0].item_id}
                  onChange={(e) =>
                    setSupplyForm({
                      ...supplyForm,
                      items: [{ ...supplyForm.items[0], item_id: e.target.value }],
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">-- Select item --</option>
                  {inventoryItems.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Quantity Requested</label>
                <input
                  type="number"
                  min="1"
                  value={supplyForm.items[0].quantity_requested}
                  onChange={(e) =>
                    setSupplyForm({
                      ...supplyForm,
                      items: [{ ...supplyForm.items[0], quantity_requested: e.target.value }],
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reason / Priority</label>
                <input
                  type="text"
                  value={supplyForm.reason}
                  onChange={(e) => setSupplyForm({ ...supplyForm, reason: e.target.value })}
                  placeholder="e.g. Floor 2 restocking"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSupplyModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
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
