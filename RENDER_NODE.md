# Deploy on Render (Node Environment)

This guide deploys the motel management app on **Render** using a **Node Web Service**.

---

## Architecture

```
User → Render (Node + Express) → Supabase Postgres
              ↓
         Serves React SPA + API
```

Render hosts both the frontend and backend in one service, just like Railway fullstack.

---

## Step 1: Push to GitHub

```powershell
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

---

## Step 2: Create Render Web Service

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Fill these settings:

| Setting | Value |
|---|---|
| **Name** | `motel-management` |
| **Runtime** | `Node` |
| **Region** | Choose closest to your users |
| **Branch** | `main` |
| **Build Command** | `npm run build` |
| **Start Command** | `npm start` |
| **Plan** | Free or paid |

5. Click **Advanced** and add environment variables below.

---

## Step 3: Add Environment Variables

In Render → your service → **Environment** tab, add:

| Variable | Value | Source |
|---|---|---|
| `NODE_ENV` | `production` |  |
| `PORT` | `3000` |  |
| `SUPABASE_DB_URL` | `postgresql://postgres.cnudfdpdyrplsqwmvolu:Artdeje%4012321%21@aws-1-eu-west-1.pooler.supabase.com:6543/postgres` | `.env` line 10 |
| `SUPABASE_URL` | `https://cnudfdpdyrplsqwmvolu.supabase.co` | `.env` line 9 |
| `SUPABASE_ANON_KEY` | copy full value | `.env` line 11 |
| `JWT_SECRET` | copy full value | `.env` line 34 |
| `SMTP_HOST` | `smtp.gmail.com` | `.env` line 27 |
| `SMTP_PORT` | `587` | `.env` line 28 |
| `SMTP_USER` | `artdeje1@gmail.com` | `.env` line 29 |
| `SMTP_PASS` | copy app password | `.env` line 30 |
| `SMTP_FROM` | `Grand Horizon Motel <artdeje1@gmail.com>` | `.env` line 31 |
| `CURRENCY` | `RWF` | `.env` line 17 |
| `CURRENCY_SYMBOL` | `Frw` | `.env` line 18 |
| `APP_URL` | leave empty; fill after deploy |  |

> No `VITE_API_URL` needed — Render serves frontend and backend from the same domain.

---

## Step 4: Deploy

1. Click **Create Web Service**
2. Render runs `npm run build` then `npm start`
3. Wait for build to finish (2–5 minutes)

---

## Step 5: Get Public URL

Render gives you a URL like:

```text
https://motel-management.onrender.com
```

1. Copy it
2. Go back to **Environment** tab
3. Add `APP_URL=https://motel-management.onrender.com`
4. Render redeploys automatically

---

## Step 6: Test

Open:

```text
https://motel-management.onrender.com/api/health
```

Expected:

```json
{
  "status": "ok",
  "db": { "connected": true, "provider": "supabase-postgres (pg)" }
}
```

Then open:

```text
https://motel-management.onrender.com
```

Log in with:
- Username: `admin`
- Password: `admin123`

You should receive the OTP email.

---

## Troubleshooting

### Build fails with `esbuild: command not found`

Already fixed. The build now uses `tsx scripts/build-server.ts` instead of the `esbuild` CLI.

If it still happens, check Render logs and make sure `package.json` has:

```json
"build": "vite build && tsx scripts/build-server.ts"
```

### Database shows MySQL instead of Supabase

`SUPABASE_DB_URL` is missing or incorrect. Copy it exactly from `.env` line 10.

### OTP email not sent

Check Render logs. `SMTP_PASS` must be a Gmail **App Password**, not your Gmail login password.

### Service sleeps on Free plan

Render Free services spin down after 15 minutes of inactivity. First request may take 30–60 seconds to wake up. Upgrade to paid for always-on.

---

## Optional: Custom Domain

1. Render → your service → **Settings** → **Custom Domain**
2. Add your domain (e.g. `app.yourmotel.com`)
3. Update DNS CNAME to Render target
4. Update `APP_URL` in Render environment variables

---

## Summary

| Platform | Role |
|---|---|
| **Render** | Hosts Node.js Express + React SPA |
| **Supabase** | Postgres database |
| **Gmail SMTP** | Sends OTP emails |
