import { Router, Request, Response } from 'express';
import { dbAll, dbGet } from '../db/database';
import { authMiddleware, requireRoles } from '../middleware/auth';

export const reportsRouter = Router();

// GET /api/reports/summary - Comprehensive metrics for reports (Daily, Weekly, Monthly, Annual)
reportsRouter.get('/reports/summary', authMiddleware, requireRoles(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    // 1. Room Occupancy
    const totalRooms = (await dbGet<any>('SELECT COUNT(*) as count FROM rooms'))?.count || 12;
    const occupiedRooms = (await dbGet<any>('SELECT COUNT(*) as count FROM rooms WHERE status = "Occupied"'))?.count || 0;
    const availableRooms = (await dbGet<any>('SELECT COUNT(*) as count FROM rooms WHERE status = "Available"'))?.count || 0;
    const maintenanceRooms = (await dbGet<any>('SELECT COUNT(*) as count FROM rooms WHERE status IN ("Maintenance", "Dirty", "Cleaning")'))?.count || 0;
    const occupancyRate = ((occupiedRooms / totalRooms) * 100).toFixed(1);

    // 2. Revenue & Expenses
    const totalRevenue = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM payments'))?.total || 0;
    const totalExpenses = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM expenses'))?.total || 0;
    const netIncome = totalRevenue - totalExpenses;

    // 3. Top selling menu items
    const topMenuItems = await dbAll<any>(
      `SELECT oi.menu_item_name, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as total_revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.status != 'Cancelled'
       GROUP BY oi.menu_item_name
       ORDER BY total_qty DESC
       LIMIT 8`
    );

    // 4. Inventory usage & stock transactions
    const topConsumedIngredients = await dbAll<any>(
      `SELECT i.name as item_name, i.unit, SUM(it.quantity) as total_quantity, SUM(it.total_cost) as total_cost
       FROM inventory_transactions it
       JOIN inventory_items i ON it.item_id = i.id
       WHERE it.transaction_type = 'Consumed'
       GROUP BY i.id
       ORDER BY total_cost DESC
       LIMIT 8`
    );

    // 5. Daily trend chart data (last 7 days from real data)
    const revenueTrendRows = await dbAll<any>(
      `SELECT DATE_FORMAT(p.payment_date, '%Y-%m-%d') as day_date,
              COALESCE(SUM(p.amount), 0) as revenue,
              0 as expenses
       FROM payments p
       WHERE p.payment_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE_FORMAT(p.payment_date, '%Y-%m-%d')
       ORDER BY day_date ASC`
    );

    const expenseRows = await dbAll<any>(
      `SELECT DATE_FORMAT(e.expense_date, '%Y-%m-%d') as day_date,
              COALESCE(SUM(e.amount), 0) as expenses
       FROM expenses e
       WHERE e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE_FORMAT(e.expense_date, '%Y-%m-%d')
       ORDER BY day_date ASC`
    );

    const occupancyRows = await dbAll<any>(
      `SELECT DATE_FORMAT(ci.check_in_time, '%Y-%m-%d') as day_date,
              COUNT(DISTINCT ci.room_id) as occupied
       FROM check_ins ci
       WHERE ci.check_in_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         AND ci.status = 'Active'
       GROUP BY DATE_FORMAT(ci.check_in_time, '%Y-%m-%d')
       ORDER BY day_date ASC`
    );

    const expMap: Record<string, number> = {};
    expenseRows.forEach((r) => { expMap[r.day_date] = r.expenses; });

    const occMap: Record<string, number> = {};
    occupancyRows.forEach((r) => { occMap[r.day_date] = r.occupied; });

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const revenueTrend: { day: string; revenue: number; expenses: number; occupancy: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayName = dayNames[d.getDay()];
      const matched = revenueTrendRows.find((r) => r.day_date === dateStr);
      revenueTrend.push({
        day: dayName,
        revenue: matched?.revenue || 0,
        expenses: expMap[dateStr] || expMap[`${dateStr} 00:00:00`] || 0,
        occupancy: totalRooms > 0 ? Math.round(((occMap[dateStr] || occMap[`${dateStr} 00:00:00`] || 0) / totalRooms) * 100) : 0,
      });
    }

    // 6. Food Cost % calculation
    const foodCostSum = (await dbGet<any>(
      `SELECT COALESCE(SUM(it.total_cost), 0) as total
       FROM inventory_transactions it
       JOIN inventory_items i ON it.item_id = i.id
       JOIN inventory_categories ic ON i.category_id = ic.id
       WHERE ic.name = 'Kitchen Ingredients' AND it.transaction_type = 'Consumed'`
    ))?.total || 0;

    const foodRevSum = (await dbGet<any>('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_category IN ("Food", "Food/Drinks")'))?.total || 1;
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

// GET /api/reports/waiter-daily - Waiter daily performance summary
reportsRouter.get('/waiter-daily', authMiddleware, async (req: Request, res: Response) => {
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
    console.error('Waiter daily data error:', err);
    return res.status(500).json({ error: 'Failed to load waiter daily data' });
  }
});
