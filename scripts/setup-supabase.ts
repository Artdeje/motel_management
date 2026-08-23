import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_POSTGRES_URL;
if (!connectionString) {
  throw new Error(
    "SUPABASE_DB_URL (or DATABASE_URL) is required. Copy the Transaction pooler connection string from Supabase Connect.\nExample: postgres://postgres.cnudfdpdyrplsqwmvolu:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  );
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  const schemaPath = path.join(process.cwd(), "supabase", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  // Supabase schema is idempotent (IF NOT EXISTS), safe to run repeatedly
  await pool.query(schema);
  console.log("✅ Supabase schema ensured (IF NOT EXISTS)");

  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('roles', 'users', 'rooms', 'guests', 'system_settings', 'otp_tokens')
    ORDER BY table_name
  `);
  console.log(`   Verified ${rows.length} core tables: ${rows.map((r) => r.table_name).join(", ")}`);

  // Ensure otp_tokens (in case schema was old version)
  const otpCheck = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='otp_tokens'`);
  if (otpCheck.rows.length === 0) {
    await pool.query(`
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
    console.log("   Ensured otp_tokens table");
  }

  // Auto-seed if empty (idempotent)
  const { rows: cntRows } = await pool.query(`SELECT COUNT(*) as c FROM users`);
  const userCount = parseInt(cntRows[0]?.c || "0", 10);
  if (userCount === 0) {
    console.log("→ Supabase empty, seeding (this may take a few seconds)...");
    // Import seed abstraction — it will auto-detect pg mode because SUPABASE_DB_URL is set
    if (!process.env.SUPABASE_DB_URL && connectionString) process.env.SUPABASE_DB_URL = connectionString;
    try {
      const { seedDatabaseIfEmpty } = await import("../server/db/seed.js");
      await seedDatabaseIfEmpty();
      console.log("✅ Seeded Supabase with full dataset");
    } catch (e: any) {
      console.warn(`⚠️ Seed via abstraction failed: ${e.message} — run npm run supabase:migrate for SQLite migration instead`);
    }
  } else {
    console.log(`ℹ️ Supabase already has ${userCount} users, skipping seed (use npm run supabase:migrate to force migration from local SQLite)`);
  }

  // Verify live counts for dynamic health check
  for (const t of ["users", "rooms", "inventory_items", "orders"]) {
    try {
      const { rows: c } = await pool.query(`SELECT COUNT(*) as c FROM "${t}"`);
      console.log(`   · ${t.padEnd(20)} ${c[0].c}`);
    } catch {}
  }
} finally {
  await pool.end();
}
