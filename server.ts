// Prevent crash on unhandled async DB errors — log instead
process.on('unhandledRejection', (reason: any) => {
  console.error('[UnhandledRejection]', reason?.message || reason, reason?.stack?.slice(0, 500) || '');
});
process.on('uncaughtException', (err: any) => {
  console.error('[UncaughtException]', err?.message || err, err?.stack?.slice(0, 800) || '');
});

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { getDatabase } from "./server/db/database";
import { seedDatabaseIfEmpty } from "./server/db/seed";

import { authRouter } from "./server/routes/auth";
import { roomsRouter, runAutoCheckIns } from "./server/routes/rooms";
import { guestsRouter } from "./server/routes/guests";
import { inventoryRouter } from "./server/routes/inventory";
import { menuRouter } from "./server/routes/menu";
import { ordersRouter } from "./server/routes/orders";
import { kitchenRouter } from "./server/routes/kitchen";
import { housekeepingRouter } from "./server/routes/housekeeping";
import { staffRouter } from "./server/routes/staff";
import { financeRouter } from "./server/routes/finance";
import { reportsRouter } from "./server/routes/reports";
import { systemRouter } from "./server/routes/system";
import { cmsRouter } from "./server/routes/cms";
import { checkSupabaseConnection } from "./server/lib/supabase";

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // CORS for split deployment (Netlify frontend -> Railway backend) and local dev
  // Fullstack single-origin works without CORS, but this allows both models
  const allowedOrigins = [
    process.env.APP_URL,
    process.env.FRONTEND_URL,
    process.env.VITE_API_URL,
    "http://localhost:5173",
    "http://localhost:3000",
  ].filter(Boolean) as string[];
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    // Allow same-origin (no origin header) and whitelisted origins, or allow all if not in production split mode
    if (!origin || allowedOrigins.some((o) => origin.startsWith(o.replace(/\/$/, ""))) || process.env.CORS_ALLOW_ALL === "true") {
      if (origin) res.header("Access-Control-Allow-Origin", origin);
      else res.header("Access-Control-Allow-Origin", "*");
    } else if (allowedOrigins.length === 0) {
      // No whitelist configured -> permissive for fullstack
      res.header("Access-Control-Allow-Origin", origin || "*");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize and seed database
  try {
    await getDatabase();
    await seedDatabaseIfEmpty();
  } catch (err) {
    console.error("Database bootstrap error:", err);
  }

  // Health check endpoint - includes DB and Supabase dynamic diagnostics
  app.get("/api/health", async (_req, res) => {
    const supabase = await checkSupabaseConnection();
    let db: { connected: boolean; provider: string; detail: string } = { connected: false, provider: "unknown", detail: "" };
    try {
      const { isPgMode, dbGet } = await import("./server/db/database.js");
      const probe = await dbGet("SELECT 1 as ok");
      const provider = isPgMode ? "supabase-postgres (pg)" : "mysql";
      const detail = isPgMode
        ? `pg via ${process.env.SUPABASE_DB_URL ? "SUPABASE_DB_URL" : process.env.DATABASE_URL ? "DATABASE_URL" : "POSTGRES_URL"}`
        : `mysql://${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || "motel_management"}`;
      db = { connected: !!probe, provider, detail };
    } catch (e: any) {
      // Fallback if dynamic import fails (tsx dev resolves .ts)
      try {
        const { isPgMode: fallbackIsPg, dbGet: fallbackGet } = await import("./server/db/database");
        const probe2 = await fallbackGet("SELECT 1 as ok");
        db = {
          connected: !!probe2,
          provider: fallbackIsPg ? "supabase-postgres (pg)" : "mysql",
          detail: fallbackIsPg ? "pg via SUPABASE_DB_URL/DATABASE_URL" : `mysql://${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || "motel_management"}`,
        };
      } catch (e2: any) {
        db = { connected: false, provider: "unknown", detail: e2?.message || e?.message || String(e2 || e) };
      }
    }
    res.json({ status: db.connected ? "ok" : "degraded", timestamp: new Date().toISOString(), supabase, db, version: process.env.npm_package_version || "0.0.0" });
  });

  // Simple ping for load balancers
  app.get("/api/ping", (_req, res) => res.json({ pong: true }));

  // Mount API routers
  app.use("/api/auth", authRouter);
  app.use("/api", roomsRouter);
  app.use("/api", guestsRouter);
  app.use("/api", inventoryRouter);
  app.use("/api", menuRouter);
  app.use("/api", ordersRouter);
  app.use("/api", kitchenRouter);
  app.use("/api", housekeepingRouter);
  app.use("/api", staffRouter);
  app.use("/api", financeRouter);
  app.use("/api", reportsRouter);
  app.use("/api", systemRouter);
  app.use("/api", cmsRouter);

  // Global error handler for API routes — catches unhandled DB errors and returns JSON
  app.use("/api", (err: any, _req: any, res: any, _next: any) => {
    console.error("API Error:", err);
    const message = err?.message || "Internal server error";
    return res.status(500).json({ error: message });
  });

  // Scheduled job: auto check-in reservations whose scheduled check-in date has arrived
  try {
    await runAutoCheckIns();
  } catch (err) {
    console.error("Initial auto check-in pass failed:", err);
  }
  const autoCheckInTimer = setInterval(
    async () => {
      try {
        await runAutoCheckIns();
      } catch (err) {
        console.error("Auto check-in job failed:", err);
      }
    },
    5 * 60 * 1000,
  ); // every 5 minutes

  // Vite middleware in dev or static files in prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Robust dist resolution for fullstack deployment (Railway/Render/Vercel/Docker)
    // After `npm run build`, vite assets are in dist/ and server bundle is dist/server.cjs
    // At runtime cwd is project root, so dist is predictable, but we check multiple candidates for safety
    // __dirname is available in the bundled CJS (esbuild), fallback to cwd in ESM dev
    const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    const candidates = [
      path.join(process.cwd(), "dist"),
      path.resolve("dist"),
      path.join(baseDir, "."),
      path.join(baseDir, "..", "dist"),
      path.join(process.cwd(), "build"),
    ].filter(Boolean);
    let distPath = candidates.find((p) => {
      try { return fs.existsSync(path.join(p, "index.html")); } catch { return false; }
    });
    if (!distPath) {
      distPath = path.join(process.cwd(), "dist");
      console.warn(`[Server] Warning: dist/index.html not found in candidates ${candidates.join(", ")}, falling back to ${distPath}`);
    } else {
      console.log(`[Server] Serving static frontend from ${distPath}`);
    }
    app.use(express.static(distPath));
    // SPA fallback must not intercept /api routes (already mounted), so use middleware that checks path
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      const indexFile = path.join(distPath, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Frontend build not found. Run npm run build.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Motel Management System server listening on http://0.0.0.0:${PORT}`,
    );
  });
}

startServer();
