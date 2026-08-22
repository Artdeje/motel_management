import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles } from '../middleware/auth';

export const financeRouter = Router();

// GET /api/finance/trend - Monthly revenue/expenses/profit trend + payment methods + revenue by department
financeRouter.get('/finance/trend', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const months = parseInt(req.query.months as string) || 12;

    // Monthly revenue trend
    const revenueRows = await dbAll<any>(
      `SELECT DATE_FORMAT(p.payment_date, '%Y-%m') as month_key,
              DATE_FORMAT(p.payment_date, '%b %Y') as month_label,
              COALESCE(SUM(p.amount), 0) as revenue
       FROM payments p
       WHERE p.payment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month_key, month_label
       ORDER BY month_key ASC`,
      [months]
    );

    // Monthly expense trend
    const expenseRows = await dbAll<any>(
      `SELECT DATE_FORMAT(e.expense_date, '%Y-%m') as month_key,
              DATE_FORMAT(e.expense_date, '%b %Y') as month_label,
              COALESCE(SUM(e.amount), 0) as expenses
       FROM expenses e
       WHERE e.expense_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month_key, month_label
       ORDER BY month_key ASC`,
      [months]
    );

    // Merge into trend array
    const monthMap = new Map<string, { month: string; revenue: number; expenses: number; profit: number }>();
    revenueRows.forEach((r) => {
      monthMap.set(r.month_key, { month: r.month_label, revenue: r.revenue, expenses: 0, profit: 0 });
    });
    expenseRows.forEach((r) => {
      if (monthMap.has(r.month_key)) {
        monthMap.get(r.month_key)!.expenses = r.expenses;
      } else {
        monthMap.set(r.month_key, { month: r.month_label, revenue: 0, expenses: r.expenses, profit: 0 });
      }
    });
    const trend = Array.from(monthMap.values()).map((t) => ({ ...t, profit: t.revenue - t.expenses }));

    // Payment method distribution
    const paymentMethods = await dbAll<any>(
      `SELECT payment_method, COUNT(*) as count, SUM(amount) as total
       FROM payments
       WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY payment_method
       ORDER BY total DESC`,
      [months]
    );

    // Revenue by department (payment_category)
    const revenueByDept = await dbAll<any>(
      `SELECT payment_category as department, SUM(amount) as total
       FROM payments
       WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY payment_category
       ORDER BY total DESC`,
      [months]
    );

    // Expense by category
    const expensesByCategory = await dbAll<any>(
      `SELECT category, SUM(amount) as total
       FROM expenses
       WHERE expense_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY category
       ORDER BY total DESC`,
      [months]
    );

    return res.json({ trend, paymentMethods, revenueByDept, expensesByCategory });
  } catch (err: any) {
    console.error('Finance trend error:', err);
    return res.status(500).json({ error: 'Failed to load finance trend data' });
  }
});

// GET /api/finance/overview - Financial metrics, revenue breakdown, expenses, food cost %
financeRouter.get('/finance/overview', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  // 1. Revenue by category
  const roomRev = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category IN ("Room", "Deposit")'))?.total || 0;
  const foodRev = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category = "Food"')) || { total: 0 };
  const barRev = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category = "Drinks"')) || { total: 0 };
  const orderPayments = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category = "Food/Drinks"')) || { total: 0 };

  const totalRevenue = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM payments'))?.total || 0;

  // 2. Expenses by category
  const totalExpenses = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM expenses'))?.total || 0;
  const expensesByCategory = await dbAll<any>(
    'SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC'
  );

  // 3. Food Cost Calculation
  // Food Cost = Sum of consumed kitchen inventory transactions
  const foodCostSum = (await dbGet<any>(
    `SELECT COALESCE(SUM(it.total_cost), 0) as total
     FROM inventory_transactions it
     JOIN inventory_items i ON it.item_id = i.id
     JOIN inventory_categories ic ON i.category_id = ic.id
     WHERE ic.name = 'Kitchen Ingredients' AND it.transaction_type IN ('Consumed', 'Damaged')`
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
