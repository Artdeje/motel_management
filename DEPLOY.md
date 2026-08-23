# Deploy + MySQL → Supabase seed

## 1. Seed live data from XAMPP MySQL into Supabase

Your local MySQL (`motel_management`) currently holds **~756 rows / 36 tables**.  
Copy them to Supabase once, then run the app against Supabase in production.

### Prerequisites
1. XAMPP MySQL **running** (port 3306).
2. Supabase project open → **Project Settings → Database**.
3. Copy **Transaction pooler** connection URI (port **6543**, includes `?pgbouncer=true`).
4. Reset DB password if you don’t have it.

### Commands (PowerShell)

```powershell
cd C:\Users\Dominus\Downloads\motel_management

# Set pooler URL for this session only (do not commit the password)
$env:SUPABASE_DB_URL = "postgres://postgres.cnudfdpdyrplsqwmvolu:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Preview counts only
npm run db:seed-supabase -- --dry-run

# First full seed (keeps existing Supabase rows, inserts missing)
npm run db:seed-supabase

# Or wipe Supabase public tables then re-copy everything from MySQL
npm run db:seed-supabase -- --force

Remove-Item Env:SUPABASE_DB_URL
```

Also available:
- `npm run supabase:setup` — schema + seed if empty  
- `npm run supabase:migrate` — legacy SQLite → Supabase  

After seed, set the same `SUPABASE_DB_URL` on the host so the app uses Postgres instead of local MySQL.

---

## 2. Recommended deploy: Railway (fullstack)

One service serves **API + Vite build** (`npm start` → `dist/server.cjs`).

1. Push repo to GitHub.
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**.
3. **Variables** (required):

| Variable | Value |
|---|---|
| `SUPABASE_DB_URL` | Transaction pooler URI |
| `SUPABASE_URL` | `https://cnudfdpdyrplsqwmvolu.supabase.co` |
| `SUPABASE_ANON_KEY` | your anon JWT |
| `VITE_SUPABASE_URL` | same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` | public key |
| `JWT_SECRET` | long random string (keep stable) |
| `NODE_ENV` | `production` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | for OTP email |
| `CURRENCY` / `CURRENCY_SYMBOL` | e.g. `RWF` / `Frw` |
| `APP_URL` | your Railway public URL after first deploy |

4. Build/start already in `railway.json`:
   - Build: `npm run build`
   - Start: `npm start`
   - Health: `/api/health`
5. Open `https://YOUR-APP.up.railway.app/api/health`  
   Expect: `"db":{"connected":true,"provider":"supabase-postgres (pg)"}`.
6. Login with a user that was migrated (e.g. `admin` / your MySQL password).

Leave `VITE_API_URL` **empty** on Railway (same origin).

---

## 3. Optional: Netlify frontend + Railway backend

- **Railway**: same as above (API only still works; it also serves UI).
- **Netlify**: build `npm run build`, publish `dist`.
- Netlify env: `VITE_API_URL=https://YOUR-RAILWAY.up.railway.app` + Supabase `VITE_*` keys.
- Uncomment `/api/*` proxy in `netlify.toml` pointing at Railway.

Static Netlify **alone** cannot run Express or MySQL — backend must be Railway/Render/Docker.

---

## 4. Docker (any VPS)

```bash
docker build -t motel .
docker run -p 3000:3000 --env-file .env.production motel
```

`.env.production` must include `SUPABASE_DB_URL`, `JWT_SECRET`, `NODE_ENV=production`, SMTP, etc.

---

## 5. Local production smoke test

```powershell
# After seed, point local app at Supabase
$env:SUPABASE_DB_URL = "postgres://..."
$env:NODE_ENV = "production"
npm run build
npm start
# http://localhost:3000/api/health
# http://localhost:3000  → login
```

---

## 6. Checklist before go-live

- [ ] MySQL → Supabase seed verified (counts match)
- [ ] `/api/health` shows `db.connected: true` and `supabase.reachable: true`
- [ ] OTP email works (SMTP app password)
- [ ] `JWT_SECRET` set and not rotated casually
- [ ] No secrets committed (`.env` is gitignored)
- [ ] Railway/Render healthcheck `/api/health` green
