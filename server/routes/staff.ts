import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles, createNotification } from '../middleware/auth';

export const staffRouter = Router();

// GET /api/staff/employees - List all staff
staffRouter.get('/staff/employees', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const employees = await dbAll<any>(
    `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_active,
            r.id as role_id, r.name as role, r.display_name as role_display_name
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.is_active = 1
     ORDER BY r.name ASC, u.full_name ASC`
  );
  return res.json({ employees });
});

// GET /api/staff/shifts - List shifts (weekly/monthly)
staffRouter.get('/staff/shifts', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { start_date, end_date, user_id, department } = req.query;
  let query = `
    SELECT s.*, u.full_name as user_name, u.username, r.name as role, r.display_name as role_name
    FROM staff_shifts s
    JOIN users u ON s.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (start_date && end_date) {
    query += ' AND s.shift_date BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }
  if (user_id) {
    query += ' AND s.user_id = ?';
    params.push(user_id);
  }
  if (department) {
    query += ' AND s.department = ?';
    params.push(department);
  }

  query += ' ORDER BY s.shift_date ASC, s.start_time ASC';
  const shifts = await dbAll<any>(query, params);
  return res.json({ shifts });
});

// POST /api/staff/shifts - Create shift with overlap check (Rule 16)
staffRouter.post('/staff/shifts', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { user_id, shift_date, start_time, end_time, shift_type, department, notes } = req.body;
  if (!user_id || !shift_date || !start_time || !end_time || !department) {
    return res.status(400).json({ error: 'Employee, date, start time, end time and department are required' });
  }

  // Prevent overlapping shifts for same staff member on the same date
  const overlap = await dbGet<any>(
    `SELECT id FROM staff_shifts 
     WHERE user_id = ? AND shift_date = ? 
       AND NOT (end_time <= ? OR start_time >= ?)`,
    [user_id, shift_date, start_time, end_time]
  );

  if (overlap) {
    return res.status(400).json({ error: 'Employee already has an overlapping shift assigned on this date and time.' });
  }

  const id = `sh-${Date.now()}`;
  await dbRun(
    `INSERT INTO staff_shifts (id, user_id, shift_date, start_time, end_time, shift_type, department, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, user_id, shift_date, start_time, end_time, shift_type || 'Morning', department, notes || null, req.user?.id]
  );

  const emp = await dbGet<any>('SELECT full_name FROM users WHERE id = ?', [user_id]);
  logAudit(req.user, 'Staff', 'Shift Assigned', id, `Assigned ${shift_type} shift on ${shift_date} to ${emp?.full_name}`);
  return res.status(201).json({ message: 'Shift created successfully', id });
});

// DELETE /api/staff/shifts/:id
staffRouter.delete('/staff/shifts/:id', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const shift = await dbGet<any>('SELECT * FROM staff_shifts WHERE id = ?', [req.params.id]);
  if (!shift) {
    return res.status(404).json({ error: 'Shift not found' });
  }

  await dbRun('DELETE FROM staff_shifts WHERE id = ?', [req.params.id]);
  logAudit(req.user, 'Staff', 'Shift Deleted', req.params.id, `Removed shift for ${shift.shift_date}`);
  return res.json({ message: 'Shift deleted successfully' });
});

// GET /api/staff/shift-swaps - List shift swap requests
staffRouter.get('/staff/shift-swaps', authMiddleware, async (req: Request, res: Response) => {
  const swaps = await dbAll<any>(
    `SELECT ssr.*, 
            req_u.full_name as requester_name, tgt_u.full_name as target_name,
            s1.shift_date as req_shift_date, s1.start_time as req_shift_start, s1.end_time as req_shift_end, s1.department as req_dept,
            s2.shift_date as tgt_shift_date, s2.start_time as tgt_shift_start, s2.end_time as tgt_shift_end
     FROM shift_swap_requests ssr
     JOIN users req_u ON ssr.requesting_user_id = req_u.id
     JOIN users tgt_u ON ssr.target_user_id = tgt_u.id
     JOIN staff_shifts s1 ON ssr.shift_id = s1.id
     LEFT JOIN staff_shifts s2 ON ssr.target_shift_id = s2.id
     ORDER BY ssr.created_at DESC`
  );
  return res.json({ swaps });
});

// POST /api/staff/shift-swaps - Request shift swap (Staff A)
staffRouter.post('/staff/shift-swaps', authMiddleware, async (req: Request, res: Response) => {
  const { target_user_id, shift_id, target_shift_id, reason } = req.body;
  if (!target_user_id || !shift_id || !reason) {
    return res.status(400).json({ error: 'Target staff member, shift and reason are required' });
  }

  const shift = await dbGet<any>('SELECT * FROM staff_shifts WHERE id = ?', [shift_id]);
  if (!shift) {
    return res.status(404).json({ error: 'Shift not found' });
  }

  const id = `ssr-${Date.now()}`;
  await dbRun(
    `INSERT INTO shift_swap_requests (id, requesting_user_id, target_user_id, shift_id, target_shift_id, reason, target_status, manager_status)
     VALUES (?, ?, ?, ?, ?, ?, 'Pending', 'Pending')`,
    [id, req.user?.id, target_user_id, shift_id, target_shift_id || null, reason]
  );

  createNotification(
    'request',
    'Shift Swap Request',
    `${req.user?.full_name} requested to swap a shift with you.`,
    'all',
    target_user_id,
    '/staff'
  );

  logAudit(req.user, 'Staff', 'Shift Swap Requested', id, `Requested shift swap with user ID ${target_user_id}`);
  return res.status(201).json({ message: 'Shift swap request submitted' });
});

// PUT /api/staff/shift-swaps/:id/target-respond - Staff B accepts or declines
staffRouter.put('/staff/shift-swaps/:id/target-respond', authMiddleware, async (req: Request, res: Response) => {
  const { action } = req.body; // 'Accepted' or 'Declined'
  if (!['Accepted', 'Declined'].includes(action)) {
    return res.status(400).json({ error: 'Action must be Accepted or Declined' });
  }

  const swap = await dbGet<any>('SELECT * FROM shift_swap_requests WHERE id = ?', [req.params.id]);
  if (!swap) return res.status(404).json({ error: 'Swap request not found' });

  if (swap.target_user_id !== req.user?.id && req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Only the requested staff member or manager can respond.' });
  }

  await dbRun('UPDATE shift_swap_requests SET target_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [action, req.params.id]);

  createNotification(
    'request',
    `Shift Swap ${action}`,
    `${req.user?.full_name} has ${action.toLowerCase()} the shift swap request. Waiting for Manager approval.`,
    'manager',
    null,
    '/staff'
  );

  return res.json({ message: `Shift swap ${action.toLowerCase()}` });
});

// PUT /api/staff/shift-swaps/:id/manager-review - Manager approves/rejects (Swaps schedule on Approval)
staffRouter.put('/staff/shift-swaps/:id/manager-review', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { action } = req.body; // 'Approved' or 'Rejected'
  if (!['Approved', 'Rejected'].includes(action)) {
    return res.status(400).json({ error: 'Action must be Approved or Rejected' });
  }

  const swap = await dbGet<any>('SELECT * FROM shift_swap_requests WHERE id = ?', [req.params.id]);
  if (!swap) return res.status(404).json({ error: 'Swap request not found' });

  await dbTransaction(async () => {
    await dbRun(
      'UPDATE shift_swap_requests SET manager_status = ?, approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [action, req.user?.id, req.params.id]
    );

    if (action === 'Approved') {
      // Re-assign shift 1 to target user
      await dbRun('UPDATE staff_shifts SET user_id = ? WHERE id = ?', [swap.target_user_id, swap.shift_id]);
      // If there was a target shift, reassign it to requesting user
      if (swap.target_shift_id) {
        await dbRun('UPDATE staff_shifts SET user_id = ? WHERE id = ?', [swap.requesting_user_id, swap.target_shift_id]);
      }
    }

    createNotification(
      'request',
      `Shift Swap ${action} by Manager`,
      `Shift swap between staff members was ${action.toLowerCase()}. Schedules updated.`,
      'all',
      swap.requesting_user_id,
      '/staff'
    );
  });

  logAudit(req.user, 'Staff', `Shift Swap ${action}`, req.params.id, `Manager ${action.toLowerCase()} shift swap`);
  return res.json({ message: `Shift swap ${action.toLowerCase()} and schedule updated` });
});

// GET /api/staff/attendance - List attendance records
staffRouter.get('/staff/attendance', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { date, user_id } = req.query;
  let query = `
    SELECT a.*, u.full_name as user_name, u.username, r.display_name as role_name
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (date) {
    query += ' AND a.date = ?';
    params.push(date);
  }
  if (user_id) {
    query += ' AND a.user_id = ?';
    params.push(user_id);
  }
  query += ' ORDER BY a.clock_in DESC';

  const attendance = await dbAll<any>(query, params);
  return res.json({ attendance });
});

// POST /api/staff/attendance/clock-in
staffRouter.post('/staff/attendance/clock-in', authMiddleware, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  const existing = await dbGet<any>('SELECT * FROM attendance WHERE user_id = ? AND date = ? AND clock_out IS NULL', [req.user?.id, today]);
  if (existing) {
    return res.status(400).json({ error: 'You are already clocked in for today.' });
  }

  const id = `att-${Date.now()}`;
  await dbRun(
    `INSERT INTO attendance (id, user_id, date, clock_in, status)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'Present')`,
    [id, req.user?.id, today]
  );

  logAudit(req.user, 'Staff', 'Clock-In', id, `${req.user?.full_name} clocked in at ${new Date().toLocaleTimeString()}`);
  return res.status(201).json({ message: 'Clocked in successfully', id });
});

// POST /api/staff/attendance/clock-out
staffRouter.post('/staff/attendance/clock-out', authMiddleware, async (req: Request, res: Response) => {
  const { break_duration_minutes, notes } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const activeRecord = await dbGet<any>(
    'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
    [req.user?.id, today]
  );

  if (!activeRecord) {
    return res.status(400).json({ error: 'No active clock-in session found for today.' });
  }

  const clockInTime = new Date(activeRecord.clock_in);
  const clockOutTime = new Date();
  const breakMin = parseInt(break_duration_minutes || 0, 10);
  const diffHours = Math.max(0, (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60) - breakMin / 60);

  await dbRun(
    `UPDATE attendance SET clock_out = CURRENT_TIMESTAMP, break_duration_minutes = ?, total_hours = ?, notes = COALESCE(?, notes) WHERE id = ?`,
    [breakMin, parseFloat(diffHours.toFixed(2)), notes || null, activeRecord.id]
  );

  logAudit(req.user, 'Staff', 'Clock-Out', activeRecord.id, `${req.user?.full_name} clocked out (${diffHours.toFixed(1)} hrs)`);
  return res.json({ message: 'Clocked out successfully', total_hours: diffHours.toFixed(2) });
});
