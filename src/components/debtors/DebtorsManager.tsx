import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  HandCoins,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  Trash2,
  Phone,
  User,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import { formatCurrency, CURRENCY_SYMBOL } from '../../utils/currency';
import { formatDateTimeCAT } from '../../utils/dates';

interface Debtor {
  id: string;
  debtor_name: string;
  phone?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  amount: number;
  amount_paid: number;
  balance: number;
  reason?: string | null;
  status: 'Outstanding' | 'Settled';
  recorded_by_name?: string;
  created_at: string;
  settled_at?: string | null;
}

export const DebtorsManager: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const canDelete = user?.role === 'admin' || user?.role === 'manager';

  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Outstanding' | 'Settled'>('Outstanding');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ debtor_name: '', phone: '', amount: '', reason: '' });

  const [payingDebt, setPayingDebt] = useState<Debtor | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');

  const fetchDebtors = async () => {
    try {
      setLoading(true);
      const res = await api.getDebtors(statusFilter);
      setDebtors(res.debtors || []);
      setSummary(res.summary || null);
    } catch (err: any) {
      error('Failed to load debtors', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDebtors(); }, [statusFilter]);

  const handleRecordDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!form.debtor_name.trim()) return error('Name required', 'Enter who owes the money');
    if (!Number.isFinite(amt) || amt <= 0) return error('Invalid amount', 'Enter an amount greater than zero');

    setSubmitting(true);
    try {
      await api.createDebtor({
        debtor_name: form.debtor_name.trim(),
        phone: form.phone.trim() || null,
        amount: amt,
        reason: form.reason.trim() || null,
      });
      success('Debt recorded', `${form.debtor_name.trim()} owes ${formatCurrency(amt)}`);
      setShowAddModal(false);
      setForm({ debtor_name: '', phone: '', amount: '', reason: '' });
      fetchDebtors();
    } catch (err: any) {
      error('Could not record debt', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPay = (d: Debtor) => {
    setPayingDebt(d);
    setPayAmount(String(d.balance));
    setPayMethod('Cash');
  };

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingDebt) return;
    const amt = parseFloat(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) return error('Invalid amount', 'Enter an amount greater than zero');
    if (amt > payingDebt.balance) return error('Too much', `Balance is only ${formatCurrency(payingDebt.balance)}`);

    setSubmitting(true);
    try {
      const res: any = await api.payDebtor(payingDebt.id, { amount: amt, payment_method: payMethod });
      success(res.settled ? 'Debt settled' : 'Part payment recorded', res.message);
      setPayingDebt(null);
      fetchDebtors();
    } catch (err: any) {
      error('Payment failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (d: Debtor) => {
    if (!window.confirm(`Remove the debt record for ${d.debtor_name}? This does not refund anything already collected.`)) return;
    try {
      await api.deleteDebtor(d.id);
      success('Record removed');
      fetchDebtors();
    } catch (err: any) {
      error('Delete failed', err.message);
    }
  };

  const filtered = debtors.filter((d) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return `${d.debtor_name} ${d.phone || ''} ${d.reason || ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
            <HandCoins className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-white tracking-tight">Debtors</h2>
            <p className="text-xs lg:text-sm text-slate-400 mt-1 max-w-2xl">
              Unpaid tabs recorded at the bar. A debt only becomes revenue once it is collected.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDebtors}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Record Debt
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] font-bold tracking-widest uppercase text-slate-400">Outstanding</p>
            <p className="text-2xl font-black font-mono text-amber-400 mt-1.5">{formatCurrency(summary.totalOwed)}</p>
            <p className="text-[11px] text-slate-500 mt-1">{summary.outstandingCount} unpaid tab{summary.outstandingCount === 1 ? '' : 's'}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] font-bold tracking-widest uppercase text-slate-400">Collected</p>
            <p className="text-2xl font-black font-mono text-emerald-400 mt-1.5">{formatCurrency(summary.totalCollected)}</p>
            <p className="text-[11px] text-slate-500 mt-1">Repayments received</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] font-bold tracking-widest uppercase text-slate-400">Records</p>
            <p className="text-2xl font-black font-mono text-white mt-1.5">{summary.total}</p>
            <p className="text-[11px] text-slate-500 mt-1">In the current view</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone or reason..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
          {(['Outstanding', 'Settled', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === s ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center text-slate-400 text-xs py-10">Loading debtors...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 rounded-2xl bg-slate-900 border border-dashed border-slate-800">
          <Wallet className="w-9 h-9 text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-300">No debts recorded</p>
          <p className="text-xs text-slate-500 mt-1">
            {statusFilter === 'Outstanding' ? 'Nothing is outstanding right now.' : 'Nothing matches this view.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((d) => {
            const settled = d.status === 'Settled';
            return (
              <div
                key={d.id}
                className={`p-4 rounded-2xl border shadow-lg flex flex-col justify-between ${
                  settled ? 'bg-slate-900/70 border-slate-800' : 'bg-amber-950/15 border-amber-500/30'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {d.debtor_name}
                      </p>
                      {d.phone && (
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <Phone className="w-3 h-3" /> {d.phone}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                        settled
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>

                  {d.reason && <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{d.reason}</p>}
                  {d.order_number && (
                    <p className="text-[10px] text-slate-500 mt-1">Linked order #{d.order_number}</p>
                  )}

                  <div className="mt-3 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Debt</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(d.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Paid</span>
                      <span className="font-mono font-bold text-emerald-400">{formatCurrency(d.amount_paid)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                      <span className="font-bold text-slate-300">Balance</span>
                      <span className={`font-mono font-black ${d.balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatCurrency(d.balance)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 mt-2">
                    {d.recorded_by_name} &bull; {formatDateTimeCAT(d.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-800">
                  {!settled && (
                    <button
                      onClick={() => handleOpenPay(d)}
                      className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Record Payment
                    </button>
                  )}
                  {settled && (
                    <span className="flex-1 py-1.5 text-center text-[11px] font-bold text-emerald-300">
                      Settled {d.settled_at ? formatDateTimeCAT(d.settled_at) : ''}
                    </span>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(d)}
                      className="p-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl"
                      title="Remove this record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record Debt Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <HandCoins className="w-5 h-5 text-amber-400" /> Record A Debt
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              This is tracked as owed money and is not counted as revenue until collected.
            </p>

            <form onSubmit={handleRecordDebt} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Who owes it</label>
                <input
                  type="text"
                  value={form.debtor_name}
                  onChange={(e) => setForm({ ...form, debtor_name: e.target.value })}
                  placeholder="e.g. Eric Ndahiro"
                  autoFocus
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Phone <span className="text-slate-500 font-normal">– optional</span>
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+250 788 123 456"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Amount ({CURRENCY_SYMBOL})</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  What it is for <span className="text-slate-500 font-normal">– optional</span>
                </label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="e.g. 3 beers on the counter, paying Friday"
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
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Record Debt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {payingDebt && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Payment From {payingDebt.debtor_name}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Outstanding balance {formatCurrency(payingDebt.balance)} of {formatCurrency(payingDebt.amount)}
            </p>

            <form onSubmit={handleConfirmPay} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Amount received ({CURRENCY_SYMBOL})</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  max={payingDebt.balance}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  autoFocus
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(payingDebt.balance))}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                  >
                    Full balance
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(Math.ceil(payingDebt.balance / 2)))}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                  >
                    Half
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="Mobile Money">Mobile Money (MTN / Airtel)</option>
                  <option value="Credit Card">Credit / Debit Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <AlertCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Only the amount received is written to finance. A partial payment leaves the rest outstanding.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPayingDebt(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
