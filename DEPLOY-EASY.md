# Easy deploy: app.sapience.fun (markets + full app)

Follow these steps in order. **Time:** about 30–60 minutes the first time.

You will use:
- **GitHub** — store your code  
- **Netlify** (or Vercel) — host the React app at `app.sapience.fun`  
- **Render** (or Railway / a VPS) — host GraphQL + optional Kalshi proxy at `api.sapience.fun`  
- **Your domain DNS** — point `app` and `api` subdomains  

---

## 0. Before you start

1. Code is in a **GitHub repo** (push this project if needed).  
2. You can log in to **Netlify**, **Render**, and your **DNS** (Cloudflare, Namecheap, GoDaddy, etc.).  
3. You own **sapience.fun** and can add DNS records.

---

## Simplified checklist — do these in order

Goal: **UI** at `https://app.sapience.fun` · **GraphQL** at `https://api.sapience.fun/` (the app sends **POST** requests with JSON to that URL — no `/graphql` path).

### A. Run `node graphql-server.js` on Render (Web Service)

1. Open **[dashboard.render.com](https://dashboard.render.com)** and log in.  
2. Click **New +** (top right) → **Web Service**.  
3. **Connect** your **GitHub** account if asked, then **select this repository**.  
4. Fill in:

   | Setting | What to enter |
   |--------|----------------|
   | **Name** | e.g. `sapience-api` |
   | **Region** | Closest to your users |
   | **Branch** | `main` (or your default branch) |
   | **Root Directory** | *(leave empty)* |
   | **Runtime** | **Node** |
   | **Build Command** | `npm install` |
   | **Start Command** | `node graphql-server.js` |

5. Scroll to **Environment** (or **Advanced**). Add variables if you use Postgres (see §1C below): **`DATABASE_URL`** = your Postgres connection string.  
6. Click **Create Web Service**. Wait until status is **Live** (build + start can take a few minutes).  
7. Note the temporary URL, e.g. `https://sapience-api.onrender.com` — GraphQL works at the **root** of that URL (same as local `http://localhost:4000/`).

### B. Add custom domain `api.sapience.fun` on Render

1. In Render, open **this Web Service** (the one running `graphql-server.js`).  
2. Go to **Settings** in the left sidebar.  
3. Find **Custom Domains** → **Add Custom Domain**.  
4. Type **`api.sapience.fun`** → confirm.  
5. Render will show **DNS instructions**: usually a **CNAME** where **name/host** is `api` and **value/target** is something like `sapience-api.onrender.com` (Render shows the exact target — **copy it**).

### C. DNS: point `api` to Render

1. Log in where **DNS for `sapience.fun`** is managed (Cloudflare, Namecheap, Google Domains, registrar, etc.).  
2. **Add a DNS record:**

   | Type | Name / Host | Value / Target / Points to |
   |------|-------------|----------------------------|
   | **CNAME** | `api` | *(paste the value Render gave you, e.g. `xxxx.onrender.com`)* |

   Some panels want the full name `api.sapience.fun` — others only want `api`. TTL: **Auto** or **300** is fine.

3. Save. **Wait** 5–30 minutes (sometimes up to 48h) for DNS + SSL. In Render, the domain should show **Verified** when ready.

### D. Netlify: build the app

1. Open **[app.netlify.com](https://app.netlify.com)** → log in.  
2. **Add new site** → **Import an existing project** → **GitHub** → authorize → pick **this repo**.  
3. Configure build:

   | Setting | Value |
   |--------|--------|
   | **Build command** | `npm run build` |
   | **Publish directory** | `dist` |

4. **Before** the first deploy, open **Show advanced** / **Environment variables** (or add them right after: **Site configuration → Environment variables**).  
5. **GraphQL:** production builds **always** call **`https://api.sapience.fun/`** (`src/config/site.js` + `graphqlClient.js`). You do **not** need `VITE_GQL_URL` on Netlify. **Remove** it if it still points at an old host (e.g. `*.onrender.com`).

   Add for **Production** as needed:

   | Key | Value |
   |-----|--------|
   | **`VITE_KALSHI_PROXY_URL`** | Your hosted Kalshi proxy URL (see §2) |
   | **`VITE_APP_ORIGIN`** | `https://app.sapience.fun` *(optional)* |

6. **Deploy site**. After it finishes, every change to `VITE_*` needs a **new deploy**: **Deploys** → **Trigger deploy** → **Clear cache and deploy site**.

### E. Custom domain `app.sapience.fun` on Netlify

1. **Netlify** → your site → **Domain management** → **Add custom domain** → enter **`app.sapience.fun`**.  
2. Netlify shows a **CNAME** target like `your-site-name.netlify.app`.  
3. In the **same DNS zone** for `sapience.fun`, add:

   | Type | Name | Target |
   |------|------|--------|
   | **CNAME** | `app` | *(what Netlify shows)* |

4. Wait for Netlify to provision **HTTPS**.

### F. Quick check

- **`https://api.sapience.fun/`** in the browser may show nothing useful or an error for GET — **normal**. The app uses **POST**.  
- Open **`https://app.sapience.fun`**, connect wallet, open **DevTools → Network**, confirm requests go to **`https://api.sapience.fun/`** and return **200** (not CORS errors).

---

## 1. Deploy the API (GraphQL) — `api.sapience.fun` (detail)

The React app calls this for wallets, leaderboard, predictions.

### A. Create a Web Service on Render

1. Go to [render.com](https://render.com) → sign up / log in.  
2. **New +** → **Web Service**.  
3. Connect your **GitHub** repo and select this project.  
4. Settings:

| Field | Value |
|--------|--------|
| **Name** | `sapience-api` (or any name) |
| **Region** | Choose closest to users |
| **Branch** | `main` (or your default branch) |
| **Root directory** | Leave empty (repo root) |
| **Runtime** | `Node` |
| **Build command** | `npm install` |
| **Start command** | `node graphql-server.js` |

5. **Instance type** — Free is OK to try; use paid for production traffic.  
6. **Advanced → Add environment variable:**  
   - `NODE_VERSION` = `20` (or `22`) if Render asks for a Node version.

7. Click **Create Web Service** and wait until it shows **Live**.  
8. Copy the URL Render gives you, e.g. `https://sapience-api.onrender.com`.

### B. Put it on `api.sapience.fun`

1. In Render → your service → **Settings** → **Custom Domains**.  
2. Add **`api.sapience.fun`**.  
3. Render shows a **CNAME** target (e.g. `sapience-api.onrender.com`).  
4. In your DNS provider, add:

| Type | Name | Target |
|------|------|--------|
| **CNAME** | `api` | *(what Render shows)* |

5. Wait for DNS + SSL (often 5–30 minutes).  
6. Your GraphQL URL is **`https://api.sapience.fun/`** (POST body, same as local Apollo — no `/graphql` path). The production SPA is wired to this URL in code.

**Check:** In browser open `https://api.sapience.fun/` — you may see a simple message or 400; that’s OK. The app uses **POST** with JSON.

### C. Keep user data after redeploy (do this)

Render **wipes the container disk** on every deploy. Without the steps below, **server-side** wallets and predictions disappear (browser `localStorage` can still look “fine” but leaderboard sync breaks).

#### Option A — **PostgreSQL** (recommended)

1. Render → **New +** → **PostgreSQL** → create a database (same region as your API).  
2. Copy the **Internal Database URL** (or External if the API is not on Render).  
3. Open your **GraphQL Web Service** → **Environment** → add:

| Key | Value |
|-----|--------|
| `DATABASE_URL` | *(paste the Postgres URL)* |

4. **Remove** `SAPIENCE_DB_DIR` / `SAPIENCE_DB_PATH` if you had them (optional; `DATABASE_URL` wins).  
5. Redeploy the GraphQL service.  
6. In **Logs**, you should see: `[apollo] Persistence: PostgreSQL (DATABASE_URL)`.  
7. In the Postgres dashboard, enable **backups** if available.

Tables `wallets` and `predictions` are created automatically on startup.

#### Option B — **JSON on a persistent disk** (no Postgres)

1. GraphQL service → **Disks** → add disk, mount e.g. **`/data`**.  
2. **Environment:** `SAPIENCE_DB_DIR=/data` (or `SAPIENCE_DB_PATH=/data/sapience-db.json`).  
3. Redeploy. Logs: `[apollo] Database file: /data/sapience-db.json`.

Disks usually need a **paid** Render instance — check current Render docs.

More detail: **`docs/DATA-RESILIENCE.md`** in this repo.

---

## 2. Deploy the Kalshi proxy (optional)

Only if you want **Kalshi** markets in production. You need `KALSHI_KEY_ID` and `KALSHI_PRIVATE_KEY`.

1. Render → **New +** → **Web Service** (second service).  
2. Same repo, same build: `npm install`.  
3. **Start command:** `node kalshi-proxy.cjs`  
4. **Environment variables** (Render → Environment):

   - `KALSHI_KEY_ID` = your Kalshi key id  
   - `KALSHI_PRIVATE_KEY` = full PEM, use `\n` for newlines inside the value  

5. After deploy, note the URL, e.g. `https://sapience-kalshi.onrender.com`.  
6. Optional: add custom domain `kalshi.sapience.fun` the same way as API, or use the `onrender.com` URL in env (next step).

If you skip this, **Manifold** markets can still work; Kalshi will fail until the proxy exists.

---

## 3. Deploy the website (React app) — `app.sapience.fun`

### A. Netlify

1. Go to [netlify.com](https://www.netlify.com) → log in.  
2. **Add new site** → **Import an existing project** → **GitHub** → pick this repo.  
3. Build settings:

| Field | Value |
|--------|--------|
| **Build command** | `npm run build` |
| **Publish directory** | `dist` |

4. **Do not click Deploy yet** — add environment variables first (next section).  
5. **Site settings → Environment variables → Add a variable** (for **Production**):

| Key | Value (replace with yours) |
|-----|----------------------------|
| `VITE_KALSHI_PROXY_URL` | `https://YOUR-KALSHI-SERVICE.onrender.com/api/kalshi/markets?limit=50&status=open` *(or your real proxy URL)* |
| `VITE_APP_ORIGIN` | `https://app.sapience.fun` *(optional)* |

*(GraphQL uses **`https://api.sapience.fun/`** in production builds automatically — do not set `VITE_GQL_URL` unless you use it for local dev in `.env.local`.)*

6. **Save**, then **Deploy site** (or **Trigger deploy** → **Clear cache and deploy** if you already deployed).

7. **Domain settings → Add custom domain** → `app.sapience.fun`.  
8. Netlify shows DNS instructions. Add:

| Type | Name | Value |
|------|------|--------|
| **CNAME** | `app` | `xxxx.netlify.app` *(Netlify shows the exact target)* |

9. Wait for **HTTPS** certificate (Netlify does this automatically).

### B. Vercel (alternative)

Same idea: import repo, **Build** = `npm run build`, **Output** = `dist`, add the same `VITE_*` env vars, then add domain `app.sapience.fun` and the CNAME Vercel gives you.

---

## 4. DNS summary (example)

| Host | Type | Points to |
|------|------|-----------|
| `app` | CNAME | Your Netlify (or Vercel) subdomain |
| `api` | CNAME | Your Render API hostname |

Do **not** set both to the same service unless you know what you’re doing; API and app are different hosts.

---

## 5. After every env change

Netlify/Vercel **rebuild** the site after you change `VITE_*` variables (they are baked in at build time).

- Netlify: **Deploys** → **Trigger deploy** → **Clear cache and deploy**.

---

## 6. Quick test checklist

1. Open **`https://app.sapience.fun`**.  
2. **Connect wallet** → go to **Markets** (`/prediction`).  
3. Open **DevTools → Network**:  
   - Requests to **`https://api.sapience.fun/`** (GraphQL POST) should be **200** (not blocked by CORS).  
   - Kalshi request should hit your **`VITE_KALSHI_PROXY_URL`** if you use Kalshi.  
4. If you see **CORS errors**, the API must allow your app origin. Apollo’s standalone server uses `cors` with permissive defaults; if you put a reverse proxy in front, add headers there.

---

## 7. Common problems

| Problem | What to do |
|---------|------------|
| Blank page on refresh on `/prediction` | SPA fallback: Netlify `public/_redirects` should include `/* /index.html 200`. Redeploy. |
| `localhost` in Network tab | Kalshi: set `VITE_KALSHI_PROXY_URL` and redeploy. GraphQL should hit **`api.sapience.fun`** from the built bundle; if you still see a wrong host, clear Netlify **`VITE_GQL_URL`** (legacy) and redeploy. |
| Kalshi errors | Set `VITE_KALSHI_PROXY_URL` to the **public** proxy URL; keys must be set on **Render** for that service. |
| API sleeps on free Render | First request after idle can take ~50s; upgrade or use a keep-alive ping. |
| Data lost on every deploy | Set **`DATABASE_URL`** (Postgres, §1C) or a **disk** + `SAPIENCE_DB_DIR`. |

---

## 8. One-line recap

**DNS** `app` → Netlify (or Vercel) · **DNS** `api` → Render · **Build app** (GraphQL → `api.sapience.fun` in code; set `VITE_KALSHI_PROXY_URL` if needed) · **Redeploy** when env changes.

That’s the full path to run **markets on `app.sapience.fun`**.
