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
              i.current_quantity, i.reserved_quantity, i.is_active as inventory_active,
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

    // A recipe pointing at a removed stock row deducts into something the
    // manager cannot see, so report it rather than letting it look healthy.
    const brokenLinks = ingredients
      .filter((ing) => ing.inventory_name == null || Number(ing.inventory_active) === 0)
      .map((ing) => ing.inventory_item_id);

    return {
      ...item,
      ingredients,
      broken_stock_links: brokenLinks,
      has_broken_stock_link: brokenLinks.length > 0,
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
// POST /api/menu/repair-links - Repoint recipes that reference a removed stock
// row onto the live row carrying the same name.
//
// This is the Menu/Inventory conflict in practice: replacing a stock item
// (delete the old, create a new one with the same name) leaves the recipe
// bound to the dead row, so orders deduct into it and the visible stock never
// moves. Only same-name repointing is automatic; anything ambiguous is
// reported for a human to resolve.
menuRouter.post('/menu/repair-links', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const dryRun = !!req.body?.dry_run;
    const norm = (v: any) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

    const broken = await dbAll<any>(
      `SELECT mii.id as link_id, mii.menu_item_id, mii.inventory_item_id, mii.quantity_required,
              m.name as menu_name, i.name as dead_name
       FROM menu_item_ingredients mii
       JOIN menu_items m ON m.id = mii.menu_item_id AND m.is_active = 1
       LEFT JOIN inventory_items i ON i.id = mii.inventory_item_id
       WHERE i.id IS NULL OR i.is_active = 0`
    );

    if (broken.length === 0) {
      return res.json({ repaired: 0, unresolved: [], message: 'No broken recipe links found' });
    }

    const live = await dbAll<any>('SELECT id, name, unit, current_quantity FROM inventory_items WHERE is_active = 1');
    const liveByName = new Map<string, any>();
    for (const l of live) if (!liveByName.has(norm(l.name))) liveByName.set(norm(l.name), l);

    const plan: any[] = [];
    const unresolved: any[] = [];
    for (const b of broken) {
      const target = b.dead_name ? liveByName.get(norm(b.dead_name)) : null;
      if (target) plan.push({ link_id: b.link_id, menu_item: b.menu_name, from: b.dead_name, to: target.name, to_id: target.id, unit: target.unit, in_stock: Number(target.current_quantity) || 0 });
      else unresolved.push({ menu_item: b.menu_name, missing_stock: b.dead_name || '(deleted row)' });
    }

    if (dryRun) {
      return res.json({ dry_run: true, plan, unresolved, message: `${plan.length} link(s) can be repointed, ${unresolved.length} need a manual recipe` });
    }

    let repaired = 0;
    for (const pl of plan) {
      await dbRun('UPDATE menu_item_ingredients SET inventory_item_id = ?, unit = ? WHERE id = ?', [pl.to_id, pl.unit || 'units', pl.link_id]);
      repaired++;
    }

    await logAudit(req.user!, 'Menu', 'Repair recipe links', null, `Repointed ${repaired} recipe link(s) onto live stock rows`, req.ip);
    return res.json({ repaired, unresolved, message: `Repointed ${repaired} recipe link(s). ${unresolved.length} still need attention.` });
  } catch (e: any) {
    console.error('[Menu] repair-links failed:', e?.message || e);
    return res.status(500).json({ error: e?.message || 'Failed to repair recipe links' });
  }
});

// POST /api/menu/link-stock - Link menu items that have NO recipe to a stock
// item of the same name, so ordering them actually deducts stock.
//
// A menu item without ingredients reports a flat 50 servings and consumes
// nothing on completion — that is why kitchen stock never moved. Recipes are
// business data, so this never guesses quantities beyond 1 unit per serving and
// never invents a match: it only pairs names that are already identical, and
// `dry_run` returns the proposed pairs for a human to approve first.
menuRouter.post('/menu/link-stock', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const dryRun = !!req.body?.dry_run;
    const qtyRaw = req.body?.quantity_required;
    const perServing = qtyRaw === undefined || qtyRaw === null || qtyRaw === '' ? 1 : parseFloat(qtyRaw);
    if (!Number.isFinite(perServing) || perServing <= 0) {
      return res.status(400).json({ error: 'Quantity per serving must be greater than zero' });
    }

    const norm = (v: any) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    // Loose key for near-misses: letters and digits only, so 'Akabenzi roti'
    // and 'Akabenzi iroti' can be offered as a suggestion for approval.
    const loose = (v: any) => norm(v).replace(/[^a-z0-9]/g, '');
    const tokens = (v: any) => new Set(norm(v).split(' ').filter(Boolean));
    const overlap = (a: Set<string>, b: Set<string>) => {
      let hit = 0;
      a.forEach((t) => { if (b.has(t)) hit++; });
      return hit / Math.max(1, Math.min(a.size, b.size));
    };
    // Character-bigram Dice coefficient. Token overlap alone ties 'Akabenzi
    // roti' against both 'Akabenzi iroti' and 'Akabenzi imvange'; comparing
    // letters breaks the tie in favour of the one that is actually spelled
    // almost the same.
    const bigrams = (v: string) => {
      const out = new Map<string, number>();
      for (let i = 0; i < v.length - 1; i++) {
        const g = v.slice(i, i + 2);
        out.set(g, (out.get(g) || 0) + 1);
      }
      return out;
    };
    const dice = (a: string, b: string) => {
      if (!a || !b) return 0;
      if (a === b) return 1;
      const A = bigrams(a), B = bigrams(b);
      let shared = 0, sizeA = 0, sizeB = 0;
      A.forEach((c, g) => { sizeA += c; shared += Math.min(c, B.get(g) || 0); });
      B.forEach((c) => { sizeB += c; });
      return (2 * shared) / Math.max(1, sizeA + sizeB);
    };

    const menuItems = await dbAll<any>(
      `SELECT m.id, m.name, mc.name as category_name
       FROM menu_items m JOIN menu_categories mc ON m.category_id = mc.id
       WHERE m.is_active = 1`
    );
    const linked = new Set(
      (await dbAll<any>('SELECT DISTINCT menu_item_id FROM menu_item_ingredients')).map((r) => String(r.menu_item_id))
    );
    const stock = await dbAll<any>(
      'SELECT id, name, unit, current_quantity FROM inventory_items WHERE is_active = 1'
    );

    // First stock row wins when several share a name; the manager can retarget
    // the link afterwards from the menu item's recipe editor.
    const stockByName = new Map<string, any>();
    const stockByLoose = new Map<string, any>();
    for (const s of stock) {
      if (!stockByName.has(norm(s.name))) stockByName.set(norm(s.name), s);
      if (!stockByLoose.has(loose(s.name))) stockByLoose.set(loose(s.name), s);
    }

    const row = (m: any, hit: any, confidence: string) => ({
      menu_item_id: m.id, menu_item: m.name, category: m.category_name,
      inventory_item_id: hit.id, stock_item: hit.name, unit: hit.unit,
      in_stock: Number(hit.current_quantity) || 0, confidence,
    });

    const unlinked = menuItems.filter((m) => !linked.has(String(m.id)));
    const matches: any[] = [];   // identical names — safe to apply
    const suggested: any[] = []; // near names — shown for approval, never auto-applied
    const unmatched: any[] = [];

    for (const m of unlinked) {
      const exact = stockByName.get(norm(m.name));
      if (exact) { matches.push(row(m, exact, 'exact')); continue; }

      // Same letters ignoring spacing/punctuation, e.g. 'take away' / 'takeaway'
      const looseHit = stockByLoose.get(loose(m.name));
      if (looseHit) { suggested.push(row(m, looseHit, 'same letters')); continue; }

      // One name contains the other, or their words overlap strongly, e.g.
      // menu 'Akabenzi roti' vs stock 'Akabenzi iroti'.
      let best: any = null;
      let bestScore = 0;
      const mt = tokens(m.name);
      for (const st of stock) {
        const sn = norm(st.name);
        const mn = norm(m.name);
        const contains = sn.includes(mn) || mn.includes(sn);
        const spelling = dice(loose(m.name), loose(st.name));
        // Weight spelling highest, then containment, then shared words.
        const score = Math.max(spelling, contains ? 0.9 : 0, overlap(mt, tokens(st.name)) * 0.75);
        if (score > bestScore) { bestScore = score; best = st; }
      }
      if (best && bestScore >= 0.5) suggested.push({ ...row(m, best, 'similar name'), score: Number(bestScore.toFixed(2)) });
      else unmatched.push({ menu_item: m.name, category: m.category_name });
    }

    if (dryRun) {
      return res.json({
        dry_run: true,
        unlinkedCount: unlinked.length,
        matches,
        suggested,
        unmatched,
        message: `${matches.length} exact and ${suggested.length} near match(es) across ${unlinked.length} untracked item(s)`,
      });
    }

    // Near matches are only ever written when the caller ticks them explicitly,
    // and may be narrowed to a chosen subset of menu item ids.
    const wanted: string[] | null = Array.isArray(req.body?.menu_item_ids) ? req.body.menu_item_ids.map(String) : null;
    const toLink = [...matches, ...(req.body?.include_similar ? suggested : [])]
      .filter((mt) => !wanted || wanted.includes(String(mt.menu_item_id)));

    let created = 0;
    for (const mt of toLink) {
      await dbRun(
        'INSERT INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity_required, unit) VALUES (?, ?, ?, ?, ?)',
        [`rec-link-${mt.menu_item_id}`.slice(0, 36), mt.menu_item_id, mt.inventory_item_id, perServing, mt.unit || 'units']
      );
      created++;
    }

    await logAudit(req.user!, 'Menu', 'Link menu items to stock', null, `Linked ${created} menu item(s) at ${perServing} per serving`, req.ip);
    const remaining = unmatched.length + (req.body?.include_similar ? 0 : suggested.length);
    return res.json({
      created,
      unmatched,
      stillUntracked: remaining,
      message: `Linked ${created} menu item(s) at ${perServing} per serving. ${remaining} still need a recipe.`,
    });
  } catch (e: any) {
    console.error('[Menu] link-stock failed:', e?.message || e);
    return res.status(500).json({ error: e?.message || 'Failed to link menu items to stock' });
  }
});

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
