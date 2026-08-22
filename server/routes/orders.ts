import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles, createNotification } from '../middleware/auth';

export const ordersRouter = Router();

// GET /api/orders - List all orders with filters
ordersRouter.get('/orders', authMiddleware, async (req: Request, res: Response) => {
  const { status, waiter_id, date, order_type, room_id } = req.query;

  let query = `
    SELECT o.*, u.full_name as waiter_name, u.username as waiter_username,
           r.room_number, g.full_name as guest_name
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN rooms r ON o.room_id = r.id
    LEFT JOIN guests g ON o.guest_id = g.id
    WHERE 1=1
  `;
  const params: any[] = [];

  // Per-user isolation: waiters only see their own orders
  if (req.user!.role === 'waiter') {
    query += ' AND o.waiter_id = ?';
    params.push(req.user!.id);
  }

  if (status && status !== 'all') {
    query += ' AND o.status = ?';
    params.push(status);
  }
  if (waiter_id && req.user!.role !== 'waiter') {
    query += ' AND o.waiter_id = ?';
    params.push(waiter_id);
  }
  if (order_type) {
    query += ' AND o.order_type = ?';
    params.push(order_type);
  }
  if (date) {
    query += ' AND DATE(o.created_at) = ?';
    params.push(date);
  }
  if (room_id) {
    query += ' AND o.room_id = ?';
    params.push(room_id);
  }

  query += ' ORDER BY o.created_at DESC';

  const orders = await dbAll<any>(query, params);

  const enriched = await Promise.all(orders.map(async (ord) => {
    const items = await dbAll<any>(
      `SELECT oi.*, m.category_id, mc.name as category_name
       FROM order_items oi
       JOIN menu_items m ON oi.menu_item_id = m.id
       JOIN menu_categories mc ON m.category_id = mc.id
       WHERE oi.order_id = ?`,
      [ord.id]
    );
    return { ...ord, items };
  }));

  return res.json({ orders: enriched });
});

// GET /api/orders/:id
ordersRouter.get('/orders/:id', authMiddleware, async (req: Request, res: Response) => {
  const order = await dbGet<any>(
    `SELECT o.*, u.full_name as waiter_name, r.room_number, g.full_name as guest_name
     FROM orders o
     JOIN users u ON o.waiter_id = u.id
     LEFT JOIN rooms r ON o.room_id = r.id
     LEFT JOIN guests g ON o.guest_id = g.id
     WHERE o.id = ?`,
    [req.params.id]
  );

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Waiters can only view their own orders (IDOR protection)
  if (req.user!.role === 'waiter' && order.waiter_id !== req.user!.id) {
    return res.status(403).json({ error: 'Access denied. You can only view your own orders.' });
  }

  const items = await dbAll<any>('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  return res.json({ order, items });
});

// POST /api/orders - Create order with strict transactional stock validation & reservation
ordersRouter.post('/orders', authMiddleware, requireRoles(['admin', 'manager', 'waiter']), async (req: Request, res: Response) => {
  const { order_type, table_number, room_id, guest_id, items, payment_status, notes, discount } = req.body;

  if (!order_type || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order type and at least one item are required' });
  }

  if (order_type === 'Table' && !table_number) {
    return res.status(400).json({ error: 'Table number is required for Table orders' });
  }

  if (order_type === 'Room Service' && !room_id) {
    return res.status(400).json({ error: 'Room selection is required for Room Service orders' });
  }

  const orderId = `ord-${Date.now()}`;
  const orderNumber = `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    const result = await dbTransaction(async () => {
      let subtotal = 0;
      const orderItemsToInsert: any[] = [];
      const inventoryReservations: { invId: string; qty: number; invName: string }[] = [];

      // 1. Validate every menu item & its ingredients stock
      for (const cartItem of items) {
        const menuItem = await dbGet<any>('SELECT * FROM menu_items WHERE id = ?', [cartItem.menu_item_id]);
        if (!menuItem) {
          throw new Error(`Menu item not found (${cartItem.menu_item_id})`);
        }

        if (menuItem.is_active !== 1 || menuItem.is_available !== 1) {
          throw new Error(`"${menuItem.name}" is currently unavailable (${menuItem.deactivation_reason || 'Out of stock'})`);
        }

        const quantity = parseInt(cartItem.quantity, 10);
        if (isNaN(quantity) || quantity <= 0) {
          throw new Error(`Invalid quantity for ${menuItem.name}`);
        }

        const ingredients = await dbAll<any>(
          'SELECT mii.*, i.name as inv_name, i.current_quantity, i.reserved_quantity FROM menu_item_ingredients mii JOIN inventory_items i ON mii.inventory_item_id = i.id WHERE mii.menu_item_id = ?',
          [menuItem.id]
        );

        for (const ing of ingredients) {
          const availStock = ing.current_quantity - ing.reserved_quantity;
          const requiredTotal = ing.quantity_required * quantity;

          if (availStock < requiredTotal) {
            const possibleServings = Math.floor(availStock / ing.quantity_required);
            throw new Error(
              `Insufficient stock for "${menuItem.name}". Requested ${quantity} serving(s), but only ${Math.max(0, possibleServings)} available due to limited ${ing.inv_name} stock (${availStock} remaining).`
            );
          }

          inventoryReservations.push({
            invId: ing.inventory_item_id,
            qty: requiredTotal,
            invName: ing.inv_name,
          });
        }

        const itemTotal = menuItem.price * quantity;
        subtotal += itemTotal;

        orderItemsToInsert.push({
          id: `oit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          order_id: orderId,
          menu_item_id: menuItem.id,
          menu_item_name: menuItem.name,
          unit_price: menuItem.price, // Lock historical price snapshot
          quantity,
          total_price: itemTotal,
          special_notes: cartItem.special_notes || null,
        });
      }

      const disc = parseFloat(discount || 0);
      const totalAmount = Math.max(0, subtotal - disc);

      // 2. Reserve inventory
      for (const resv of inventoryReservations) {
        await dbRun('UPDATE inventory_items SET reserved_quantity = reserved_quantity + ? WHERE id = ?', [
          resv.qty,
          resv.invId,
        ]);
      }

      // 3. Create Order
      await dbRun(
        `INSERT INTO orders (id, order_number, order_type, table_number, room_id, guest_id, waiter_id, status, payment_status, subtotal, discount, total_amount, notes, stock_reserved, stock_consumed)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, 1, 0)`,
        [
          orderId,
          orderNumber,
          order_type,
          table_number || null,
          room_id || null,
          guest_id || null,
          req.user?.id,
          payment_status || 'Unpaid',
          subtotal,
          disc,
          totalAmount,
          notes || null,
        ]
      );

      // 4. Insert order items
      for (const oi of orderItemsToInsert) {
        await dbRun(
          `INSERT INTO order_items (id, order_id, menu_item_id, menu_item_name, unit_price, quantity, total_price, special_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [oi.id, oi.order_id, oi.menu_item_id, oi.menu_item_name, oi.unit_price, oi.quantity, oi.total_price, oi.special_notes]
        );
      }

      // 5. Notify Kitchen Chef
      createNotification(
        'new_order',
        `New Order #${orderNumber} (${order_type})`,
        `Order with ${orderItemsToInsert.length} item(s) placed by Waiter ${req.user?.full_name}.`,
        'chef',
        null,
        '/kitchen'
      );

      return { orderId, orderNumber, totalAmount };
    });

    logAudit(req.user, 'Orders', 'Created', result.orderId, `Placed order #${result.orderNumber} for ${process.env.CURRENCY_SYMBOL || 'FRw'}${result.totalAmount.toFixed(2)}`);
    return res.status(201).json({
      message: 'Order created and stock successfully reserved',
      order_id: result.orderId,
      order_number: result.orderNumber,
      total_amount: result.totalAmount,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to place order due to stock unavailability.' });
  }
});

// PUT /api/orders/:id - Edit order items and details before cooking starts
ordersRouter.put('/orders/:id', authMiddleware, requireRoles(['admin', 'manager', 'waiter']), async (req: Request, res: Response) => {
  const order = await dbGet<any>('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Ownership check: waiters can only edit their own orders
  if (req.user!.role === 'waiter' && order.waiter_id !== req.user!.id) {
    return res.status(403).json({ error: 'You can only edit your own orders' });
  }

  // Strict check: Orders can ONLY be edited before cooking starts ('Pending' or 'Confirmed')
  if (!['Pending', 'Confirmed'].includes(order.status)) {
    return res.status(400).json({
      error: `Order #${order.order_number} cannot be edited because kitchen preparation has already started (Current status: ${order.status}). Orders can only be modified before cooking begins.`
    });
  }

  const { order_type, table_number, room_id, guest_id, items, discount, notes, payment_status } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one menu item is required in the order.' });
  }

  const targetOrderType = order_type || order.order_type;
  if (targetOrderType === 'Table' && !table_number && !order.table_number) {
    return res.status(400).json({ error: 'Table number is required for Table orders.' });
  }

  if (targetOrderType === 'Room Service' && !room_id && !order.room_id) {
    return res.status(400).json({ error: 'Room selection is required for Room Service orders.' });
  }

  try {
    const updatedResult = await dbTransaction(async () => {
      // 1. First, release previously reserved stock for this order's items
      const oldItems = await dbAll<any>('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
      if (order.stock_reserved === 1 && order.stock_consumed === 0) {
        for (const oldItem of oldItems) {
          const oldIngredients = await dbAll<any>(
            'SELECT * FROM menu_item_ingredients WHERE menu_item_id = ?',
            [oldItem.menu_item_id]
          );
          for (const ing of oldIngredients) {
            const reservedQty = ing.quantity_required * oldItem.quantity;
            await dbRun(
              'UPDATE inventory_items SET reserved_quantity = GREATEST(0, reserved_quantity - ?) WHERE id = ?',
              [reservedQty, ing.inventory_item_id]
            );
          }
        }
      }

      // 2. Validate all new items and check available stock
      let newSubtotal = 0;
      const newOrderItemsToInsert: any[] = [];
      const newInventoryReservations: { invId: string; qty: number; invName: string }[] = [];

      for (const cartItem of items) {
        const menuItem = await dbGet<any>('SELECT * FROM menu_items WHERE id = ?', [cartItem.menu_item_id]);
        if (!menuItem) {
          throw new Error(`Menu item not found (${cartItem.menu_item_id})`);
        }

        if (menuItem.is_active !== 1 || menuItem.is_available !== 1) {
          throw new Error(`"${menuItem.name}" is currently unavailable (${menuItem.deactivation_reason || 'Out of stock'})`);
        }

        const quantity = parseInt(cartItem.quantity, 10);
        if (isNaN(quantity) || quantity <= 0) {
          throw new Error(`Invalid quantity for ${menuItem.name}`);
        }

        const ingredients = await dbAll<any>(
          'SELECT mii.*, i.name as inv_name, i.current_quantity, i.reserved_quantity FROM menu_item_ingredients mii JOIN inventory_items i ON mii.inventory_item_id = i.id WHERE mii.menu_item_id = ?',
          [menuItem.id]
        );

        for (const ing of ingredients) {
          const availStock = ing.current_quantity - ing.reserved_quantity;
          const requiredTotal = ing.quantity_required * quantity;

          if (availStock < requiredTotal) {
            const possibleServings = Math.floor(availStock / ing.quantity_required);
            throw new Error(
              `Insufficient stock for "${menuItem.name}". Requested ${quantity} serving(s), but only ${Math.max(0, possibleServings)} available due to limited ${ing.inv_name} stock (${availStock} remaining).`
            );
          }

          newInventoryReservations.push({
            invId: ing.inventory_item_id,
            qty: requiredTotal,
            invName: ing.inv_name,
          });
        }

        const itemTotal = menuItem.price * quantity;
        newSubtotal += itemTotal;

        newOrderItemsToInsert.push({
          id: `oit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          order_id: order.id,
          menu_item_id: menuItem.id,
          menu_item_name: menuItem.name,
          unit_price: menuItem.price,
          quantity,
          total_price: itemTotal,
          special_notes: cartItem.special_notes || null,
        });
      }

      const disc = discount !== undefined ? parseFloat(discount || 0) : order.discount;
      const totalAmount = Math.max(0, newSubtotal - disc);

      // 3. Apply new inventory reservations
      for (const resv of newInventoryReservations) {
        await dbRun('UPDATE inventory_items SET reserved_quantity = reserved_quantity + ? WHERE id = ?', [
          resv.qty,
          resv.invId,
        ]);
      }

      // 4. Replace order items
      await dbRun('DELETE FROM order_items WHERE order_id = ?', [order.id]);
      for (const oi of newOrderItemsToInsert) {
        await dbRun(
          `INSERT INTO order_items (id, order_id, menu_item_id, menu_item_name, unit_price, quantity, total_price, special_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [oi.id, oi.order_id, oi.menu_item_id, oi.menu_item_name, oi.unit_price, oi.quantity, oi.total_price, oi.special_notes]
        );
      }

      // 5. Update the order header
      const finalTableNumber = targetOrderType === 'Table' ? (table_number !== undefined ? table_number : order.table_number) : null;
      const finalRoomId = targetOrderType === 'Room Service' ? (room_id !== undefined ? room_id : order.room_id) : null;
      const finalGuestId = guest_id !== undefined ? guest_id : order.guest_id;
      const finalNotes = notes !== undefined ? notes : order.notes;
      const finalPaymentStatus = payment_status !== undefined ? payment_status : order.payment_status;

      await dbRun(
        `UPDATE orders
         SET order_type = ?, table_number = ?, room_id = ?, guest_id = ?,
             subtotal = ?, discount = ?, total_amount = ?, notes = ?, payment_status = ?,
             stock_reserved = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          targetOrderType,
          finalTableNumber,
          finalRoomId,
          finalGuestId,
          newSubtotal,
          disc,
          totalAmount,
          finalNotes,
          finalPaymentStatus,
          order.id,
        ]
      );

      // 6. Notify Kitchen Chef
      createNotification(
        'order_status',
        `Order #${order.order_number} Modified`,
        `Order #${order.order_number} items & details updated before cooking by ${req.user?.full_name} (New total: $${totalAmount.toFixed(2)}).`,
        'chef',
        null,
        '/kitchen'
      );

      return {
        orderId: order.id,
        orderNumber: order.order_number,
        subtotal: newSubtotal,
        discount: disc,
        totalAmount,
        itemCount: newOrderItemsToInsert.length,
      };
    });

    logAudit(
      req.user,
      'Orders',
      'Updated',
      order.id,
      `Modified order #${order.order_number} before cooking started (New total: $${updatedResult.totalAmount.toFixed(2)}, ${updatedResult.itemCount} items)`
    );

    return res.json({
      message: 'Order updated successfully and stock reservations refreshed.',
      order: updatedResult,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to update order.' });
  }
});

// PUT /api/orders/:id/status - Update order status (with automatic stock consumption / release)
ordersRouter.put('/orders/:id/status', authMiddleware, requireRoles(['admin', 'manager', 'chef', 'waiter']), async (req: Request, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status' });
  }

  const order = await dbGet<any>('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Waiters can only update their own orders
  if (req.user!.role === 'waiter' && order.waiter_id !== req.user!.id) {
    return res.status(403).json({ error: 'Access denied. You can only update your own orders.' });
  }

  // Waiters can only transition to specific statuses (not arbitrary workflow jumps)
  if (req.user!.role === 'waiter') {
    const waiterAllowedStatuses = ['Cancelled'];
    if (!waiterAllowedStatuses.includes(status)) {
      return res.status(403).json({ error: 'Waiters can only cancel orders. Other status changes require manager/chef action.' });
    }
  }

  if (order.status === status) {
    return res.json({ message: 'Order is already in this status' });
  }

  const orderItems = await dbAll<any>('SELECT * FROM order_items WHERE order_id = ?', [order.id]);

  await dbTransaction(async () => {
    // 1. If transitioning to COMPLETED and stock was reserved: consume stock permanently
    if (status === 'Completed' && order.stock_consumed !== 1) {
      for (const item of orderItems) {
        const ingredients = await dbAll<any>(
          'SELECT mii.*, i.unit_cost, i.name as inv_name FROM menu_item_ingredients mii JOIN inventory_items i ON mii.inventory_item_id = i.id WHERE mii.menu_item_id = ?',
          [item.menu_item_id]
        );

        for (const ing of ingredients) {
          const usedQty = ing.quantity_required * item.quantity;
          const invItem = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
          if (invItem) {
            const newCurQty = Math.max(0, invItem.current_quantity - usedQty);
            const newResQty = Math.max(0, invItem.reserved_quantity - usedQty);

            await dbRun(
              'UPDATE inventory_items SET current_quantity = ?, reserved_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [newCurQty, newResQty, invItem.id]
            );

            // Log stock transaction
            const txId = `itx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            await dbRun(
              `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, total_cost, reference_id, reason, user_id)
               VALUES (?, ?, 'Consumed', ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                txId,
                invItem.id,
                usedQty,
                invItem.current_quantity,
                newCurQty,
                invItem.unit_cost,
                usedQty * invItem.unit_cost,
                order.order_number,
                `Consumed for Order #${order.order_number} (${item.menu_item_name} x${item.quantity})`,
                req.user?.id,
              ]
            );

            // Log kitchen usage for food costing
            const kUsageId = `ku-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            await dbRun(
              `INSERT INTO kitchen_usage (id, inventory_item_id, quantity, unit, used_for, recorded_by)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [kUsageId, invItem.id, usedQty, ing.unit, `Order #${order.order_number}`, req.user?.id]
            );
          }
        }
      }

      await dbRun('UPDATE orders SET stock_consumed = 1, stock_reserved = 0 WHERE id = ?', [order.id]);
    }

    // 2. If CANCELLED and stock was reserved: release reserved stock
    if (status === 'Cancelled' && order.stock_reserved === 1 && order.stock_consumed === 0) {
      for (const item of orderItems) {
        const ingredients = await dbAll<any>(
          'SELECT mii.* FROM menu_item_ingredients mii WHERE mii.menu_item_id = ?',
          [item.menu_item_id]
        );
        for (const ing of ingredients) {
          const reservedQty = ing.quantity_required * item.quantity;
          await dbRun(
            'UPDATE inventory_items SET reserved_quantity = GREATEST(0, reserved_quantity - ?) WHERE id = ?',
            [reservedQty, ing.inventory_item_id]
          );
        }
      }
      await dbRun('UPDATE orders SET stock_reserved = 0 WHERE id = ?', [order.id]);
    }

    // 3. Update order status
    await dbRun('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, order.id]);

    createNotification(
      'order_status',
      `Order #${order.order_number} is ${status}`,
      `Order status updated to ${status}.`,
      'all',
      order.waiter_id,
      '/orders'
    );
  });

  logAudit(req.user, 'Orders', 'Status Update', order.id, `Updated order #${order.order_number} status to ${status}`);
  return res.json({ message: `Order status updated to ${status}` });
});

// POST /api/orders/:id/pay - Record payment for order directly
ordersRouter.post('/orders/:id/pay', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { payment_method } = req.body;
  const order = await dbGet<any>('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const payId = `pay-${Date.now()}`;
  const recNumber = `RCT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await dbTransaction(async () => {
    await dbRun('UPDATE orders SET payment_status = "Paid", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [order.id]);

    await dbRun(
      `INSERT INTO payments (id, receipt_number, order_id, guest_id, amount, payment_method, payment_category, received_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'Food/Drinks', ?, 'Direct restaurant/bar order payment')`,
      [payId, recNumber, order.id, order.guest_id, order.total_amount, payment_method || 'Cash', req.user?.id]
    );
  });

  logAudit(req.user, 'Finance', 'Payment Received', payId, `Received $${order.total_amount} payment for order #${order.order_number} via ${payment_method || 'Cash'}`);
  return res.json({ message: 'Payment recorded successfully', receipt_number: recNumber });
});
