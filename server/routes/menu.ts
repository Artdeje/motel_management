import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/database';
import { authMiddleware, logAudit, requireRoles, createNotification } from '../middleware/auth';
import { getStockLabel } from './inventory';

export const menuRouter = Router();

// Selling price for an auto-published drink = purchase cost x markup, rounded up
// to the nearest 100 (RWF prices are whole numbers). Managers can edit any price
// afterwards through normal menu CRUD — this only sets the opening price.
const DRINK_MARKUP = Number(process.env.DRINK_MENU_MARKUP) || 2;

/**
 * Selling price from purchase cost.
 * `markupPercent` is the margin added on top of cost — 100 means "sell at
 * double cost". Falls back to the DRINK_MENU_MARKUP multiplier when the caller
 * does not specify one, which keeps the automatic sync behaving as before.
 */
function drinkSellingPrice(unitCost: number, markupPercent?: number): number {
  const cost = Number(unitCost) || 0;
  const base = Number.isFinite(markupPercent as number)
    ? cost * (1 + (markupPercent as number) / 100)
    : cost * DRINK_MARKUP;
  return Math.max(100, Math.ceil(base / 100) * 100);
}

/**
 * Publish every Drink-labelled inventory item to the 'Drinks & Bar' menu.
 *
 * Idempotent: matches on lower-cased name, so an item already on the menu is
 * left completely alone (price edits and manual changes survive). Each created
 * menu item is linked to its inventory item as a 1-unit ingredient, so bar
 * stock drives menu availability automatically.
 *
 * Returns counts rather than throwing — the menu must still load if this fails.
 */
export async function syncDrinksToMenu(opts?: { markupPercent?: number; repriceExisting?: boolean }): Promise<{ created: number; skipped: number; repriced?: number; error?: string }> {
  try {
    let barCat = await dbGet<any>("SELECT id FROM menu_categories WHERE name = 'Drinks & Bar'");
    if (!barCat?.id) {
      await dbRun('INSERT INTO menu_categories (id, name, display_order, icon) VALUES (?, ?, ?, ?)', ['mcat-drinks', 'Drinks & Bar', 4, 'Wine']);
      barCat = { id: 'mcat-drinks' };
    }

    const stock = await dbAll<any>(
      `SELECT i.id, i.name, i.unit, i.unit_cost, i.department, ic.name as category_name
       FROM inventory_items i
       JOIN inventory_categories ic ON i.category_id = ic.id
       WHERE i.is_active = 1`
    );
    const drinks = stock.filter((s) => getStockLabel(s.category_name, s.department) === 'Drink');
    if (drinks.length === 0) return { created: 0, skipped: 0 };

    // Compare against ALL menu items (including is_active=0) so a drink the
    // manager deliberately deleted is not silently resurrected on next load.
    // Both lookups are loaded up front: this runs on every menu load, so the
    // loop below must not issue a query per drink.
    const existing = await dbAll<any>('SELECT id, name FROM menu_items');
    const taken = new Set(existing.map((m) => String(m.name || '').trim().toLowerCase()));
    const existingIds = new Set(existing.map((m) => String(m.id)));
    const linkedIds = new Set(
      (await dbAll<any>('SELECT DISTINCT menu_item_id FROM menu_item_ingredients')).map((r) => String(r.menu_item_id))
    );

    let created = 0, skipped = 0, repriced = 0;
    for (const d of drinks) {
      const id = `menu-drink-${d.id}`;

      // Check our own id BEFORE the name check: an already-published drink must
      // still get its stock link repaired, and the name check would skip past it.
      if (existingIds.has(id)) {
        // An explicit import with a chosen rate reprices what is already on the
        // menu; the automatic background sync never touches existing prices.
        if (opts?.repriceExisting && Number.isFinite(opts?.markupPercent as number)) {
          await dbRun('UPDATE menu_items SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
            drinkSellingPrice(d.unit_cost, opts!.markupPercent), id,
          ]);
          repriced++;
        }
        // Without the link the item falls back to a flat 50 servings and stops
        // tracking real bar stock.
        if (!linkedIds.has(id)) {
          await dbRun(
            'INSERT INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity_required, unit) VALUES (?, ?, ?, ?, ?)',
            [`rec-drink-${d.id}`, id, d.id, 1, d.unit || 'units']
          );
          linkedIds.add(id);
        }
        skipped++;
        continue;
      }

      // A manually-created menu item already owns this name — leave it alone.
      const key = String(d.name || '').trim().toLowerCase();
      if (!key || taken.has(key)) { skipped++; continue; }

      // Both rows or neither: a menu item without its ingredient link would
      // report a default 50 servings and ignore real bar stock.
      await dbTransaction(async () => {
        await dbRun(
          `INSERT INTO menu_items (id, name, category_id, description, price, preparation_duration, is_active, is_available)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
          [id, d.name, barCat.id, `Bar stock item — served by the ${d.unit || 'unit'}`, drinkSellingPrice(d.unit_cost, opts?.markupPercent), 2]
        );
        // Link 1 stock unit per serving so availability tracks live bar stock.
        await dbRun(
          'INSERT INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity_required, unit) VALUES (?, ?, ?, ?, ?)',
          [`rec-drink-${d.id}`, id, d.id, 1, d.unit || 'units']
        );
      });
      taken.add(key);
      created++;
    }
    if (created > 0) console.log(`[Menu] Published ${created} drink(s) from inventory to Drinks & Bar`);
    return { created, skipped, repriced };
  } catch (e: any) {
    console.error('[Menu] Drink sync failed:', e?.message || e);
    return { created: 0, skipped: 0, error: e?.message || String(e) };
  }
}

// GET /api/menu/items - List menu items with live ingredient stock & computed available servings
// Menu is INDEPENDENT from inventory: items can exist without any linked stock.
// When ingredients are linked, live stock is pulled from inventory (LEFT JOIN so orphaned stock doesn't break menu).
// Only active items are returned so deleted items (is_active=0) disappear from UI – full CRUD verified.
menuRouter.get('/menu/items', authMiddleware, async (req: Request, res: Response) => {
  // Publish any Drink stock that is not on the menu yet. Idempotent and
  // non-throwing: once everything is synced this is just two SELECTs.
  await syncDrinksToMenu();

  const items = await dbAll<any>(
    `SELECT m.*, mc.name as category_name, mc.icon as category_icon,
            u.full_name as deactivated_by_name
     FROM menu_items m
     JOIN menu_categories mc ON m.category_id = mc.id
     LEFT JOIN users u ON m.deactivated_by = u.id
     WHERE m.is_active = 1
     ORDER BY mc.display_order ASC, m.name ASC`
  );

  const enriched = await Promise.all(items.map(async (item) => {
    const ingredients = await dbAll<any>(
      `SELECT mii.*, i.name as inventory_name, i.sku, i.unit as inventory_unit,
              i.current_quantity, i.reserved_quantity,
              (i.current_quantity - i.reserved_quantity) as available_stock
       FROM menu_item_ingredients mii
       LEFT JOIN inventory_items i ON mii.inventory_item_id = i.id
       WHERE mii.menu_item_id = ?`,
      [item.id]
    );

    let maxServings = 9999;
    let missingIngredients: string[] = [];

    if (ingredients.length === 0) {
      maxServings = 50; // default for non-ingredient item
    } else {
      for (const ing of ingredients) {
        const avail = Math.max(0, ing.available_stock);
        const reqQty = ing.quantity_required;
        const possible = Math.floor(avail / reqQty);
        if (possible < maxServings) {
          maxServings = possible;
        }
        if (possible <= 0) {
          missingIngredients.push(`${ing.inventory_name} (Stock: ${avail} ${ing.inventory_unit})`);
        }
      }
    }

    if (maxServings === 9999) maxServings = 0;

    // Automatic availability: if ingredients 0, item cannot be prepared
    const autoAvailable = maxServings > 0;
    const isReadyForOrdering = item.is_active === 1 && item.is_available === 1 && autoAvailable;

    let displayReason = item.deactivation_reason;
    if (!displayReason && !autoAvailable) {
      displayReason = `Out of stock: ${missingIngredients.join(', ')}`;
    }

    return {
      ...item,
      ingredients,
      available_servings: maxServings,
      can_order: isReadyForOrdering,
      missing_ingredients: missingIngredients,
      effective_reason: displayReason,
      stock_status: maxServings === 0 ? 'OUT OF STOCK' : maxServings <= 3 ? 'LOW STOCK' : 'AVAILABLE',
    };
  }));

  const categories = await dbAll<any>('SELECT * FROM menu_categories ORDER BY display_order ASC');
  return res.json({ items: enriched, categories });
});

// PUT /api/menu/items/:id/availability - Chef or Manager toggles item availability (Rule 6 & 7)
menuRouter.put('/menu/items/:id/availability', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  const { is_available, deactivation_reason } = req.body;
  const item = await dbGet<any>('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!item) {
    return res.status(404).json({ error: 'Menu item not found' });
  }

  const isAvail = is_available ? 1 : 0;
  const reason = isAvail === 0 ? (deactivation_reason || 'Temporarily unavailable per Kitchen Chef') : null;

  await dbRun(
    `UPDATE menu_items SET is_available = ?, deactivation_reason = ?, deactivated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [isAvail, reason, isAvail === 0 ? req.user?.id : null, req.params.id]
  );

  const actionText = isAvail === 1 ? 'Reactivated' : 'Deactivated';
  logAudit(
    req.user,
    'Menu',
    'Availability Change',
    req.params.id,
    `${actionText} menu item "${item.name}" (Reason: ${reason || 'In Stock'})`
  );

  if (isAvail === 0) {
    createNotification(
      'menu_unavailable',
      `Menu Item Unavailable: ${item.name}`,
      `Kitchen Chef marked "${item.name}" as unavailable. Reason: ${reason}`,
      'all',
      null,
      '/menu'
    );
  }

  return res.json({
    message: `Menu item "${item.name}" is now ${isAvail === 1 ? 'Available' : 'Unavailable'}`,
    is_available: isAvail,
    deactivation_reason: reason,
  });
});

// POST /api/menu/items - Create menu item (Chef / Manager / Admin)
menuRouter.post('/menu/items', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  const { name, category_id, description, price, preparation_duration, ingredients } = req.body;
  if (!name || !category_id || price === undefined) {
    return res.status(400).json({ error: 'Name, category and price are required' });
  }

  // Chef restriction: cannot create bar items
  if (req.user?.role === 'chef') {
    const cat = await dbGet<any>('SELECT name FROM menu_categories WHERE id = ?', [category_id]);
    if (cat?.name === 'Drinks & Bar') {
      return res.status(403).json({ error: 'Chef cannot create items in the Drinks & Bar category' });
    }
  }

  const id = `menu-${Date.now()}`;

  await dbTransaction(async () => {
    await dbRun(
      `INSERT INTO menu_items (id, name, category_id, description, price, preparation_duration, is_active, is_available)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
      [id, name, category_id, description || null, parseFloat(price), parseInt(preparation_duration || 15, 10)]
    );

    // Ingredients are OPTIONAL – menu is independent. Only link those that reference existing inventory.
    if (ingredients && Array.isArray(ingredients)) {
      for (const ing of ingredients) {
        if (!ing.inventory_item_id) continue;
        const invExists = await dbGet<any>('SELECT id FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
        if (!invExists) continue; // skip orphaned reference, keep menu independent
        const miiId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await dbRun(
          `INSERT INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity_required, unit)
           VALUES (?, ?, ?, ?, ?)`,
          [miiId, id, ing.inventory_item_id, parseFloat(ing.quantity_required || 1), ing.unit || 'units']
        );
      }
    }
  });

  logAudit(req.user, 'Menu', 'Created', id, `Created menu item "${name}" (${process.env.CURRENCY_SYMBOL || 'FRw'}${price})`);
  return res.status(201).json({ message: 'Menu item created successfully', id });
});

// PUT /api/menu/items/:id - Edit menu item (Chef / Manager / Admin)
menuRouter.put('/menu/items/:id', authMiddleware, requireRoles(['admin', 'manager', 'chef']), async (req: Request, res: Response) => {
  const { name, category_id, description, price, preparation_duration, is_active, ingredients } = req.body;
  const item = await dbGet<any>('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!item) {
    return res.status(404).json({ error: 'Menu item not found' });
  }

  // Chef restriction: cannot move items into or edit within Drinks & Bar
  if (req.user?.role === 'chef' && category_id) {
    const cat = await dbGet<any>('SELECT name FROM menu_categories WHERE id = ?', [category_id]);
    if (cat?.name === 'Drinks & Bar') {
      return res.status(403).json({ error: 'Chef cannot edit items into the Drinks & Bar category' });
    }
  }

  await dbTransaction(async () => {
    await dbRun(
      `UPDATE menu_items SET name = ?, category_id = ?, description = ?, price = ?, preparation_duration = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, category_id, description || null, parseFloat(price), parseInt(preparation_duration || 15, 10), is_active ? 1 : 0, req.params.id]
    );

    // Ingredients are optional – preserve menu independence. Only update if array is provided.
    if (ingredients && Array.isArray(ingredients)) {
      await dbRun('DELETE FROM menu_item_ingredients WHERE menu_item_id = ?', [req.params.id]);
      for (const ing of ingredients) {
        if (!ing.inventory_item_id) continue;
        const invExists = await dbGet<any>('SELECT id FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
        if (!invExists) continue;
        const miiId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await dbRun(
          `INSERT INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity_required, unit)
           VALUES (?, ?, ?, ?, ?)`,
          [miiId, req.params.id, ing.inventory_item_id, parseFloat(ing.quantity_required || 1), ing.unit || 'units']
        );
      }
    }
  });

  logAudit(req.user, 'Menu', 'Updated', req.params.id, `Updated menu item "${name}" price to ${process.env.CURRENCY_SYMBOL || 'FRw'}${price}`);
  return res.json({ message: 'Menu item updated successfully' });
});

// DELETE /api/menu/items/:id - Drop menu item (soft-delete, Manager / Admin only)
menuRouter.delete('/menu/items/:id', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const item = await dbGet<any>('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!item) {
    return res.status(404).json({ error: 'Menu item not found' });
  }

  await dbTransaction(async () => {
    await dbRun('UPDATE menu_items SET is_active = 0, is_available = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM menu_item_ingredients WHERE menu_item_id = ?', [req.params.id]);
  });

  logAudit(req.user, 'Menu', 'Deleted', req.params.id, `Dropped menu item "${item.name}" from the menu`);
  return res.json({ message: `Menu item "${item.name}" removed from the menu` });
});

// GET /api/menu/categories
// POST /api/menu/sync-drinks - Manually publish all Drink stock to Drinks & Bar.
// Runs automatically on every menu load; this endpoint is for an explicit
// "sync now" action and reports what it did.
menuRouter.post('/menu/sync-drinks', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { markup_percent, reprice_existing } = req.body || {};

  let markupPercent: number | undefined;
  if (markup_percent !== undefined && markup_percent !== null && markup_percent !== '') {
    markupPercent = parseFloat(markup_percent);
    if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000) {
      return res.status(400).json({ error: 'Markup must be a number between 0 and 1000 percent' });
    }
  }

  const result = await syncDrinksToMenu({ markupPercent, repriceExisting: !!reprice_existing });
  if (result.error) return res.status(500).json({ error: result.error });

  const rateNote = markupPercent === undefined ? 'default rate' : `${markupPercent}% markup`;
  await logAudit(
    req.user!, 'Menu', 'Import drinks from stock', null,
    `Published ${result.created}, repriced ${result.repriced || 0} at ${rateNote}`, req.ip
  );
  return res.json({
    message: `Imported ${result.created} new drink(s)${result.repriced ? `, repriced ${result.repriced}` : ''} at ${rateNote}`,
    ...result,
  });
});

menuRouter.get('/menu/categories', authMiddleware, async (req: Request, res: Response) => {
  const categories = await dbAll<any>('SELECT * FROM menu_categories ORDER BY display_order ASC');
  return res.json({ categories });
});

// POST /api/menu/categories
menuRouter.post('/menu/categories', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  const { name, icon, display_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  const id = `mcat-${Date.now()}`;
  await dbRun('INSERT INTO menu_categories (id, name, icon, display_order) VALUES (?, ?, ?, ?)', [
    id, name, icon || 'Utensils', parseInt(display_order || 0, 10)
  ]);
  return res.status(201).json({ message: 'Category created', id });
});
