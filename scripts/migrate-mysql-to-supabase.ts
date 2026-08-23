/**
 * Migrate ALL data from local XAMPP MySQL (motel_management) → Supabase Postgres.
 *
 * Reads DB_* from .env for MySQL source.
 * Requires SUPABASE_DB_URL (Transaction pooler) for destination.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_DB_URL = "postgres://postgres....pooler.supabase.com:6543/postgres?pgbouncer=true"
 *   npm run db:seed-supabase
 *
 * Flags:
 *   --force   truncate destination tables first (destructive)
 *   --dry-run count only, no writes
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { Pool } from "pg";

dotenv.config();

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");

const PG_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_POSTGRES_URL;

if (!PG_URL) {
  console.error("❌ SUPABASE_DB_URL is required.");
  console.error("   Supabase Dashboard → Project Settings → Database → Connection string → Transaction pooler (URI)");
  console.error('   $env:SUPABASE_DB_URL="postgres://postgres.xxx:[PASSWORD]@aws-0-...pooler.supabase.com:6543/postgres?pgbouncer=true"');
  process.exit(1);
}

const MYSQL_CFG = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "motel_management",
  dateStrings: true as const,
  decimalNumbers: true as const,
};

// Parents before children (FK-safe)
const ORDERED_TABLES = [
  "roles",
  "permissions",
  "users",
  "role_permissions",
  "room_types",
  "inventory_categories",
  "suppliers",
  "menu_categories",
  "system_settings",
  "restaurant_tables",
  "guests",
  "rooms",
  "reservations",
  "check_ins",
  "inventory_items",
  "inventory_transactions",
  "stock_requests",
  "stock_request_items",
  "menu_items",
  "menu_item_ingredients",
  "orders",
  "order_items",
  "kitchen_usage",
  "kitchen_waste",
  "maintenance_requests",
  "staff_shifts",
  "shift_swap_requests",
  "attendance",
  "invoices",
  "invoice_items",
  "payments",
  "expenses",
  "notifications",
  "audit_logs",
  "token_blacklist",
  "otp_tokens",
];

// Reverse for truncate
const TRUNCATE_ORDER = [...ORDERED_TABLES].reverse();

const CONFLICT_TARGETS: Record<string, string> = {
  roles: "id",
  permissions: "id",
  users: "id",
  role_permissions: "role_id,permission_id",
  room_types: "id",
  inventory_categories: "id",
  suppliers: "id",
  menu_categories: "id",
  system_settings: "key_name",
  restaurant_tables: "id",
  guests: "id",
  rooms: "id",
  reservations: "id",
  check_ins: "id",
  inventory_items: "id",
  inventory_transactions: "id",
  stock_requests: "id",
  stock_request_items: "id",
  menu_items: "id",
  menu_item_ingredients: "id",
  orders: "id",
  order_items: "id",
  kitchen_usage: "id",
  kitchen_waste: "id",
  maintenance_requests: "id",
  staff_shifts: "id",
  shift_swap_requests: "id",
  attendance: "id",
  invoices: "id",
  invoice_items: "id",
  payments: "id",
  expenses: "id",
  notifications: "id",
  audit_logs: "id",
  token_blacklist: "token_id",
  otp_tokens: "id",
};

function normalizeValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  // MySQL DATE/DATETIME as Date object → ISO string PG accepts
  if (v instanceof Date) return v.toISOString();
  return v;
}

async function applySchema(pg: Pool) {
  const schemaPath = path.join(process.cwd(), "supabase", "schema.sql");
  if (!fs.existsSync(schemaPath)) throw new Error(`Missing ${schemaPath}`);
  console.log("→ Applying supabase/schema.sql (IF NOT EXISTS)...");
  const sql = await fs.promises.readFile(schemaPath, "utf8");
  await pg.query(sql);

  // Extra safety: restaurant_tables + otp if schema was older
  await pg.query(`
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id VARCHAR(64) PRIMARY KEY,
      table_number VARCHAR(32) NOT NULL UNIQUE,
      seats INTEGER NOT NULL DEFAULT 2,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pg.query(`
    CREATE TABLE IF NOT EXISTS otp_tokens (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      email VARCHAR(100) NOT NULL,
      otp_code VARCHAR(10) NOT NULL,
      purpose VARCHAR(50) NOT NULL DEFAULT 'login',
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ Schema ready");
}

async function listMysqlTables(mysqlConn: mysql.Connection): Promise<Set<string>> {
  const [rows] = await mysqlConn.query<any[]>("SHOW TABLES");
  const key = Object.keys(rows[0] || { x: 1 })[0];
  return new Set(rows.map((r) => String(r[key])));
}

async function getPgColumns(pg: Pool, table: string): Promise<Set<string>> {
  const { rows } = await pg.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  return new Set(rows.map((r) => r.column_name));
}

async function truncateAll(pg: Pool) {
  console.log("⚠️  --force: truncating destination tables...");
  await pg.query("SET session_replication_role = 'replica'");
  for (const t of TRUNCATE_ORDER) {
    try {
      await pg.query(`TRUNCATE TABLE "${t}" CASCADE`);
      console.log(`  truncated ${t}`);
    } catch {
      // table may not exist
    }
  }
  await pg.query("SET session_replication_role = 'origin'");
}

async function migrateTable(
  mysqlConn: mysql.Connection,
  pg: Pool,
  table: string,
): Promise<{ inserted: number; skipped: number; source: number }> {
  const [rows] = await mysqlConn.query<any[]>(`SELECT * FROM \`${table}\``);
  const source = rows.length;
  if (source === 0) {
    console.log(`  · ${table.padEnd(28)} 0 rows`);
    return { inserted: 0, skipped: 0, source: 0 };
  }

  if (DRY_RUN) {
    console.log(`  · ${table.padEnd(28)} ${source} rows (dry-run)`);
    return { inserted: 0, skipped: 0, source };
  }

  const pgCols = await getPgColumns(pg, table);
  if (pgCols.size === 0) {
    console.warn(`  · ${table.padEnd(28)} SKIP — not in Supabase schema`);
    return { inserted: 0, skipped: source, source };
  }

  let inserted = 0;
  let skipped = 0;
  const conflict = CONFLICT_TARGETS[table] || "id";
  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      // Only columns that exist on both sides
      const cols = Object.keys(row).filter((c) => pgCols.has(c));
      if (cols.length === 0) {
        skipped++;
        continue;
      }
      const vals = cols.map((c) => normalizeValue(row[c]));
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const conflictCols = conflict
        .split(",")
        .map((c) => `"${c.trim()}"`)
        .join(", ");
      const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT (${conflictCols}) DO NOTHING`;
      try {
        const res = await client.query(sql, vals);
        if ((res.rowCount ?? 0) > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        // Fallback without named conflict if PK composite issues
        try {
          const sql2 = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
          const res2 = await client.query(sql2, vals);
          if ((res2.rowCount ?? 0) > 0) inserted++;
          else skipped++;
        } catch (e2: any) {
          console.warn(`    ! ${table} row fail: ${String(e2.message).slice(0, 120)}`);
          skipped++;
        }
      }
    }
    await client.query("COMMIT");
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`  · ${table} TX failed: ${e.message}`);
    throw e;
  } finally {
    client.release();
  }

  console.log(`  · ${table.padEnd(28)} ${inserted} inserted, ${skipped} skipped, ${source} source`);
  return { inserted, skipped, source };
}

async function verify(pg: Pool, expected: Record<string, number>) {
  console.log("\n→ Verification (Supabase vs MySQL):");
  let ok = true;
  for (const [table, exp] of Object.entries(expected)) {
    if (exp === 0) continue;
    try {
      const { rows } = await pg.query(`SELECT COUNT(*)::int as c FROM "${table}"`);
      const got = rows[0].c as number;
      const mark = got >= exp ? "✓" : "✗";
      if (got < exp) ok = false;
      console.log(`  ${mark} ${table.padEnd(28)} mysql=${exp}  supabase=${got}`);
    } catch (e: any) {
      ok = false;
      console.log(`  ✗ ${table.padEnd(28)} error: ${e.message.slice(0, 60)}`);
    }
  }
  return ok;
}

async function main() {
  console.log("🚀 MySQL (XAMPP) → Supabase migration");
  console.log(`   MySQL: ${MYSQL_CFG.user}@${MYSQL_CFG.host}:${MYSQL_CFG.port}/${MYSQL_CFG.database}`);
  console.log(`   PG:    ${PG_URL.replace(/:[^:@/]*@/, ":****@").slice(0, 90)}...`);
  console.log(`   mode:  ${DRY_RUN ? "DRY-RUN" : FORCE ? "FORCE (truncate first)" : "upsert / skip existing"}`);

  let mysqlConn: mysql.Connection;
  try {
    mysqlConn = await mysql.createConnection(MYSQL_CFG);
    await mysqlConn.query("SELECT 1");
    console.log("✅ MySQL connected");
  } catch (e: any) {
    console.error("❌ Cannot connect to MySQL. Start XAMPP MySQL first.");
    console.error("   ", e.message);
    process.exit(1);
  }

  const pg = new Pool({
    connectionString: PG_URL,
    ssl: PG_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 5,
  });
  try {
    await pg.query("SELECT 1");
    console.log("✅ Supabase Postgres connected");
  } catch (e: any) {
    console.error("❌ Cannot connect to Supabase. Check SUPABASE_DB_URL (Transaction pooler + password).");
    console.error("   ", e.message);
    await mysqlConn.end();
    process.exit(1);
  }

  try {
    await applySchema(pg);
    if (FORCE && !DRY_RUN) await truncateAll(pg);

    const existing = await listMysqlTables(mysqlConn);
    const expected: Record<string, number> = {};
    let totalIn = 0;
    let totalSkip = 0;
    let totalSrc = 0;

    console.log("\n→ Copying tables...");
    for (const table of ORDERED_TABLES) {
      if (!existing.has(table)) {
        console.log(`  · ${table.padEnd(28)} not in MySQL, skip`);
        continue;
      }
      const r = await migrateTable(mysqlConn, pg, table);
      expected[table] = r.source;
      totalIn += r.inserted;
      totalSkip += r.skipped;
      totalSrc += r.source;
    }

    // Any extra MySQL tables not in ORDERED list
    for (const t of existing) {
      if (!ORDERED_TABLES.includes(t)) {
        console.log(`  · ${t.padEnd(28)} EXTRA (not in migrator list) — skipped`);
      }
    }

    console.log(`\n✅ Done: ${totalIn} inserted, ${totalSkip} skipped, ${totalSrc} source rows`);
    const verified = await verify(pg, expected);
    if (!verified && !DRY_RUN) {
      console.warn("\n⚠️ Some tables have fewer rows on Supabase (FK skips or conflicts). Re-run with --force after fixing schema if needed.");
    } else if (verified) {
      console.log("\n✅ All non-empty tables match or exceed source counts on Supabase.");
    }

    console.log("\nNext:");
    console.log("  1. Put SUPABASE_DB_URL permanently in Railway/Render env (and optionally .env for local pg mode)");
    console.log("  2. npm run build && npm start");
    console.log("  3. Deploy to Railway (fullstack) — see DEPLOY.md");
  } finally {
    await mysqlConn.end().catch(() => {});
    await pg.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
