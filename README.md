# Sapience.fun

Prediction-style markets UI with wallet login, points ledger, leaderboard, and a small GraphQL API. The **app** (markets, BTC 5m, profile, leaderboard) is intended for **[app.sapience.fun](https://app.sapience.fun)**; marketing can live on the root domain.

## Features

- **Wallet auth** — MetaMask (EIP-1193 / EIP-6963) with `personal_sign` on connect; session restored via `eth_accounts`.
- **Markets** — Kalshi (via local proxy), Manifold Markets API, or demo data; filters, infinite scroll, YES/NO picks and stake flow.
- **Points** — Per-wallet balance in `localStorage`, synced to GraphQL when the server is running; navbar + profile show live balance.
- **Leaderboard & profile** — Rankings and prediction history; merges GraphQL + local data when offline.
- **Themes** — Light / dark with persistence (`sapience_theme` in `localStorage`).
- **Beta access** — First visit to **Markets** per wallet can require a 6-character code (see configuration below).

## Tech stack

| Layer | Choice |
|--------|--------|
| UI | React 19, React Router 7, Tailwind CSS 4 |
| Build | Vite 8 |
| API | Apollo Server (`graphql-server.js`), JSON file DB (`sapience-db.json`) |
| Markets proxy | Express (`kalshi-proxy.cjs`, port `3001`) |

## Prerequisites

- **Node.js** 20+ recommended  
- **MetaMask** (or compatible wallet that exposes MetaMask-like API) for `/access` login  
- For live Kalshi data: valid **Kalshi API** credentials in `.env.local` (optional)

## Quick start

```bash
git clone https://github.com/SachinVardhan06/Sapience.fun.git
cd Sapience.fun   # or my-react-app if that is your folder name
npm install
```

Copy environment template and adjust if needed:

```bash
cp .env.example .env.local
```

Start **GraphQL + Kalshi proxy + Vite** together:

```bash
npm run dev
```

| URL | Service |
|-----|---------|
| [http://localhost:5173](http://localhost:5173) | Vite app |
| [http://localhost:4000/](http://localhost:4000/) | GraphQL (POST JSON body) |
| [http://localhost:3001](http://localhost:3001) | Kalshi / Manifold proxy |

Open the app → **Login with MetaMask** on `/access` → you’ll land on **Markets** (`/prediction`).

### Port 4000 already in use

The GraphQL server will try the next free port and log a warning. Set `VITE_GQL_URL` in `.env.local` to match (see `.env.example`).

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | `graphql-server.js` + `kalshi-proxy.cjs` + Vite (concurrently) |
| `npm run gql` | Apollo server only |
| `npm run proxy` | Kalshi proxy only |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | ESLint |

## Environment variables

See **`.env.example`**. Common entries:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `VITE_APP_ORIGIN` | Vite client | Optional. Canonical site URL; defaults to `https://app.sapience.fun` in production builds if unset. |
| `VITE_GQL_URL` | Vite client | GraphQL endpoint: dev default `http://localhost:4000/`. **Production:** `https://api.sapience.fun/` (POST to origin root). If omitted in prod build, client defaults to that URL. |
| `VITE_KALSHI_PROXY_URL` | `market.jsx` | Full Kalshi markets URL. Dev default `http://localhost:3001/api/kalshi/...`. **Set in production** to your hosted proxy (same host as API or dedicated). |
| `GQL_PORT` | `graphql-server.js` | Listen port (default `4000`). |
| `DATABASE_URL` | `graphql-server.js` | **Recommended production:** PostgreSQL connection string. Tables auto-created; survives redeploys. Use provider backups. |
| `DATABASE_SSL` | `graphql-server.js` | Set `0` or `false` for local Postgres without TLS (default: SSL on for remote). |
| `SAPIENCE_DB_DIR` or `SAPIENCE_DB_PATH` | `graphql-persist.mjs` | **If no `DATABASE_URL`:** persistent path for `sapience-db.json` (e.g. Render Disk). |
| `KALSHI_KEY_ID`, `KALSHI_PRIVATE_KEY` | `kalshi-proxy.cjs` | Kalshi signing (PEM with `\n` for newlines in `.env.local`). |

Vite only exposes variables prefixed with **`VITE_`**.

## Project structure (high level)

```
src/
  config/         # site origin (app.sapience.fun)
  components/     # Trade navbar, beta banner, access modal, …
  context/        # walletAuth, theme
  hooks/          # useWalletBalance
  pages/
    buy/market.jsx
    leaderboard/
    profile/
    comingsoon/   # /access landing + MetaMask connect
  utils/          # pointsLedger, graphqlClient, accessGate
graphql-server.js # Apollo
graphql-persist.mjs # Postgres (DATABASE_URL) or JSON file
kalshi-proxy.cjs  # Express proxy for Kalshi + Manifold helper routes
```

## Beta access code (Markets)

New wallets hitting **Markets** may be prompted for a **6-character** code once per address. Allowed addresses are stored under `localStorage` key `sapience_beta_access_wallets`.

- **Change the code** → `src/utils/accessGate.js` (`BETA_ACCESS_CODE`).
- **Reset for testing** → remove `sapience_beta_access_wallets` in DevTools (or clear that key only).

## Production build (app.sapience.fun)

**Step-by-step (Netlify + Render + DNS):** see **[DEPLOY-EASY.md](./DEPLOY-EASY.md)**. **Durable user data:** see **[docs/DATA-RESILIENCE.md](./docs/DATA-RESILIENCE.md)** (Postgres vs disk).

Host the built SPA at **`https://app.sapience.fun`** (DNS `CNAME` / custom domain on Netlify, Vercel, etc.). `vite.config.js` uses default `base: '/'`, which is correct for a subdomain root.

```bash
VITE_GQL_URL=https://api.sapience.fun/ \
VITE_KALSHI_PROXY_URL=https://your-proxy.example.com/api/kalshi/markets?limit=50&status=open \
npm run build
```

- **`VITE_APP_ORIGIN`** — optional; if omitted, production builds assume `https://app.sapience.fun` (see `src/config/site.js`).
- Deploy the **`dist/`** folder to the **app** host.
- Run **GraphQL** at **`https://api.sapience.fun/`** (custom domain on the same service that runs `node graphql-server.js`). Run the **Kalshi proxy** on the same host or another URL; allow **CORS** from `https://app.sapience.fun` if the browser reports blocked requests.

## License

Private / all rights reserved unless you add an explicit `LICENSE` file.

---

**Sapience.fun** — experimental beta; balances and markets are for demonstration unless you wire real settlement.
