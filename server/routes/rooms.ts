import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles, createNotification } from '../middleware/auth';

export const roomsRouter = Router();

// GET /api/rooms - List all rooms with type details and current occupant
roomsRouter.get('/rooms', authMiddleware, async (req: Request, res: Response) => {
  const rooms = await dbAll<any>(
    `SELECT r.*, rt.name as room_type_name, rt.code as room_type_code, rt.capacity, rt.amenities,
            g.full_name as occupant_name, g.phone as occupant_phone, g.guest_code as occupant_code
     FROM rooms r
     JOIN room_types rt ON r.room_type_id = rt.id
     LEFT JOIN guests g ON r.current_occupant_id = g.id
     ORDER BY r.room_number ASC`
  );
  const roomTypes = await dbAll<any>('SELECT * FROM room_types ORDER BY base_price ASC');
  return res.json({ rooms, roomTypes });
});

// POST /api/room-types - Add room category (Manager/Admin)
roomsRouter.post('/room-types', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { name, code, base_price, capacity, description, amenities } = req.body;
  if (!name || !code || base_price === undefined) {
    return res.status(400).json({ error: 'Name, code and base price are required' });
  }

  const existing = await dbGet<any>('SELECT id FROM room_types WHERE name = ?', [name]);
  if (existing) {
    return res.status(400).json({ error: `Room category "${name}" already exists` });
  }

  const id = `rt-${Date.now()}`;
  await dbRun(
    'INSERT INTO room_types (id, name, code, base_price, capacity, description, amenities) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, code, parseFloat(base_price), parseInt(capacity || 2, 10), description || null, amenities || null]
  );

  await logAudit(req.user, 'Rooms', 'Room Type Created', id, `Added room category "${name}" (${code})`);
  return res.status(201).json({ message: 'Room category added successfully', id });
});

// PUT /api/room-types/:id - Edit room category
roomsRouter.put('/room-types/:id', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { name, code, base_price, capacity, description, amenities } = req.body;
  const roomType = await dbGet<any>('SELECT * FROM room_types WHERE id = ?', [req.params.id]);
  if (!roomType) {
    return res.status(404).json({ error: 'Room category not found' });
  }

  await dbRun(
    'UPDATE room_types SET name = ?, code = ?, base_price = ?, capacity = ?, description = ?, amenities = ? WHERE id = ?',
    [name, code, parseFloat(base_price), parseInt(capacity || roomType.capacity, 10), description || null, amenities || null, req.params.id]
  );

  await logAudit(req.user, 'Rooms', 'Room Type Updated', req.params.id, `Updated room category "${name}"`);
  return res.json({ message: 'Room category updated successfully' });
});

// DELETE /api/room-types/:id - Drop room category (Manager/Admin)
roomsRouter.delete('/room-types/:id', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const roomType = await dbGet<any>('SELECT * FROM room_types WHERE id = ?', [req.params.id]);
  if (!roomType) {
    return res.status(404).json({ error: 'Room category not found' });
  }

  const roomsWithType = await dbGet<any>('SELECT COUNT(*) as count FROM rooms WHERE room_type_id = ?', [req.params.id]);
  if (roomsWithType && roomsWithType.count > 0) {
    return res.status(400).json({ error: `Cannot drop room category "${roomType.name}" - it has ${roomsWithType.count} room(s) assigned.` });
  }

  await dbRun('DELETE FROM room_types WHERE id = ?', [req.params.id]);
  await logAudit(req.user, 'Rooms', 'Room Type Deleted', req.params.id, `Dropped room category "${roomType.name}"`);
  return res.json({ message: 'Room category dropped successfully' });
});

// POST /api/rooms - Add room (Manager/Admin)
roomsRouter.post('/rooms', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { room_number, floor, room_type_id, price_per_night, notes } = req.body;
  if (!room_number || !floor || !room_type_id || !price_per_night) {
    return res.status(400).json({ error: 'Room number, floor, room type and price are required' });
  }

  const existing = await dbGet<any>('SELECT id FROM rooms WHERE room_number = ?', [room_number]);
  if (existing) {
    return res.status(400).json({ error: `Room number ${room_number} already exists` });
  }

  const id = `rm-${Date.now()}`;
  await dbRun(
    'INSERT INTO rooms (id, room_number, floor, room_type_id, status, price_per_night, notes) VALUES (?, ?, ?, ?, "Available", ?, ?)',
    [id, room_number, parseInt(floor, 10), room_type_id, parseFloat(price_per_night), notes || null]
  );

  await logAudit(req.user, 'Rooms', 'Created', id, `Added Room ${room_number}`);
  return res.status(201).json({ message: 'Room added successfully', id });
});

// PUT /api/rooms/:id - Edit room details
roomsRouter.put('/rooms/:id', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { room_number, floor, room_type_id, price_per_night, notes, status } = req.body;
  const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  await dbRun(
    'UPDATE rooms SET room_number = ?, floor = ?, room_type_id = ?, price_per_night = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [room_number, parseInt(floor, 10), room_type_id, parseFloat(price_per_night), notes || null, status || room.status, req.params.id]
  );

  await logAudit(req.user, 'Rooms', 'Updated', req.params.id, `Updated Room ${room_number} properties`);
  return res.json({ message: 'Room updated successfully' });
});

// PUT /api/rooms/:id/status - Update room status directly
roomsRouter.put('/rooms/:id/status', authMiddleware, async (req: Request, res: Response) => {
  const { status, notes } = req.body;
  const validStatuses = ['Available', 'Reserved', 'Occupied', 'Dirty', 'Cleaning', 'Clean', 'Maintenance', 'Out of Service'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid room status' });
  }

  const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Housekeeper constraints: can only transition Dirty -> Cleaning, Cleaning -> Clean
  if (req.user?.role === 'housekeeper') {
    if (!['Dirty', 'Cleaning', 'Clean'].includes(status)) {
      return res.status(403).json({ error: 'Housekeepers can only change status between Dirty, Cleaning, and Clean' });
    }
  }

  await dbRun(
    `UPDATE rooms SET status = ?, last_cleaned_at = ${status === 'Clean' ? 'CURRENT_TIMESTAMP' : 'last_cleaned_at'}, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, notes || null, req.params.id]
  );

  await logAudit(req.user, 'Rooms', 'Status Change', req.params.id, `Changed Room ${room.room_number} status from ${room.status} to ${status}`);
  return res.json({ message: `Room status updated to ${status}` });
});

// GET /api/reservations - List reservations with filter
roomsRouter.get('/reservations', authMiddleware, async (req: Request, res: Response) => {
  const reservations = await dbAll<any>(
    `SELECT res.*, g.full_name as guest_name, g.phone as guest_phone, g.email as guest_email,
            r.room_number, rt.name as room_type_name
     FROM reservations res
     JOIN guests g ON res.guest_id = g.id
     JOIN rooms r ON res.room_id = r.id
     JOIN room_types rt ON r.room_type_id = rt.id
     ORDER BY res.check_in_date DESC`
  );
  return res.json({ reservations });
});

// POST /api/reservations - Create new reservation with overlap check
roomsRouter.post('/reservations', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { guest_id, room_id, check_in_date, check_out_date, num_guests, total_amount, deposit_amount, special_requests, guest_name, guest_phone, guest_email } = req.body;

  // Resolve guest_id: accept existing guest_id, or auto-create from guest_name + guest_phone
  let resolvedGuestId = guest_id;
  if (!resolvedGuestId) {
    if (!guest_name || !guest_phone) {
      return res.status(400).json({ error: 'Guest, room, check-in date and check-out date are required' });
    }
    const newGuestId = `gst-${Date.now()}`;
    const guestCode = `GST-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    await dbRun(
      `INSERT INTO guests (id, guest_code, full_name, phone, email, nationality, created_by)
       VALUES (?, ?, ?, ?, ?, 'Rwandan', ?)`,
      [newGuestId, guestCode, guest_name, guest_phone, guest_email || null, req.user?.id]
    );
    resolvedGuestId = newGuestId;
  }

  if (!room_id || !check_in_date || !check_out_date) {
    return res.status(400).json({ error: 'Room, check-in date and check-out date are required' });
  }

  if (new Date(check_in_date) >= new Date(check_out_date)) {
    return res.status(400).json({ error: 'Check-out date must be strictly after check-in date' });
  }

  // Prevent overlapping reservations for the same room
  const overlap = await dbGet<any>(
    `SELECT id, reservation_number FROM reservations 
     WHERE room_id = ? 
       AND status IN ('Confirmed', 'CheckedIn')
       AND NOT (check_out_date <= ? OR check_in_date >= ?)`,
    [room_id, check_in_date, check_out_date]
  );

  if (overlap) {
    return res.status(400).json({
      error: `Room is already reserved during these dates (Reservation #${overlap.reservation_number})`
    });
  }

  const id = `res-${Date.now()}`;
  const resNumber = `RES-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await dbRun(
    `INSERT INTO reservations (id, reservation_number, guest_id, room_id, check_in_date, check_out_date, num_guests, total_amount, deposit_amount, status, special_requests, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?, ?)`,
    [id, resNumber, resolvedGuestId, room_id, check_in_date, check_out_date, num_guests || 1, total_amount || 0, deposit_amount || 0, special_requests || null, req.user?.id]
  );

  // If check-in is today, mark room as Reserved
  const todayStr = new Date().toISOString().split('T')[0];
  if (check_in_date === todayStr) {
    await dbRun('UPDATE rooms SET status = "Reserved" WHERE id = ? AND status = "Available"', [room_id]);
  }

  await logAudit(req.user, 'Reservations', 'Created', id, `Created reservation ${resNumber}`);
  await createNotification('check_in', 'New Reservation Created', `Reservation ${resNumber} created for ${check_in_date}`, 'manager', null, '/reservations');

  return res.status(201).json({ message: 'Reservation created successfully', id, reservation_number: resNumber });
});

// POST /api/reservations/:id/cancel
roomsRouter.post('/reservations/:id/cancel', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const resRecord = await dbGet<any>('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
  if (!resRecord) {
    return res.status(404).json({ error: 'Reservation not found' });
  }

  await dbRun('UPDATE reservations SET status = "Cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  await dbRun('UPDATE rooms SET status = "Available" WHERE id = ? AND status = "Reserved"', [resRecord.room_id]);

  await logAudit(req.user, 'Reservations', 'Cancelled', req.params.id, `Cancelled reservation ${resRecord.reservation_number}`);
  return res.json({ message: 'Reservation cancelled successfully' });
});

// Shared check-in transaction used by the manual endpoint and the auto check-in job.
export async function performCheckIn(opts: {
  reservation_id?: string | null;
  guest_id: string;
  room_id: string;
  expected_check_out_date: string;
  deposit_paid?: number;
  payment_method?: string;
  notes?: string | null;
  checked_in_by?: string;
  nightBaseDate?: string;
}): Promise<{ check_in_number: string; invoice_number: string }> {
  const {
    reservation_id = null,
    guest_id,
    room_id,
    expected_check_out_date,
    deposit_paid = 0,
    payment_method = 'Cash',
    notes = null,
    checked_in_by,
    nightBaseDate,
  } = opts;

  const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [room_id]);
  if (!room) {
    throw new Error('Room not found');
  }
  if (room.status !== 'Available') {
    throw new Error(`Cannot check in. Room must be Available (current status: ${room.status})`);
  }

  const checkedBy = checked_in_by || 'usr-admin';
  const rnd = Math.random().toString(36).substr(2, 4);
  const checkInId = `chk-${Date.now()}-${rnd}`;
  const checkInNumber = `CHK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const invoiceId = `inv-${Date.now()}-${rnd}`;
  const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Calculate nights from the nightBaseDate (today for manual, reservation check-in date for auto)
  const base = nightBaseDate ? new Date(nightBaseDate) : new Date();
  const checkout = new Date(expected_check_out_date);
  const diffTime = Math.abs(checkout.getTime() - base.getTime());
  const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  const roomTotal = room.price_per_night * diffDays;
  const deposit = Number(deposit_paid || 0);

  await dbTransaction(async () => {
    // 1. Create Check-In
    await dbRun(
      `INSERT INTO check_ins (id, check_in_number, reservation_id, guest_id, room_id, expected_check_out_date, deposit_paid, payment_method, checked_in_by, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
      [checkInId, checkInNumber, reservation_id, guest_id, room_id, expected_check_out_date, deposit, payment_method, checkedBy, notes]
    );

    // 2. Update Room Status to Occupied & assign occupant
    await dbRun('UPDATE rooms SET status = "Occupied", current_occupant_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [guest_id, room_id]);

    // 3. Update reservation if present
    if (reservation_id) {
      await dbRun('UPDATE reservations SET status = "CheckedIn", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [reservation_id]);
    }

    // 4. Create Initial Invoice for Room charges
    await dbRun(
      `INSERT INTO invoices (id, invoice_number, guest_id, check_in_id, room_id, subtotal, total_amount, amount_paid, balance_due, status, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, invoiceNumber, guest_id, checkInId, room_id, roomTotal, roomTotal, deposit, roomTotal - deposit, deposit >= roomTotal ? 'Paid' : deposit > 0 ? 'Partially Paid' : 'Unpaid', expected_check_out_date]
    );

    // 5. Add invoice item for Room Stay
    const itemId = `iit-${Date.now()}-${rnd}`;
    await dbRun(
      `INSERT INTO invoice_items (id, invoice_id, description, item_type, unit_price, quantity, total_price, reference_id)
       VALUES (?, ?, ?, 'Room', ?, ?, ?, ?)`,
      [itemId, invoiceId, `Room ${room.room_number} Accommodation (${diffDays} Night${diffDays > 1 ? 's' : ''})`, room.price_per_night, diffDays, roomTotal, room_id]
    );

    // 6. Record Deposit Payment if > 0
    if (deposit > 0) {
      const payId = `pay-${Date.now()}-${rnd}`;
      const recNumber = `RCT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await dbRun(
        `INSERT INTO payments (id, receipt_number, invoice_id, guest_id, amount, payment_method, payment_category, received_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, 'Deposit', ?, 'Check-in deposit payment')`,
        [payId, recNumber, invoiceId, guest_id, deposit, payment_method, checkedBy]
      );
    }
  });

  return { check_in_number: checkInNumber, invoice_number: invoiceNumber };
}

// Auto check-in: any 'Confirmed' reservation whose check-in date has arrived (or passed)
// is automatically checked in at the scheduled check-in time.
export async function runAutoCheckIns(): Promise<number> {
  const dueReservations = await dbAll<any>(
    `SELECT r.*, g.full_name as guest_name
     FROM reservations r
     JOIN guests g ON r.guest_id = g.id
     WHERE r.status = 'Confirmed'
       AND r.check_in_date <= CURDATE()
       AND NOT EXISTS (SELECT 1 FROM check_ins ci WHERE ci.reservation_id = r.id)`
  );

  let processed = 0;
  for (const res of dueReservations) {
    const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [res.room_id]);
    if (!room || room.status !== 'Available') {
      continue;
    }

    try {
      await performCheckIn({
        reservation_id: res.id,
        guest_id: res.guest_id,
        room_id: res.room_id,
        expected_check_out_date: res.check_out_date,
        deposit_paid: res.deposit_amount,
        payment_method: 'Cash',
        notes: 'Automatic check-in at scheduled check-in date',
        checked_in_by: res.created_by || 'usr-admin',
        nightBaseDate: res.check_in_date,
      });

      await logAudit(
        { id: res.created_by || 'system', username: 'system', role: 'system' },
        'Reservations',
        'Auto Check-In',
        res.id,
        `Auto checked-in reservation ${res.reservation_number} (Guest: ${res.guest_name}) at scheduled check-in date`
      );
      await createNotification(
        'check_in',
        `Auto Check-In: ${res.guest_name}`,
        `Reservation ${res.reservation_number} was automatically checked in for its scheduled check-in date.`,
        'manager',
        null,
        '/reservations'
      );
      processed += 1;
    } catch (err: any) {
      console.error(`Auto check-in failed for reservation ${res.reservation_number}:`, err.message);
    }
  }

  if (processed > 0) {
    console.log(`Auto check-in job: ${processed} reservation(s) checked in automatically.`);
  }
  return processed;
}

// POST /api/check-in - Check guest into room
roomsRouter.post('/check-in', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { reservation_id, guest_id, room_id, expected_check_out_date, deposit_paid, payment_method, notes } = req.body;

  if (!guest_id || !room_id || !expected_check_out_date) {
    return res.status(400).json({ error: 'Guest, room and expected checkout date are required' });
  }

  try {
    const result = await performCheckIn({
      reservation_id: reservation_id || null,
      guest_id,
      room_id,
      expected_check_out_date,
      deposit_paid,
      payment_method,
      notes,
      checked_in_by: req.user?.id,
    });

    const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [room_id]);
    await logAudit(req.user, 'Rooms', 'Check-In', room_id, `Checked in guest to Room ${room?.room_number} (Check-in #${result.check_in_number})`);
    return res.status(201).json({ message: 'Guest checked in successfully', check_in_number: result.check_in_number, invoice_number: result.invoice_number });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/check-out - Complete check-out, compile all charges, set room to Dirty
roomsRouter.post('/check-out', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { room_id, payment_amount, payment_method, notes } = req.body;
  if (!room_id) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  const room = await dbGet<any>('SELECT * FROM rooms WHERE id = ?', [room_id]);
  if (!room || room.status !== 'Occupied') {
    return res.status(400).json({ error: 'Room is not currently occupied' });
  }

  const checkIn = await dbGet<any>('SELECT * FROM check_ins WHERE room_id = ? AND status = "Active" ORDER BY check_in_time DESC LIMIT 1', [room_id]);
  const guest = room.current_occupant_id ? await dbGet<any>('SELECT * FROM guests WHERE id = ?', [room.current_occupant_id]) : null;

  // Find linked invoice and room service orders charged to room
  const invoice = checkIn ? await dbGet<any>('SELECT * FROM invoices WHERE check_in_id = ?', [checkIn.id]) : null;
  const roomServiceOrders = await dbAll<any>(
    'SELECT * FROM orders WHERE room_id = ? AND payment_status = "ChargedToRoom" AND status != "Cancelled"',
    [room_id]
  );

  let ordersTotal = 0;
  for (const ord of roomServiceOrders) {
    ordersTotal += ord.total_amount;
  }

  const finalPayment = parseFloat(payment_amount || 0);

  await dbTransaction(async () => {
    // 1. If there are room service orders charged to room, append them to invoice
    if (invoice && roomServiceOrders.length > 0) {
      for (const ord of roomServiceOrders) {
        const orderItems = await dbAll<any>('SELECT * FROM order_items WHERE order_id = ?', [ord.id]);
        for (const item of orderItems) {
          const iitId = `iit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          await dbRun(
            `INSERT INTO invoice_items (id, invoice_id, description, item_type, unit_price, quantity, total_price, reference_id)
             VALUES (?, ?, ?, 'Food/Drinks', ?, ?, ?, ?)`,
            [iitId, invoice.id, `${item.menu_item_name} (Order #${ord.order_number})`, item.unit_price, item.quantity, item.total_price, ord.id]
          );
        }
        // Mark order payment_status as 'Paid'
        await dbRun('UPDATE orders SET payment_status = "Paid" WHERE id = ?', [ord.id]);
      }

      // Update invoice total
      const newTotal = invoice.total_amount + ordersTotal;
      const newPaid = invoice.amount_paid + finalPayment;
      const newDue = Math.max(0, newTotal - newPaid);
      await dbRun(
        'UPDATE invoices SET subtotal = ?, total_amount = ?, amount_paid = ?, balance_due = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newTotal, newTotal, newPaid, newDue, newDue === 0 ? 'Paid' : 'Partially Paid', invoice.id]
      );
    } else if (invoice && finalPayment > 0) {
      const newPaid = invoice.amount_paid + finalPayment;
      const newDue = Math.max(0, invoice.total_amount - newPaid);
      await dbRun(
        'UPDATE invoices SET amount_paid = ?, balance_due = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPaid, newDue, newDue === 0 ? 'Paid' : 'Partially Paid', invoice.id]
      );
    }

    // 2. Record checkout payment
    if (finalPayment > 0) {
      const payId = `pay-${Date.now()}`;
      const recNumber = `RCT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await dbRun(
        `INSERT INTO payments (id, receipt_number, invoice_id, guest_id, amount, payment_method, payment_category, received_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, 'Room', ?, 'Final check-out payment settlement')`,
        [payId, recNumber, invoice ? invoice.id : null, guest ? guest.id : null, finalPayment, payment_method || 'Cash', req.user?.id]
      );
    }

    // 3. Mark Check-In completed
    if (checkIn) {
      await dbRun('UPDATE check_ins SET status = "Completed", actual_check_out_time = CURRENT_TIMESTAMP WHERE id = ?', [checkIn.id]);
    }

    // 3b. Update Reservation status to CheckedOut
    if (checkIn?.reservation_id) {
      await dbRun('UPDATE reservations SET status = "CheckedOut" WHERE id = ?', [checkIn.reservation_id]);
    }

    // 4. Set Room to DIRTY (Mandatory rule #14) and clear occupant
    await dbRun(
      'UPDATE rooms SET status = "Dirty", current_occupant_id = NULL, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [`Checked out on ${new Date().toLocaleDateString()}. Pending housekeeping turnover.`, room_id]
    );

    // 5. Create notification for Housekeeping
    await createNotification(
      'maintenance',
      `Room ${room.room_number} Requires Cleaning`,
      `Guest checked out of Room ${room.room_number}. Room status set to DIRTY.`,
      'housekeeper',
      null,
      '/housekeeping'
    );
  });

  await logAudit(req.user, 'Rooms', 'Check-Out', room_id, `Checked out Room ${room.room_number}. Room set to DIRTY.`);
  return res.json({ message: `Room ${room.room_number} check-out completed. Room marked as Dirty.` });
});
