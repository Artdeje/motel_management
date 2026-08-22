import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { AsyncLocalStorage } from 'async_hooks';
import mysql, { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';

dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'motel_management';

const SCHEMA_PATH = path.join(process.cwd(), 'server', 'db', 'schema.sql');

let pool: Pool | null = null;
const txStorage = new AsyncLocalStorage<PoolConnection>();

// Initialize the MySQL pool, create the database if missing, and apply the schema.
export async function getDatabase(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const adminConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  await adminConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await adminConn.end();

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    decimalNumbers: true,
    timezone: '+02:00',
  });

  await initSchema(pool);
  await runMigrations(pool);
  return pool;
}

async function runMigrations(p: Pool): Promise<void> {
  // Add department column to inventory_items if missing
  const [deptCol] = await p.query(
    "SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_items' AND column_name = 'department'"
  );
  if (Array.isArray(deptCol) && (deptCol[0] as any).cnt === 0) {
    console.log('Migrating: Adding department column to inventory_items...');
    await p.query("ALTER TABLE inventory_items ADD COLUMN department VARCHAR(50) NOT NULL DEFAULT 'General'");
  }

  // Backfill department for existing items still set to 'General'
  await p.query(`
    UPDATE inventory_items i
    JOIN inventory_categories ic ON i.category_id = ic.id
    SET i.department = CASE
      WHEN ic.name = 'Kitchen Ingredients' THEN 'Kitchen'
      WHEN ic.name = 'Bar/Drinks' THEN 'Bar'
      WHEN ic.name IN ('Cleaning Supplies', 'Linen') THEN 'Housekeeping'
      WHEN ic.name = 'Other' THEN 'Manager'
      ELSE 'General'
    END
    WHERE i.department = 'General' OR i.department IS NULL
  `);

  // Seed default CMS settings if missing
  const cmsDefaults: Record<string, { value: string; desc: string }> = {
    site_title: { value: 'Grand Horizon Motel & Bistro', desc: 'Full site title shown in browser tab and branding' },
    site_subtitle: { value: 'Motel & Bistro', desc: 'Subtitle badge shown next to site name in navbar' },
    logo_text: { value: 'GH', desc: 'Abbreviation shown in the logo icon' },
    favicon_url: { value: '', desc: 'URL to favicon image (leave empty for default)' },
    logo_url: { value: '', desc: 'URL to logo image (leave empty for text-only logo)' },
    site_description: { value: 'Full-service motel management platform', desc: 'Meta description for the site' },
    loading_subtitle: { value: 'Initializing operational engines & RBAC permissions...', desc: 'Text shown on the loading screen below the title' },
    site_location: { value: 'Kigali, Rwanda', desc: 'Physical location shown in navbar, reports, and receipts' },
    developer_name: { value: 'Grand Horizon Dev Team', desc: 'Developer / team name shown in the footer' },
    footer_text: { value: 'All rights reserved', desc: 'Copyright text shown in the footer' },
  };

  for (const [key, { value, desc }] of Object.entries(cmsDefaults)) {
    const [existing] = await p.query('SELECT 1 FROM system_settings WHERE key_name = ?', [key]);
    if (Array.isArray(existing) && existing.length === 0) {
      await p.query(
        'INSERT INTO system_settings (key_name, value_json, description) VALUES (?, ?, ?)',
        [key, JSON.stringify(value), desc]
      );
    }
  }
  console.log('CMS default settings verified');

  // Ensure token_blacklist table exists
  const [tbRows] = await p.query(
    "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'token_blacklist'"
  );
  if (Array.isArray(tbRows) && (tbRows[0] as any).cnt === 0) {
    console.log('Migrating: Creating token_blacklist table...');
    await p.query(`
      CREATE TABLE token_blacklist (
        token_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        blacklisted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        reason VARCHAR(100) NOT NULL DEFAULT 'Logout'
      )
    `);
  }
}

async function initSchema(p: Pool): Promise<void> {
  const [rows] = await p.query('SHOW TABLES LIKE "roles"');
  if (Array.isArray(rows) && rows.length > 0) {
    console.log(`Connected to MySQL database "${DB_NAME}" (already initialized)`);
    return;
  }

  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error(`Schema file not found: ${SCHEMA_PATH}`);
  }

  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const statements = schemaSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  for (const stmt of statements) {
    await p.query(stmt);
  }

  console.log(`MySQL database "${DB_NAME}" initialized with relational schema`);
}

async function withConnection<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const txConn = txStorage.getStore();
  if (txConn) {
    return fn(txConn);
  }
  const p = await getDatabase();
  const conn = await p.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

// Helper methods for structured queries
function sanitizeParams(params: any[]): any[] {
  return params.map((p) => (p === undefined ? null : p));
}

export async function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return withConnection(async (conn) => {
    const [rows] = await conn.execute(sql, sanitizeParams(params));
    return rows as T[];
  });
}

export async function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const rows = await dbAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : undefined;
}

export async function dbRun(sql: string, params: any[] = []): Promise<{ changes: number }> {
  return withConnection(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(sql, sanitizeParams(params));
    return { changes: result.affectedRows };
  });
}

export async function dbTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const p = await getDatabase();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await txStorage.run(conn, async () => fn());
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (e) {
      // ignore
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = pool;
  }
}

export async function getCmsSetting(key: string, fallback: string = ''): Promise<string> {
  try {
    const row = await dbGet<{ value_json: string }>('SELECT value_json FROM system_settings WHERE key_name = ?', [key]);
    if (row) {
      try { return JSON.parse(row.value_json); } catch { return row.value_json; }
    }
  } catch {}
  return fallback;
}

export async function getCmsSettings(): Promise<Record<string, string>> {
  const rows = await dbAll<{ key_name: string; value_json: string }>('SELECT key_name, value_json FROM system_settings');
  const settings: Record<string, string> = {};
  for (const row of rows) {
    try { settings[row.key_name] = JSON.parse(row.value_json); } catch { settings[row.key_name] = row.value_json; }
  }
  return settings;
}
