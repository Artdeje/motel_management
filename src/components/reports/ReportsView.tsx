import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useCms } from '../../context/CmsContext';
import {
  BarChart3, TrendingUp, Download, BedDouble, Utensils,
  DollarSign, Activity, CreditCard, Receipt, Layers, TrendingDown,
  Wallet, FileText
} from 'lucide-react';
import { formatCurrency, CURRENCY_SYMBOL } from '../../utils/currency';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#e879f9', '#38bdf8'];
const EXPENSE_COLORS = ['#ef4444', '#f59e0b', '#0ea5e9', '#34d399', '#a855f7', '#f97316'];
const DEPT_COLORS = ['#3b82f6', '#f59e0b', '#a855f7', '#10b981', '#ef4444'];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[10px] text-slate-400 font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-[11px] font-mono" style={{ color: p.color }}>
          {p.name}: {p.name === 'Occupancy' ? `${p.value}%` : formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

export const ReportsView: React.FC = () => {
  const { success, error } = useToast();
  const { getSetting } = useCms();
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'report' | 'charts'>('report');
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'annual'>('monthly');
  const [reportData, setReportData] = useState<any>(null);
  const [financeTrend, setFinanceTrend] = useState<any>(null);
  const [financeOverview, setFinanceOverview] = useState<any>(null);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const [summary, trend, overview] = await Promise.all([
        api.getReportData({ timeframe }),
        api.getFinanceTrend(12),
        api.getFinanceOverview()
      ]);
      setReportData(summary);
      setFinanceTrend(trend);
      setFinanceOverview(overview);
    } catch (err: any) {
      error('Failed to load reports', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [timeframe]);

  const handleExportCSV = () => {
    const csv = 'data:text/csv;charset=utf-8,' + 'Metric,Value\n'
      + `Timeframe,${timeframe.toUpperCase()}\n`
      + `Total Revenue,${CURRENCY_SYMBOL}${financeOverview?.totalRevenue || 0}\n`
      + `Total Expenses,${CURRENCY_SYMBOL}${financeOverview?.totalExpenses || 0}\n`
      + `Net Income,${CURRENCY_SYMBOL}${financeOverview?.netIncome || 0}\n`
      + `Food Cost %,${financeOverview?.foodCostPercentage || 0}%\n`;
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `report_${timeframe}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    success('CSV Exported');
  };


  const handleDownloadHTML = () => {
    const el = document.getElementById('analytics-report-printable');
    if (!el) return;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Analytics Report</title>'
      + '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;color:#1e293b;background:#fff;padding:25px;font-size:11px;line-height:1.5}'
      + 'h1{font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;text-align:center}'
      + 'h2{font-size:13px;font-weight:700;margin:20px 0 8px;padding-bottom:5px;border-bottom:2px solid #1e293b}'
      + 'table{width:100%;border-collapse:collapse;margin:6px 0}'
      + 'th{text-align:left;padding:4px 6px;border-bottom:2px solid #1e293b;font-size:8px;color:#64748b;text-transform:uppercase}'
      + 'td{padding:4px 6px;border-bottom:1px solid #f3f4f6;font-size:10px}'
      + '.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}'
      + '.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px}'
      + '.kpi-label{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:600}'
      + '.kpi-value{font-size:16px;font-weight:800;font-family:monospace;margin-top:2px}'
      + '.bar{height:7px;border-radius:4px}'
      + '.footer{margin-top:24px;padding-top:10px;border-top:2px solid #1e293b;text-align:center;font-size:8px;color:#94a3b8}'
      + '@media print{body{padding:12px;font-size:10px}}</style></head><body>' + el.innerHTML + '</body></html>');
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const occupancy = reportData?.occupancy?.occupancyRate || 0;
  const totalRev = financeOverview?.totalRevenue || 0;
  const totalExpenses = financeOverview?.totalExpenses || 0;
  const netIncome = financeOverview?.netIncome || totalRev - totalExpenses;
  const foodCostPct = financeOverview?.foodCostPercentage || 0;
  const monthlyTrend = financeTrend?.trend || [];
  const paymentMethods = financeTrend?.paymentMethods || [];
  const revenueByDept = financeTrend?.revenueByDept || [];
  const expensesByCategory = financeTrend?.expensesByCategory || [];
  const topMenuItems = reportData?.topMenuItems || [];
  const dailyTrend = reportData?.revenueTrend || [];
  const profitMargin = totalRev > 0 ? ((netIncome / totalRev) * 100).toFixed(1) : '0';
  const maxRevDept = Math.max(...revenueByDept.map((d: any) => d.total), 1);
  const maxExpCat = Math.max(...expensesByCategory.map((d: any) => d.total), 1);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const period = timeframe.charAt(0).toUpperCase() + timeframe.slice(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Executive Financial Analytics</h2>
            <p className="text-xs text-slate-400 mt-0.5">Revenue trends, expense breakdowns, payment analytics & profit insights.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 overflow-x-auto no-scrollbar">
            {(['daily', 'weekly', 'monthly', 'annual'] as const).map((tf) => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                className={`whitespace-nowrap px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${timeframe === tf ? 'bg-sky-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'}`}>
                {tf}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button onClick={() => setViewMode('report')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${viewMode === 'report' ? 'bg-white text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'}`}>
              <FileText className="w-3 h-3" /> Report
            </button>
            <button onClick={() => setViewMode('charts')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${viewMode === 'charts' ? 'bg-white text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'}`}>
              <BarChart3 className="w-3 h-3" /> Charts
            </button>
          </div>
          <button onClick={handleExportCSV} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={handleDownloadHTML} className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold rounded-xl border border-sky-500/30 flex items-center gap-1.5 transition-colors">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* ==================== REPORT VIEW ==================== */}
      {viewMode === 'report' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl">
          <div id="analytics-report-printable" className="p-8" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: '#1e293b' }}>
            <div className="text-center pb-4 mb-5" style={{ borderBottom: '3px solid #1e293b' }}>
              <h1 className="text-xl font-extrabold tracking-widest uppercase" style={{ color: '#1e293b' }}>{getSetting('site_title', 'Grand Horizon Motel & Bistro')}</h1>
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>Executive Analytics Report &mdash; {period} Period &mdash; Generated {dateStr}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Total Revenue', value: formatCurrency(totalRev), bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
                { label: 'Total Expenses', value: formatCurrency(totalExpenses), bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
                { label: 'Net Income', value: formatCurrency(netIncome), bg: netIncome >= 0 ? '#eff6ff' : '#fef2f2', border: netIncome >= 0 ? '#bfdbfe' : '#fecaca', color: netIncome >= 0 ? '#1d4ed8' : '#dc2626', note: `Margin: ${profitMargin}%` },
              ].map((kpi, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: kpi.bg, border: `1px solid ${kpi.border}` }}>
                  <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: kpi.color }}>{kpi.label}</div>
                  <div className="text-lg font-extrabold font-mono mt-1" style={{ color: kpi.color }}>{kpi.value}</div>
                  {kpi.note && <div className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>{kpi.note}</div>}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Occupancy Rate', value: `${occupancy}%`, bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af' },
                { label: 'Food Cost %', value: `${foodCostPct}%`, bg: '#fffbeb', border: '#fde68a', color: '#b45309', note: 'Target: 28-32%' },
                { label: 'Profit Margin', value: `${profitMargin}%`, bg: '#f5f3ff', border: '#ddd6fe', color: parseFloat(profitMargin) >= 0 ? '#6d28d9' : '#dc2626' },
              ].map((kpi, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: kpi.bg, border: `1px solid ${kpi.border}` }}>
                  <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: kpi.color }}>{kpi.label}</div>
                  <div className="text-lg font-extrabold font-mono mt-1" style={{ color: kpi.color }}>{kpi.value}</div>
                  {kpi.note && <div className="text-[9px] mt-0.5" style={{ color: '#92400e' }}>{kpi.note}</div>}
                </div>
              ))}
            </div>

            {revenueByDept.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-bold pb-1 mb-2" style={{ borderBottom: '2px solid #1e293b' }}>Revenue By Department</h2>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="text-left pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Department</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Amount</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Share</th>
                    <th className="pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb', width: '30%' }}>Visual</th>
                  </tr></thead>
                  <tbody>{revenueByDept.map((d: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 text-[10px] font-semibold" style={{ borderBottom: '1px solid #f3f4f6' }}>{d.department}</td>
                      <td className="py-1.5 text-[10px] text-right font-mono font-bold" style={{ borderBottom: '1px solid #f3f4f6' }}>{formatCurrency(d.total)}</td>
                      <td className="py-1.5 text-[10px] text-right" style={{ borderBottom: '1px solid #f3f4f6', color: '#64748b' }}>{totalRev > 0 ? ((d.total / totalRev) * 100).toFixed(1) : '0'}%</td>
                      <td className="py-1.5" style={{ borderBottom: '1px solid #f3f4f6' }}><div className="bar" style={{ background: DEPT_COLORS[i % DEPT_COLORS.length], width: `${(d.total / maxRevDept) * 100}%` }} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              </div>
            )}

            {expensesByCategory.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-bold pb-1 mb-2" style={{ borderBottom: '2px solid #1e293b' }}>Expenses by Category</h2>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="text-left pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Category</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Amount</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Share</th>
                    <th className="pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb', width: '25%' }}>Visual</th>
                  </tr></thead>
                  <tbody>{expensesByCategory.map((d: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 text-[10px] font-semibold" style={{ borderBottom: '1px solid #f3f4f6' }}>{d.category}</td>
                      <td className="py-1.5 text-[10px] text-right font-mono font-bold" style={{ borderBottom: '1px solid #f3f4f6' }}>{formatCurrency(d.total)}</td>
                      <td className="py-1.5 text-[10px] text-right" style={{ borderBottom: '1px solid #f3f4f6', color: '#64748b' }}>{totalExpenses > 0 ? ((d.total / totalExpenses) * 100).toFixed(1) : '0'}%</td>
                      <td className="py-1.5" style={{ borderBottom: '1px solid #f3f4f6' }}><div className="bar" style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length], width: `${(d.total / maxExpCat) * 100}%` }} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              </div>
            )}

            {paymentMethods.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-bold pb-1 mb-2" style={{ borderBottom: '2px solid #1e293b' }}>Payment Methods</h2>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="text-left pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Method</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Amount</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Count</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Share</th>
                  </tr></thead>
                  <tbody>{paymentMethods.map((pm: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 text-[10px] font-semibold" style={{ borderBottom: '1px solid #f3f4f6' }}>{pm.payment_method}</td>
                      <td className="py-1.5 text-[10px] text-right font-mono font-bold" style={{ borderBottom: '1px solid #f3f4f6' }}>{formatCurrency(pm.total)}</td>
                      <td className="py-1.5 text-[10px] text-right" style={{ borderBottom: '1px solid #f3f4f6', color: '#64748b' }}>{pm.count}</td>
                      <td className="py-1.5 text-[10px] text-right" style={{ borderBottom: '1px solid #f3f4f6', color: '#64748b' }}>{totalRev > 0 ? ((pm.total / totalRev) * 100).toFixed(1) : '0'}%</td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              </div>
            )}

            {topMenuItems.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-bold pb-1 mb-2" style={{ borderBottom: '2px solid #1e293b' }}>Top Selling Menu Items</h2>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="text-left pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>#</th>
                    <th className="text-left pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Item</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Orders</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Revenue</th>
                  </tr></thead>
                  <tbody>{topMenuItems.map((m: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 text-[10px]" style={{ borderBottom: '1px solid #f3f4f6', color: '#94a3b8' }}>{i + 1}</td>
                      <td className="py-1.5 text-[10px] font-semibold" style={{ borderBottom: '1px solid #f3f4f6' }}>{m.menu_item_name}</td>
                      <td className="py-1.5 text-[10px] text-right font-mono" style={{ borderBottom: '1px solid #f3f4f6' }}>{m.total_qty}</td>
                      <td className="py-1.5 text-[10px] text-right font-mono font-bold" style={{ borderBottom: '1px solid #f3f4f6', color: '#b45309' }}>{formatCurrency(m.total_revenue)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              </div>
            )}

            {dailyTrend.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-bold pb-1 mb-2" style={{ borderBottom: '2px solid #1e293b' }}>7-Day Daily Revenue & Occupancy</h2>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="text-left pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Day</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Revenue</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Expenses</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Occupancy</th>
                  </tr></thead>
                  <tbody>{dailyTrend.map((d: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 text-[10px] font-semibold" style={{ borderBottom: '1px solid #f3f4f6' }}>{d.day}</td>
                      <td className="py-1.5 text-[10px] text-right font-mono font-bold" style={{ borderBottom: '1px solid #f3f4f6', color: '#15803d' }}>{formatCurrency(d.revenue)}</td>
                      <td className="py-1.5 text-[10px] text-right font-mono" style={{ borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>{formatCurrency(d.expenses)}</td>
                      <td className="py-1.5 text-[10px] text-right" style={{ borderBottom: '1px solid #f3f4f6' }}>{d.occupancy}%</td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              </div>
            )}

            {monthlyTrend.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-bold pb-1 mb-2" style={{ borderBottom: '2px solid #1e293b' }}>Monthly Revenue vs Expenses Trend</h2>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="text-left pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Month</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Revenue</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Expenses</th>
                    <th className="text-right pb-1 text-[9px] uppercase" style={{ color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>Profit</th>
                  </tr></thead>
                  <tbody>{monthlyTrend.map((t: any, i: number) => {
                    const p = t.revenue - t.expenses;
                    return (
                      <tr key={i}>
                        <td className="py-1.5 text-[10px] font-semibold" style={{ borderBottom: '1px solid #f3f4f6' }}>{t.month}</td>
                        <td className="py-1.5 text-[10px] text-right font-mono font-bold" style={{ borderBottom: '1px solid #f3f4f6', color: '#15803d' }}>{formatCurrency(t.revenue)}</td>
                        <td className="py-1.5 text-[10px] text-right font-mono" style={{ borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>{formatCurrency(t.expenses)}</td>
                        <td className="py-1.5 text-[10px] text-right font-mono font-bold" style={{ borderBottom: '1px solid #f3f4f6', color: p >= 0 ? '#15803d' : '#dc2626' }}>{formatCurrency(p)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                </div>
              </div>
            )}

            <div className="footer">
              {getSetting('site_title', 'Grand Horizon Motel & Bistro')} &mdash; {getSetting('site_location', 'Kigali, Rwanda')}<br />
              Confidential Analytics Report &mdash; {period} Period &mdash; Generated {dateStr}
            </div>
          </div>
        </div>
      )}

      {/* ==================== CHARTS VIEW ==================== */}
      {viewMode === 'charts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Revenue', value: formatCurrency(totalRev), icon: TrendingUp, iconColor: 'text-emerald-400', iconBg: 'bg-emerald-500/10', valueColor: 'text-emerald-400' },
              { label: 'Total Expenses', value: formatCurrency(totalExpenses), icon: TrendingDown, iconColor: 'text-red-400', iconBg: 'bg-red-500/10', valueColor: 'text-red-400' },
              { label: 'Net Income', value: formatCurrency(netIncome), icon: Wallet, iconColor: 'text-sky-400', iconBg: 'bg-sky-500/10', valueColor: netIncome >= 0 ? 'text-emerald-400' : 'text-red-400', sub: `Margin: ${profitMargin}%` },
              { label: 'Occupancy Rate', value: `${occupancy}%`, icon: BedDouble, iconColor: 'text-blue-400', iconBg: 'bg-blue-500/10', valueColor: 'text-white' },
              { label: 'Food Cost %', value: `${foodCostPct}%`, icon: Utensils, iconColor: 'text-amber-400', iconBg: 'bg-amber-500/10', valueColor: 'text-amber-400', sub: 'Target: 28-32%' },
            ].map((kpi, i) => (
              <div key={i} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-semibold">{kpi.label}</span>
                  <span className={`p-2 rounded-xl ${kpi.iconBg} ${kpi.iconColor}`}><kpi.icon className="w-4 h-4" /></span>
                </div>
                <p className={`text-xl font-bold font-mono mt-2 ${kpi.valueColor}`}>{kpi.value}</p>
                {kpi.sub && <p className="text-[10px] text-slate-500 mt-0.5">{kpi.sub}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><Activity className="w-4 h-4 text-cyan-400" /> Monthly Revenue vs Expenses Trend</h3>
              {monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={monthlyTrend}>
                    <defs>
                      <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} /><stop offset="95%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.3} /><stop offset="95%" stopColor="#f87171" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.3} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#22d3ee" fill="url(#gR)" strokeWidth={2} />
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f87171" fill="url(#gE)" strokeWidth={2} />
                    <Area type="monotone" dataKey="profit" name="Profit" stroke="#34d399" fill="url(#gP)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="h-[280px] flex items-center justify-center text-slate-500 text-xs">No trend data</div>}
            </div>
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><Layers className="w-4 h-4 text-purple-400" /> Revenue by Department</h3>
              {revenueByDept.length > 0 ? (<>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart><Pie data={revenueByDept} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="total" nameKey="department">
                    {revenueByDept.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip formatter={(v: number) => formatCurrency(v)} /></PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">{revenueByDept.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-slate-300">{d.department}</span></div>
                    <span className="font-mono font-bold text-white">{formatCurrency(d.total)}</span>
                  </div>
                ))}</div>
              </>) : <div className="h-[280px] flex items-center justify-center text-slate-500 text-xs">No data</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><CreditCard className="w-4 h-4 text-emerald-400" /> Payment Methods</h3>
              {paymentMethods.length > 0 ? (<>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart><Pie data={paymentMethods} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="total" nameKey="payment_method">
                    {paymentMethods.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip formatter={(v: number) => formatCurrency(v)} /></PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">{paymentMethods.map((pm: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-slate-300">{pm.payment_method}</span></div>
                    <div className="text-right"><span className="font-mono font-bold text-white">{formatCurrency(pm.total)}</span><span className="text-slate-500 ml-1">({pm.count})</span></div>
                  </div>
                ))}</div>
              </>) : <div className="h-[280px] flex items-center justify-center text-slate-500 text-xs">No data</div>}
            </div>
            <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><Receipt className="w-4 h-4 text-red-400" /> Expenses by Category</h3>
              {expensesByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={expensesByCategory} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: '#94a3b8' }} width={110} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="total" name="Amount" radius={[0, 6, 6, 0]}>
                      {expensesByCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-[280px] flex items-center justify-center text-slate-500 text-xs">No data</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><Utensils className="w-4 h-4 text-amber-400" /> Top Selling Menu Items ({timeframe})</h3>
              {topMenuItems.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topMenuItems.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey="menu_item_name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={140} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (<div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
                        <p className="text-[11px] text-white font-bold">{d.menu_item_name}</p>
                        <p className="text-[10px] text-amber-400 font-mono">{d.total_qty} orders &mdash; {formatCurrency(d.total_revenue)}</p>
                      </div>);
                    }} />
                    <Bar dataKey="total_qty" name="Orders" radius={[0, 6, 6, 0]}>
                      {topMenuItems.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill="#fbbf24" fillOpacity={1 - i * 0.08} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-[280px] flex items-center justify-center text-slate-500 text-xs">No data</div>}
            </div>
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><DollarSign className="w-4 h-4 text-cyan-400" /> 7-Day Daily Revenue & Occupancy</h3>
              {dailyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dailyTrend}>
                    <defs>
                      <linearGradient id="gDR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} /><stop offset="95%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gDE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.3} /><stop offset="95%" stopColor="#f87171" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis yAxisId="money" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="occ" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="money" type="monotone" dataKey="revenue" name="Revenue" stroke="#22d3ee" fill="url(#gDR)" strokeWidth={2} />
                    <Area yAxisId="money" type="monotone" dataKey="expenses" name="Expenses" stroke="#f87171" fill="url(#gDE)" strokeWidth={2} />
                    <Area yAxisId="occ" type="monotone" dataKey="occupancy" name="Occupancy" stroke="#a78bfa" fill="none" strokeWidth={2} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="h-[280px] flex items-center justify-center text-slate-500 text-xs">No data</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
