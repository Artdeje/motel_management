import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useCms } from '../../context/CmsContext';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  CreditCard,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  RefreshCw,
  PieChart,
  Download
} from 'lucide-react';
import { formatCurrency, CURRENCY_SYMBOL } from '../../utils/currency';
import { todayCAT, formatDateCAT } from '../../utils/dates';

export const FinanceDashboard: React.FC = () => {
  const { getSetting } = useCms();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'expenses' | 'payments'>('overview');

  // Finance trend for real expense breakdown
  const [financeTrend, setFinanceTrend] = useState<any>(null);

  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: 'Inventory',
    amount: '',
    title: '',
    payment_method: 'Cash',
    expense_date: todayCAT(),
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchFinanceData = async () => {
    try {
      setLoading(true);
      const [ovRes, invRes, expRes, payRes, trendRes] = await Promise.all([
        api.getFinancialOverview(),
        api.getInvoices(),
        api.getExpenses(),
        api.getPayments(),
        api.getFinanceTrend(12).catch(() => null),
      ]);
      setOverview(ovRes);
      setInvoices(invRes.invoices || []);
      setExpenses(expRes.expenses || []);
      setPayments(payRes.payments || []);
      setFinanceTrend(trendRes);
    } catch (err: any) {
      error('Failed to load finance data', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.amount || !expenseForm.title) {
      return error('Please provide an amount and description');
    }

    setSubmitting(true);
    try {
      await api.createExpense({
        ...expenseForm,
        amount: parseFloat(expenseForm.amount),
      });
      success('Expense Logged Successfully');
      setShowExpenseModal(false);
      setExpenseForm({
        category: 'Inventory',
        amount: '',
        title: '',
        payment_method: 'Cash',
        expense_date: todayCAT(),
      });
      fetchFinanceData();
    } catch (err: any) {
      error('Failed to record expense', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalRev = overview?.totalRevenue || 0;
  const totalExp = overview?.totalExpenses || 0;
  const netProfit = overview?.netIncome || 0;
  const expensesByCat = overview?.expensesByCategory || [];
  const revenueByDept = [
    { name: 'Room Accommodation', value: overview?.roomRevenue || 0, color: '#3b82f6' },
    { name: 'Food & Bistro', value: overview?.foodRevenue || 0, color: '#f59e0b' },
    { name: 'Bar & Beverages', value: overview?.barRevenue || 0, color: '#a855f7' },
  ].filter(d => d.value > 0);
  const maxRevDept = Math.max(...revenueByDept.map(d => d.value), 1);
  const maxExpCat = Math.max(...expensesByCat.map((d: any) => d.total), 1);

  const EXPENSE_COLORS = ['#ef4444', '#f59e0b', '#0ea5e9', '#34d399', '#a855f7', '#f97316'];

  const handleDownloadFinancePDF = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    const revenueRows = revenueByDept.map(d => {
      const pct = totalRev > 0 ? ((d.value / totalRev) * 100).toFixed(1) : '0';
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:600">${d.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">${formatCurrency(d.value)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${pct}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb"><div style="background:${d.color};height:10px;border-radius:5px;width:${(d.value / maxRevDept) * 100}%"></div></td>
      </tr>`;
    }).join('');

    const expenseRows = expensesByCat.map((d: any, i: number) => {
      const pct = totalExp > 0 ? ((d.total / totalExp) * 100).toFixed(1) : '0';
      const color = EXPENSE_COLORS[i % EXPENSE_COLORS.length];
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:600">${d.category}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">${formatCurrency(d.total)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${pct}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb"><div style="background:${color};height:10px;border-radius:5px;width:${(d.total / maxExpCat) * 100}%"></div></td>
      </tr>`;
    }).join('');

    const invoiceRows = invoices.slice(0, 20).map(inv => `<tr>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:11px">#${inv.invoice_number}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:11px">${inv.guest_name || 'N/A'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-family:monospace;font-size:11px">${formatCurrency(inv.total_amount)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-family:monospace;font-size:11px;color:#10b981">${formatCurrency(inv.amount_paid)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:10px;font-weight:bold;color:${inv.status === 'Paid' ? '#10b981' : '#f59e0b'}">${inv.status}</td>
    </tr>`).join('');

    const expenseTableRows = expenses.slice(0, 20).map(exp => `<tr>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:11px">${exp.expense_date}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:10px"><span style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${exp.category}</span></td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:11px">${exp.title}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-family:monospace;font-size:11px;color:#ef4444">-${formatCurrency(exp.amount)}</td>
    </tr>`).join('');

    const trendRows = (financeTrend?.trend || []).map((t: any) => {
      const profit = t.revenue - t.expenses;
      return `<tr>
        <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;font-weight:600">${t.month}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-family:monospace;font-size:11px;color:#10b981">${formatCurrency(t.revenue)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-family:monospace;font-size:11px;color:#ef4444">${formatCurrency(t.expenses)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-family:monospace;font-size:11px;font-weight:bold;color:${profit >= 0 ? '#10b981' : '#ef4444'}">${formatCurrency(profit)}</td>
      </tr>`;
    }).join('');

    const profitMargin = totalRev > 0 ? ((netProfit / totalRev) * 100).toFixed(1) : '0';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Finance Report — ${getSetting('site_title', 'Grand Horizon Motel')}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#1e293b; background:#fff; padding:30px; font-size:12px; line-height:1.5; }
  h1 { font-size:20px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; }
  h2 { font-size:14px; font-weight:700; margin:24px 0 10px; padding-bottom:6px; border-bottom:2px solid #1e293b; }
  .subtitle { font-size:11px; color:#64748b; margin-top:2px; }
  .kpi-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin:16px 0; }
  .kpi { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; }
  .kpi-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; font-weight:600; }
  .kpi-value { font-size:22px; font-weight:800; font-family:monospace; margin-top:4px; }
  .kpi-note { font-size:10px; color:#94a3b8; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin:8px 0; }
  th { text-align:left; padding:6px 8px; border-bottom:2px solid #1e293b; font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; }
  .footer { margin-top:30px; padding-top:12px; border-top:2px solid #1e293b; text-align:center; font-size:9px; color:#94a3b8; }
  @media print { body { padding:15px; } }
</style></head><body>
  <div style="text-align:center;margin-bottom:20px">
    <h1>${getSetting('site_title', 'Grand Horizon Motel & Bistro')}</h1>
    <p class="subtitle">Financial Analytics Report — Generated ${dateStr}</p>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Total Revenue</div><div class="kpi-value" style="color:#10b981">${formatCurrency(totalRev)}</div><div class="kpi-note">Room stays & bistro</div></div>
    <div class="kpi"><div class="kpi-label">Total Expenses</div><div class="kpi-value" style="color:#ef4444">${formatCurrency(totalExp)}</div><div class="kpi-note">Operations & supplies</div></div>
    <div class="kpi"><div class="kpi-label">Net Profit</div><div class="kpi-value" style="color:${netProfit >= 0 ? '#10b981' : '#ef4444'}">${formatCurrency(netProfit)}</div><div class="kpi-note">Margin: ${profitMargin}%</div></div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Food Cost %</div><div class="kpi-value" style="color:#f59e0b">${overview?.foodCostPercentage || 0}%</div><div class="kpi-note">Target: 28-32%</div></div>
    <div class="kpi"><div class="kpi-label">Unpaid Invoices</div><div class="kpi-value" style="color:#f59e0b">${formatCurrency(overview?.unpaidInvoices || 0)}</div><div class="kpi-note">Outstanding balance</div></div>
    <div class="kpi"><div class="kpi-label">Food Cost Amount</div><div class="kpi-value" style="color:#ef4444">${formatCurrency(overview?.foodCostAmount || 0)}</div><div class="kpi-note">Consumed inventory</div></div>
  </div>

  <h2>Revenue By Department</h2>
  <table>
    <thead><tr><th>Department</th><th style="text-align:right">Amount</th><th style="text-align:right">Share</th><th style="width:30%">Visual</th></tr></thead>
    <tbody>${revenueRows || '<tr><td colspan="4" style="padding:10px;color:#94a3b8">No revenue data</td></tr>'}</tbody>
  </table>

  <h2>Expense Distribution</h2>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:right">Share</th><th style="width:30%">Visual</th></tr></thead>
    <tbody>${expenseRows || '<tr><td colspan="4" style="padding:10px;color:#94a3b8">No expense data</td></tr>'}</tbody>
  </table>

  ${trendRows ? `<h2>Monthly Revenue vs Expenses Trend</h2>
  <table>
    <thead><tr><th>Month</th><th style="text-align:right">Revenue</th><th style="text-align:right">Expenses</th><th style="text-align:right">Profit</th></tr></thead>
    <tbody>${trendRows}</tbody>
  </table>` : ''}

  <h2>Recent Invoices (Top 20)</h2>
  <table>
    <thead><tr><th>Invoice #</th><th>Guest</th><th style="text-align:right">Total</th><th style="text-align:right">Paid</th><th>Status</th></tr></thead>
    <tbody>${invoiceRows || '<tr><td colspan="5" style="padding:10px;color:#94a3b8">No invoices recorded</td></tr>'}</tbody>
  </table>

  <h2>Recent Expenses (Top 20)</h2>
  <table>
    <thead><tr><th>Date</th><th>Category</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${expenseTableRows || '<tr><td colspan="4" style="padding:10px;color:#94a3b8">No expenses recorded</td></tr>'}</tbody>
  </table>

  <div class="footer">
    ${getSetting('site_title', 'Grand Horizon Motel & Bistro')} — ${getSetting('site_location', 'Kigali, Rwanda')}<br>
    Confidential Financial Report — Generated ${dateStr}
  </div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-report-${now.toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Finance report downloaded — open and print to PDF');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Motel Finance & Revenue Folio</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Room & Restaurant billing, operating expenses, cash receipts & profit/loss ledger.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleDownloadFinancePDF}
            className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-semibold text-xs rounded-xl border border-emerald-500/30 flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" /> Download PDF Report
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Record Expense
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">Total Revenue (Gross)</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold font-mono text-white mt-2">{formatCurrency(totalRev)}</p>
          <p className="text-[11px] text-emerald-400 mt-1">From room stays & bistro orders</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">Operating Expenses</span>
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <ArrowDownRight className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold font-mono text-white mt-2">{formatCurrency(totalExp)}</p>
          <p className="text-[11px] text-rose-400 mt-1">Supplies, repairs & payroll</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">Net Operating Profit</span>
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <p
            className={`text-2xl font-bold font-mono mt-2 ${
              netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatCurrency(netProfit)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Net surplus after all costs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('overview')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <PieChart className="w-3.5 h-3.5" />
          Revenue Breakdown
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'invoices'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          Invoices & Folios ({invoices.length})
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'expenses'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          Expenses Ledger ({expenses.length})
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'payments'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Payment Transactions ({payments.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW BREAKDOWN */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenue Sources — Real Data */}
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Revenue By Department
            </h3>

            <div className="space-y-3">
              {revenueByDept.length > 0 ? revenueByDept.map((dept, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{dept.name}</span>
                    <span className="font-bold text-white">
                      {formatCurrency(dept.value)}
                      <span className="text-slate-500 ml-1">({totalRev > 0 ? ((dept.value / totalRev) * 100).toFixed(1) : '0'}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${maxRevDept > 0 ? (dept.value / maxRevDept) * 100 : 0}%`, backgroundColor: dept.color }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-xs text-slate-500 italic">No revenue data recorded yet</p>
              )}
            </div>
          </div>

          {/* Expense Breakdown — Real Data */}
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              Expense Distribution
            </h3>

            <div className="space-y-3">
              {expensesByCat.length > 0 ? expensesByCat.map((cat: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{cat.category}</span>
                    <span className="font-bold text-white">
                      {formatCurrency(cat.total)}
                      <span className="text-slate-500 ml-1">({totalExp > 0 ? ((cat.total / totalExp) * 100).toFixed(1) : '0'}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${maxExpCat > 0 ? (cat.total / maxExpCat) * 100 : 0}%`,
                        backgroundColor: EXPENSE_COLORS[i % EXPENSE_COLORS.length]
                      }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-xs text-slate-500 italic">No expenses recorded yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INVOICES */}
      {activeTab === 'invoices' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="p-3.5">Invoice #</th>
                  <th className="p-3.5">Guest</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Total Amount</th>
                  <th className="p-3.5">Paid Amount</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-amber-400">
                      #{inv.invoice_number}
                    </td>
                    <td className="p-3.5 font-bold text-white">{inv.guest_name}</td>
                    <td className="p-3.5 text-slate-400">{formatDateCAT(inv.issue_date)}</td>
                    <td className="p-3.5 font-mono font-bold text-white">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="p-3.5 font-mono text-emerald-400">
                      {formatCurrency(inv.amount_paid)}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === 'Paid'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: EXPENSES */}
      {activeTab === 'expenses' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Description</th>
                  <th className="p-3.5">Payment Method</th>
                  <th className="p-3.5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-3.5 text-slate-400">{exp.expense_date}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded bg-slate-800 font-semibold text-slate-200 text-[10px]">
                        {exp.category}
                      </span>
                    </td>
                    <td className="p-3.5 font-medium text-white">{exp.title}</td>
                    <td className="p-3.5 text-slate-400">{exp.payment_method}</td>
                    <td className="p-3.5 font-mono font-bold text-rose-400">
                      -{formatCurrency(exp.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PAYMENTS */}
      {activeTab === 'payments' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="p-3.5">Payment Ref</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Invoice #</th>
                  <th className="p-3.5">Payment Method</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-3.5 font-mono text-amber-400">#{p.receipt_number}</td>
                    <td className="p-3.5 text-slate-400">
                      {formatDateCAT(p.payment_date)}
                    </td>
                    <td className="p-3.5 font-bold text-white">{p.invoice_number || 'Direct Order'}</td>
                    <td className="p-3.5">{p.payment_method}</td>
                    <td className="p-3.5 font-mono font-bold text-emerald-400">
                      +{formatCurrency(p.amount)}
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                        {p.payment_category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-rose-400" />
              Record Operational Expense
            </h3>

            <form onSubmit={handleCreateExpense} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Inventory">Food / Kitchen Ingredients</option>
                    <option value="Housekeeping">Housekeeping Supplies & Linen</option>
                    <option value="Maintenance">Maintenance & Facility Repair</option>
                    <option value="Utilities">Electricity / Water / Internet</option>
                    <option value="Payroll">Staff Wages & Allowances</option>
                    <option value="Other">Other Operational Cost</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Amount ({CURRENCY_SYMBOL})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.5"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    placeholder="e.g. 120.00"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Bulk fresh vegetables supplier payment"
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Payment Method</label>
                  <select
                    value={expenseForm.payment_method}
                    onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Cash">Cash (Petty Cash)</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Mobile Money">Mobile Money</option>
                    <option value="Company Card">Company Card</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
