import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { authMiddleware, requireRoles } from '../middleware/auth';

export const cmsRouter = Router();

// GET /api/cms/settings - Public (needed for branding on login page etc.)
cmsRouter.get('/cms/settings', async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll<{ key_name: string; value_json: string; description: string | null }>(
      'SELECT key_name, value_json, description FROM system_settings ORDER BY key_name'
    );
    const settings: Record<string, string> = {};
    for (const row of rows) {
      try {
        settings[row.key_name] = JSON.parse(row.value_json);
      } catch {
        settings[row.key_name] = row.value_json;
      }
    }
    return res.json({ settings });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/cms/settings - Admin only (bulk update)
cmsRouter.put('/cms/settings', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  try {
    const { settings } = req.body as { settings: Record<string, { value: string; description?: string }> };
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings object required' });
    }

    for (const [key, entry] of Object.entries(settings)) {
      const value = typeof entry === 'string' ? entry : entry.value;
      const description = typeof entry === 'object' ? entry.description : undefined;

      const existing = await dbGet<any>('SELECT key_name FROM system_settings WHERE key_name = ?', [key]);
      if (existing) {
        let updateSql = 'UPDATE system_settings SET value_json = ?, updated_at = NOW()';
        const params: any[] = [JSON.stringify(value)];
        if (description !== undefined) {
          updateSql += ', description = ?';
          params.push(description);
        }
        updateSql += ' WHERE key_name = ?';
        params.push(key);
        await dbRun(updateSql, params);
      } else {
        await dbRun(
          'INSERT INTO system_settings (key_name, value_json, description) VALUES (?, ?, ?)',
          [key, JSON.stringify(value), description || null]
        );
      }
    }

    return res.json({ message: 'Settings updated', count: Object.keys(settings).length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cms/settings/:key - Admin only
cmsRouter.delete('/cms/settings/:key', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const existing = await dbGet<any>('SELECT key_name FROM system_settings WHERE key_name = ?', [key]);
    if (!existing) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    await dbRun('DELETE FROM system_settings WHERE key_name = ?', [key]);
    return res.json({ message: `Setting "${key}" deleted` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
