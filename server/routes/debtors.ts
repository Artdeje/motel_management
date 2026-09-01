import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles } from '../middleware/auth';

export const debtorsRouter = Router();

/**
 * Debtors = unpaid tabs. A bartender records what a customer owes; a manager or
 * admin (or the bartender who raised it) records repayments until it is settled.
 *
 * Deliberately separate from `payments`: an outstanding debt is not revenue.
 * Only settlements are written into payments, and only for the amount collected.
 */

// GET /api/debtors - list debts. Bartenders see only the ones they recorded.
debtorsRouter.get('/debtors', authMiddleware, async (req: Request, res: Response) => {
  const { status } = req.query;
  let sql = `SELECT d.*, u.full_name as recorded_by_name, o.order_number
             FROM debtors d
             JOIN users u ON d.recorded_by = u.id
             LEFT JOIN orders o ON d.order_id = o.id
             WHERE 1=1`;
  const params: any[] = [];

  if (req.user!.role === 'bartender') {
    sql += ' AND d.recorded_by = ?';
    params.push(req.user!.id);
  }
  if (status && status !== 'all') {
    sql += ' AND d.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY d.created_at DESC';

  const debtors = await dbAll<any>(sql, params);

  // Coerce: Postgres returns numeric columns as strings, so summing them raw
  // would concatenate instead of adding.
  const rows = debtors.map((d) => {
    const amount = Number(d.amount) || 0;
    const paid = Number(d.amount_paid) || 0;
    return { ...d, amount, amount_paid: paid, balance: Math.max(0, amount - paid) };
  });

  const outstanding = rows.filter((d) => d.status === 'Outstanding');
  return res.json({
    debtors: rows,
    summary: {
      total: rows.length,
      outstandingCount: outstanding.length,
      totalOwed: outstanding.reduce((s, d) => s + d.balance, 0),
      totalCollected: rows.reduce((s, d) => s + d.amount_paid, 0),
    },
  });
});

// POST /api/debtors - record a new debt
debtorsRouter.post('/debtors', authMiddleware, requireRoles(['admin', 'manager', 'bartender']), async (req: Request, res: Response) => {
  const { debtor_name, phone, amount, reason, order_id } = req.body;

  if (!debtor_name || !String(debtor_name).trim()) {
    return res.status(400).json({ error: 'Debtor name is required' });
  }
  const amt = parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Amount must be a number greater than zero' });
  }

  // Only attach a real order — a dangling reference would break the listing join.
  let linkedOrder: string | null = null;
  if (order_id) {
    const ord = await dbGet<any>('SELECT id FROM orders WHERE id = ?', [order_id]);
    if (!ord) return res.status(404).json({ error: 'Linked order not found' });
    linkedOrder = order_id;
  }

  const id = `debt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  await dbRun(
    `INSERT INTO debtors (id, debtor_name, phone, order_id, amount, amount_paid, reason, status, recorded_by)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'Outstanding', ?)`,
    [id, String(debtor_name).trim(), phone || null, linkedOrder, amt, reason || null, req.user?.id]
  );

  await logAudit(req.user!, 'Debtors', 'Recorded', id, `Debt of ${amt} recorded for ${debtor_name}`, req.ip);
  return res.status(201).json({ message: `Debt recorded for ${debtor_name}`, id });
});

// POST /api/debtors/:id/pay - record a repayment (full or partial)
debtorsRouter.post('/debtors/:id/pay', authMiddleware, requireRoles(['admin', 'manager', 'bartender']), async (req: Request, res: Response) => {
  const { amount, payment_method } = req.body;
  const debt = await dbGet<any>('SELECT * FROM debtors WHERE id = ?', [req.params.id]);
  if (!debt) return res.status(404).json({ error: 'Debt not found' });

  if (req.user!.role === 'bartender' && debt.recorded_by !== req.user!.id) {
    return res.status(403).json({ error: 'You can only settle debts you recorded' });
  }
  if (debt.status === 'Settled') {
    return res.status(400).json({ error: 'This debt is already settled' });
  }

  const total = Number(debt.amount) || 0;
  const alreadyPaid = Number(debt.amount_paid) || 0;
  const balance = Math.max(0, total - alreadyPaid);

  // Default to clearing the whole balance.
  const pay = amount === undefined || amount === null || amount === '' ? balance : parseFloat(amount);
  if (!Number.isFinite(pay) || pay <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than zero' });
  }
  if (pay > balance) {
    return res.status(400).json({ error: `Payment exceeds the outstanding balance of ${balance}` });
  }

  const newPaid = alreadyPaid + pay;
  const nowSettled = newPaid >= total;

  await dbTransaction(async () => {
    await dbRun(
      `UPDATE debtors SET amount_paid = ?, status = ?, settled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newPaid, nowSettled ? 'Settled' : 'Outstanding', nowSettled ? new Date() : null, debt.id]
    );

    // Money actually collected becomes revenue at this point, not before.
    const payId = `pay-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const recNumber = `RCT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    await dbRun(
      `INSERT INTO payments (id, receipt_number, order_id, guest_id, amount, payment_method, payment_category, received_by, notes)
       VALUES (?, ?, ?, NULL, ?, ?, 'Other', ?, ?)`,
      [payId, recNumber, debt.order_id || null, pay, payment_method || 'Cash', req.user?.id, `Debt repayment from ${debt.debtor_name}`]
    );
  });

  await logAudit(req.user!, 'Debtors', nowSettled ? 'Settled' : 'Part payment', debt.id, `${pay} received from ${debt.debtor_name}`, req.ip);
  return res.json({
    message: nowSettled ? `Debt from ${debt.debtor_name} fully settled` : `${pay} recorded — balance ${total - newPaid}`,
    settled: nowSettled,
    balance: Math.max(0, total - newPaid),
  });
});

// DELETE /api/debtors/:id - remove a mistaken entry (admin/manager only)
debtorsRouter.delete('/debtors/:id', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const debt = await dbGet<any>('SELECT * FROM debtors WHERE id = ?', [req.params.id]);
  if (!debt) return res.status(404).json({ error: 'Debt not found' });

  await dbRun('DELETE FROM debtors WHERE id = ?', [debt.id]);
  await logAudit(req.user!, 'Debtors', 'Deleted', debt.id, `Removed debt record for ${debt.debtor_name}`, req.ip);
  return res.json({ message: `Debt record for ${debt.debtor_name} removed` });
});
