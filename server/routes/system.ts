import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { dbAll, dbGet, dbRun } from '../db/database';
import { authMiddleware, requireRoles, logAudit } from '../middleware/auth';
import { seedDatabaseIfEmpty } from '../db/seed';

export const systemRouter = Router();

// GET /api/system/audit-logs - List audit logs with filters
systemRouter.get('/system/audit-logs', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  const { module, user_id } = req.query;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (module && module !== 'all') {
    query += ' AND module = ?';
    params.push(module);
  }
  if (user_id) {
    query += ' AND user_id = ?';
    params.push(user_id);
  }

  query += ' ORDER BY created_at DESC LIMIT 200';
  const logs = await dbAll<any>(query, params);
  return res.json({ logs });
});

// GET /api/system/notifications - List notifications for user role
systemRouter.get('/system/notifications', authMiddleware, async (req: Request, res: Response) => {
  const userRole = req.user?.role || 'all';
  const userId = req.user?.id;

  const notifications = await dbAll<any>(
    `SELECT * FROM notifications 
     WHERE target_role IN ('all', ?) OR target_user_id = ?
     ORDER BY created_at DESC LIMIT 50`,
    [userRole, userId]
  );
  return res.json({ notifications });
});

// PUT /api/system/notifications/:id/read - Mark notification as read
systemRouter.put('/system/notifications/:id/read', authMiddleware, async (req: Request, res: Response) => {
  await dbRun('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
  return res.json({ message: 'Notification marked as read' });
});

// PUT /api/system/notifications/mark-all-read - Mark all read
systemRouter.put('/system/notifications/mark-all-read', authMiddleware, async (req: Request, res: Response) => {
  const userRole = req.user?.role || 'all';
  const userId = req.user?.id;
  await dbRun('UPDATE notifications SET is_read = 1 WHERE target_role IN ("all", ?) OR target_user_id = ?', [userRole, userId]);
  return res.json({ message: 'All notifications marked as read' });
});

// GET /api/system/schema-info - Get pure MySQL schema script and table statistics
systemRouter.get('/system/schema-info', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  const schemaPath = path.join(process.cwd(), 'server', 'db', 'schema.sql');
  let schemaSql = '';
  if (fs.existsSync(schemaPath)) {
    schemaSql = fs.readFileSync(schemaPath, 'utf8');
  }

  const tables = [
    { name: 'users', count: (await dbGet<any>('SELECT COUNT(*) as c FROM users'))?.c || 0 },
    { name: 'roles', count: (await dbGet<any>('SELECT COUNT(*) as c FROM roles'))?.c || 0 },
    { name: 'rooms', count: (await dbGet<any>('SELECT COUNT(*) as c FROM rooms'))?.c || 0 },
    { name: 'room_types', count: (await dbGet<any>('SELECT COUNT(*) as c FROM room_types'))?.c || 0 },
    { name: 'guests', count: (await dbGet<any>('SELECT COUNT(*) as c FROM guests'))?.c || 0 },
    { name: 'reservations', count: (await dbGet<any>('SELECT COUNT(*) as c FROM reservations'))?.c || 0 },
    { name: 'check_ins', count: (await dbGet<any>('SELECT COUNT(*) as c FROM check_ins'))?.c || 0 },
    { name: 'inventory_items', count: (await dbGet<any>('SELECT COUNT(*) as c FROM inventory_items'))?.c || 0 },
    { name: 'inventory_transactions', count: (await dbGet<any>('SELECT COUNT(*) as c FROM inventory_transactions'))?.c || 0 },
    { name: 'stock_requests', count: (await dbGet<any>('SELECT COUNT(*) as c FROM stock_requests'))?.c || 0 },
    { name: 'menu_items', count: (await dbGet<any>('SELECT COUNT(*) as c FROM menu_items'))?.c || 0 },
    { name: 'menu_categories', count: (await dbGet<any>('SELECT COUNT(*) as c FROM menu_categories'))?.c || 0 },
    { name: 'menu_item_ingredients', count: (await dbGet<any>('SELECT COUNT(*) as c FROM menu_item_ingredients'))?.c || 0 },
    { name: 'orders', count: (await dbGet<any>('SELECT COUNT(*) as c FROM orders'))?.c || 0 },
    { name: 'order_items', count: (await dbGet<any>('SELECT COUNT(*) as c FROM order_items'))?.c || 0 },
    { name: 'invoices', count: (await dbGet<any>('SELECT COUNT(*) as c FROM invoices'))?.c || 0 },
    { name: 'payments', count: (await dbGet<any>('SELECT COUNT(*) as c FROM payments'))?.c || 0 },
    { name: 'expenses', count: (await dbGet<any>('SELECT COUNT(*) as c FROM expenses'))?.c || 0 },
    { name: 'staff_shifts', count: (await dbGet<any>('SELECT COUNT(*) as c FROM staff_shifts'))?.c || 0 },
    { name: 'attendance', count: (await dbGet<any>('SELECT COUNT(*) as c FROM attendance'))?.c || 0 },
    { name: 'maintenance_requests', count: (await dbGet<any>('SELECT COUNT(*) as c FROM maintenance_requests'))?.c || 0 },
    { name: 'audit_logs', count: (await dbGet<any>('SELECT COUNT(*) as c FROM audit_logs'))?.c || 0 },
  ];

  return res.json({
    engine: 'Relational MySQL / SQLite Storage Engine with ACID Transactions',
    tables,
    schemaSql,
  });
});
