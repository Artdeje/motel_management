import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { authMiddleware, logAudit, requireRoles } from '../middleware/auth';

export const guestsRouter = Router();

// GET /api/guests - Search & list guests
guestsRouter.get('/guests', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const query = req.query.q ? String(req.query.q).toLowerCase() : '';
  let guests;
  if (query) {
    guests = await dbAll<any>(
      `SELECT g.*, 
              (SELECT COUNT(*) FROM reservations WHERE guest_id = g.id) as total_stays,
              (SELECT MAX(check_in_time) FROM check_ins WHERE guest_id = g.id) as last_stay_date,
              (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.guest_id = g.id) as total_spent
       FROM guests g
       WHERE LOWER(g.full_name) LIKE ? OR LOWER(g.phone) LIKE ? OR LOWER(g.guest_code) LIKE ? OR LOWER(g.id_number) LIKE ?
       ORDER BY g.created_at DESC`,
      [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
    );
  } else {
    guests = await dbAll<any>(
      `SELECT g.*, 
              (SELECT COUNT(*) FROM reservations WHERE guest_id = g.id) as total_stays,
              (SELECT MAX(check_in_time) FROM check_ins WHERE guest_id = g.id) as last_stay_date,
              (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.guest_id = g.id) as total_spent
       FROM guests g
       ORDER BY g.created_at DESC`
    );
  }
  return res.json({ guests });
});

// POST /api/guests - Create guest
guestsRouter.post('/guests', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { full_name, phone, email, id_type, id_number, nationality, address, notes } = req.body;
  if (!full_name || !phone) {
    return res.status(400).json({ error: 'Guest name and phone number are required' });
  }

  const id = `gst-${Date.now()}`;
  const code = `GST-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await dbRun(
    `INSERT INTO guests (id, guest_code, full_name, phone, email, id_type, id_number, nationality, address, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, code, full_name, phone, email || null, id_type || 'National ID', id_number || null, nationality || 'Rwandan', address || null, notes || null, req.user?.id]
  );

  await logAudit(req.user, 'Guests', 'Created', id, `Registered new guest ${full_name} (${code})`);
  return res.status(201).json({ message: 'Guest registered successfully', id, guest_code: code });
});

// PUT /api/guests/:id - Edit guest
guestsRouter.put('/guests/:id', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { full_name, phone, email, id_type, id_number, nationality, address, notes } = req.body;
  const guest = await dbGet<any>('SELECT * FROM guests WHERE id = ?', [req.params.id]);
  if (!guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  await dbRun(
    `UPDATE guests SET full_name = ?, phone = ?, email = ?, id_type = ?, id_number = ?, nationality = ?, address = ?, notes = ? WHERE id = ?`,
    [
      full_name ?? guest.full_name,
      phone ?? guest.phone,
      email ?? guest.email,
      id_type ?? guest.id_type,
      id_number ?? guest.id_number,
      nationality ?? guest.nationality,
      address ?? guest.address,
      notes ?? guest.notes,
      req.params.id,
    ]
  );

  await logAudit(req.user, 'Guests', 'Updated', req.params.id, `Updated guest profile ${full_name}`);
  return res.json({ message: 'Guest profile updated successfully' });
});

// GET /api/guests/:id/history - Complete guest stay, order and financial history
guestsRouter.get('/guests/:id/history', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const guest = await dbGet<any>('SELECT * FROM guests WHERE id = ?', [req.params.id]);
  if (!guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  const reservations = await dbAll<any>(
    `SELECT res.*, r.room_number, rt.name as room_type_name
     FROM reservations res
     JOIN rooms r ON res.room_id = r.id
     JOIN room_types rt ON r.room_type_id = rt.id
     WHERE res.guest_id = ?
     ORDER BY res.check_in_date DESC`,
    [req.params.id]
  );

  const checkIns = await dbAll<any>(
    `SELECT c.*, r.room_number
     FROM check_ins c
     JOIN rooms r ON c.room_id = r.id
     WHERE c.guest_id = ?
     ORDER BY c.check_in_time DESC`,
    [req.params.id]
  );

  const orders = await dbAll<any>(
    `SELECT * FROM orders WHERE guest_id = ? ORDER BY created_at DESC`,
    [req.params.id]
  );

  const invoices = await dbAll<any>(
    `SELECT * FROM invoices WHERE guest_id = ? ORDER BY created_at DESC`,
    [req.params.id]
  );

  const payments = await dbAll<any>(
    `SELECT * FROM payments WHERE guest_id = ? ORDER BY payment_date DESC`,
    [req.params.id]
  );

  return res.json({ guest, reservations, checkIns, orders, invoices, payments });
});
