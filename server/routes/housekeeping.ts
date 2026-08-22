import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { authMiddleware, logAudit, requireRoles, createNotification } from '../middleware/auth';

export const housekeepingRouter = Router();

// GET /api/housekeeping/rooms - Housekeeping view of all rooms with priority sorting
housekeepingRouter.get('/housekeeping/rooms', authMiddleware, async (req: Request, res: Response) => {
  const rooms = await dbAll<any>(
    `SELECT r.*, rt.name as room_type_name, g.full_name as occupant_name, g.phone as occupant_phone
     FROM rooms r
     JOIN room_types rt ON r.room_type_id = rt.id
     LEFT JOIN guests g ON r.current_occupant_id = g.id
     ORDER BY 
       CASE r.status
         WHEN 'Dirty' THEN 1
         WHEN 'Cleaning' THEN 2
         WHEN 'Maintenance' THEN 3
         WHEN 'Clean' THEN 4
         WHEN 'Occupied' THEN 5
         WHEN 'Reserved' THEN 6
         WHEN 'Available' THEN 7
         ELSE 8
       END, r.room_number ASC`
  );

  // Supply alerts for housekeeping (cleaning supplies & linen)
  const supplyAlerts = await dbAll<any>(
    `SELECT i.*, ic.name as category_name
     FROM inventory_items i
     JOIN inventory_categories ic ON i.category_id = ic.id
     WHERE ic.name IN ('Cleaning Supplies', 'Linen') AND i.current_quantity <= i.minimum_quantity
     ORDER BY i.current_quantity ASC`
  );

  const myPendingRequests = await dbAll<any>(
    `SELECT * FROM stock_requests WHERE department = 'Housekeeping' ORDER BY created_at DESC LIMIT 10`
  );

  return res.json({ rooms, supplyAlerts, myPendingRequests });
});

// POST /api/housekeeping/start-cleaning/:roomId - Any status -> Cleaning (cleaning can start anytime)
housekeepingRouter.post('/housekeeping/start-cleaning/:roomId', authMiddleware, requireRoles(['admin', 'manager', 'housekeeper']), async (req: Request, res: Response) => {
  const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Cleaning can be started from any room status
  await dbRun(
    'UPDATE rooms SET status = "Cleaning", notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [`Cleaning in progress by ${req.user?.full_name}`, req.params.roomId]
  );

  await logAudit(req.user, 'Housekeeping', 'Started Cleaning', req.params.roomId, `Started cleaning Room ${room.room_number}`);
  return res.json({ message: `Started cleaning Room ${room.room_number}` });
});

// POST /api/housekeeping/complete-cleaning/:roomId - Cleaning -> Clean (Rule 15)
housekeepingRouter.post('/housekeeping/complete-cleaning/:roomId', authMiddleware, requireRoles(['admin', 'manager', 'housekeeper']), async (req: Request, res: Response) => {
  const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  await dbRun(
    'UPDATE rooms SET status = "Clean", last_cleaned_at = CURRENT_TIMESTAMP, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [`Cleaned by ${req.user?.full_name} at ${new Date().toLocaleTimeString()}`, req.params.roomId]
  );

  await createNotification(
    'maintenance',
    `Room ${room.room_number} is CLEAN`,
    `Housekeeper ${req.user?.full_name} completed cleaning Room ${room.room_number}. Ready for inspection.`,
    'manager',
    null,
    '/rooms'
  );

  await logAudit(req.user, 'Housekeeping', 'Completed Cleaning', req.params.roomId, `Completed cleaning Room ${room.room_number}. Room marked as Clean.`);
  return res.json({ message: `Room ${room.room_number} marked as Clean` });
});

// POST /api/housekeeping/mark-available/:roomId - Clean -> Available (Manager)
housekeepingRouter.post('/housekeeping/mark-available/:roomId', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  await dbRun('UPDATE rooms SET status = "Available", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.roomId]);
  await logAudit(req.user, 'Housekeeping', 'Released Room', req.params.roomId, `Released Room ${room.room_number} to Available status`);
  return res.json({ message: `Room ${room.room_number} is now Available for guest check-in` });
});

// GET /api/housekeeping/maintenance - List maintenance tickets
housekeepingRouter.get('/housekeeping/maintenance', authMiddleware, async (req: Request, res: Response) => {
  const tickets = await dbAll<any>(
    `SELECT m.*, r.room_number, u.full_name as reporter_name
     FROM maintenance_requests m
     LEFT JOIN rooms r ON m.room_id = r.id
     JOIN users u ON m.reported_by = u.id
     ORDER BY 
       CASE m.status
         WHEN 'Reported' THEN 1
         WHEN 'In Progress' THEN 2
         WHEN 'Resolved' THEN 3
         ELSE 4
       END, m.created_at DESC`
  );
  return res.json({ tickets });
});

// POST /api/housekeeping/maintenance - Report damage or maintenance problem
housekeepingRouter.post('/housekeeping/maintenance', authMiddleware, async (req: Request, res: Response) => {
  const { room_id, location, issue_type, description, severity, assign_to } = req.body;
  if (!issue_type || !description) {
    return res.status(400).json({ error: 'Issue type and description are required' });
  }

  const id = `mnt-${Date.now()}`;
  const ticketNumber = `MNT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await dbRun(
    `INSERT INTO maintenance_requests (id, ticket_number, room_id, location, issue_type, description, severity, status, reported_by, assigned_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Reported', ?, ?)`,
    [id, ticketNumber, room_id || null, location || null, issue_type, description, severity || 'Medium', req.user?.id, assign_to || null]
  );

  // If room is affected, set room to Maintenance
  if (room_id && (severity === 'High' || severity === 'Critical')) {
    await dbRun('UPDATE rooms SET status = "Maintenance" WHERE id = ?', [room_id]);
  }

  await createNotification(
    'maintenance',
    `Maintenance Ticket #${ticketNumber}`,
    `Issue reported: ${issue_type} - ${description.substring(0, 50)}...`,
    'manager',
    null,
    '/housekeeping'
  );

  await logAudit(req.user, 'Maintenance', 'Created', id, `Logged maintenance ticket ${ticketNumber}`);
  return res.status(201).json({ message: 'Maintenance issue reported', ticket_number: ticketNumber });
});

// PUT /api/housekeeping/maintenance/:id - Update maintenance ticket status
housekeepingRouter.put('/housekeeping/maintenance/:id', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { status, resolution_notes, assigned_to } = req.body;
  const ticket = await dbGet<any>('SELECT * FROM maintenance_requests WHERE id = ?', [req.params.id]);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  const isResolved = status === 'Resolved' || status === 'Closed';
  await dbRun(
    `UPDATE maintenance_requests SET status = ?, resolution_notes = ?, assigned_to = COALESCE(?, assigned_to), resolved_at = ${isResolved ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ?`,
    [status, resolution_notes || null, assigned_to || null, req.params.id]
  );

  if (isResolved && ticket.room_id) {
    // Return room to Clean / Available
    await dbRun('UPDATE rooms SET status = "Clean" WHERE id = ? AND status = "Maintenance"', [ticket.room_id]);
  }

  await logAudit(req.user, 'Maintenance', 'Updated', req.params.id, `Updated ticket ${ticket.ticket_number} to ${status}`);
  return res.json({ message: `Maintenance ticket updated to ${status}` });
});
