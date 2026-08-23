# Supabase Database Setup — Fullstack + Dynamic Data

This project now supports **dual database mode** and **fullstack deployment with dynamic Supabase data**:

- **Local MySQL** (XAMPP, `DB_HOST`…) — for offline development
- **Supabase Postgres** (Transaction Pooler via `SUPABASE_DB_URL` or `DATABASE_URL`) — for production/fullstack

The server automatically detects `SUPABASE_DB_URL`/`DATABASE_URL` and switches to Postgres (`pg`); otherwise it uses MySQL. SQL dialect differences (`?` vs `$1`, `INSERT IGNORE`, `DATE_FORMAT`, `CURDATE()` …) are translated transparently, so all API routes work with Supabase without code changes.

## Quick Start — Supabase as Primary DB

### Option A: SQL Editor (manual)
1. Open `supabase/schema.sql` and run the complete file in **Supabase SQL Editor**.
2. Confirm `public.roles` exists:
```sql
select id, name from public.roles order by name;
```

### Option B: Script (recommended, transactional)
Copy the **Transaction pooler** connection string from Supabase Dashboard → **Connect** → **Transaction pooler** → **Nodejs**:

```powershell
$env:SUPABASE_DB_URL = "postgres://postgres.cnudfdpdyrplsqwmvolu:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
npm run supabase:setup
Remove-Item Env:SUPABASE_DB_URL
```

The script verifies core tables `roles, users, rooms, guests, system_settings` and logs success.

### Environment Variables (Production)

Set these in Railway / Render / Vercel / Netlify dashboard (NOT committed):

```env
# Required for Supabase Postgres mode
SUPABASE_DB_URL=postgres://postgres.[ref]:[password]@aws-0-...pooler.supabase.com:6543/postgres?pgbouncer=true
# Or DATABASE_URL=...

# Supabase REST / Auth (health check + optional realtime)
SUPABASE_URL=https://cnudfdpdyrplsqwmvolu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_SUPABASE_URL=https://cnudfdpdyrplsqwmvolu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
# New publishable key format also supported: VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# App
NODE_ENV=production
PORT=3000
JWT_SECRET=your-long-random-secret-keep-same-across-restarts
APP_URL=https://your-app.up.railway.app
VITE_API_URL=  # leave empty for fullstack single-origin, or set to backend URL for split frontend (Netlify→Railway)

# MySQL fallback (ignored when SUPABASE_DB_URL is set)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=motel_management
```

## Fullstack Integration — How Dynamic Supabase Data Flows

```
Browser (React + Vite) ──fetch /api/*──► Express (server.ts)
                                          ├─► health /api/health  ──► Supabase REST check + DB probe
                                          ├─► all CRUD routes     ──► dbAll/dbGet/dbRun (pg or mysql)
                                          └─► static dist/ (vite frontend)  ──► SPA fallback
Postgres (Supabase Pooler) ◄──────────────────── pg Pool ───────────────────────┘
Supabase REST (optional realtime) ◄──── @supabase/supabase-js (src/lib/supabaseClient.ts)
```

- **Same-origin fullstack** (Railway/Render/Docker): Build `npm run build` creates `dist/index.html` + `dist/server.cjs`. `npm start` serves both API and frontend from one container. `VITE_API_URL` left empty → client uses relative `/api/*`.
- **Split** (Netlify frontend + Railway backend): Set `VITE_API_URL=https://your-backend.up.railway.app` so `src/api/client.ts` resolves to absolute backend. `/api` proxy in `netlify.toml` is uncommented when using split.

Health diagnostics: `GET /api/health` returns `{ supabase: {configured, reachable, schemaAvailable}, db: {connected, provider, detail} }` — use it to verify dynamic wiring.

## Deployment Presets

- **Railway (recommended fullstack)**: `railway.json` uses `npm run build` + `npm start`, healthcheck `/api/health`, `NIXPACKS` auto-detects Node. Just set env vars and deploy.
- **Render**: Build `npm run build`, Start `npm start`, add `SUPABASE_DB_URL`, set `NODE_ENV=production`.
- **Netlify (split)**: Uncomment `[[redirects]] from = "/api/*"` in `netlify.toml` to proxy to Railway backend.
- **Vercel (static)**: Keep empty `VITE_API_URL` for fullstack proxy, or set `VITE_API_URL` to Railway for split. SPA fallback handled in `vercel.json`.

## Troubleshooting

- `Database bootstrap error` on start → check `SUPABASE_DB_URL` format (must include `?pgbouncer=true` for pooler) and firewall/SSL.
- `Supabase endpoint could not be reached` → verify `SUPABASE_URL` and anon/publishable key.
- `Access-Control-Allow-Origin` errors in split mode → set `APP_URL`/`FRONTEND_URL` and/or `CORS_ALLOW_ALL=true` temporarily.

