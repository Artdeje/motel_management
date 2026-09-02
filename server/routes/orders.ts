import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles, createNotification } from '../middleware/auth';

export const ordersRouter = Router();

/**
 * Put back the stock an order already took off the shelf.
 *
 * Ingredients are consumed the moment an order is raised, so anything that
 * undoes the order — cancelling it, or deleting one that never went out —
 * has to hand the quantity back and leave a ledger row explaining why.
 */
async function returnOrderStock(order: any, orderItems: any[], userId: string | undefined, why: string) {
  for (const item of orderItems) {
    const ingredients = await dbAll<any>(
      'SELECT mii.*, i.unit_cost FROM menu_item_ingredients mii JOIN inventory_items i ON i.id = mii.inventory_item_id WHERE mii.menu_item_id = ?',
      [item.menu_item_id]
    );
    for (const ing of ingredients) {
      const qty = (Number(ing.quantity_required) || 0) * (Number(item.quantity) || 0);
      if (qty <= 0) continue;
      const inv = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
      if (!inv) continue;
      const prev = Number(inv.current_quantity) || 0;
      const next = prev + qty;
      await dbRun('UPDATE inventory_items SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [next, inv.id]);
      const cost = Number(inv.unit_cost) || 0;
      await dbRun(
        `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, total_cost, reference_id, reason, user_id)
         VALUES (?, ?, 'Returned', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`itx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, inv.id, qty, prev, next, cost, qty * cost, order.order_number,
         `${why} for Order #${order.order_number} (${item.menu_item_name} x${item.quantity})`, userId]
      );
    }
  }
}

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
  if (req.user!.role === 'bartender') {
    query += ' AND o.waiter_id = ?';
    params.push(req.user!.id);
  }

  if (status && status !== 'all') {
    query += ' AND o.status = ?';
    params.push(status);
  }
  if (waiter_id && req.user!.role !== 'bartender') {
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
  if (req.user!.role === 'bartender' && order.waiter_id !== req.user!.id) {
    return res.status(403).json({ error: 'Access denied. You can only view your own orders.' });
  }

  const items = await dbAll<any>('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  return res.json({ order, items });
});

// POST /api/orders - Create order with strict transactional stock validation & reservation
ordersRouter.post('/orders', authMiddleware, requireRoles(['admin', 'manager', 'bartender']), async (req: Request, res: Response) => {
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
      // Running demand per stock item for the whole order (see the check below).
      const demandByInventory = new Map<string, { need: number; name: string }>();

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
          'SELECT mii.*, i.name as inv_name, i.is_active as inv_active, i.current_quantity, i.reserved_quantity FROM menu_item_ingredients mii JOIN inventory_items i ON mii.inventory_item_id = i.id WHERE mii.menu_item_id = ?',
          [menuItem.id]
        );

        for (const ing of ingredients) {
          // Selling against a removed stock row would deduct where nobody can
          // see it, so treat that as unsellable rather than silently allowing it.
          if (Number(ing.inv_active) === 0) {
            throw new Error(
              `"${menuItem.name}" cannot be sold: its stock item "${ing.inv_name}" has been removed from inventory. Point the recipe at a live stock item first.`
            );
          }

          const availStock = Number(ing.current_quantity) - Number(ing.reserved_quantity);
          const perServing = Number(ing.quantity_required) || 0;
          const requiredTotal = perServing * quantity;

          // Accumulate demand per stock item across the WHOLE order. Reservations
          // are only written after this loop, so checking each line on its own let
          // two lines that draw on the same stock item each pass while together
          // exceeding it — two servings of the same dish, or two different dishes
          // sharing an ingredient.
          const prior = demandByInventory.get(ing.inventory_item_id)?.need || 0;
          const cumulative = prior + requiredTotal;
          demandByInventory.set(ing.inventory_item_id, { need: cumulative, name: ing.inv_name });

          if (availStock < cumulative) {
            const possibleServings = perServing > 0 ? Math.floor((availStock - prior) / perServing) : 0;
            const alsoNeeded = prior > 0 ? ` (${prior} already needed by other items on this order)` : '';
            throw new Error(
              `Insufficient stock for "${menuItem.name}". Requested ${quantity} serving(s), but only ${Math.max(0, possibleServings)} can be made from the remaining ${ing.inv_name} stock (${availStock} available${alsoNeeded}).`
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

      // 2. Take the ingredients off the shelf now. The kitchen pulls stock when
      // the ticket is raised, not when it is later marked complete, so the
      // on-hand figure has to drop immediately. Cancelling or deleting the
      // order hands it back (see returnOrderStock).
      for (const resv of inventoryReservations) {
        const inv = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [resv.invId]);
        if (!inv) continue;
        const prev = Number(inv.current_quantity) || 0;
        const next = Math.max(0, prev - resv.qty);
        await dbRun('UPDATE inventory_items SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [next, resv.invId]);
        const cost = Number(inv.unit_cost) || 0;
        await dbRun(
          `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, total_cost, reference_id, reason, user_id)
           VALUES (?, ?, 'Consumed', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [`itx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, resv.invId, resv.qty, prev, next, cost, resv.qty * cost, orderNumber,
           `Consumed on order placement #${orderNumber} (${resv.invName})`, req.user?.id]
        );
      }

      // 3. Create Order
      await dbRun(
        `INSERT INTO orders (id, order_number, order_type, table_number, room_id, guest_id, waiter_id, status, payment_status, subtotal, discount, total_amount, notes, stock_reserved, stock_consumed)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, 0, 1)`,
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
        `Order with ${orderItemsToInsert.length} item(s) placed by bartender ${req.user?.full_name}.`,
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
ordersRouter.put('/orders/:id', authMiddleware, requireRoles(['admin', 'manager', 'bartender']), async (req: Request, res: Response) => {
  const order = await dbGet<any>('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Ownership check: waiters can only edit their own orders
  if (req.user!.role === 'bartender' && order.waiter_id !== req.user!.id) {
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
      // 1. Hand back everything the previous version of this order consumed,
      // then take the new contents below. Editing is only allowed before the
      // kitchen starts, so nothing has actually been cooked yet.
      const oldItems = await dbAll<any>('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
      if (order.stock_consumed === 1) {
        await returnOrderStock(order, oldItems, req.user?.id, 'Returned while editing');
      }
      // 2. Validate all new items and check available stock
      let newSubtotal = 0;
      const newOrderItemsToInsert: any[] = [];
      const newInventoryReservations: { invId: string; qty: number; invName: string }[] = [];
      // Same cumulative guard as order creation: reservations are written after
      // this loop, so per-line checks alone would let one order oversell a stock
      // item shared by several of its lines.
      const editDemandByInventory = new Map<string, { need: number; name: string }>();

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
          'SELECT mii.*, i.name as inv_name, i.is_active as inv_active, i.current_quantity, i.reserved_quantity FROM menu_item_ingredients mii JOIN inventory_items i ON mii.inventory_item_id = i.id WHERE mii.menu_item_id = ?',
          [menuItem.id]
        );

        for (const ing of ingredients) {
          if (Number(ing.inv_active) === 0) {
            throw new Error(
              `"${menuItem.name}" cannot be sold: its stock item "${ing.inv_name}" has been removed from inventory. Point the recipe at a live stock item first.`
            );
          }

          const availStock = Number(ing.current_quantity) - Number(ing.reserved_quantity);
          const perServing = Number(ing.quantity_required) || 0;
          const requiredTotal = perServing * quantity;

          const prior = editDemandByInventory.get(ing.inventory_item_id)?.need || 0;
          const cumulative = prior + requiredTotal;
          editDemandByInventory.set(ing.inventory_item_id, { need: cumulative, name: ing.inv_name });

          if (availStock < cumulative) {
            const possibleServings = perServing > 0 ? Math.floor((availStock - prior) / perServing) : 0;
            const alsoNeeded = prior > 0 ? ` (${prior} already needed by other items on this order)` : '';
            throw new Error(
              `Insufficient stock for "${menuItem.name}". Requested ${quantity} serving(s), but only ${Math.max(0, possibleServings)} can be made from the remaining ${ing.inv_name} stock (${availStock} available${alsoNeeded}).`
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
        const inv = await dbGet<any>('SELECT * FROM inventory_items WHERE id = ?', [resv.invId]);
        if (inv) {
          const prev = Number(inv.current_quantity) || 0;
          const next = Math.max(0, prev - resv.qty);
          await dbRun('UPDATE inventory_items SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [next, resv.invId]);
          const cost = Number(inv.unit_cost) || 0;
          await dbRun(
            `INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, unit_cost, total_cost, reference_id, reason, user_id)
             VALUES (?, ?, 'Consumed', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [`itx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, resv.invId, resv.qty, prev, next, cost, resv.qty * cost, order.order_number,
             `Consumed on order edit #${order.order_number} (${resv.invName})`, req.user?.id]
          );
        }
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
             stock_reserved = 0, stock_consumed = 1, updated_at = CURRENT_TIMESTAMP
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
ordersRouter.put('/orders/:id/status', authMiddleware, requireRoles(['admin', 'manager', 'chef', 'bartender']), async (req: Request, res: Response) => {
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
  if (req.user!.role === 'bartender' && order.waiter_id !== req.user!.id) {
    return res.status(403).json({ error: 'Access denied. You can only update your own orders.' });
  }

  // Bartenders run their own service end to end — serve, take payment, close —
  // but never the kitchen workflow (Confirmed/Preparing/Ready stay with the chef).
  if (req.user!.role === 'bartender') {
    const bartenderAllowedStatuses = ['Served', 'Completed', 'Cancelled'];
    if (!bartenderAllowedStatuses.includes(status)) {
      return res.status(403).json({ error: 'Bartenders can serve, complete or cancel their own orders. Kitchen preparation steps require chef/manager action.' });
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
    // Cancelling gives the ingredients back, since they were taken when the
    // order was raised. stock_consumed drops to 0 so this can never run twice.
    if (status === 'Cancelled' && order.stock_consumed === 1) {
      await returnOrderStock(order, orderItems, req.user?.id, 'Returned on cancellation');
      await dbRun('UPDATE orders SET stock_consumed = 0, stock_reserved = 0 WHERE id = ?', [order.id]);
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

// DELETE /api/orders - Admin: empty all order history (bulk clear) - optimized
ordersRouter.delete('/orders', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  try {
    // Postgres returns COUNT(*) as a bigint, which the driver hands back as a
    // string — coerce so the reported figure is a real number.
    const countRow = await dbGet<any>('SELECT COUNT(*) as cnt FROM orders');
    const total = Number(countRow?.cnt) || 0;
    await dbTransaction(async () => {
      // Fast release: reset all reserved stock (all pending reservations are cleared with orders)
      await dbRun('UPDATE inventory_items SET reserved_quantity = 0 WHERE reserved_quantity > 0');
      await dbRun('DELETE FROM order_items');
      await dbRun('DELETE FROM payments WHERE order_id IS NOT NULL');
      await dbRun('DELETE FROM orders');
    });
    await logAudit(req.user, 'Orders', 'Bulk Delete', null, `Admin ${req.user?.username} emptied all order history (${total} orders)`, req.ip);
    return res.json({ message: `Order history cleared (${total} orders deleted)` });
  } catch (err:any) {
    console.error('Bulk delete orders error:', err);
    return res.status(500).json({ error: err.message || 'Failed to clear order history' });
  }
});

// DELETE /api/orders/:id - Admin: delete single order history
ordersRouter.delete('/orders/:id', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  const order = await dbGet<any>('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  try {
    await dbTransaction(async () => {
      // Deleting an order that never reached the customer hands the stock back.
      // One already Served or Completed genuinely left the kitchen, so its
      // consumption stands even though the record is being removed.
      const wentOut = ['Served', 'Completed'].includes(order.status);
      if (order.stock_consumed === 1 && !wentOut) {
        const items = await dbAll<any>('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
        await returnOrderStock(order, items, req.user?.id, 'Returned on order deletion');
      }
      await dbRun('DELETE FROM order_items WHERE order_id = ?', [order.id]);
      await dbRun('DELETE FROM payments WHERE order_id = ?', [order.id]);
      await dbRun('DELETE FROM orders WHERE id = ?', [order.id]);
    });
    await logAudit(req.user, 'Orders', 'Deleted', order.id, `Admin ${req.user?.username} deleted order #${order.order_number}`, req.ip);
    return res.json({ message: `Order #${order.order_number} deleted` });
  } catch (err:any) {
    console.error('Delete order error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete order' });
  }
});

// POST /api/orders/:id/pay - Record payment for order directly
ordersRouter.post('/orders/:id/pay', authMiddleware, requireRoles(['admin', 'manager', 'bartender']), async (req: Request, res: Response) => {
  const { payment_method } = req.body;
  const order = await dbGet<any>('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // A bartender settles only the orders they raised.
  if (req.user!.role === 'bartender' && order.waiter_id !== req.user!.id) {
    return res.status(403).json({ error: 'You can only take payment for your own orders' });
  }

  if (order.payment_status === 'Paid') {
    return res.status(400).json({ error: `Order #${order.order_number} is already paid` });
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
