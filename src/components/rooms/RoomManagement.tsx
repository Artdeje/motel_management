import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Room, Guest, RoomType } from '../../types';
import { formatCurrency, CURRENCY_SYMBOL } from '../../utils/currency';
import { daysFromTodayCAT, todayCAT } from '../../utils/dates';
import {
  BedDouble,
  Search,
  Filter,
  Plus,
  LogIn,
  LogOut,
  Sparkles,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  User,
  Phone,
  RefreshCw,
  Clock,
  Receipt,
  Edit3
} from 'lucide-react';

const ROOM_SERVICE_ESTIMATE = 0; // Deprecated: now calculated from real orders

export const RoomManagement: React.FC = () => {
  const { user } = useAuth();
  // PUT /api/rooms/:id is admin+manager; match it so the button never 403s.
  const canEditRooms = user?.role === 'admin' || user?.role === 'manager';
  const { success, error, info } = useToast();  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Check-In Modal State
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedRoomForCheckIn, setSelectedRoomForCheckIn] = useState<Room | null>(null);
  const [checkInForm, setCheckInForm] = useState({
    guest_id: '',
    guest_name: '',
    guest_phone: '',
    expected_check_out_date: daysFromTodayCAT(2),
    deposit_paid: '50000',
    payment_method: 'Cash',
    notes: '',
  });
  // Filters the existing-guest picker. Scrolling a full guest list to assign a
  // room is the slow part of check-in, so the admin can type instead.
  const [guestSearch, setGuestSearch] = useState('');

  // Check-Out Modal State
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [selectedRoomForCheckOut, setSelectedRoomForCheckOut] = useState<Room | null>(null);
  const [checkOutPaymentMethod, setCheckOutPaymentMethod] = useState('Cash');
  const [roomServiceCharges, setRoomServiceCharges] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Add Room / Add Room Type Modal State
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [showRoomTypeModal, setShowRoomTypeModal] = useState(false);
  const [roomForm, setRoomForm] = useState({
    room_number: '',
    floor: '1',
    room_type_id: '',
    price_per_night: '',
    notes: '',
  });
  const [roomTypeForm, setRoomTypeForm] = useState({
    name: '',
    code: '',
    base_price: '',
    capacity: '2',
    description: '',
    amenities: '',
  });

  const fetchRoomsData = async () => {
    try {
      setLoading(true);
      const [rRes, gRes] = await Promise.all([api.getRooms(), api.getGuests()]);
      setRooms(rRes.rooms || []);
      setRoomTypes(rRes.roomTypes || []);
      setGuests(gRes.guests || []);
    } catch (err: any) {
      error('Failed to load rooms', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomsData();
  }, []);

  // Nights between today and the chosen check-out date (minimum 1).
  const nightsUntil = (dateStr: string): number => {
    if (!dateStr) return 1;
    const out = new Date(`${dateStr}T00:00:00`);
    const today = new Date(`${todayCAT()}T00:00:00`);
    if (Number.isNaN(out.getTime())) return 1;
    return Math.max(1, Math.round((out.getTime() - today.getTime()) / 86400000));
  };

  const handleOpenCheckIn = (room: Room) => {
    setSelectedRoomForCheckIn(room);
    setGuestSearch('');
    setCheckInForm({
      // Deliberately blank: pre-selecting the first guest made it easy to
      // assign a room to the wrong person with a single click.
      guest_id: '',
      guest_name: '',
      guest_phone: '',
      expected_check_out_date: daysFromTodayCAT(2),
      deposit_paid: String(room.price_per_night),
      payment_method: 'Cash',
      notes: '',
    });
    setShowCheckInModal(true);
  };

  // Quick stay presets — set the check-out date N nights from today.
  const setStayNights = (nights: number) => {
    setCheckInForm((f) => ({ ...f, expected_check_out_date: daysFromTodayCAT(nights) }));
  };

  const handleOpenCheckOut = async (room: Room) => {
    setSelectedRoomForCheckOut(room);
    setCheckOutPaymentMethod('Cash');
    // Fetch real room service charges for this room
    try {
      const res = await api.getOrders({ room_id: room.id });
      const orders = res.orders || res || [];
      const total = Array.isArray(orders)
        ? orders.reduce((sum: number, o: any) => sum + (parseFloat(o.total_amount) || 0), 0)
        : 0;
      setRoomServiceCharges(total);
    } catch {
      setRoomServiceCharges(0);
    }
    setShowCheckOutModal(true);
  };

  const handleOpenAddRoom = () => {
    setEditingRoom(null);
    setRoomForm({
      room_number: '',
      floor: '1',
      room_type_id: roomTypes[0]?.id || '',
      price_per_night: '',
      notes: '',
    });
    setShowRoomModal(true);
  };

  const handleOpenEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomForm({
      room_number: room.room_number || '',
      floor: String(room.floor ?? '1'),
      room_type_id: room.room_type_id || roomTypes[0]?.id || '',
      price_per_night: String(room.price_per_night ?? ''),
      notes: (room as any).notes || '',
    });
    setShowRoomModal(true);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomForm.room_number || !roomForm.room_type_id || !roomForm.price_per_night) {
      return error('Room number, room category and price are required');
    }

    setSubmitting(true);
    const payload = {
      room_number: roomForm.room_number.trim(),
      floor: parseInt(roomForm.floor, 10),
      room_type_id: roomForm.room_type_id,
      price_per_night: parseFloat(roomForm.price_per_night),
      notes: roomForm.notes || null,
    };
    try {
      if (editingRoom) {
        await api.updateRoom(editingRoom.id, payload);
        success('Room Updated', `Room ${payload.room_number} saved successfully`);
      } else {
        await api.createRoom(payload);
        success('Room Added', `Room ${payload.room_number} registered successfully`);
      }
      setShowRoomModal(false);
      setEditingRoom(null);
      fetchRoomsData();
    } catch (err: any) {
      error(editingRoom ? 'Failed to update room' : 'Failed to add room', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAddRoomType = () => {
    setRoomTypeForm({
      name: '',
      code: '',
      base_price: '',
      capacity: '2',
      description: '',
      amenities: '',
    });
    setShowRoomTypeModal(true);
  };

  const handleCreateRoomType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomTypeForm.name || !roomTypeForm.code || !roomTypeForm.base_price) {
      return error('Category name, code and base price are required');
    }

    setSubmitting(true);
    try {
      await api.createRoomType({
        name: roomTypeForm.name.trim(),
        code: roomTypeForm.code.trim(),
        base_price: parseFloat(roomTypeForm.base_price),
        capacity: parseInt(roomTypeForm.capacity || '2', 10),
        description: roomTypeForm.description || null,
        amenities: roomTypeForm.amenities || null,
      });
      success('Room Category Added', `"${roomTypeForm.name}" created successfully`);
      setShowRoomTypeModal(false);
      fetchRoomsData();
    } catch (err: any) {
      error('Failed to add room category', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomForCheckIn) return;

    if (!checkInForm.guest_id && (!checkInForm.guest_name || !checkInForm.guest_phone)) {
      return error('Please select an existing guest or provide new guest name and phone');
    }

    setSubmitting(true);
    try {
      const payload = {
        room_id: selectedRoomForCheckIn.id,
        guest_id: checkInForm.guest_id || undefined,
        guest_name: checkInForm.guest_name || undefined,
        guest_phone: checkInForm.guest_phone || undefined,
        expected_check_out_date: checkInForm.expected_check_out_date,
        deposit_paid: parseFloat(checkInForm.deposit_paid || '0'),
        payment_method: checkInForm.payment_method,
        notes: checkInForm.notes || null,
      };

      await api.checkIn(payload);
      success('Guest Checked-In Successfully!', `Room ${selectedRoomForCheckIn.room_number} is now marked Occupied.`);
      setShowCheckInModal(false);
      fetchRoomsData();
    } catch (err: any) {
      error('Check-in failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCheckOut = async () => {
    if (!selectedRoomForCheckOut) return;
    setSubmitting(true);
    try {
      await api.checkOut({
        room_id: selectedRoomForCheckOut.id,
        payment_method: checkOutPaymentMethod,
      });
      success(
        'Check-Out Completed!',
        `Room ${selectedRoomForCheckOut.room_number} is now DIRTY and queued for Housekeeping cleaning.`
      );
      setShowCheckOutModal(false);
      fetchRoomsData();
    } catch (err: any) {
      error('Check-out failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (roomId: string, nextStatus: string) => {
    try {
      await api.updateRoomStatus(roomId, { status: nextStatus });
      success(`Room status updated to ${nextStatus}`);
      fetchRoomsData();
    } catch (err: any) {
      error('Status update failed', err.message);
    }
  };

  const filteredRooms = rooms.filter((r) => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchFloor = floorFilter === 'all' || String(r.floor) === floorFilter;
    const matchSearch =
      r.room_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.occupant_name && r.occupant_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.room_type_name && r.room_type_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchStatus && matchFloor && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
            <BedDouble className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Front Desk & Room Management</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live room grid, fast guest check-in/out, folio invoices & housekeeping status tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <button
            onClick={handleOpenAddRoomType}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 transition-transform active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> Add Room Category
          </button>
          <button
            onClick={handleOpenAddRoom}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 transition-transform active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> Add Room
          </button>
          <button
            onClick={fetchRoomsData}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Board
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search room number, guest name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-slate-500"
          />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto no-scrollbar">
          {['all', 'Available', 'Occupied', 'Dirty', 'Cleaning', 'Clean', 'Reserved', 'Maintenance'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-blue-500 text-white font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {st === 'all' ? `All (${rooms.length})` : st}
            </button>
          ))}
        </div>
      </div>

      {/* Room Summary by Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {roomTypes.map((rt) => {
          const typeRooms = rooms.filter((r) => r.room_type_id === rt.id);
          const available = typeRooms.filter((r) => r.status === 'Available').length;
          const occupied = typeRooms.filter((r) => r.status === 'Occupied').length;
          const dirty = typeRooms.filter((r) => r.status === 'Dirty').length;

          return (
            <div
              key={rt.id}
              className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg flex flex-col"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{rt.name}</p>
                <span className="text-2xl font-bold text-white">{typeRooms.length}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {formatCurrency(rt.base_price)} / night
              </p>
              <div className="flex items-center gap-2 mt-3 text-[10px] font-semibold">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {available} Available
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  {occupied} Occupied
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  {dirty} Dirty
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredRooms.map((room) => {
          const isAvailable = room.status === 'Available';
          const isOccupied = room.status === 'Occupied';
          const isDirty = room.status === 'Dirty';
          const isCleaning = room.status === 'Cleaning';
          const isClean = room.status === 'Clean';
          const isMaint = room.status === 'Maintenance';

          const statusColors: Record<string, string> = {
            Available: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
            Occupied: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
            Dirty: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
            Cleaning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
            Clean: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
            Reserved: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
            Maintenance: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
          };

          return (
            <div
              key={room.id}
              className={`p-4 rounded-2xl border transition-all shadow-xl flex flex-col justify-between ${
                isOccupied
                  ? 'bg-blue-950/20 border-blue-500/30'
                  : isDirty
                  ? 'bg-rose-950/20 border-rose-500/30'
                  : isAvailable
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-slate-900/90 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                  <div>
                    <span className="text-base font-bold text-white tracking-tight">
                      Room {room.room_number}
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Floor {room.floor} • {room.room_type_name}
                    </p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusColors[room.status]}`}>
                    {room.status}
                  </span>
                </div>

                <div className="py-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Rate:</span>
                    <span className="font-bold text-amber-400">{formatCurrency(room.price_per_night)} / night</span>
                  </div>

                  {isOccupied && room.occupant_name && (
                    <div className="bg-blue-500/10 border border-blue-500/20 p-2 rounded-xl text-blue-200 text-xs">
                      <p className="font-bold flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-blue-400" /> {room.occupant_name}
                      </p>
                      {room.occupant_phone && (
                        <p className="text-[10px] text-blue-300/80 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-blue-400" /> {room.occupant_phone}
                        </p>
                      )}
                    </div>
                  )}

                  {room.notes && (
                    <p className="text-[11px] text-slate-400 italic bg-slate-950/40 p-1.5 rounded-lg">
                      "{room.notes}"
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                {isAvailable && (
                  <button
                    onClick={() => handleOpenCheckIn(room)}
                    className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" /> Check-In Guest
                  </button>
                )}

                {canEditRooms && (
                  <button
                    onClick={() => handleOpenEditRoom(room)}
                    className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                    title="Edit room number, floor, category, rate or notes"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Room
                  </button>
                )}

                {isOccupied && (
                  <button
                    onClick={() => handleOpenCheckOut(room)}
                    className="w-full py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Settle & Check-Out
                  </button>
                )}

                {/* Cleaning available for ANY room status (except Available and already Cleaning) */}
                {!isAvailable && !isCleaning && (
                  <button
                    onClick={() => handleUpdateStatus(room.id, 'Cleaning')}
                    className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Start Cleaning
                  </button>
                )}

                {isCleaning && (
                  <button
                    onClick={() => handleUpdateStatus(room.id, 'Clean')}
                    className="w-full py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark Clean
                  </button>
                )}

                {isClean && (
                  <button
                    onClick={() => handleUpdateStatus(room.id, 'Available')}
                    className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Release to Available
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Check-In Modal */}
      {showCheckInModal && selectedRoomForCheckIn && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <LogIn className="w-5 h-5 text-emerald-400" />
              Check-In: Room {selectedRoomForCheckIn.room_number}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Rate: {formatCurrency(selectedRoomForCheckIn.price_per_night)}/night • Floor {selectedRoomForCheckIn.floor}
            </p>

            <form onSubmit={handleConfirmCheckIn} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assign To Guest</label>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    placeholder="Search guest by name, phone or code..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-500"
                  />
                </div>
                {(() => {
                  const q = guestSearch.trim().toLowerCase();
                  const matches = q
                    ? guests.filter((g) =>
                        `${g.full_name || ''} ${g.phone || ''} ${g.guest_code || ''}`.toLowerCase().includes(q)
                      )
                    : guests;
                  return (
                    <>
                      <select
                        value={checkInForm.guest_id}
                        onChange={(e) => setCheckInForm({ ...checkInForm, guest_id: e.target.value })}
                        size={Math.min(5, Math.max(2, matches.length + 1))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="">-- Register a new guest below --</option>
                        {matches.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.full_name} ({g.phone}) - {g.guest_code}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {q
                          ? `${matches.length} of ${guests.length} guests match "${guestSearch.trim()}"`
                          : `${guests.length} registered guests`}
                      </p>
                    </>
                  );
                })()}
              </div>

              {!checkInForm.guest_id && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Guest Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Eric Ndahiro"
                      value={checkInForm.guest_name}
                      onChange={(e) => setCheckInForm({ ...checkInForm, guest_name: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                      required={!checkInForm.guest_id}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+250 788 123 456"
                      value={checkInForm.guest_phone}
                      onChange={(e) => setCheckInForm({ ...checkInForm, guest_phone: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                      required={!checkInForm.guest_id}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Length Of Stay</label>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {[1, 2, 3, 7].map((nights) => {
                    const active = nightsUntil(checkInForm.expected_check_out_date) === nights;
                    return (
                      <button
                        key={nights}
                        type="button"
                        onClick={() => setStayNights(nights)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                          active
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {nights} night{nights > 1 ? 's' : ''}
                      </button>
                    );
                  })}
                  <span className="text-[10px] text-slate-500 ml-1">or pick a date</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expected Check-Out</label>
                  <input
                    type="date"
                    min={daysFromTodayCAT(1)}
                    value={checkInForm.expected_check_out_date}
                    onChange={(e) => setCheckInForm({ ...checkInForm, expected_check_out_date: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Deposit Paid ({CURRENCY_SYMBOL})</label>
                  <input
                    type="number"
                    min="0"
                    value={checkInForm.deposit_paid}
                    onChange={(e) => setCheckInForm({ ...checkInForm, deposit_paid: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setCheckInForm((f) => ({ ...f, deposit_paid: String(selectedRoomForCheckIn.price_per_night) }))}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                    >
                      1 night
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckInForm((f) => ({
                        ...f,
                        deposit_paid: String(Number(selectedRoomForCheckIn.price_per_night) * nightsUntil(f.expected_check_out_date)),
                      }))}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                    >
                      Full stay
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckInForm((f) => ({ ...f, deposit_paid: '0' }))}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                    >
                      None
                    </button>
                  </div>
                </div>
              </div>

              {/* Live stay summary so the admin sees the cost before assigning. */}
              {(() => {
                const nights = nightsUntil(checkInForm.expected_check_out_date);
                const rate = Number(selectedRoomForCheckIn.price_per_night) || 0;
                const total = rate * nights;
                const deposit = parseFloat(checkInForm.deposit_paid || '0') || 0;
                const balance = total - deposit;
                return (
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">
                        {nights} night{nights > 1 ? 's' : ''} &times; {formatCurrency(rate)}
                      </span>
                      <span className="font-mono font-bold text-white">{formatCurrency(total)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">Deposit paid now</span>
                      <span className="font-mono font-bold text-emerald-400">-{formatCurrency(deposit)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800">
                      <span className="font-bold text-slate-300">Balance at check-out</span>
                      <span className={`font-mono font-black ${balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatCurrency(Math.max(0, balance))}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Payment Method</label>
                <select
                  value={checkInForm.payment_method}
                  onChange={(e) => setCheckInForm({ ...checkInForm, payment_method: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="Credit Card">Credit / Debit Card</option>
                  <option value="Mobile Money">Mobile Money (MTN / Airtel)</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCheckInModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Checking In...' : 'Confirm Check-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check-Out Confirmation Modal */}
      {showCheckOutModal && selectedRoomForCheckOut && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <LogOut className="w-5 h-5 text-rose-400" />
              Settle Folio & Check-Out: Room {selectedRoomForCheckOut.room_number}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Guest: <strong>{selectedRoomForCheckOut.occupant_name || 'Guest'}</strong>
            </p>

            <div className="my-4 p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-300">
                <span>Room Charges:</span>
                <span className="font-semibold">{formatCurrency(selectedRoomForCheckOut.price_per_night * 2)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Room Service (Food & Bar):</span>
                <span className="font-semibold text-amber-400">{formatCurrency(roomServiceCharges)}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-400">
                <span>Deposit Paid:</span>
                <span>-{formatCurrency(selectedRoomForCheckOut.price_per_night)}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-bold text-white text-sm">
                <span>Net Balance Due:</span>
                <span className="text-amber-400">{formatCurrency(selectedRoomForCheckOut.price_per_night + roomServiceCharges)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Final Settlement Method</label>
              <select
                value={checkOutPaymentMethod}
                onChange={(e) => setCheckOutPaymentMethod(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="Cash">Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Mobile Money">Mobile Money</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-4">
              <button
                type="button"
                onClick={() => setShowCheckOutModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCheckOut}
                disabled={submitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                {submitting ? 'Settling...' : 'Complete & Mark Room Dirty'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add Room Type Modal */}
      {showRoomTypeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Add Room Category
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Register a new room type so rooms can be grouped and priced by category.
            </p>

            <form onSubmit={handleCreateRoomType} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Premium Twin"
                    value={roomTypeForm.name}
                    onChange={(e) => setRoomTypeForm({ ...roomTypeForm, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Code</label>
                  <input
                    type="text"
                    placeholder="e.g. PRM-TWN"
                    value={roomTypeForm.code}
                    onChange={(e) => setRoomTypeForm({ ...roomTypeForm, code: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Base Price / Night ({CURRENCY_SYMBOL})</label>
                  <input
                    type="number"
                    min="0"
                    value={roomTypeForm.base_price}
                    onChange={(e) => setRoomTypeForm({ ...roomTypeForm, base_price: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Capacity (Guests)</label>
                  <input
                    type="number"
                    min="1"
                    value={roomTypeForm.capacity}
                    onChange={(e) => setRoomTypeForm({ ...roomTypeForm, capacity: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Two queen beds with city view"
                  value={roomTypeForm.description}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Amenities</label>
                <input
                  type="text"
                  placeholder="e.g. WiFi, TV, Mini Fridge, Balcony"
                  value={roomTypeForm.amenities}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, amenities: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRoomTypeModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {editingRoom ? <Edit3 className="w-5 h-5 text-amber-400" /> : <Plus className="w-5 h-5 text-blue-400" />}
              {editingRoom ? `Edit Room ${editingRoom.room_number}` : 'Add New Room'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {editingRoom
                ? 'Update the room number, floor, category, rate or notes.'
                : 'Register a physical room under an existing category.'}
            </p>

            <form onSubmit={handleCreateRoom} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Room Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 305"
                    value={roomForm.room_number}
                    onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Floor</label>
                  <input
                    type="number"
                    min="1"
                    value={roomForm.floor}
                    onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Room Category</label>
                <select
                  value={roomForm.room_type_id}
                  onChange={(e) => setRoomForm({ ...roomForm, room_type_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                >
                  <option value="">Select category...</option>
                  {roomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name} ({formatCurrency(rt.base_price)}/night)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nightly Price ({CURRENCY_SYMBOL})</label>
                <input
                  type="number"
                  min="0"
                  value={roomForm.price_per_night}
                  onChange={(e) => setRoomForm({ ...roomForm, price_per_night: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Corner room with garden view"
                  value={roomForm.notes}
                  onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowRoomModal(false); setEditingRoom(null); }}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting
                    ? (editingRoom ? 'Saving...' : 'Adding...')
                    : (editingRoom ? 'Save Changes' : 'Add Room')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
