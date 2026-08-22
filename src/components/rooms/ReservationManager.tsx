import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Reservation, Room, Guest } from '../../types';
import {
  CalendarCheck,
  Search,
  Plus,
  XCircle,
  CheckCircle2,
  Clock,
  User,
  BedDouble,
  DollarSign,
  Phone,
  RefreshCw,
  LogIn,
  LogOut
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { todayCAT, daysFromTodayCAT, formatDateCAT } from '../../utils/dates';

export const ReservationManager: React.FC = () => {
  const { success, error } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [form, setForm] = useState({
    guest_id: '',
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    room_id: '',
    check_in_date: todayCAT(),
    check_out_date: daysFromTodayCAT(2),
    num_guests: '1',
    deposit_amount: '50000',
    special_requests: '',
  });
  const [guestSearch, setGuestSearch] = useState('');
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const matchedGuests = guestSearch.trim()
    ? guests.filter(
        (g) =>
          g.full_name.toLowerCase().includes(guestSearch.toLowerCase()) ||
          g.phone.includes(guestSearch) ||
          g.guest_code.toLowerCase().includes(guestSearch.toLowerCase())
      )
    : [];

  const hasExactMatch = matchedGuests.some(
    (g) => g.id === form.guest_id
  );

  const showInlineNewGuest = guestSearch.trim() && !hasExactMatch && matchedGuests.length === 0;

  const handleGuestSearchChange = (val: string) => {
    setGuestSearch(val);
    setShowGuestDropdown(true);
    if (val.trim()) {
      setForm({ ...form, guest_id: '', guest_name: '', guest_phone: '', guest_email: '' });
    }
  };

  const handleSelectGuest = (g: Guest) => {
    setForm({
      ...form,
      guest_id: g.id,
      guest_name: g.full_name,
      guest_phone: g.phone,
      guest_email: g.email || '',
    });
    setGuestSearch(g.full_name);
    setShowGuestDropdown(false);
  };

  const fetchReservations = async () => {
    try {
      setLoading(true);
      const [resRes, roomRes, guestRes] = await Promise.all([
        api.getReservations(),
        api.getRooms(),
        api.getGuests(),
      ]);
      setReservations(resRes.reservations || []);
      setRooms(roomRes.rooms || []);
      setGuests(guestRes.guests || []);
    } catch (err: any) {
      error('Failed to load reservations', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
  }, []);

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.room_id) return error('Please select a room');
    if (!form.check_in_date || !form.check_out_date) return error('Check-in and check-out dates are required');
    if (!form.guest_id && !form.guest_name) return error('Please select an existing guest or enter a new guest name');

    setSubmitting(true);
    try {
      const payload = {
        guest_id: form.guest_id || undefined,
        guest_name: form.guest_name || undefined,
        guest_phone: form.guest_phone || undefined,
        guest_email: form.guest_email || undefined,
        room_id: form.room_id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        num_guests: parseInt(form.num_guests || '1', 10),
        deposit_amount: parseFloat(form.deposit_amount || '0'),
        special_requests: form.special_requests || null,
      };

      const res = await api.createReservation(payload);
      success('Reservation Created!', `Booking confirmed with number ${res.reservation_number}`);
      setShowModal(false);
      fetchReservations();
    } catch (err: any) {
      error('Reservation failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelReservation = async (id: string, number: string) => {
    if (!window.confirm(`Are you sure you want to cancel reservation #${number}?`)) return;
    try {
      await api.cancelReservation(id);
      success('Reservation Cancelled');
      fetchReservations();
    } catch (err: any) {
      error('Cancellation failed', err.message);
    }
  };

  const handleCheckIn = async (resv: Reservation) => {
    if (!window.confirm(`Check in guest ${resv.guest_name} now for reservation #${resv.reservation_number}?`)) return;
    try {
      await api.checkIn({
        reservation_id: resv.id,
        guest_id: resv.guest_id,
        room_id: resv.room_id,
        expected_check_out_date: resv.check_out_date,
        deposit_paid: resv.deposit_amount,
        payment_method: 'Cash',
      });
      success('Guest Checked In', `Reservation #${resv.reservation_number} marked as CheckedIn, room now Occupied`);
      fetchReservations();
    } catch (err: any) {
      error('Check-in failed', err.message);
    }
  };

  const handleCheckOut = async (resv: Reservation) => {
    if (!window.confirm(`Check out guest ${resv.guest_name} from Room ${resv.room_number}? This will finalize all charges.`)) return;
    try {
      await api.checkOut({
        room_id: resv.room_id,
        payment_amount: 0,
        payment_method: 'Cash',
        notes: `Checked out via reservation #${resv.reservation_number}`,
      });
      success('Guest Checked Out', `Room ${resv.room_number} set to Dirty. Reservation #${resv.reservation_number} completed.`);
      fetchReservations();
    } catch (err: any) {
      error('Check-out failed', err.message);
    }
  };

  const filtered = reservations.filter((r) => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchSearch =
      r.reservation_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.guest_name && r.guest_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.room_number && r.room_number.includes(searchQuery));
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/30">
            <CalendarCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Motel Room Reservations</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Advance room booking, date conflict prevention, deposit collection & stay schedules.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-transform active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Reservation
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search reservation #, guest name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto no-scrollbar">
          {['all', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-purple-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {st === 'all' ? `All (${reservations.length})` : st}
            </button>
          ))}
        </div>
      </div>

      {/* Reservations Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="p-3.5">Booking #</th>
                <th className="p-3.5">Guest Details</th>
                <th className="p-3.5">Room</th>
                <th className="p-3.5">Dates</th>
                <th className="p-3.5">Total / Deposit</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filtered.map((resv) => (
                <tr key={resv.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-white">#{resv.reservation_number}</td>
                  <td className="p-3.5">
                    <p className="font-semibold text-white">{resv.guest_name}</p>
                    <p className="text-[11px] text-slate-400">{resv.guest_phone || 'No phone'}</p>
                  </td>
                  <td className="p-3.5">
                    <span className="font-bold text-amber-400">Room {resv.room_number}</span>
                    <p className="text-[10px] text-slate-400">{resv.room_type_name}</p>
                  </td>
                  <td className="p-3.5 text-slate-300">
                    <p className="font-medium">In: {formatDateCAT(resv.check_in_date)}</p>
                    <p className="text-[11px] text-slate-400">Out: {formatDateCAT(resv.check_out_date)}</p>
                  </td>
                  <td className="p-3.5">
                    <p className="font-bold text-white">{formatCurrency(resv.total_amount)}</p>
                    <p className="text-[10px] text-emerald-400 font-semibold">
                      Dep: {formatCurrency(resv.deposit_amount)}
                    </p>
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        resv.status === 'Confirmed'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : resv.status === 'CheckedIn'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : resv.status === 'CheckedOut'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {resv.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    {resv.status === 'Confirmed' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCheckIn(resv)}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[10px] rounded-lg shadow flex items-center gap-1 transition-transform active:scale-95"
                          title="Check in guest now"
                        >
                          <LogIn className="w-3.5 h-3.5" /> Check In
                        </button>
                        <button
                          onClick={() => handleCancelReservation(resv.id, resv.reservation_number)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded transition-colors"
                          title="Cancel Booking"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {resv.status === 'CheckedIn' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCheckOut(resv)}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] rounded-lg shadow flex items-center gap-1 transition-transform active:scale-95"
                          title="Check out guest & finalize charges"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Check Out
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No reservations found matching filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Reservation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-full sm:max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-purple-400" />
              Create Room Reservation
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Checks for booking overlaps automatically and reserves the room.
            </p>

            <form onSubmit={handleCreateReservation} className="mt-4 space-y-4">
              {/* Guest Search + Inline New Guest */}
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {form.guest_id ? 'Selected Guest' : 'Search Existing Guest or Type New Name'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={form.guest_id ? '✓ Guest selected — clear to search' : 'Type guest name, phone or code...'}
                    value={guestSearch}
                    onChange={(e) => handleGuestSearchChange(e.target.value)}
                    onFocus={() => !form.guest_id && setShowGuestDropdown(true)}
                    onBlur={() => setTimeout(() => setShowGuestDropdown(false), 200)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white"
                  />
                  {form.guest_id && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm({ ...form, guest_id: '', guest_name: '', guest_phone: '', guest_email: '' });
                        setGuestSearch('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown matches */}
                {showGuestDropdown && matchedGuests.length > 0 && (
                  <div className="absolute z-30 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {matchedGuests.slice(0, 8).map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onMouseDown={() => handleSelectGuest(g)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-700 flex items-center justify-between text-xs border-b border-slate-700/50 last:border-0"
                      >
                        <div>
                          <span className="font-semibold text-white">{g.full_name}</span>
                          <span className="text-slate-400 ml-2">{g.phone}</span>
                        </div>
                        <span className="text-teal-400 font-mono text-[10px]">{g.guest_code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Inline new guest fields — only visible if no dropdown match */}
              {showInlineNewGuest && (
                <div className="p-3 bg-teal-950/20 rounded-xl border border-teal-800/40 space-y-2">
                  <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-wide">New Guest — fill details below</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Full Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. David Mugisha"
                        value={form.guest_name}
                        onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                        required={!form.guest_id}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Phone *</label>
                      <input
                        type="tel"
                        placeholder="+250 788 000 111"
                        value={form.guest_phone}
                        onChange={(e) => setForm({ ...form, guest_phone: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                        required={!form.guest_id}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Email (optional)</label>
                    <input
                      type="email"
                      placeholder="guest@example.com"
                      value={form.guest_email}
                      onChange={(e) => setForm({ ...form, guest_email: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Select Room</label>
                <select
                  value={form.room_id}
                  onChange={(e) => setForm({ ...form, room_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                >
                  <option value="">Select available room...</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number} - {r.room_type_name} ({formatCurrency(r.price_per_night)}/night)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Check-In Date</label>
                  <input
                    type="date"
                    value={form.check_in_date}
                    onChange={(e) => setForm({ ...form, check_in_date: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Check-Out Date</label>
                  <input
                    type="date"
                    value={form.check_out_date}
                    onChange={(e) => setForm({ ...form, check_out_date: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Number of Guests</label>
                  <input
                    type="number"
                    min="1"
                    value={form.num_guests}
                    onChange={(e) => setForm({ ...form, num_guests: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Deposit Amount (RWF)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.deposit_amount}
                    onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Confirming...' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
