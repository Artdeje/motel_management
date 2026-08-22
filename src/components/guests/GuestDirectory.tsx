import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { Guest } from '../../types';
import {
  Users,
  Search,

  Phone,
  Mail,
  CreditCard,
  History,
  Calendar,
  DollarSign,
  UserCheck,
  Eye,
  RefreshCw,
  Download,
  FileText,
  Trophy,
  TrendingUp,
  Bed
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { formatDateCAT, formatDateTimeCAT } from '../../utils/dates';

export const GuestDirectory: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const { getSetting } = useCms();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedGuestProfile, setSelectedGuestProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const isAdmin = user?.role === 'admin';

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    id_passport_number: '',
    nationality: 'Rwandan',
    address: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchGuests = async () => {
    try {
      setLoading(true);
      const res = await api.getGuests();
      setGuests(res.guests || []);
    } catch (err: any) {
      error('Failed to load guests', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuests();
  }, []);

  const handleCreateGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.phone) {
      return error('Name and phone number are required');
    }

    setSubmitting(true);
    try {
      await api.createGuest(form);
      success('Guest Profile Created Successfully');
      setShowAddModal(false);
      setForm({
        full_name: '',
        phone: '',
        email: '',
        id_passport_number: '',
        nationality: 'Rwandan',
        address: '',
        notes: '',
      });
      fetchGuests();
    } catch (err: any) {
      error('Failed to create guest', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewProfile = async (guestId: string) => {
    try {
      setProfileLoading(true);
      setSelectedGuestProfile(null);
      const res = await api.getGuestHistory(guestId);
      setSelectedGuestProfile(res);
    } catch (err: any) {
      error('Failed to load guest history', err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const filtered = guests.filter((g) => {
    const q = searchQuery.toLowerCase();
    return (
      g.full_name.toLowerCase().includes(q) ||
      g.phone.includes(q) ||
      g.guest_code.toLowerCase().includes(q) ||
      (g.email && g.email.toLowerCase().includes(q))
    );
  });

  const visitRanks = useMemo(() => {
    const sorted = [...guests].sort((a, b) => (b.total_stays || 0) - (a.total_stays || 0));
    const rankMap: Record<string, number> = {};
    sorted.forEach((g, i) => { rankMap[g.id] = i + 1; });
    return rankMap;
  }, [guests]);

  const handleViewAllPDF = () => {
    const rows = filtered.map((g, i) => {
      const rank = visitRanks[g.id] || i + 1;
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${rank}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;font-weight:bold;">${g.guest_code}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${g.full_name}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${g.phone}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${g.email || 'N/A'}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${g.nationality || 'N/A'}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">${g.total_stays || 0}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold;color:#059669;">${formatCurrency((g as any).total_spent || 0)}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${(g as any).last_stay_date ? formatDateCAT((g as any).last_stay_date) : 'Never'}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><title>Guest Directory — ${getSetting('site_title', 'Grand Horizon Motel')}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f1f5f9; padding: 8px; text-align: left; border-bottom: 2px solid #94a3b8; font-weight: 700; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; }
</style></head><body>
<h1>Guest Directory — ${getSetting('site_title', 'Grand Horizon Motel & Bistro')}</h1>
<p class="subtitle">Generated: ${new Date().toLocaleString()} • Total Guests: ${filtered.length}</p>
<table>
  <thead><tr>
    <th>#</th><th>Guest Code</th><th>Full Name</th><th>Phone</th><th>Email</th>
    <th>Nationality</th><th style="text-align:center">Visits</th><th style="text-align:right">Total Spent</th><th>Last Visit</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">${getSetting('site_title', 'Grand Horizon Motel & Bistro')} — Guest Directory Report</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleDownloadPDF = () => {
    const rows = filtered.map((g, i) => {
      const rank = visitRanks[g.id] || i + 1;
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${rank}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;font-weight:bold;">${g.guest_code}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${g.full_name}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${g.phone}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${g.email || 'N/A'}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${g.nationality || 'N/A'}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">${g.total_stays || 0}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold;color:#059669;">${formatCurrency((g as any).total_spent || 0)}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${(g as any).last_stay_date ? formatDateCAT((g as any).last_stay_date) : 'Never'}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><title>Guest Directory — ${getSetting('site_title', 'Grand Horizon Motel')}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f1f5f9; padding: 8px; text-align: left; border-bottom: 2px solid #94a3b8; font-weight: 700; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 20px; } }
</style></head><body>
<h1>Guest Directory — ${getSetting('site_title', 'Grand Horizon Motel & Bistro')}</h1>
<p class="subtitle">Generated: ${new Date().toLocaleString()} • Total Guests: ${filtered.length}</p>
<table>
  <thead><tr>
    <th>#</th><th>Guest Code</th><th>Full Name</th><th>Phone</th><th>Email</th>
    <th>Nationality</th><th style="text-align:center">Visits</th><th style="text-align:right">Total Spent</th><th>Last Visit</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">${getSetting('site_title', 'Grand Horizon Motel & Bistro')} — Guest Directory Report</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guest-directory-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Guest Directory & Folio History</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Guest profiles, identification, loyalty stay records & aggregate lifetime spending.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleViewAllPDF}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> View PDF Directory
          </button>
          <button
            onClick={handleDownloadPDF}
            className="px-3.5 py-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 font-semibold text-xs rounded-xl border border-teal-500/30 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download Directory
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, phone, code (e.g. GST-101)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500"
          />
        </div>
        <span className="text-xs text-slate-400 font-semibold">{filtered.length} Registered Guests</span>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-md">
          <div>
            <p className="text-[11px] text-slate-400">Total Guests</p>
            <p className="text-2xl font-bold text-white mt-1">{guests.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Users className="w-5 h-5" />
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-md">
          <div>
            <p className="text-[11px] text-slate-400">Total Revenue</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{formatCurrency(guests.reduce((s, g) => s + ((g as any).total_spent || 0), 0))}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-md">
          <div>
            <p className="text-[11px] text-slate-400">Total Stays</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{guests.reduce((s, g) => s + (g.total_stays || 0), 0)}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Bed className="w-5 h-5" />
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-md">
          <div>
            <p className="text-[11px] text-slate-400">Top Guest Visits</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{guests.length > 0 ? Math.max(...guests.map(g => g.total_stays || 0)) : 0}</p>
          </div>
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Trophy className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Guests Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="p-3.5">Rank</th>
                <th className="p-3.5">Guest ID</th>
                <th className="p-3.5">Full Name</th>
                <th className="p-3.5">Phone / Contact</th>
                <th className="p-3.5">Visits</th>
                <th className="p-3.5">Total Spent</th>
                <th className="p-3.5">Recent Visit</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filtered.map((g) => {
                const rank = visitRanks[g.id] || 0;
                return (
                  <tr
                    key={g.id}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => handleViewProfile(g.id)}
                  >
                    <td className="p-3.5">
                      {rank <= 3 ? (
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          rank === 1 ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                          rank === 2 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' :
                          'bg-amber-700/20 text-amber-400 border border-amber-700/30'
                        }`}>
                          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'} {rank}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-semibold pl-1">#{rank}</span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-teal-400">{g.guest_code}</td>
                    <td className="p-3.5 font-bold text-white">{g.full_name}</td>
                    <td className="p-3.5">
                      <p className="text-slate-200">{g.phone}</p>
                      <p className="text-[10px] text-slate-400">{g.email || 'No email'}</p>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        {g.total_stays || 0} visits
                      </span>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-emerald-400">
                      {formatCurrency((g as any).total_spent || 0)}
                    </td>
                    <td className="p-3.5 text-slate-400">
                      {(g as any).last_stay_date ? formatDateCAT((g as any).last_stay_date) : (
                        <span className="text-slate-500 italic">Never</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleViewProfile(g.id); }}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-teal-200 font-semibold text-xs rounded-lg border border-slate-700 transition-colors inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Profile & History
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guest Profile History Modal */}
      {selectedGuestProfile && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-full sm:max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-teal-400" />
                  {selectedGuestProfile.guest?.full_name} ({selectedGuestProfile.guest?.guest_code})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Phone: {selectedGuestProfile.guest?.phone} • Nationality: {selectedGuestProfile.guest?.nationality}
                </p>
              </div>
              <button
                onClick={() => setSelectedGuestProfile(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded-lg"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                  <p className="text-[10px] text-slate-400 flex items-center gap-1"><History className="w-3 h-3" /> Total Check-Ins</p>
                  <p className="text-lg font-bold text-white mt-0.5">
                    {selectedGuestProfile.checkIns?.length || 0}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                  <p className="text-[10px] text-slate-400 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Total Spent</p>
                  <p className="text-lg font-bold text-emerald-400 mt-0.5 font-mono">
                    {formatCurrency(selectedGuestProfile.payments?.reduce((s: number, p: any) => s + (p.amount || 0), 0) || 0)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                  <p className="text-[10px] text-slate-400 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Invoices</p>
                  <p className="text-lg font-bold text-teal-400 mt-0.5">
                    {selectedGuestProfile.invoices?.length || 0}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                  <p className="text-[10px] text-slate-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Food Orders</p>
                  <p className="text-lg font-bold text-amber-400 mt-0.5">
                    {selectedGuestProfile.orders?.length || 0}
                  </p>
                </div>
              </div>

              {/* Past Stays */}
              <div>
                <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-400" /> Past Room Stays
                </h4>
                <div className="space-y-1.5">
                  {selectedGuestProfile.checkIns?.map((ci: any) => (
                    <div
                      key={ci.id}
                      className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-white">Room {ci.room_number}</span>
                        <p className="text-[10px] text-slate-400">
                          {formatDateCAT(ci.check_in_date)} → {formatDateCAT(ci.actual_check_out_date || ci.expected_check_out_date)}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-emerald-400">
                        Deposit: {formatCurrency(ci.deposit_paid)}
                      </span>
                    </div>
                  ))}
                  {(!selectedGuestProfile.checkIns || selectedGuestProfile.checkIns.length === 0) && (
                    <p className="text-xs text-slate-500 italic">No past room stays recorded.</p>
                  )}
                </div>
              </div>

              {/* Past Invoices */}
              <div>
                <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Invoices & Folio Billing
                </h4>
                <div className="space-y-1.5">
                  {selectedGuestProfile.invoices?.map((inv: any) => (
                    <div
                      key={inv.id}
                      className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-white">Invoice #{inv.invoice_number}</span>
                        <p className="text-[10px] text-slate-400">{formatDateCAT(inv.issue_date)}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-amber-400">
                          {formatCurrency(inv.total_amount)}
                        </span>
                        <p className="text-[10px] text-emerald-400 font-semibold">{inv.payment_status}</p>
                      </div>
                    </div>
                  ))}
                  {(!selectedGuestProfile.invoices || selectedGuestProfile.invoices.length === 0) && (
                    <p className="text-xs text-slate-500 italic">No invoices recorded.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Guest Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-400" />
              Register New Guest
            </h3>

            <form onSubmit={handleCreateGuest} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. David Mugisha"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+250 788 123 456"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email (optional)</label>
                  <input
                    type="email"
                    placeholder="guest@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Passport / Nat ID</label>
                  <input
                    type="text"
                    placeholder="1 1990 8..."
                    value={form.id_passport_number}
                    onChange={(e) => setForm({ ...form, id_passport_number: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nationality</label>
                  <input
                    type="text"
                    value={form.nationality}
                    onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes / Preferences</label>
                <textarea
                  placeholder="VIP, quiet room preference, dietary restrictions..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Registering...' : 'Register Guest'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
