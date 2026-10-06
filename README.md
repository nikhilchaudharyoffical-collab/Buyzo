# Buyzo (Dropcart Store) — Deployment Guide

Is repo mein 3 hisse hain:
- `dropcart-store/` — React + Vite frontend (yeh Vercel pe jaayega)
- `api-server/` — Express backend (yeh Render pe jaayega)
- `lib/` — shared code jo dono use karte hain (db schema, API types)

## Step 1 — Database banao (Neon ya Supabase, dono free)

1. https://neon.tech (ya supabase.com) pe free account banao
2. Naya Postgres project/database banao
3. `DATABASE_URL` connection string copy kar lo (postgres://... se shuru hogi)

Phir apne computer pe (ya Vercel/Render ke build step se pehle) schema push karo:

```bash
cd lib/db
DATABASE_URL="tumhari-connection-string" pnpm push
```

Isse `products`, `orders`, aur `analytics` tables ban jayengi.

## Step 2 — Backend deploy karo (Render.com, free tier)

1. https://render.com pe account banao, GitHub se ye repo connect karo
2. "New Web Service" → is repo ko select karo
3. `render.yaml` already configured hai (Render usse auto-detect kar lega) — ya manually:
   - Build command: `corepack enable && pnpm install --frozen-lockfile=false && pnpm --filter ./api-server run build`
   - Start command: `node api-server/dist/index.mjs`
4. Environment variables set karo (Render dashboard mein):
   - `DATABASE_URL` — Step 1 wali connection string
   - `ADMIN_USERNAME` — apna admin login username (jo bhi chaho)
   - `ADMIN_PASSWORD` — apna admin login password
   - `SESSION_SECRET` — koi bhi lamba random string (e.g. `openssl rand -hex 32` se generate kar sakte ho)
   - `NODE_ENV` — `production`
5. Deploy hone do. Deploy hone ke baad tumhe ek URL milega jaisे `https://buyzo-api.onrender.com`

## Step 3 — Frontend deploy karo (Vercel)

1. `vercel.json` file mein `YOUR-BACKEND-URL.onrender.com` ko Step 2 wale actual Render URL se replace karo:

```json
"destination": "https://buyzo-api.onrender.com/api/:path*"
```

2. Vercel pe naya project banao, is repo ko import karo
3. Vercel Project Settings mein:
   - Framework Preset: Vite
   - Build Command: `pnpm --filter ./dropcart-store run build` (ya `vercel.json` se auto)
   - Output Directory: `dropcart-store/dist`
4. Deploy karo

`vercel.json` mein jo rewrite hai, wo `/api/*` calls ko automatically Render backend tak forward kar dega — isse admin login (jo cookies use karta hai) bhi sahi kaam karega, kyunki browser ko lagega sab kuch same domain pe hai.

## Step 4 — Test karo

- Store homepage khulni chahiye aur ek default product (PulseWatch Pro) dikhna chahiye
- `/admin` pe jaake apna `ADMIN_USERNAME`/`ADMIN_PASSWORD` se login karo — dashboard khulna chahiye

## Note — Clerk Authentication

Is code mein `@clerk/react` aur `@clerk/express` integrate hain, lekin **admin dashboard login Clerk pe depend nahi karta** — woh apna khud ka simple username/password + cookie session use karta hai (Step 2 ke env vars se). Agar Clerk (social login jaisa kuch) chahiye future mein, toh `CLERK_SECRET_KEY` aur `CLERK_PUBLISHABLE_KEY` env vars add karne honge — abhi ke liye optional hai aur inke bina bhi sab kaam karega.

## Local development

```bash
# Root se
pnpm install

# Backend chalane ke liye (alag terminal)
cd api-server
PORT=8080 DATABASE_URL="..." ADMIN_USERNAME=admin ADMIN_PASSWORD=admin SESSION_SECRET=dev pnpm run dev

# Frontend chalane ke liye (alag terminal)
cd dropcart-store
pnpm run dev
```
