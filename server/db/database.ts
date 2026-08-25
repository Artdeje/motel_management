import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { AsyncLocalStorage } from "async_hooks";
import mysql, {
  Pool as MySqlPool,
  PoolConnection as MySqlConn,
  ResultSetHeader,
} from "mysql2/promise";
import { Pool as PgPool, PoolClient as PgClient } from "pg";

dotenv.config();

// Detect DB mode: Prefer Postgres (Supabase) when a PG connection string is present.
// Supports: SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL, SUPABASE_POSTGRES_URL
const PG_CONNECTION_STRING =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_POSTGRES_URL ||
  null;

export const isPgMode =
  !!PG_CONNECTION_STRING && process.env.FORCE_MYSQL !== "true";
console.log(
  `[DB] Mode detected: ${isPgMode ? "PostgreSQL (Supabase)" : "MySQL"}`,
);

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "motel_management";

const SCHEMA_PATH_MYSQL = path.join(
  process.cwd(),
  "server",
  "db",
  "schema.sql",
);
const SCHEMA_PATH_PG = path.join(process.cwd(), "supabase", "schema.sql");

let mysqlPool: MySqlPool | null = null;
let pgPool: PgPool | null = null;

type TxMySqlConn = MySqlConn;
type TxPgClient = PgClient;
const txStorage = new AsyncLocalStorage<TxMySqlConn | TxPgClient>();

// --- SQL translation for PG compatibility ---
function translateSql(sql: string, paramsLengthHint?: number): string {
  if (!isPgMode) return sql;
  let out = sql;

  // 1. INSERT IGNORE -> INSERT ... ON CONFLICT DO NOTHING
  const isInsertIgnore = /INSERT\s+IGNORE\s+INTO/i.test(out);
  if (isInsertIgnore) {
    out = out.replace(/INSERT\s+IGNORE\s+INTO/gi, "INSERT INTO");
  }

  // 2. Replace MySQL double-quoted string literals with single quotes (naive but covers our cases like IN ("Room", "Deposit"))
  // Only convert when double quotes wrap simple strings with no SQL keywords inside
  // We convert status/category IN lists:
  out = out.replace(
    /IN\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g,
    "IN ('$1', '$2')",
  );
  out = out.replace(
    /IN\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g,
    "IN ('$1', '$2', '$3')",
  );
  out = out.replace(
    /IN\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g,
    "IN ('$1', '$2', '$3', '$4')",
  );
  // Single value comparisons with double quotes:
  out = out.replace(/=\s*"([^"]*)"/g, "= '$1'");
  out = out.replace(/!=\s*"([^"]*)"/g, "!= '$1'");
  // Coverage for specific patterns in codebase:
  out = out.replace(/status\s+IN\s+\("([^"]+)"\)/g, "status IN ('$1')");
  // Generic fallback for remaining status = "Something": already handled, but keep for safety
  // Handle payment_category IN lists etc

  // 3. DATE_ADD / DATE_SUB patterns - Handle both dynamic and specific intervals
  // Generic pattern for DATE_SUB(CURDATE(), INTERVAL n UNIT) - dynamic intervals like 30 DAY, 12 MONTH, etc.
  out = out.replace(
    /DATE_SUB\s*\(\s*CURDATE\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR|HOUR)\s*\)/gi,
    (match, num, unit) => {
      const unitMap: Record<string, string> = {
        day: "days",
        month: "months",
        year: "years",
        hour: "hours",
      };
      const pgUnit = unitMap[unit.toLowerCase()] || unit.toLowerCase() + "s";
      return `CURRENT_DATE - INTERVAL '${num} ${pgUnit}'`;
    },
  );

  // Generic pattern for DATE_SUB(NOW(), INTERVAL n UNIT)
  out = out.replace(
    /DATE_SUB\s*\(\s*NOW\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR|HOUR)\s*\)/gi,
    (match, num, unit) => {
      const unitMap: Record<string, string> = {
        day: "days",
        month: "months",
        year: "years",
        hour: "hours",
      };
      const pgUnit = unitMap[unit.toLowerCase()] || unit.toLowerCase() + "s";
      return `NOW() - INTERVAL '${num} ${pgUnit}'`;
    },
  );

  // Generic pattern for DATE_ADD(NOW(), INTERVAL n UNIT)
  out = out.replace(
    /DATE_ADD\s*\(\s*NOW\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR|HOUR)\s*\)/gi,
    (match, num, unit) => {
      const unitMap: Record<string, string> = {
        day: "days",
        month: "months",
        year: "years",
        hour: "hours",
      };
      const pgUnit = unitMap[unit.toLowerCase()] || unit.toLowerCase() + "s";
      return `NOW() + INTERVAL '${num} ${pgUnit}'`;
    },
  );

  // Handle parameterized intervals (with ? placeholder)
  out = out.replace(
    /DATE_SUB\s*\(\s*CURDATE\s*\(\s*\)\s*,\s*INTERVAL\s+\?\s+MONTH\s*\)/gi,
    "CURRENT_DATE - (? * INTERVAL '1 month')",
  );
  out = out.replace(
    /DATE_SUB\s*\(\s*CURDATE\s*\(\s*\)\s*,\s*INTERVAL\s+\?\s+DAY\s*\)/gi,
    "CURRENT_DATE - (? * INTERVAL '1 day')",
  );

  // 4. CURDATE() -> CURRENT_DATE
  out = out.replace(/CURDATE\s*\(\s*\)/gi, "CURRENT_DATE");

  // 5. DATE_FORMAT -> TO_CHAR
  out = out.replace(
    /DATE_FORMAT\s*\(\s*p\.payment_date\s*,\s*'%Y-%m'\s*\)/gi,
    "TO_CHAR(p.payment_date, 'YYYY-MM')",
  );
  out = out.replace(
    /DATE_FORMAT\s*\(\s*p\.payment_date\s*,\s*'%b %Y'\s*\)/gi,
    "TO_CHAR(p.payment_date, 'Mon YYYY')",
  );
  out = out.replace(
    /DATE_FORMAT\s*\(\s*e\.expense_date\s*,\s*'%Y-%m'\s*\)/gi,
    "TO_CHAR(e.expense_date, 'YYYY-MM')",
  );
  out = out.replace(
    /DATE_FORMAT\s*\(\s*e\.expense_date\s*,\s*'%b %Y'\s*\)/gi,
    "TO_CHAR(e.expense_date, 'Mon YYYY')",
  );
  out = out.replace(
    /DATE_FORMAT\s*\(\s*p\.payment_date\s*,\s*'%Y-%m-%d'\s*\)/gi,
    "TO_CHAR(p.payment_date, 'YYYY-MM-DD')",
  );
  out = out.replace(
    /DATE_FORMAT\s*\(\s*e\.expense_date\s*,\s*'%Y-%m-%d'\s*\)/gi,
    "TO_CHAR(e.expense_date, 'YYYY-MM-DD')",
  );
  out = out.replace(
    /DATE_FORMAT\s*\(\s*ci\.check_in_time\s*,\s*'%Y-%m-%d'\s*\)/gi,
    "TO_CHAR(ci.check_in_time, 'YYYY-MM-DD')",
  );

  // 6. DATE(col) = ? -> col::date = ?
  out = out.replace(
    /DATE\s*\(\s*o\.created_at\s*\)\s*=\s*\?/gi,
    "o.created_at::date = ?",
  );
  out = out.replace(/DATE\s*\(\s*([a-z_\.]+)\s*\)/gi, "$1::date");

  // 7. information_schema DATABASE() -> 'public'
  out = out.replace(
    /table_schema\s*=\s*DATABASE\s*\(\s*\)/gi,
    "table_schema = 'public'",
  );

  // 8. SHOW TABLES helper handled in initSchema directly, not here.

  // 9. GREATEST works in PG already.

  // Convert ? placeholders to $1, $2...
  // But need to keep already-translated (? * INTERVAL ...) case: there we kept "?" inside pattern, now convert.
  let idx = 0;
  out = out.replace(/\?/g, () => `$${++idx}`);

  // 10. Append ON CONFLICT DO NOTHING for former INSERT IGNORE
  if (isInsertIgnore && !/ON\s+CONFLICT/i.test(out)) {
    // Trim trailing semicolon if present
    const trimmed = out.trim().replace(/;$/, "");
    out = trimmed + " ON CONFLICT DO NOTHING";
  }

  return out;
}

// Also need raw executor that handles translation and returns rows

export async function getDatabase(): Promise<MySqlPool | PgPool> {
  if (isPgMode) {
    if (pgPool) return pgPool;
    if (!PG_CONNECTION_STRING) throw new Error("Missing PG connection string");
    pgPool = new PgPool({
      connectionString: PG_CONNECTION_STRING,
      ssl: PG_CONNECTION_STRING.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
      max: 10,
    });
    // Test connection
    const client = await pgPool.connect();
    try {
      await client.query("SELECT 1");
      console.log("[DB] Connected to Supabase Postgres (pg)");
    } finally {
      client.release();
    }
    await initSchemaPg(pgPool);
    await runMigrationsPg(pgPool);
    return pgPool;
  } else {
    if (mysqlPool) return mysqlPool;
    // MySQL path: create DB if missing then pool
    const adminConn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });
    await adminConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await adminConn.end();

    mysqlPool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4",
      decimalNumbers: true,
      timezone: "+02:00",
    });

    await initSchemaMySql(mysqlPool);
    await runMigrationsMySql(mysqlPool);
    return mysqlPool;
  }
}

// --- MySQL init/migrations (original logic) ---
async function initSchemaMySql(p: MySqlPool): Promise<void> {
  const [rows] = await p.query('SHOW TABLES LIKE "roles"');
  if (Array.isArray(rows) && rows.length > 0) {
    console.log(
      `[DB] Connected to MySQL database "${DB_NAME}" (already initialized)`,
    );
    return;
  }
  if (!fs.existsSync(SCHEMA_PATH_MYSQL)) {
    throw new Error(`Schema file not found: ${SCHEMA_PATH_MYSQL}`);
  }
  const schemaSql = fs.readFileSync(SCHEMA_PATH_MYSQL, "utf8");
  const statements = schemaSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
  for (const stmt of statements) {
    await p.query(stmt);
  }
  console.log(
    `[DB] MySQL database "${DB_NAME}" initialized with relational schema`,
  );
  // Ensure otp_tokens table
  await ensureOtpTableMySql(p);
}

async function ensureOtpTableMySql(p: MySqlPool) {
  const [rows] = await p.query(`SHOW TABLES LIKE 'otp_tokens'`);
  if (Array.isArray(rows) && rows.length === 0) {
    console.log("[DB] Migrating: Creating otp_tokens table (MySQL)...");
    await p.query(`
      CREATE TABLE otp_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        email VARCHAR(100) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        purpose VARCHAR(50) NOT NULL DEFAULT 'login',
        expires_at DATETIME NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await p.query(
      `CREATE INDEX idx_otp_email ON otp_tokens(email, purpose, used)`,
    );
    await p.query(`CREATE INDEX idx_otp_expires ON otp_tokens(expires_at)`);
  }
}

async function runMigrationsMySql(p: MySqlPool): Promise<void> {
  // department column
  const [deptCol] = await p.query(
    "SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_items' AND column_name = 'department'",
  );
  if (Array.isArray(deptCol) && (deptCol[0] as any).cnt === 0) {
    console.log(
      "[DB] Migrating: Adding department column to inventory_items...",
    );
    await p.query(
      "ALTER TABLE inventory_items ADD COLUMN department VARCHAR(50) NOT NULL DEFAULT 'General'",
    );
  }
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
  const cmsDefaults: Record<string, { value: string; desc: string }> = {
    site_title: {
      value: "Grand Horizon Motel & Bistro",
      desc: "Full site title shown in browser tab and branding",
    },
    site_subtitle: {
      value: "Motel & Bistro",
      desc: "Subtitle badge shown next to site name in navbar",
    },
    logo_text: { value: "GH", desc: "Abbreviation shown in the logo icon" },
    favicon_url: {
      value: "",
      desc: "URL to favicon image (leave empty for default)",
    },
    logo_url: {
      value: "",
      desc: "URL to logo image (leave empty for text-only logo)",
    },
    site_description: {
      value: "Full-service motel management platform",
      desc: "Meta description for the site",
    },
    loading_subtitle: {
      value: "Initializing operational engines & RBAC permissions...",
      desc: "Text shown on the loading screen below the title",
    },
    site_location: {
      value: "Kigali, Rwanda",
      desc: "Physical location shown in navbar, reports, and receipts",
    },
    developer_name: {
      value: "Grand Horizon Dev Team",
      desc: "Developer / team name shown in the footer",
    },
    footer_text: {
      value: "All rights reserved",
      desc: "Copyright text shown in the footer",
    },
  };
  for (const [key, { value, desc }] of Object.entries(cmsDefaults)) {
    const [existing] = await p.query(
      "SELECT 1 FROM system_settings WHERE key_name = ?",
      [key],
    );
    if (Array.isArray(existing) && existing.length === 0) {
      await p.query(
        "INSERT INTO system_settings (key_name, value_json, description) VALUES (?, ?, ?)",
        [key, JSON.stringify(value), desc],
      );
    }
  }
  console.log("[DB] CMS default settings verified (MySQL)");
  const [tbRows] = await p.query(
    "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'token_blacklist'",
  );
  if (Array.isArray(tbRows) && (tbRows[0] as any).cnt === 0) {
    console.log("[DB] Migrating: Creating token_blacklist table...");
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
  await ensureOtpTableMySql(p);
}

// --- Postgres init/migrations ---
async function initSchemaPg(p: PgPool): Promise<void> {
  const { rows } = await p.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roles'`,
  );
  if (rows.length > 0) {
    console.log("[DB] Connected to Supabase Postgres (already initialized)");
    return;
  }
  // Try supabase schema, fallback to mysql schema translated
  let schemaPath = SCHEMA_PATH_PG;
  if (!fs.existsSync(schemaPath)) {
    console.warn(
      `[DB] Supabase schema not found at ${schemaPath}, falling back to MySQL schema translation`,
    );
    schemaPath = SCHEMA_PATH_MYSQL;
  }
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  console.log(`[DB] Initializing Supabase Postgres from ${schemaPath} ...`);
  // Supabase schema.sql is already PG-compatible; just execute
  await p.query(schemaSql);
  console.log("[DB] Supabase Postgres initialized with relational schema");
  await ensureOtpTablePg(p);
}

async function ensureOtpTablePg(p: PgPool) {
  const { rows } = await p.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='otp_tokens'`,
  );
  if (rows.length === 0) {
    console.log("[DB] Migrating: Creating otp_tokens table (PG)...");
    await p.query(`
      CREATE TABLE IF NOT EXISTS otp_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        email VARCHAR(100) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        purpose VARCHAR(50) NOT NULL DEFAULT 'login',
        expires_at TIMESTAMPTZ NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await p.query(
      `CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_tokens(email, purpose, used)`,
    );
    await p.query(
      `CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_tokens(expires_at)`,
    );
  }
}

async function runMigrationsPg(p: PgPool): Promise<void> {
  // department column
  const colCheck = await p.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_items' AND column_name='department'`,
  );
  if (colCheck.rows.length === 0) {
    console.log(
      "[DB] Migrating (PG): Adding department column to inventory_items...",
    );
    await p.query(
      `ALTER TABLE inventory_items ADD COLUMN department VARCHAR(50) NOT NULL DEFAULT 'General'`,
    );
  }
  await p.query(`
    UPDATE inventory_items i
    SET department = CASE
      WHEN ic.name = 'Kitchen Ingredients' THEN 'Kitchen'
      WHEN ic.name = 'Bar/Drinks' THEN 'Bar'
      WHEN ic.name IN ('Cleaning Supplies', 'Linen') THEN 'Housekeeping'
      WHEN ic.name = 'Other' THEN 'Manager'
      ELSE 'General'
    END
    FROM inventory_categories ic
    WHERE i.category_id = ic.id AND (i.department = 'General' OR i.department IS NULL)
  `);

  const cmsDefaults: Record<string, { value: string; desc: string }> = {
    site_title: {
      value: "Grand Horizon Motel & Bistro",
      desc: "Full site title shown in browser tab and branding",
    },
    site_subtitle: {
      value: "Motel & Bistro",
      desc: "Subtitle badge shown next to site name in navbar",
    },
    logo_text: { value: "GH", desc: "Abbreviation shown in the logo icon" },
    favicon_url: {
      value: "",
      desc: "URL to favicon image (leave empty for default)",
    },
    logo_url: {
      value: "",
      desc: "URL to logo image (leave empty for text-only logo)",
    },
    site_description: {
      value: "Full-service motel management platform",
      desc: "Meta description for the site",
    },
    loading_subtitle: {
      value: "Initializing operational engines & RBAC permissions...",
      desc: "Text shown on the loading screen below the title",
    },
    site_location: {
      value: "Kigali, Rwanda",
      desc: "Physical location shown in navbar, reports, and receipts",
    },
    developer_name: {
      value: "Grand Horizon Dev Team",
      desc: "Developer / team name shown in the footer",
    },
    footer_text: {
      value: "All rights reserved",
      desc: "Copyright text shown in the footer",
    },
  };
  for (const [key, { value, desc }] of Object.entries(cmsDefaults)) {
    const existing = await p.query(
      "SELECT 1 FROM system_settings WHERE key_name = $1",
      [key],
    );
    if (existing.rows.length === 0) {
      await p.query(
        "INSERT INTO system_settings (key_name, value_json, description) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [key, JSON.stringify(value), desc],
      );
    }
  }
  console.log("[DB] CMS default settings verified (PG)");

  const tbCheck = await p.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='token_blacklist'`,
  );
  if (tbCheck.rows.length === 0) {
    console.log("[DB] Migrating (PG): Creating token_blacklist table...");
    await p.query(`
      CREATE TABLE token_blacklist (
        token_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        blacklisted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        reason VARCHAR(100) NOT NULL DEFAULT 'Logout'
      )
    `);
  }
  await ensureOtpTablePg(p);
}

// --- Connection helper for query execution ---
async function withConnectionPg<T>(
  fn: (client: PgClient) => Promise<T>,
): Promise<T> {
  const txClient = txStorage.getStore() as PgClient | undefined;
  // Distinguish pg client by having .query and not .execute
  const isPgClient =
    txClient &&
    typeof (txClient as any).query === "function" &&
    !(txClient as any).execute;
  if (txClient && isPgClient) {
    return fn(txClient as PgClient);
  }
  // Also need to handle case where MySQL tx is stored but we are in PG mode - should not happen, but guard
  const p = (await getDatabase()) as PgPool;
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function withConnectionMySql<T>(
  fn: (conn: MySqlConn) => Promise<T>,
): Promise<T> {
  const txConn = txStorage.getStore() as MySqlConn | undefined;
  const isMySqlConn = txConn && typeof (txConn as any).execute === "function";
  if (txConn && isMySqlConn) {
    return fn(txConn as MySqlConn);
  }
  const p = (await getDatabase()) as MySqlPool;
  const conn = await p.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

function sanitizeParams(params: any[]): any[] {
  return params.map((p) => (p === undefined ? null : p));
}

// Unified query helpers that auto-translate

export async function dbAll<T = any>(
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  const sanitized = sanitizeParams(params);
  if (isPgMode) {
    const pgSql = translateSql(sql);
    return withConnectionPg(async (client) => {
      const result = await client.query(pgSql, sanitized);
      return result.rows as T[];
    });
  } else {
    return withConnectionMySql(async (conn) => {
      const [rows] = await conn.execute(sql, sanitized);
      return rows as T[];
    });
  }
}

export async function dbGet<T = any>(
  sql: string,
  params: any[] = [],
): Promise<T | undefined> {
  const rows = await dbAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : undefined;
}

export async function dbRun(
  sql: string,
  params: any[] = [],
): Promise<{ changes: number }> {
  const sanitized = sanitizeParams(params);
  if (isPgMode) {
    const pgSql = translateSql(sql);
    return withConnectionPg(async (client) => {
      const result = await client.query(pgSql, sanitized);
      return { changes: result.rowCount ?? 0 };
    });
  } else {
    return withConnectionMySql(async (conn) => {
      const [result] = await conn.execute<ResultSetHeader>(sql, sanitized);
      return { changes: result.affectedRows };
    });
  }
}

export async function dbTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (isPgMode) {
    const p = (await getDatabase()) as PgPool;
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const result = await txStorage.run(client, async () => fn());
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw err;
    } finally {
      client.release();
    }
  } else {
    const p = (await getDatabase()) as MySqlPool;
    const conn = await p.getConnection();
    try {
      await conn.beginTransaction();
      const result = await txStorage.run(conn, async () => fn());
      await conn.commit();
      return result;
    } catch (err) {
      try {
        await conn.rollback();
      } catch {}
      throw err;
    } finally {
      conn.release();
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (isPgMode) {
    if (pgPool) {
      await pgPool.end();
      pgPool = null;
    }
  } else {
    if (mysqlPool) {
      await mysqlPool.end();
      mysqlPool = null;
    }
  }
}

export async function getCmsSetting(
  key: string,
  fallback: string = "",
): Promise<string> {
  try {
    const row = await dbGet<{ value_json: string }>(
      "SELECT value_json FROM system_settings WHERE key_name = ?",
      [key],
    );
    if (row) {
      try {
        return JSON.parse(row.value_json);
      } catch {
        return row.value_json;
      }
    }
  } catch {}
  return fallback;
}

export async function getCmsSettings(): Promise<Record<string, string>> {
  const rows = await dbAll<{ key_name: string; value_json: string }>(
    "SELECT key_name, value_json FROM system_settings",
  );
  const settings: Record<string, string> = {};
  for (const row of rows) {
    try {
      settings[row.key_name] = JSON.parse(row.value_json);
    } catch {
      settings[row.key_name] = row.value_json;
    }
  }
  return settings;
}
