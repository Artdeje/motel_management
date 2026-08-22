import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDatabase } from './server/db/database';
import { seedDatabaseIfEmpty } from './server/db/seed';

import { authRouter } from './server/routes/auth';
import { roomsRouter, runAutoCheckIns } from './server/routes/rooms';
import { guestsRouter } from './server/routes/guests';
import { inventoryRouter } from './server/routes/inventory';
import { menuRouter } from './server/routes/menu';
import { ordersRouter } from './server/routes/orders';
import { kitchenRouter } from './server/routes/kitchen';
import { housekeepingRouter } from './server/routes/housekeeping';
import { staffRouter } from './server/routes/staff';
import { financeRouter } from './server/routes/finance';
import { reportsRouter } from './server/routes/reports';
import { systemRouter } from './server/routes/system';
import { cmsRouter } from './server/routes/cms';

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // Initialize and seed database
  try {
    await getDatabase();
    await seedDatabaseIfEmpty();
  } catch (err) {
    console.error('Database bootstrap error:', err);
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount API routers
  app.use('/api/auth', authRouter);
  app.use('/api', roomsRouter);
  app.use('/api', guestsRouter);
  app.use('/api', inventoryRouter);
  app.use('/api', menuRouter);
  app.use('/api', ordersRouter);
  app.use('/api', kitchenRouter);
  app.use('/api', housekeepingRouter);
  app.use('/api', staffRouter);
  app.use('/api', financeRouter);
  app.use('/api', reportsRouter);
  app.use('/api', systemRouter);
  app.use('/api', cmsRouter);

  // Global error handler for API routes — catches unhandled DB errors and returns JSON
  app.use('/api', (err: any, _req: any, res: any, _next: any) => {
    console.error('API Error:', err);
    const message = err?.message || 'Internal server error';
    return res.status(500).json({ error: message });
  });

  // Scheduled job: auto check-in reservations whose scheduled check-in date has arrived
  try {
    await runAutoCheckIns();
  } catch (err) {
    console.error('Initial auto check-in pass failed:', err);
  }
  const autoCheckInTimer = setInterval(async () => {
    try {
      await runAutoCheckIns();
    } catch (err) {
      console.error('Auto check-in job failed:', err);
    }
  }, 5 * 60 * 1000); // every 5 minutes

  // Vite middleware in dev or static files in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Motel Management System server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
