import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles, createNotification } from '../middleware/auth';

export const inventoryRouter = Router();

// Helper: canonical stock categories - Drink, Kitchen ingredient, Tools
// 'Food' was retired as a stock category: edible stock is all Kitchen ingredient.
// Legacy Food/Foods rows still exist for FK safety and are folded in here.
export function getStockLabel(categoryName: string, department?: string): string {
  const n = (categoryName || '').toLowerCase();
  const d = (department || '').toLowerCase();
  if (n.includes('drink') || n.includes('bar') || n.includes('beverage') || n.includes('wine') || n.includes('beer') || n.includes('juice') || n.includes('water') || n.includes('soda') || d === 'bar') return 'Drink';
  if (n.includes('tool') || n.includes('clean') || n.includes('maintenance') || d === 'housekeeping') return 'Tools';
  if (n.includes('kitchen') || n.includes('ingredient') || n.includes('spice') || n.includes('oil') || n.includes('produce') || n.includes('meat') || n.includes('poultry') || n.includes('dairy') || n.includes('grain') || n.includes('food') || d === 'kitchen') return 'Kitchen ingredient';
  return 'Tools';
}

async function ensureStockLabels() {
  const labels = [
    { id: 'cat-drink', name: 'Drink', description: 'Drink stock: beverages, juices, water, beer, wine, spirits' },
    { id: 'cat-kitchen-ingredient', name: 'Kitchen ingredient', description: 'Kitchen ingredients: meats, poultry, dairy, produce, grains, spices, oils, prepared foods' },
    { id: 'cat-tools-stock', name: 'Tools', description: 'Tools stock: cleaning supplies, amenities, maintenance spares' },
  ];
  for (const c of labels) {
    const exists = await dbGet<any>('SELECT id FROM inventory_categories WHERE id = ? OR name = ?', [c.id, c.name]);
    if (!exists) {
      try { await dbRun('INSERT INTO inventory_categories (id, name, description) VALUES (?, ?, ?)', [c.id, c.name, c.description]); } catch {}
    }
  }

  // 'Food' is retired as a stock category. Move any item still filed under a
  // Food category over to Kitchen ingredient so nothing is orphaned or hidden.
  // Idempotent: once migrated there is nothing left to match.
  try {
    const target = await dbGet<any>("SELECT id FROM inventory_categories WHERE name = 'Kitchen ingredient'");
    if (target?.id) {
      const foodCats = await dbAll<any>("SELECT id FROM inventory_categories WHERE name IN ('Food', 'Foods')");
      for (const fc of foodCats) {
        await dbRun('UPDATE inventory_items SET category_id = ? WHERE category_id = ?', [target.id, fc.id]);
      }
    }
  } catch (e: any) {
    console.error('[Inventory] Food -> Kitchen ingredient migration skipped:', e?.message || e);
  }
  // Hide removed categories (Food, Linen, Others, Ingredient) from active selection - keep for FK but filter in UI
}

// GET /api/inventory/analytics - Live stock analytics with period filter (24h/week/month/annual)
inventoryRouter.get('/inventory/analytics', authMiddleware, async (req: Request, res: Response) => {
  try {
    await ensureStockLabels();
    const period = (req.query.period as string) || 'month';
    const periodMap: Record<string, string> = {
      '24h': '1 DAY',
      '24 hours': '1 DAY',
      'daily': '1 DAY',
      'week': '7 DAY',
      'weekly': '7 DAY',
      'month': '30 DAY',
      'monthly': '30 DAY',
      'annual': '365 DAY',
      'year': '365 DAY',
      'yearly': '365 DAY',
    };
    const interval = periodMap[period.toLowerCase()] || periodMap[period] || '30 DAY';

    // Current stock aggregates
    const allItems = await dbAll<any>(`SELECT i.*, ic.name as category_name FROM inventory_items i JOIN inventory_categories ic ON i.category_id = ic.id WHERE i.is_active = 1`);
    let totalCurrentQty = 0, totalValuation = 0, totalItems = allItems.length;
    let lowStockCount = 0, outOfStockCount = 0;
    const labelBreakdown: Record<string, { count: number; currentQty: number; valuation: number }> = {
      Drink: { count: 0, currentQty: 0, valuation: 0 },
      'Kitchen ingredient': { count: 0, currentQty: 0, valuation: 0 },
      Tools: { count: 0, currentQty: 0, valuation: 0 },
    };
    for (const it of allItems) {
      // Coerce: Postgres returns numeric columns as strings, so `+=` would
      // concatenate and corrupt every total on this dashboard.
      const cur = Number(it.current_quantity) || 0;
      const reserved = Number(it.reserved_quantity) || 0;
      const minimum = Number(it.minimum_quantity) || 0;
      const cost = Number(it.unit_cost) || 0;
      const avail = cur - reserved;
      totalCurrentQty += cur;
      totalValuation += cur * cost;
      if (avail <= 0) outOfStockCount++;
      else if (avail <= minimum) lowStockCount++;
      const label = getStockLabel(it.category_name, it.department);
      if (!labelBreakdown[label]) labelBreakdown[label] = { count: 0, currentQty: 0, valuation: 0 };
      labelBreakdown[label].count++;
      labelBreakdown[label].currentQty += cur;
      labelBreakdown[label].valuation += cur * cost;
    }

    // Every stock (total ever received) vs current stock via transactions
    const everyStockRow = await dbGet<any>(`SELECT COALESCE(SUM(quantity),0) as total FROM inventory_transactions WHERE transaction_type IN ('Received','Returned')`);
    const stockOutRow = await dbGet<any>(`SELECT COALESCE(SUM(quantity),0) as total FROM inventory_transactions WHERE transaction_type IN ('Issued','Consumed','Damaged','Lost','Expired')`);
    const everyStock = everyStockRow?.total || 0;
    const totalStockOut = stockOutRow?.total || 0;

    // Period filtered transactions for trend
    const periodStockIn = await dbGet<any>(`SELECT COALESCE(SUM(quantity),0) as total FROM inventory_transactions WHERE transaction_type IN ('Received','Returned') AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})`);
    const periodStockOut = await dbGet<any>(`SELECT COALESCE(SUM(quantity),0) as total FROM inventory_transactions WHERE transaction_type IN ('Issued','Consumed','Damaged','Lost','Expired') AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})`);
    const periodTransactions = await dbAll<any>(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as day, transaction_type, SUM(quantity) as qty FROM inventory_transactions WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${interval}) GROUP BY day, transaction_type ORDER BY day ASC`);

    // Build daily trend map
    const trendMap = new Map<string, { day: string; stockIn: number; stockOut: number }>();
    for (const r of periodTransactions) {
      const day = r.day;
      if (!trendMap.has(day)) trendMap.set(day, { day, stockIn: 0, stockOut: 0 });
      const entry = trendMap.get(day)!;
      if (['Received','Returned'].includes(r.transaction_type)) entry.stockIn += Number(r.qty);
      else entry.stockOut += Number(r.qty);
    }
    const trend = Array.from(trendMap.values()).sort((a,b)=> a.day.localeCompare(b.day));

    // Stock status distribution for current
    const statusDist = await dbAll<any>(`SELECT 
      SUM(CASE WHEN (i.current_quantity - COALESCE(i.reserved_quantity,0)) <= 0 THEN 1 ELSE 0 END) as outOfStock,
      SUM(CASE WHEN (i.current_quantity - COALESCE(i.reserved_quantity,0)) > 0 AND (i.current_quantity - COALESCE(i.reserved_quantity,0)) <= i.minimum_quantity THEN 1 ELSE 0 END) as lowStock,
      SUM(CASE WHEN (i.current_quantity - COALESCE(i.reserved_quantity,0)) > i.minimum_quantity THEN 1 ELSE 0 END) as inStock
      FROM inventory_items i WHERE i.is_active=1`);

    return res.json({
      period, interval,
      summary: {
        totalItems,
        totalCurrentQty,
        totalValuation,
        everyStock,
        totalStockOut,
        currentVsEvery: everyStock > 0 ? Number(((totalCurrentQty / everyStock)*100).toFixed(1)) : 0,
        stockOutVsCurrent: totalCurrentQty > 0 ? Number(((totalStockOut / (totalStockOut + totalCurrentQty))*100).toFixed(1)) : 0,
        lowStockCount,
        outOfStockCount,
        periodStockIn: periodStockIn?.total || 0,
        periodStockOut: periodStockOut?.total || 0,
      },
      labelBreakdown,
      trend,
      statusDist: statusDist[0] || { outOfStock: 0, lowStock: 0, inStock: 0 },
      generatedAt: new Date().toISOString(),
    });
  } catch (err:any) {
    console.error('Inventory analytics error:', err);
    return res.status(500).json({ error: 'Failed to load inventory analytics' });
  }
});

// GET /api/inventory/items - List all items with category, stock status & alerts
inventoryRouter.get('/inventory/items', authMiddleware, async (req: Request, res: Response) => {
  const role = req.user?.role;
  let deptFilter = '';
  let deptParams: any[] = [];

  if (role === 'chef') {
    deptFilter = 'AND i.department = ?';
    deptParams = ['Kitchen'];
  } else if (role === 'housekeeper') {
    deptFilter = 'AND i.department = ?';
    deptParams = ['Housekeeping'];
  } else if (role === 'bartender') {
    deptFilter = 'AND i.department = ?';
    deptParams = ['Bar'];
  }
  // admin & manager see all departments

  const items = await dbAll<any>(
    `SELECT i.*, ic.name as category_name, s.name as supplier_name
     FROM inventory_items i
     JOIN inventory_categories ic ON i.category_id = ic.id
     LEFT JOIN suppliers s ON i.supplier_id = s.id
     WHERE i.is_active = 1 ${deptFilter}
     ORDER BY i.department ASC, ic.name ASC, i.name ASC`,
    deptParams
  );

  // Ensure stock labels exist for frontend filters
  await ensureStockLabels();

  const enriched = items.map((item) => {
    // Postgres hands back numeric columns as strings — coerce before any
    // arithmetic, otherwise `+` concatenates instead of adding.
    const current = Number(item.current_quantity) || 0;
    const reserved = Number(item.reserved_quantity) || 0;
    const minimum = Number(item.minimum_quantity) || 0;
    const reorder = Number(item.reorder_quantity) || 0;
    const available = current - reserved;
    let stock_status = 'In Stock';
    if (available <= 0) {
      stock_status = 'Out of Stock';
    } else if (available <= minimum * 0.5) {
      stock_status = 'Critical Stock';
    } else if (available <= minimum) {
      stock_status = 'Low Stock';
    }
    const recommended_reorder = Math.max(0, reorder + (minimum - available));
    const stock_label = getStockLabel(item.category_name, item.department);
    return {
      ...item,
      available_quantity: available,
      stock_status,
      stock_label,
      recommended_reorder: Math.ceil(recommended_reorder),
    };
  });

  const categories = await dbAll<any>('SELECT * FROM inventory_categories ORDER BY name ASC');
  const suppliers = await dbAll<any>('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name ASC');

  return res.json({ items: enriched, categories, suppliers });
});

// POST /api/inventory/items - Add inventory item (Chef, Housekeeper, Manager, Admin)
inventoryRouter.post('/inventory/items', authMiddleware, requireRoles(['admin', 'manager', 'chef', 'housekeeper']), async (req: Request, res: Response) => {
  const { sku, name, category_id, department, unit, current_quantity, minimum_quantity, reorder_quantity, unit_cost, supplier_id, storage_location } = req.body;
  if (!name || !category_id || !unit) {
    return res.status(400).json({ error: 'Name, category and unit are required' });
  }

  // Auto-generate a unique SKU when the user does not provide one
  let finalSku = (sku || '').trim();
  if (!finalSku) {
    const catPrefix = (await dbGet<any>('SELECT name FROM inventory_categories WHERE id = ?', [category_id]));
    const base = (catPrefix?.name || 'STK')
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase()
      .substring(0, 3) || 'STK';
    let unique = false;
    let counter = 0;
    while (!unique) {
      counter += 1;
      finalSku = `${base}-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000) + counter)}`;
      const exists = await dbGet<any>('SELECT id FROM inventory_items WHERE sku = ?', [finalSku]);
      unique = !exists;
    }
  }

  const existing = await dbGet<any>('SELECT id FROM inventory_items WHERE sku = ?', [finalSku]);
  if (existing) {
    return res.status(400).json({ error: `Item with SKU ${finalSku} already exists` });
  }

  const id = `inv-${Date.now()}`;
  const initialQty = parseFloat(current_quantity || 0);

  await dbTransaction(async () => {
    await dbRun(
      `INSERT INTO inventory_items (id, sku, name, category_id, department, unit, current_quantity, reserved_quantity, minimum_quantity, reorder_quantity, unit_cost, supplier_id, storage_location, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1)`,
      [id, finalSku, name, category_id, department || 'General', unit, initialQty, parseFloat(minimum_quantity || 5), parseFloat(reorder_quantity || 20), parseFloat(unit_cost || 0), supplier_id || null, storage_location || null]
    );

    if (initialQty > 0) {
      const txId = `itx-${Date.now()}`;
      await dbRun(
        `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, total_cost, reason, user_id)
         VALUES (?, ?, 'Received', ?, 0, ?, ?, ?, 'Initial stock setup', ?)`,
        [txId, id, initialQty, initialQty, parseFloat(unit_cost || 0), initialQty * parseFloat(unit_cost || 0), req.user?.id]
      );
    }
  });

  await logAudit(req.user, 'Inventory', 'Created', id, `Added inventory item ${name} (${finalSku})`);
  return res.status(201).json({ message: 'Inventory item added successfully', id, sku: finalSku });
});

// PUT /api/inventory/items/:id - Edit item specifications
inventoryRouter.put('/inventory/items/:id', authMiddleware, requireRoles(['admin', 'manager', 'chef', 'housekeeper']), async (req: Request, res: Response) => {
  const { name, category_id, department, unit, minimum_quantity, reorder_quantity, unit_cost, supplier_id, storage_location, is_active } = req.body;
  const item = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  // Department boundary: non-admin/manager users can only edit items in their department
  if (!['admin', 'manager'].includes(req.user!.role)) {
    const userRole = req.user!.role;
    const allowedDepartments: Record<string, string[]> = {
      chef: ['Kitchen'],
      housekeeper: ['Housekeeping'],
    };
    const allowed = allowedDepartments[userRole] || [];
    if (!allowed.includes(item.department || 'General')) {
      return res.status(403).json({ error: `Access denied. You can only edit ${item.department || 'General'} department items.` });
    }
  }

  // Treat this as a partial update: any field the caller omits keeps its current
  // value. Previously `is_active ? 1 : 0` turned an omitted flag into 0, so the
  // edit form — which never sends is_active — silently soft-deleted the item and
  // it vanished from the list.
  const keepNumber = (v: any, fallback: any) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : Number(fallback) || 0;
  };
  const nextActive = is_active === undefined || is_active === null ? (item.is_active ?? 1) : (is_active ? 1 : 0);

  await dbRun(
    `UPDATE inventory_items SET name = ?, category_id = ?, department = ?, unit = ?, minimum_quantity = ?, reorder_quantity = ?, unit_cost = ?, supplier_id = ?, storage_location = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [
      name ?? item.name,
      category_id ?? item.category_id,
      department || item.department || 'General',
      unit ?? item.unit,
      keepNumber(minimum_quantity, item.minimum_quantity),
      keepNumber(reorder_quantity, item.reorder_quantity),
      keepNumber(unit_cost, item.unit_cost),
      supplier_id === undefined ? item.supplier_id : (supplier_id || null),
      storage_location === undefined ? item.storage_location : (storage_location || null),
      nextActive,
      req.params.id,
    ]
  );

  await logAudit(req.user, 'Inventory', 'Updated', req.params.id, `Updated item ${item.sku} properties`);
  return res.json({ message: 'Inventory item updated successfully' });
});

// DELETE /api/inventory/items/:id - Soft-delete inventory item (Chef, Housekeeper, Manager, Admin)
inventoryRouter.delete('/inventory/items/:id', authMiddleware, requireRoles(['admin', 'manager', 'chef', 'housekeeper']), async (req: Request, res: Response) => {
  const item = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  // Department boundary: non-admin/manager users can only delete items in their department
  if (!['admin', 'manager'].includes(req.user!.role)) {
    const userRole = req.user!.role;
    const allowedDepartments: Record<string, string[]> = {
      chef: ['Kitchen'],
      housekeeper: ['Housekeeping'],
    };
    const allowed = allowedDepartments[userRole] || [];
    if (!allowed.includes(item.department || 'General')) {
      return res.status(403).json({ error: `Access denied. You can only delete ${item.department || 'General'} department items.` });
    }
  }

  await dbRun(
    'UPDATE inventory_items SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [req.params.id]
  );

  await logAudit(req.user, 'Inventory', 'Deleted', req.params.id, `Removed inventory item ${item.name} (${item.sku}) from stock`);
  return res.json({ message: 'Inventory item removed from stock successfully' });
});

// POST /api/inventory/transactions - Stock Receive/Adjust/Damage/Return (Transactions engine)
inventoryRouter.post('/inventory/transactions', authMiddleware, async (req: Request, res: Response) => {
  const { item_id, transaction_type, quantity, unit_cost, reason, reference_id } = req.body;
  if (!item_id || !transaction_type || !quantity || !reason) {
    return res.status(400).json({ error: 'Item, transaction type, quantity and reason are required' });
  }

  const validTypes = ['Received', 'Issued', 'Consumed', 'Returned', 'Damaged', 'Lost', 'Expired', 'Adjustment'];
  if (!validTypes.includes(transaction_type)) {
    return res.status(400).json({ error: 'Invalid transaction type' });
  }

  // Bartenders have read-only access to inventory: no receiving, no waste, no
  // adjustment of any kind. Stock they need goes through a Supply Request that a
  // manager approves. Chef & Housekeeper still manage their own department stock.
  if (req.user?.role === 'bartender') {
    return res.status(403).json({ error: 'Bartenders have view-only access to inventory. Please raise a Supply Request.' });
  }

  const item = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [item_id]);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const qty = parseFloat(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a number greater than zero' });
  }

  // Postgres returns numeric/decimal columns as STRINGS. Without this coercion
  // `prevQty + qty` concatenates instead of adding ("37.00" + 15 -> "37.0015"),
  // which silently corrupted every stock refill. Subtraction coerced already,
  // so only Received/Returned were affected.
  const prevQty = Number(item.current_quantity) || 0;
  const minQty = Number(item.minimum_quantity) || 0;
  let newQty = prevQty;

  if (['Received', 'Returned'].includes(transaction_type)) {
    newQty = prevQty + qty;
  } else if (['Issued', 'Consumed', 'Damaged', 'Lost', 'Expired'].includes(transaction_type)) {
    newQty = prevQty - qty;
    if (newQty < 0) {
      return res.status(400).json({ error: `Cannot deduct ${qty} ${item.unit}. Current stock is only ${prevQty} ${item.unit}.` });
    }
  } else if (transaction_type === 'Adjustment') {
    newQty = qty;
  }

  const cost = unit_cost ? parseFloat(unit_cost) : Number(item.unit_cost) || 0;
  const totalCost = cost * Math.abs(newQty - prevQty);

  await dbTransaction(async () => {
    // 1. Update item quantity
    await dbRun('UPDATE inventory_items SET current_quantity = ?, unit_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, cost, item_id]);

    // 2. Log transaction
    const txId = `itx-${Date.now()}`;
    await dbRun(
      `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, total_cost, reference_id, reason, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [txId, item_id, transaction_type, qty, prevQty, newQty, cost, totalCost, reference_id || null, reason, req.user?.id]
    );

    // If stock is below min, create notification
    if (newQty <= minQty) {
      await createNotification(
        'low_stock',
        `Low Stock: ${item.name}`,
        `${item.name} is now at ${newQty} ${item.unit} (Min: ${minQty} ${item.unit})`,
        'manager',
        null,
        '/inventory'
      );
    }
  });

  await logAudit(req.user, 'Inventory', 'Stock Change', item_id, `${transaction_type} ${qty} ${item.unit} for ${item.name} (${prevQty} -> ${newQty})`);
  return res.json({ message: `Stock updated. New quantity: ${newQty} ${item.unit}` });
});

// GET /api/inventory/transactions - List recent transactions with user and item
inventoryRouter.get('/inventory/transactions', authMiddleware, async (req: Request, res: Response) => {
  const transactions = await dbAll<any>(
    `SELECT it.*, i.name as item_name, i.sku, i.unit, u.full_name as user_name, u.username
     FROM inventory_transactions it
     JOIN inventory_items i ON it.item_id = i.id
     JOIN users u ON it.user_id = u.id
     ORDER BY it.created_at DESC
     LIMIT 100`
  );
  return res.json({ transactions });
});

// GET /api/inventory/requests - List supply requests
inventoryRouter.get('/inventory/requests', authMiddleware, async (req: Request, res: Response) => {
  const requests = await dbAll<any>(
    `SELECT sr.*, u.full_name as requester_name, u.username as requester_username,
            rev.full_name as reviewer_name
     FROM stock_requests sr
     JOIN users u ON sr.requested_by = u.id
     LEFT JOIN users rev ON sr.reviewed_by = rev.id
     ORDER BY sr.created_at DESC`
  );

  const enriched = await Promise.all(requests.map(async (reqItem) => {
    const items = await dbAll<any>(
      `SELECT sri.*, i.name as item_name, i.sku, i.current_quantity
       FROM stock_request_items sri
       JOIN inventory_items i ON sri.item_id = i.id
       WHERE sri.request_id = ?`,
      [reqItem.id]
    );
    return { ...reqItem, items };
  }));

  return res.json({ requests: enriched });
});

// POST /api/inventory/requests - Submit stock request (Chef, bartender, Housekeeper)
inventoryRouter.post('/inventory/requests', authMiddleware, async (req: Request, res: Response) => {
  const { department, priority, reason, items } = req.body;
  if (!department || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Department and at least one item are required' });
  }

  const reqId = `sr-${Date.now()}`;
  const reqNumber = `REQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await dbTransaction(async () => {
    await dbRun(
      `INSERT INTO stock_requests (id, request_number, department, requested_by, status, priority, reason)
       VALUES (?, ?, ?, ?, 'Pending', ?, ?)`,
      [reqId, reqNumber, department, req.user?.id, priority || 'Normal', reason || null]
    );

    for (const it of items) {
      const sriId = `sri-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      await dbRun(
        `INSERT INTO stock_request_items (id, request_id, item_id, quantity_requested, unit)
         VALUES (?, ?, ?, ?, ?)`,
        [sriId, reqId, it.item_id, parseFloat(it.quantity_requested), it.unit || 'units']
      );
    }

    await createNotification(
      'request',
      `New Stock Request from ${department}`,
      `${req.user?.full_name} submitted request #${reqNumber} for ${items.length} item(s).`,
      'manager',
      null,
      '/inventory'
    );
  });

  await logAudit(req.user, 'Inventory', 'Stock Request Created', reqId, `Submitted stock request ${reqNumber} (${department})`);
  return res.status(201).json({ message: 'Stock request submitted successfully', request_number: reqNumber });
});

// PUT /api/inventory/requests/:id/review - Approve / Reject stock request (Rule 10 & 11)
inventoryRouter.put('/inventory/requests/:id/review', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { status, review_notes } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Approved or Rejected' });
  }

  const request = await dbGet<any>('SELECT * FROM stock_requests WHERE id = ?', [req.params.id]);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  // Rule 10 & 11: Users cannot approve their own requests
  if (request.requested_by === req.user?.id) {
    return res.status(403).json({ error: 'You cannot approve your own stock request. Another Manager or Admin must review it.' });
  }

  const reqItems = await dbAll<any>('SELECT * FROM stock_request_items WHERE request_id = ?', [req.params.id]);

  await dbTransaction(async () => {
    await dbRun(
      `UPDATE stock_requests SET status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, req.user?.id, review_notes || null, req.params.id]
    );

    if (status === 'Approved') {
      // Issue stock to the department & log inventory transaction
      for (const item of reqItems) {
        const invItem = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [item.item_id]);
        if (invItem) {
          await dbRun('UPDATE stock_request_items SET quantity_approved = ? WHERE id = ?', [item.quantity_requested, item.id]);
          // Deduct from storage and mark issued
          const newQty = Math.max(0, invItem.current_quantity - item.quantity_requested);
          await dbRun('UPDATE inventory_items SET current_quantity = ? WHERE id = ?', [newQty, invItem.id]);

          const txId = `itx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          await dbRun(
            `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, reference_id, reason, user_id)
             VALUES (?, ?, 'Issued', ?, ?, ?, ?, ?, ?, ?)`,
            [txId, invItem.id, item.quantity_requested, invItem.current_quantity, newQty, invItem.unit_cost, request.request_number, `Issued for request #${request.request_number} (${request.department})`, req.user?.id]
          );
        }
      }
    }

    createNotification(
      'request',
      `Stock Request #${request.request_number} ${status}`,
      `Your stock request has been ${status.toLowerCase()} by ${req.user?.full_name}.`,
      'all',
      request.requested_by,
      '/inventory'
    );
  });

  logAudit(req.user, 'Inventory', `Request ${status}`, req.params.id, `${status} stock request ${request.request_number}`);
  return res.json({ message: `Stock request marked as ${status}` });
});
