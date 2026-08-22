import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  CalendarDays,
  Clock,
  UserCheck,
  CheckCircle2,
  XCircle,
  Plus,
  ArrowRightLeft,
  Users,
  Play,
  Square,
  RefreshCw
} from 'lucide-react';
import { formatNowCAT, formatTimeCAT, todayCAT, formatDateCAT } from '../../utils/dates';

export const StaffSchedule: React.FC<{ initialTab?: 'schedule' | 'swaps' | 'attendance' }> = ({ initialTab }) => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<any[]>([]);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'schedule' | 'swaps' | 'attendance'>(initialTab || 'schedule');

  // Modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    user_id: '',
    shift_date: todayCAT(),
    shift_type: 'Morning',
    notes: '',
  });

  const [swapForm, setSwapForm] = useState({
    requesting_shift_id: '',
    target_user_id: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchStaffData = async () => {
    try {
      setLoading(true);
      const [shiftRes, swapRes, attRes, usersRes] = await Promise.all([
        api.getShifts(),
        api.getShiftSwaps(),
        api.getAttendance(),
        api.getUsers(),
      ]);
      setShifts(shiftRes.shifts || []);
      setSwaps(swapRes.swaps || []);
      setAttendance(attRes.attendance || []);
      setUsersList(usersRes.users || []);
    } catch (err: any) {
      error('Failed to load staff schedule data', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffData();
  }, []);

  const handleClockIn = async () => {
    try {
      await api.clockIn({});
      success('Clocked In Successfully', `Recorded at ${formatNowCAT()}`);
      fetchStaffData();
    } catch (err: any) {
      error('Clock-in failed', err.message);
    }
  };

  const handleClockOut = async () => {
    try {
      await api.clockOut({});
      success('Clocked Out Successfully', `Recorded at ${formatNowCAT()}`);
      fetchStaffData();
    } catch (err: any) {
      error('Clock-out failed', err.message);
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftForm.user_id) return error('Please select a staff member');

    setSubmitting(true);
    try {
      await api.createShift(shiftForm);
      success('Shift Assigned Successfully');
      setShowShiftModal(false);
      fetchStaffData();
    } catch (err: any) {
      error('Failed to assign shift', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveSwap = async (swapId: string) => {
    try {
      await api.updateShiftSwap(swapId, { status: 'Approved' });
      success('Shift Swap Approved & Roster Updated');
      fetchStaffData();
    } catch (err: any) {
      error('Approval failed', err.message);
    }
  };

  const handleRejectSwap = async (swapId: string) => {
    try {
      await api.updateShiftSwap(swapId, { status: 'Rejected' });
      success('Shift Swap Request Rejected');
      fetchStaffData();
    } catch (err: any) {
      error('Rejection failed', err.message);
    }
  };

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  // Check if current user is currently clocked in
  const myCurrentAttendance = attendance.find(
    (a) => a.user_id === user?.id && a.clock_out_time === null
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Staff Scheduling & Attendance</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Shift rosters (Morning, Afternoon, Night), shift swap approvals & digital time clocking.
            </p>
          </div>
        </div>

        {/* Time Clock Action */}
        <div className="flex items-center gap-3 flex-wrap">
          {myCurrentAttendance ? (
            <button
              onClick={handleClockOut}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-500/25 flex items-center gap-2 transition-transform active:scale-95 animate-pulse"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Clock Out (On Duty)
            </button>
          ) : (
            <button
              onClick={handleClockIn}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-transform active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Clock In for Duty
            </button>
          )}

          {canManage && (
            <button
              onClick={() => setShowShiftModal(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Assign Shift
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'schedule'
              ? 'bg-indigo-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Weekly Shift Roster ({shifts.length})
        </button>

        <button
          onClick={() => setActiveTab('swaps')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'swaps'
              ? 'bg-indigo-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Shift Swaps ({swaps.length})
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'attendance'
              ? 'bg-indigo-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Attendance Timesheet ({attendance.length})
        </button>
      </div>

      {/* TAB 1: SHIFTS */}
      {activeTab === 'schedule' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((s) => (
            <div
              key={s.id}
              className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                  <div>
                    <h4 className="text-sm font-bold text-white">{s.employee_name}</h4>
                    <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
                      {s.employee_role}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {s.shift_type}
                  </span>
                </div>

                <div className="py-3 text-xs space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Date:</span>
                    <span className="font-semibold text-white">{formatDateCAT(s.shift_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hours:</span>
                    <span className="text-amber-400 font-mono">
                      {s.start_time} - {s.end_time}
                    </span>
                  </div>
                  {s.notes && <p className="text-[11px] text-slate-400 italic">"{s.notes}"</p>}
                </div>
              </div>
            </div>
          ))}
          {shifts.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-500 text-xs bg-slate-900/60 rounded-2xl border border-slate-800">
              No shifts assigned for this week. Click "Assign Shift" to schedule staff.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SWAPS */}
      {activeTab === 'swaps' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {swaps.map((sw) => (
              <div
                key={sw.id}
                className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-white">Shift Swap Request</h4>
                      <p className="text-xs text-indigo-400">
                        {sw.requesting_employee_name} ➔ {sw.target_employee_name}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        sw.status === 'Approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : sw.status === 'Pending'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {sw.status}
                    </span>
                  </div>

                  <div className="py-3 text-xs space-y-1 text-slate-300">
                    <p>Shift Date: <strong className="text-white">{formatDateCAT(sw.shift_date)} ({sw.shift_type})</strong></p>
                    <p className="text-slate-400 italic">Reason: "{sw.reason}"</p>
                  </div>
                </div>

                {sw.status === 'Pending' && canManage && (
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleRejectSwap(sw.id)}
                      className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold rounded-xl border border-rose-500/30"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproveSwap(sw.id)}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl shadow"
                    >
                      Approve Swap
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE TIMESHEET */}
      {activeTab === 'attendance' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="p-3.5">Staff Member</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Clock In</th>
                  <th className="p-3.5">Clock Out</th>
                  <th className="p-3.5">Total Hours</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {attendance.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-3.5 font-bold text-white">{att.employee_name}</td>
                    <td className="p-3.5 text-slate-400">{formatDateCAT(att.date)}</td>
                    <td className="p-3.5 text-emerald-400 font-mono">
                      {formatTimeCAT(att.clock_in_time)}
                    </td>
                    <td className="p-3.5 text-amber-400 font-mono">
                      {att.clock_out_time
                        ? formatTimeCAT(att.clock_out_time)
                        : 'On Duty (Active)'}
                    </td>
                    <td className="p-3.5 font-bold text-white">{att.total_hours_worked || '-'} hrs</td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          att.status === 'Present'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {att.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Shift Modal */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-indigo-400" />
              Assign Staff Shift
            </h3>

            <form onSubmit={handleCreateShift} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Staff Member</label>
                <select
                  value={shiftForm.user_id}
                  onChange={(e) => setShiftForm({ ...shiftForm, user_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                >
                  <option value="">Select employee...</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Shift Date</label>
                  <input
                    type="date"
                    value={shiftForm.shift_date}
                    onChange={(e) => setShiftForm({ ...shiftForm, shift_date: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Shift Type</label>
                  <select
                    value={shiftForm.shift_type}
                    onChange={(e) => setShiftForm({ ...shiftForm, shift_type: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Morning">Morning (06:00 - 14:00)</option>
                    <option value="Afternoon">Afternoon (14:00 - 22:00)</option>
                    <option value="Night">Night (22:00 - 06:00)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Lead morning breakfast rush"
                  value={shiftForm.notes}
                  onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Assigning...' : 'Assign Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
