import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles } from '../middleware/auth';

export const financeRouter = Router();

// GET /api/finance/trend - Revenue/expenses/profit trend + payment methods + revenue by department
financeRouter.get('/finance/trend', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'monthly';

    const periodConfig: Record<string, { interval: string; trendInterval: string; groupFmt: string; labelFmt: string }> = {
      daily:   { interval: '1 DAY',    trendInterval: '7 DAY',  groupFmt: '%Y-%m-%d %H:00', labelFmt: '%H:00' },
      weekly:  { interval: '7 DAY',    trendInterval: '28 DAY', groupFmt: '%Y-%m-%d',        labelFmt: '%b %d' },
      monthly: { interval: '12 MONTH', trendInterval: '12 MONTH', groupFmt: '%Y-%m',          labelFmt: '%b %Y' },
      annual:  { interval: '5 YEAR',   trendInterval: '5 YEAR', groupFmt: '%Y',              labelFmt: '%Y' },
    };
    const pc = periodConfig[period] || periodConfig.monthly;

    // Revenue trend
    const revenueRows = await dbAll<any>(
      `SELECT DATE_FORMAT(p.payment_date, '${pc.groupFmt}') as period_key,
              DATE_FORMAT(p.payment_date, '${pc.labelFmt}') as period_label,
              COALESCE(SUM(p.amount), 0) as revenue
       FROM payments p
       WHERE p.payment_date >= DATE_SUB(CURDATE(), INTERVAL ${pc.trendInterval})
       GROUP BY period_key, period_label
       ORDER BY period_key ASC`
    );

    // Expense trend
    const expenseRows = await dbAll<any>(
      `SELECT DATE_FORMAT(e.expense_date, '${pc.groupFmt}') as period_key,
              DATE_FORMAT(e.expense_date, '${pc.labelFmt}') as period_label,
              COALESCE(SUM(e.amount), 0) as expenses
       FROM expenses e
       WHERE e.expense_date >= DATE_SUB(CURDATE(), INTERVAL ${pc.trendInterval})
       GROUP BY period_key, period_label
       ORDER BY period_key ASC`
    );

    // Merge into trend array
    const periodMap = new Map<string, { month: string; revenue: number; expenses: number; profit: number }>();
    revenueRows.forEach((r) => {
      periodMap.set(r.period_key, { month: r.period_label, revenue: r.revenue, expenses: 0, profit: 0 });
    });
    expenseRows.forEach((r) => {
      if (periodMap.has(r.period_key)) {
        periodMap.get(r.period_key)!.expenses = r.expenses;
      } else {
        periodMap.set(r.period_key, { month: r.period_label, revenue: 0, expenses: r.expenses, profit: 0 });
      }
    });
    const trend = Array.from(periodMap.values()).map((t) => ({ ...t, profit: t.revenue - t.expenses }));

    // Payment method distribution (filtered by period)
    const paymentMethods = await dbAll<any>(
      `SELECT payment_method, COUNT(*) as count, SUM(amount) as total
       FROM payments
       WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL ${pc.trendInterval})
       GROUP BY payment_method
       ORDER BY total DESC`
    );

    // Revenue by department (filtered by period)
    const revenueByDept = await dbAll<any>(
      `SELECT payment_category as department, SUM(amount) as total
       FROM payments
       WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL ${pc.trendInterval})
       GROUP BY payment_category
       ORDER BY total DESC`
    );

    // Expense by category (filtered by period)
    const expensesByCategory = await dbAll<any>(
      `SELECT category, SUM(amount) as total
       FROM expenses
       WHERE expense_date >= DATE_SUB(CURDATE(), INTERVAL ${pc.trendInterval})
       GROUP BY category
       ORDER BY total DESC`
    );

    return res.json({ trend, paymentMethods, revenueByDept, expensesByCategory });
  } catch (err: any) {
    console.error('Finance trend error:', err);
    return res.status(500).json({ error: 'Failed to load finance trend data' });
  }
});

// GET /api/finance/overview - Financial metrics, revenue breakdown, expenses, food cost %
financeRouter.get('/finance/overview', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const period = (req.query.period as string) || 'monthly';

  const periodConfig: Record<string, string> = {
    daily: '1 DAY', weekly: '7 DAY', monthly: '30 DAY', annual: '12 MONTH',
  };
  const interval = periodConfig[period] || '30 DAY';

  // 1. Revenue by category (filtered by period)
  const roomRev = (await dbGet<any>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category IN ("Room", "Deposit") AND payment_date >= DATE_SUB(CURDATE(), INTERVAL ${interval})`
  ))?.total || 0;
  const foodRev = (await dbGet<any>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category = "Food" AND payment_date >= DATE_SUB(CURDATE(), INTERVAL ${interval})`
  )) || { total: 0 };
  const barRev = (await dbGet<any>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category = "Drinks" AND payment_date >= DATE_SUB(CURDATE(), INTERVAL ${interval})`
  )) || { total: 0 };
  const orderPayments = (await dbGet<any>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category = "Food/Drinks" AND payment_date >= DATE_SUB(CURDATE(), INTERVAL ${interval})`
  )) || { total: 0 };

  const totalRevenue = (await dbGet<any>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL ${interval})`
  ))?.total || 0;

  // 2. Expenses by category (filtered by period)
  const totalExpenses = (await dbGet<any>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date >= DATE_SUB(CURDATE(), INTERVAL ${interval})`
  ))?.total || 0;
  const expensesByCategory = await dbAll<any>(
    `SELECT category, SUM(amount) as total FROM expenses WHERE expense_date >= DATE_SUB(CURDATE(), INTERVAL ${interval}) GROUP BY category ORDER BY total DESC`
  );

  // 3. Food Cost Calculation (filtered by period)
  const foodCostSum = (await dbGet<any>(
    `SELECT COALESCE(SUM(it.total_cost), 0) as total
     FROM inventory_transactions it
     JOIN inventory_items i ON it.item_id = i.id
     JOIN inventory_categories ic ON i.category_id = ic.id
     WHERE ic.name = 'Kitchen Ingredients' AND it.transaction_type IN ('Consumed', 'Damaged')
       AND it.created_at >= DATE_SUB(CURDATE(), INTERVAL ${interval})`
  ))?.total || 0;

  const foodRevenueTotal = foodRev.total + orderPayments.total;
  const foodCostPct = foodRevenueTotal > 0 ? ((foodCostSum / foodRevenueTotal) * 100).toFixed(1) : '0.0';
  const netIncome = totalRevenue - totalExpenses;

  // 4. Invoices summary
  const unpaidInvoices = (await dbGet<any>('SELECT COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE status IN ("Unpaid", "Partially Paid")'))?.total || 0;

  return res.json({
    totalRevenue,
    totalExpenses,
    netIncome,
    roomRevenue: roomRev,
    foodRevenue: foodRevenueTotal,
    barRevenue: barRev.total,
    foodCostAmount: foodCostSum,
    foodCostPercentage: parseFloat(foodCostPct),
    unpaidInvoices,
    expensesByCategory,
  });
});

// GET /api/finance/invoices
financeRouter.get('/finance/invoices', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const invoices = await dbAll<any>(
    `SELECT inv.*, g.full_name as guest_name, g.phone as guest_phone, r.room_number
     FROM invoices inv
     JOIN guests g ON inv.guest_id = g.id
     LEFT JOIN rooms r ON inv.room_id = r.id
     ORDER BY inv.created_at DESC`
  );

  const enriched = await Promise.all(invoices.map(async (inv) => {
    const items = await dbAll<any>('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
    const payments = await dbAll<any>('SELECT * FROM payments WHERE invoice_id = ?', [inv.id]);
    return { ...inv, items, payments };
  }));

  return res.json({ invoices: enriched });
});

// GET /api/finance/payments
financeRouter.get('/finance/payments', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const payments = await dbAll<any>(
    `SELECT p.*, u.full_name as receiver_name, g.full_name as guest_name,
            inv.invoice_number, ord.order_number
     FROM payments p
     JOIN users u ON p.received_by = u.id
     LEFT JOIN guests g ON p.guest_id = g.id
     LEFT JOIN invoices inv ON p.invoice_id = inv.id
     LEFT JOIN orders ord ON p.order_id = ord.id
     ORDER BY p.payment_date DESC`
  );
  return res.json({ payments });
});

// POST /api/finance/payments - Record a manual payment against an invoice
financeRouter.post('/finance/payments', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { invoice_id, amount, payment_method, payment_category, reference_number, notes } = req.body;
  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  const amt = parseFloat(amount);
  const payId = `pay-${Date.now()}`;
  const recNumber = `RCT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await dbTransaction(async () => {
    let guestId = null;
    if (invoice_id) {
      const inv = await dbGet<any>('SELECT * FROM invoices WHERE id = ?', [invoice_id]);
      if (inv) {
        guestId = inv.guest_id;
        const newPaid = inv.amount_paid + amt;
        const newDue = Math.max(0, inv.total_amount - newPaid);
        await dbRun(
          'UPDATE invoices SET amount_paid = ?, balance_due = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newPaid, newDue, newDue === 0 ? 'Paid' : 'Partially Paid', invoice_id]
        );
      }
    }

    await dbRun(
      `INSERT INTO payments (id, receipt_number, invoice_id, guest_id, amount, payment_method, payment_category, reference_number, received_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payId, recNumber, invoice_id || null, guestId, amt, payment_method || 'Cash', payment_category || 'Room', reference_number || null, req.user?.id, notes || null]
    );
  });

  await logAudit(req.user, 'Finance', 'Payment Recorded', payId, `Recorded payment of ${process.env.CURRENCY_SYMBOL || 'FRw'}${amt.toFixed(2)} (${recNumber})`);
  return res.status(201).json({ message: 'Payment recorded successfully', receipt_number: recNumber });
});

// GET /api/finance/expenses
financeRouter.get('/finance/expenses', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const expenses = await dbAll<any>(
    `SELECT e.*, u.full_name as recorder_name, s.name as supplier_name
     FROM expenses e
     JOIN users u ON e.recorded_by = u.id
     LEFT JOIN suppliers s ON e.supplier_id = s.id
     ORDER BY e.expense_date DESC`
  );
  return res.json({ expenses });
});

// DELETE /api/finance/room-revenues - Admin: clean up all Room revenues (payments + invoices)
// DELETE /api/finance/expenses/:id - Admin: delete one expense
financeRouter.delete('/finance/expenses/:id', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  try {
    const exp = await dbGet<any>('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    if (!exp) return res.status(404).json({ error: 'Expense not found' });

    await dbRun('DELETE FROM expenses WHERE id = ?', [exp.id]);
    await logAudit(req.user, 'Finance', 'Expense Deleted', exp.id, `Admin ${req.user?.username} deleted expense #${exp.expense_number} (${exp.title}, ${exp.amount})`, req.ip);
    return res.json({ message: `Expense #${exp.expense_number} deleted`, deleted: 1 });
  } catch (err:any) {
    console.error('Delete expense error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete expense' });
  }
});

// DELETE /api/finance/expenses - Admin: delete selected expenses, or all of them.
// Body { ids: [...] } deletes just those; an empty/absent list clears everything.
financeRouter.delete('/finance/expenses', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  try {
    const ids: unknown = req.body?.ids;
    const selected = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string' && x) : [];

    if (selected.length > 0) {
      // Parameterised IN list — never interpolate ids into the SQL.
      const placeholders = selected.map(() => '?').join(', ');
      const rows = await dbAll<any>(`SELECT id FROM expenses WHERE id IN (${placeholders})`, selected);
      if (rows.length === 0) return res.status(404).json({ error: 'None of the selected expenses exist' });

      await dbRun(`DELETE FROM expenses WHERE id IN (${placeholders})`, selected);
      await logAudit(req.user, 'Finance', 'Expenses Bulk Delete', null, `Admin ${req.user?.username} deleted ${rows.length} selected expense(s)`, req.ip);
      return res.json({ message: `${rows.length} expense(s) deleted`, deleted: rows.length });
    }

    // Postgres returns COUNT(*) as a bigint string — coerce before reporting.
    const total = Number((await dbGet<any>('SELECT COUNT(*) as cnt FROM expenses'))?.cnt) || 0;
    await dbRun('DELETE FROM expenses');
    await logAudit(req.user, 'Finance', 'Expenses Bulk Delete', null, `Admin ${req.user?.username} cleared all expenses (${total})`, req.ip);
    return res.json({ message: `All expenses cleared (${total} deleted)`, deleted: total });
  } catch (err:any) {
    console.error('Bulk delete expenses error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete expenses' });
  }
});

financeRouter.delete('/finance/room-revenues', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  try {
    const countPayments = (await dbGet<any>(`SELECT COUNT(*) as cnt FROM payments WHERE payment_category IN ('Room','Deposit')`))?.cnt || 0;
    const countInvoices = (await dbGet<any>(`SELECT COUNT(*) as cnt FROM invoices`))?.cnt || 0;
    const countInvoiceItems = (await dbGet<any>(`SELECT COUNT(*) as cnt FROM invoice_items`))?.cnt || 0;

    await dbTransaction(async () => {
      // Delete Room/Deposit payments
      await dbRun(`DELETE FROM payments WHERE payment_category IN ('Room','Deposit')`);
      // Delete invoice items and invoices (all invoices are room folios)
      await dbRun(`DELETE FROM invoice_items`);
      await dbRun(`DELETE FROM invoices`);
      // Reset any remaining invoice-linked payments to avoid orphans (already deleted above)
      // Optionally keep non-room payments (Food, Drinks etc) intact
    });

    await logAudit(req.user, 'Finance', 'Room Revenue Cleanup', null, `Admin ${req.user?.username} cleaned Room revenues: ${countPayments} payments, ${countInvoices} invoices, ${countInvoiceItems} invoice_items`, req.ip);
    return res.json({ message: `Room revenues cleaned (${countPayments} payments, ${countInvoices} invoices, ${countInvoiceItems} items)`, deleted: { payments: countPayments, invoices: countInvoices, invoice_items: countInvoiceItems } });
  } catch (err:any) {
    console.error('Room revenue cleanup error:', err);
    return res.status(500).json({ error: err.message || 'Failed to clean Room revenues' });
  }
});

// POST /api/finance/expenses
financeRouter.post('/finance/expenses', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { category, title, amount, payment_method, supplier_id, paid_to, expense_date, receipt_reference, notes } = req.body;
  if (!category || !title || !amount || !expense_date) {
    return res.status(400).json({ error: 'Category, title, amount and date are required' });
  }

  const id = `exp-${Date.now()}`;
  const expNumber = `EXP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await dbRun(
    `INSERT INTO expenses (id, expense_number, category, title, amount, payment_method, supplier_id, paid_to, expense_date, receipt_reference, recorded_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, expNumber, category, title, parseFloat(amount), payment_method || 'Cash', supplier_id || null, paid_to || null, expense_date, receipt_reference || null, req.user?.id, notes || null]
  );

  await logAudit(req.user, 'Finance', 'Expense Logged', id, `Logged expense "${title}" for ${process.env.CURRENCY_SYMBOL || 'FRw'}${parseFloat(amount).toFixed(2)} (${category})`);
  return res.status(201).json({ message: 'Expense recorded successfully', expense_number: expNumber });
});
