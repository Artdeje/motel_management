import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { authMiddleware, logAudit, requireRoles, createNotification } from '../middleware/auth';

export const kitchenRouter = Router();

// GET /api/kitchen/stats - KPI metrics for chef dashboard
kitchenRouter.get('/kitchen/stats', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  try {
    const activeCount = await dbGet<any>(
      `SELECT COUNT(DISTINCT o.id) as cnt
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items m ON oi.menu_item_id = m.id
       JOIN menu_categories mc ON m.category_id = mc.id
       WHERE o.status IN ('Pending', 'Confirmed', 'Preparing', 'Ready')
         AND mc.name NOT IN ('Drinks & Bar')`
    );

    const avgPrep = await dbGet<any>(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, o.created_at, o.updated_at)) as avg_minutes
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items m ON oi.menu_item_id = m.id
       JOIN menu_categories mc ON m.category_id = mc.id
       WHERE o.status = 'Completed'
         AND DATE(o.updated_at) = CURDATE()
         AND mc.name NOT IN ('Drinks & Bar')`
    );

    const wasteCost = await dbGet<any>(
      `SELECT COALESCE(SUM(kw.cost_loss), 0) as total_cost
       FROM kitchen_waste kw
       WHERE DATE(kw.date_reported) = CURDATE()`
    );

    const usageCount = await dbGet<any>(
      `SELECT COUNT(*) as cnt
       FROM kitchen_usage
       WHERE DATE(date_recorded) = CURDATE()`
    );

    const lowStock = await dbGet<any>(
      `SELECT COUNT(*) as cnt
       FROM inventory_items
       WHERE department = 'Kitchen' AND is_active = 1
         AND (current_quantity - reserved_quantity) <= minimum_quantity`
    );

    const revenue = await dbGet<any>(
      `SELECT COALESCE(SUM(o.total_amount), 0) as total_revenue
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items m ON oi.menu_item_id = m.id
       JOIN menu_categories mc ON m.category_id = mc.id
       WHERE o.status = 'Completed'
         AND o.payment_status = 'Paid'
         AND DATE(o.updated_at) = CURDATE()
         AND mc.name NOT IN ('Drinks & Bar')`
    );

    // Postgres returns COUNT/SUM/AVG as strings; send real numbers so callers
    // can do arithmetic without silently concatenating.
    const num = (v: any) => Number(v) || 0;
    return res.json({
      activeOrders: num(activeCount?.cnt),
      avgPrepTime: Math.round(num(avgPrep?.avg_minutes)),
      todayWasteCost: num(wasteCost?.total_cost),
      todayUsageCount: num(usageCount?.cnt),
      lowStockCount: num(lowStock?.cnt),
      todayRevenue: num(revenue?.total_revenue),
    });
  } catch (err: any) {
    console.error('Kitchen stats error:', err);
    return res.status(500).json({ error: 'Failed to load kitchen stats' });
  }
});

// GET /api/kitchen/orders-chart - Time-series data for completed kitchen orders
kitchenRouter.get('/kitchen/orders-chart', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'daily';

    let groupBy: string;
    let dateFormat: string;
    let limit: number;

    switch (period) {
      case 'weekly':
        groupBy = 'YEAR(o.updated_at), WEEK(o.updated_at, 1)';
        dateFormat = "DATE_FORMAT(MIN(o.updated_at), '%x-W%v')";
        limit = 12;
        break;
      case 'monthly':
        groupBy = 'YEAR(o.updated_at), MONTH(o.updated_at)';
        dateFormat = "DATE_FORMAT(MIN(o.updated_at), '%Y-%m')";
        limit = 12;
        break;
      case 'annual':
        groupBy = 'YEAR(o.updated_at)';
        dateFormat = "DATE_FORMAT(MIN(o.updated_at), '%Y')";
        limit = 5;
        break;
      default: // daily
        groupBy = 'DATE(o.updated_at)';
        dateFormat = "DATE_FORMAT(MIN(o.updated_at), '%Y-%m-%d')";
        limit = 30;
        break;
    }

    const rows = await dbAll<any>(
      `SELECT ${dateFormat} as period_label,
              COUNT(DISTINCT o.id) as orders_completed,
              COALESCE(SUM(o.total_amount), 0) as revenue
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items m ON oi.menu_item_id = m.id
       JOIN menu_categories mc ON m.category_id = mc.id
       WHERE o.status = 'Completed'
         AND mc.name NOT IN ('Drinks & Bar')
       GROUP BY ${groupBy}
       ORDER BY MIN(o.updated_at) DESC
       LIMIT ?`,
      [limit]
    );

    // Recharts needs numbers — Postgres hands COUNT/SUM back as strings, which
    // would plot as zero-height bars.
    const chartData = rows
      .map((r) => ({
        period_label: String(r.period_label),
        orders_completed: Number(r.orders_completed) || 0,
        revenue: Number(r.revenue) || 0,
      }))
      .reverse();
    return res.json({ chartData });
  } catch (err: any) {
    console.error('Kitchen chart error:', err);
    return res.status(500).json({ error: 'Failed to load kitchen chart data' });
  }
});

// GET /api/kitchen/dashboard - Active food orders, unavailable items, low stock ingredients
kitchenRouter.get('/kitchen/dashboard', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  try {
    const activeOrders = await dbAll<any>(
      `SELECT DISTINCT o.*, u.full_name as waiter_name, r.room_number, g.full_name as guest_name
       FROM orders o
       JOIN users u ON o.waiter_id = u.id
       LEFT JOIN rooms r ON o.room_id = r.id
       LEFT JOIN guests g ON o.guest_id = g.id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items m ON oi.menu_item_id = m.id
       JOIN menu_categories mc ON m.category_id = mc.id
       WHERE o.status IN ('Pending', 'Confirmed', 'Preparing', 'Ready')
         AND mc.name NOT IN ('Drinks & Bar')
       ORDER BY o.created_at ASC`
    );

    const enrichedOrders = await Promise.all(activeOrders.map(async (ord) => {
      const items = await dbAll<any>(
        `SELECT oi.*, m.preparation_duration
         FROM order_items oi
         JOIN menu_items m ON oi.menu_item_id = m.id
         WHERE oi.order_id = ?`,
        [ord.id]
      );
      return { ...ord, items };
    }));

    const lowIngredients = await dbAll<any>(
      `SELECT i.*, (i.current_quantity - i.reserved_quantity) as available_stock
       FROM inventory_items i
       WHERE i.department = 'Kitchen' AND i.is_active = 1
         AND (i.current_quantity - i.reserved_quantity) <= i.minimum_quantity
       ORDER BY (i.current_quantity - i.reserved_quantity) ASC`
    );

    const unavailableItems = await dbAll<any>(
      `SELECT m.*, mc.name as category_name
       FROM menu_items m
       JOIN menu_categories mc ON m.category_id = mc.id
       WHERE m.is_available = 0 OR m.is_active = 0
       ORDER BY m.name ASC`
    );

    const todayUsage = await dbAll<any>(
      `SELECT ku.*, i.name as item_name, u.full_name as user_name
       FROM kitchen_usage ku
       JOIN inventory_items i ON ku.inventory_item_id = i.id
       JOIN users u ON ku.recorded_by = u.id
       WHERE DATE(ku.date_recorded) = CURDATE()
       ORDER BY ku.date_recorded DESC`
    );

    const todayWaste = await dbAll<any>(
      `SELECT kw.*, i.name as item_name, u.full_name as user_name
       FROM kitchen_waste kw
       JOIN inventory_items i ON kw.inventory_item_id = i.id
       JOIN users u ON kw.reported_by = u.id
       WHERE DATE(kw.date_reported) = CURDATE()
       ORDER BY kw.date_reported DESC`
    );

    return res.json({
      activeOrders: enrichedOrders,
      lowIngredients,
      unavailableItems,
      todayUsage,
      todayWaste,
    });
  } catch (err: any) {
    console.error('Kitchen dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load kitchen dashboard' });
  }
});

// POST /api/kitchen/waste - Report food waste
kitchenRouter.post('/kitchen/waste', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  try {
    const { inventory_item_id, quantity, reason, notes } = req.body;
    if (!inventory_item_id || !quantity || !reason) {
      return res.status(400).json({ error: 'Ingredient, quantity and reason are required' });
    }

    const item = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [inventory_item_id]);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const qty = parseFloat(quantity);
    const costLoss = qty * item.unit_cost;
    const id = `kw-${Date.now()}`;

    await dbRun(
      `INSERT INTO kitchen_waste (id, inventory_item_id, quantity, unit, cost_loss, reason, notes, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, inventory_item_id, qty, item.unit, costLoss, reason, notes || null, req.user?.id]
    );

    const prevQty = item.current_quantity;
    const newQty = Math.max(0, prevQty - qty);
    await dbRun('UPDATE inventory_items SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, item.id]);

    const txId = `itx-${Date.now()}`;
    await dbRun(
      `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, total_cost, reason, user_id)
       VALUES (?, ?, 'Damaged', ?, ?, ?, ?, ?, ?, ?)`,
      [txId, item.id, qty, prevQty, newQty, item.unit_cost, costLoss, `Kitchen waste reported: ${reason}`, req.user?.id]
    );

    logAudit(req.user, 'Kitchen', 'Waste Reported', id, `Reported ${qty} ${item.unit} waste of ${item.name} (${process.env.CURRENCY_SYMBOL || 'FRw'}${costLoss.toFixed(2)})`);
    return res.status(201).json({ message: 'Kitchen food waste recorded', cost_loss: costLoss });
  } catch (err: any) {
    console.error('Kitchen waste error:', err);
    return res.status(500).json({ error: 'Failed to record kitchen waste' });
  }
});

// GET /api/kitchen/waste - List all kitchen waste
kitchenRouter.get('/kitchen/waste', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  try {
    const wasteRecords = await dbAll<any>(
      `SELECT kw.*, i.name as item_name, i.sku, u.full_name as reported_by_name
       FROM kitchen_waste kw
       JOIN inventory_items i ON kw.inventory_item_id = i.id
       JOIN users u ON kw.reported_by = u.id
       ORDER BY kw.date_reported DESC`
    );
    return res.json({ wasteRecords });
  } catch (err: any) {
    console.error('Kitchen waste list error:', err);
    return res.status(500).json({ error: 'Failed to load kitchen waste records' });
  }
});

// POST /api/kitchen/usage - Manually record ingredient usage
kitchenRouter.post('/kitchen/usage', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  try {
    const { inventory_item_id, quantity, used_for } = req.body;
    if (!inventory_item_id || !quantity || !used_for) {
      return res.status(400).json({ error: 'Ingredient, quantity and used_for description are required' });
    }

    const item = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [inventory_item_id]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const qty = parseFloat(quantity);
    const id = `ku-${Date.now()}`;

    await dbRun(
      `INSERT INTO kitchen_usage (id, inventory_item_id, quantity, unit, used_for, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, inventory_item_id, qty, item.unit, used_for, req.user?.id]
    );

    const prevQty = item.current_quantity;
    const newQty = Math.max(0, prevQty - qty);
    await dbRun('UPDATE inventory_items SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, item.id]);

    const txId = `itx-${Date.now()}`;
    await dbRun(
      `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, total_cost, reason, user_id)
       VALUES (?, ?, 'Consumed', ?, ?, ?, ?, ?, ?, ?)`,
      [txId, item.id, qty, prevQty, newQty, item.unit_cost, qty * item.unit_cost, `Kitchen usage: ${used_for}`, req.user?.id]
    );

    logAudit(req.user, 'Kitchen', 'Usage Recorded', id, `Recorded ${qty} ${item.unit} usage of ${item.name} for ${used_for}`);
    return res.status(201).json({ message: 'Kitchen usage recorded successfully' });
  } catch (err: any) {
    console.error('Kitchen usage error:', err);
    return res.status(500).json({ error: 'Failed to record kitchen usage' });
  }
});
