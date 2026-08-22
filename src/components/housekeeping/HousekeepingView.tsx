import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Sparkles,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Play,
  Check,
  Clock,
  RefreshCw,
  Plus,
  BedDouble
} from 'lucide-react';
import { formatTimeCAT, formatDateCAT } from '../../utils/dates';

export const HousekeepingView: React.FC = () => {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<any[]>([]);
  const [maintenanceTickets, setMaintenanceTickets] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'rooms' | 'maintenance'>('rooms');

  // Maintenance Modal
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [maintForm, setMaintForm] = useState({
    room_id: '',
    issue_type: 'Plumbing',
    description: '',
    severity: 'Medium',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchHousekeeping = async () => {
    try {
      setLoading(true);
      const [hkRes, maintRes] = await Promise.all([
        api.getHousekeepingRooms(),
        api.getMaintenanceTickets(),
      ]);
      setRooms(hkRes.rooms || []);
      setMaintenanceTickets(maintRes.tickets || []);
    } catch (err: any) {
      error('Failed to load housekeeping data', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHousekeeping();
  }, []);

  const handleStartCleaning = async (roomId: string) => {
    try {
      await api.startCleaning(roomId);
      success('Cleaning Started');
      fetchHousekeeping();
    } catch (err: any) {
      error('Failed to update status', err.message);
    }
  };

  const handleCompleteCleaning = async (roomId: string) => {
    try {
      await api.completeCleaning(roomId);
      success('Room Marked Clean & Sanitized');
      fetchHousekeeping();
    } catch (err: any) {
      error('Failed to complete cleaning', err.message);
    }
  };

  const handleResolveTicket = async (ticketId: string) => {
    try {
      await api.updateMaintenanceTicket(ticketId, { status: 'Resolved' });
      success('Maintenance Ticket Resolved & Room Unblocked');
      fetchHousekeeping();
    } catch (err: any) {
      error('Failed to resolve ticket', err.message);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintForm.description) return error('Description is required');

    setSubmitting(true);
    try {
      await api.createMaintenanceTicket(maintForm);
      success('Maintenance Ticket Logged');
      setShowMaintModal(false);
      setMaintForm({ room_id: '', issue_type: 'Plumbing', description: '', severity: 'Medium' });
      fetchHousekeeping();
    } catch (err: any) {
      error('Failed to report issue', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Housekeeping & Maintenance Board</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Room turnover schedule (Dirty → Cleaning → Clean) & facility trouble tickets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMaintModal(true)}
            className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs rounded-xl border border-amber-500/30 flex items-center gap-1.5 transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" /> Report Damage / Fault
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('rooms')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'rooms'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <BedDouble className="w-3.5 h-3.5" />
          Room Cleaning Queue ({rooms.length})
        </button>
        <button
          onClick={() => setActiveTab('maintenance')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'maintenance'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          Maintenance Tickets ({maintenanceTickets.length})
        </button>
      </div>

      {/* TAB 1: ROOMS CLEANING BOARD */}
      {activeTab === 'rooms' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rooms.map((room) => {
            const isDirty = room.status === 'Dirty';
            const isCleaning = room.status === 'Cleaning';
            const isClean = room.status === 'Clean';

            return (
              <div
                key={room.id}
                className={`p-4 rounded-2xl border transition-all shadow-lg flex flex-col justify-between ${
                  isDirty
                    ? 'bg-rose-950/20 border-rose-500/30'
                    : isCleaning
                    ? 'bg-amber-950/20 border-amber-500/30'
                    : isClean
                    ? 'bg-sky-950/20 border-sky-500/30'
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                    <div>
                      <span className="text-sm font-bold text-white">Room {room.room_number}</span>
                      <p className="text-[11px] text-slate-400">Floor {room.floor} • {room.room_type_name}</p>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isDirty
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : isCleaning
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : isClean
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {room.status}
                    </span>
                  </div>

                  <div className="py-3 text-xs space-y-1">
                    {room.notes && (
                      <p className="text-[11px] text-slate-400 italic">"{room.notes}"</p>
                    )}
                    {room.last_cleaned_at && (
                      <p className="text-[10px] text-slate-500">
                        Cleaned: {formatTimeCAT(room.last_cleaned_at)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-end">
                  {!isCleaning && room.status !== 'Available' && (
                    <button
                      onClick={() => handleStartCleaning(room.id)}
                      className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow flex items-center justify-center gap-1"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Cleaning
                    </button>
                  )}
                  {isCleaning && (
                    <button
                      onClick={() => handleCompleteCleaning(room.id)}
                      className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Complete Clean
                    </button>
                  )}
                  {isClean && (
                    <span className="text-xs text-sky-400 font-semibold flex items-center gap-1 py-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Inspection
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: MAINTENANCE TICKETS */}
      {activeTab === 'maintenance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {maintenanceTickets.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                  <div>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      #{t.ticket_number}
                    </span>
                    <h4 className="text-sm font-bold text-white">
                      {t.room_number ? `Room ${t.room_number} - ` : ''}
                      {t.issue_type}
                    </h4>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      t.status === 'Resolved'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>

                <div className="py-3 text-xs space-y-1.5 text-slate-300">
                  <p className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                    {t.description}
                  </p>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Severity: <strong className="text-amber-400">{t.severity}</strong></span>
                    <span>Reported by: {t.reported_by_name || 'Staff'}</span>
                  </div>
                </div>
              </div>

              {t.status !== 'Resolved' && (
                <div className="pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleResolveTicket(t.id)}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
                  </button>
                </div>
              )}
            </div>
          ))}
          {maintenanceTickets.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-500 text-xs bg-slate-900/60 rounded-2xl border border-slate-800">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              No open maintenance tickets. All motel rooms & facilities are operating normally.
            </div>
          )}
        </div>
      )}

      {/* Maintenance Modal */}
      {showMaintModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-400" />
              Report Maintenance Trouble Ticket
            </h3>

            <form onSubmit={handleCreateTicket} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Room (Optional)</label>
                <select
                  value={maintForm.room_id}
                  onChange={(e) => setMaintForm({ ...maintForm, room_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">General Facility / Common Area</option>
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
                    <option value="Plumbing">Plumbing</option>
                    <option value="Electrical">Electrical</option>
                    <option value="HVAC">AC / Heating</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Keycard Lock">Keycard Lock</option>
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
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical (Block room)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  placeholder="Describe the leak, broken lamp, lock malfunction..."
                  value={maintForm.description}
                  onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
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
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Reporting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
