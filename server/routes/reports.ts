import { Router, Request, Response } from 'express';
import { dbAll, dbGet } from '../db/database';
import { authMiddleware, requireRoles } from '../middleware/auth';

export const reportsRouter = Router();

// GET /api/reports/summary - Comprehensive metrics for reports (Daily, Weekly, Monthly, Annual)
reportsRouter.get('/reports/summary', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'monthly';

    // Date range based on period
    const dateRanges: Record<string, { interval: string; trendInterval: string; trendGroup: string; trendLabel: string; trendFmt: string; limit: number }> = {
      daily:   { interval: '1 DAY',  trendInterval: '7 DAY',  trendGroup: '%Y-%m-%d %H:00', trendLabel: '%H:00',  trendFmt: 'hour',  limit: 24 },
      weekly:  { interval: '7 DAY',  trendInterval: '28 DAY', trendGroup: '%Y-%m-%d',        trendLabel: '%b %d',  trendFmt: 'day',   limit: 28 },
      monthly: { interval: '30 DAY', trendInterval: '90 DAY', trendGroup: '%Y-%m-%d',        trendLabel: '%b %d',  trendFmt: 'day',   limit: 30 },
      annual:  { interval: '12 MONTH', trendInterval: '12 MONTH', trendGroup: '%Y-%m',       trendLabel: '%b %Y',  trendFmt: 'month', limit: 12 },
    };
    const dr = dateRanges[period] || dateRanges.monthly;

    // 1. Room Occupancy
    const totalRooms = (await dbGet<any>('SELECT COUNT(*) as count FROM rooms'))?.count || 12;
    const occupiedRooms = (await dbGet<any>('SELECT COUNT(*) as count FROM rooms WHERE status = "Occupied"'))?.count || 0;
    const availableRooms = (await dbGet<any>('SELECT COUNT(*) as count FROM rooms WHERE status = "Available"'))?.count || 0;
    const maintenanceRooms = (await dbGet<any>('SELECT COUNT(*) as count FROM rooms WHERE status IN ("Maintenance", "Dirty", "Cleaning")'))?.count || 0;
    const occupancyRate = ((occupiedRooms / totalRooms) * 100).toFixed(1);

    // 2. Revenue & Expenses (filtered by period)
    const totalRevenue = (await dbGet<any>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL ${dr.interval})`
    ))?.total || 0;
    const totalExpenses = (await dbGet<any>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date >= DATE_SUB(CURDATE(), INTERVAL ${dr.interval})`
    ))?.total || 0;
    const netIncome = totalRevenue - totalExpenses;

    // 3. Top selling menu items (filtered by period)
    const topMenuItems = await dbAll<any>(
      `SELECT oi.menu_item_name, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as total_revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.status != 'Cancelled'
         AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ${dr.interval})
       GROUP BY oi.menu_item_name
       ORDER BY total_qty DESC
       LIMIT 8`
    );

    // 4. Inventory usage (filtered by period)
    const topConsumedIngredients = await dbAll<any>(
      `SELECT i.name as item_name, i.unit, SUM(it.quantity) as total_quantity, SUM(it.total_cost) as total_cost
       FROM inventory_transactions it
       JOIN inventory_items i ON it.item_id = i.id
       WHERE it.transaction_type = 'Consumed'
         AND it.created_at >= DATE_SUB(CURDATE(), INTERVAL ${dr.interval})
       GROUP BY i.id
       ORDER BY total_cost DESC
       LIMIT 8`
    );

    // 5. Trend chart data (filtered and grouped by period)
    const revenueTrendRows = await dbAll<any>(
      `SELECT DATE_FORMAT(p.payment_date, '${dr.trendGroup}') as trend_key,
              DATE_FORMAT(p.payment_date, '${dr.trendLabel}') as trend_label,
              COALESCE(SUM(p.amount), 0) as revenue
       FROM payments p
       WHERE p.payment_date >= DATE_SUB(CURDATE(), INTERVAL ${dr.trendInterval})
       GROUP BY trend_key, trend_label
       ORDER BY trend_key ASC`
    );

    const expenseRows = await dbAll<any>(
      `SELECT DATE_FORMAT(e.expense_date, '${dr.trendGroup}') as trend_key,
              DATE_FORMAT(e.expense_date, '${dr.trendLabel}') as trend_label,
              COALESCE(SUM(e.amount), 0) as expenses
       FROM expenses e
       WHERE e.expense_date >= DATE_SUB(CURDATE(), INTERVAL ${dr.trendInterval})
       GROUP BY trend_key, trend_label
       ORDER BY trend_key ASC`
    );

    const occupancyRows = await dbAll<any>(
      `SELECT DATE_FORMAT(ci.check_in_time, '${dr.trendGroup}') as trend_key,
              COUNT(DISTINCT ci.room_id) as occupied
       FROM check_ins ci
       WHERE ci.check_in_time >= DATE_SUB(CURDATE(), INTERVAL ${dr.trendInterval})
         AND ci.status = 'Active'
       GROUP BY trend_key
       ORDER BY trend_key ASC`
    );

    const expMap: Record<string, number> = {};
    expenseRows.forEach((r) => { expMap[r.trend_key] = r.expenses; });

    const occMap: Record<string, number> = {};
    occupancyRows.forEach((r) => { occMap[r.trend_key] = r.occupied; });

    const revenueTrend: { day: string; revenue: number; expenses: number; occupancy: number }[] = [];
    const seenKeys = new Set<string>();

    for (const row of revenueTrendRows) {
      seenKeys.add(row.trend_key);
      revenueTrend.push({
        day: row.trend_label,
        revenue: row.revenue,
        expenses: expMap[row.trend_key] || 0,
        occupancy: totalRooms > 0 ? Math.round(((occMap[row.trend_key] || 0) / totalRooms) * 100) : 0,
      });
    }
    for (const row of expenseRows) {
      if (!seenKeys.has(row.trend_key)) {
        seenKeys.add(row.trend_key);
        revenueTrend.push({
          day: row.trend_label,
          revenue: 0,
          expenses: row.expenses,
          occupancy: totalRooms > 0 ? Math.round(((occMap[row.trend_key] || 0) / totalRooms) * 100) : 0,
        });
      }
    }
    revenueTrend.sort((a, b) => {
      const ai = revenueTrendRows.findIndex((r) => r.trend_label === a.day);
      const bi = revenueTrendRows.findIndex((r) => r.trend_label === b.day);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    // 6. Food Cost % calculation (filtered by period)
    const foodCostSum = (await dbGet<any>(
      `SELECT COALESCE(SUM(it.total_cost), 0) as total
       FROM inventory_transactions it
       JOIN inventory_items i ON it.item_id = i.id
       JOIN inventory_categories ic ON i.category_id = ic.id
       WHERE ic.name = 'Kitchen Ingredients' AND it.transaction_type = 'Consumed'
         AND it.created_at >= DATE_SUB(CURDATE(), INTERVAL ${dr.interval})`
    ))?.total || 0;

    const foodRevSum = (await dbGet<any>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments
       WHERE payment_category IN ("Food", "Food/Drinks")
         AND payment_date >= DATE_SUB(CURDATE(), INTERVAL ${dr.interval})`
    ))?.total || 1;
    const foodCostPct = ((foodCostSum / Math.max(1, foodRevSum)) * 100).toFixed(1);

    return res.json({
      occupancy: {
        totalRooms,
        occupiedRooms,
        availableRooms,
        maintenanceRooms,
        occupancyRate: parseFloat(occupancyRate),
      },
      finance: {
        totalRevenue,
        totalExpenses,
        netIncome,
        foodCostAmount: foodCostSum,
        foodCostPercentage: parseFloat(foodCostPct),
      },
      topMenuItems,
      topConsumedIngredients,
      revenueTrend,
    });
  } catch (err: any) {
    console.error('Reports summary error:', err);
    return res.status(500).json({ error: 'Failed to load reports summary' });
  }
});

// GET /api/reports/bartender-daily - bartender daily performance summary
reportsRouter.get('/bartender-daily', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const orders = await dbAll<any>(
      `SELECT o.*, oi.*, u.full_name as waiter_name
       FROM orders o
       JOIN users u ON o.waiter_id = u.id
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.waiter_id = ?
       ORDER BY o.created_at DESC`,
      [userId]
    );

    // Calculate daily stats
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0));
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.setDate(1));
    const startOfYear = new Date(now.setFullYear(now.getFullYear() - 1));

    let served = 0;
    let paid = 0;
    let revenue = 0;

    // Daily stats
    const dailyOrders = orders.filter((o) => new Date(o.created_at) >= startOfDay);
    served = dailyOrders.length;
    const paidOrders = dailyOrders.filter((o) => o.payment_status === 'Paid' || o.payment_status === 'ChargedToRoom');
    paid = paidOrders.length;
    revenue = paidOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const paymentRate = served > 0 ? (paid / served) * 100 : 0;

    // Hourly revenue for last 24 hours
    const hourlyData = dailyOrders.reduce((acc, o) => {
      const date = new Date(o.created_at);
      const hour = date.getHours().toString().padStart(2, '0');
      const existing = acc.find((h) => h.hour === hour);
      if (existing) {
        existing.revenue += o.total_amount || 0;
        existing.orders += 1;
      } else {
        acc.push({ hour, revenue: o.total_amount || 0, orders: 1 });
      }
      return acc;
    }, []);

    const sortedHourly = hourlyData
      .sort((a, b) => a.hour.localeCompare(b.hour))
      .slice(0, 24);

    // Top selling services
    const serviceData = dailyOrders.reduce((acc, o) => {
      o.items?.forEach((it: any) => {
        const existing = acc.find((a) => a.name === it.menu_item_name);
        if (existing) {
          existing.revenue += it.total_price || 0;
          existing.quantity += it.quantity || 1;
        } else {
          acc.push({
            name: it.menu_item_name,
            revenue: it.total_price || 0,
            quantity: it.quantity || 1,
          });
        }
      });
      return acc;
    }, []);

    const topServices = serviceData
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // Department revenue (waiters only see Bar department, but show all for context)
    const deptData = orders.reduce((acc, o) => {
      const dept = o.department || 'General';
      const existing = acc.find((d) => d.department === dept);
      if (existing) {
        existing.revenue += o.total_amount || 0;
        existing.orders += 1;
      } else {
        acc.push({ department: dept, revenue: o.total_amount || 0, orders: 1 });
      }
      return acc;
    }, []);

    return res.json({
      dailyStats: {
        total_served: served,
        paid_count: paid,
        revenue,
        payment_rate: parseFloat((paymentRate / 100).toFixed(1)),
      },
      hourlyRevenue: sortedHourly,
      topServices: topServices.map((s) => ({
        name: s.name,
        revenue: s.revenue,
        quantity: s.quantity,
      })),
      deptRevenue: deptData,
    });
  } catch (err: any) {
    console.error('bartender daily data error:', err);
    return res.status(500).json({ error: 'Failed to load bartender daily data' });
  }
});
