# Sapience.fun

Prediction-style markets UI with wallet login, points ledger, leaderboard, and a small GraphQL API. Built for **[sapience.fun](https://sapience.fun)**.

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
| `VITE_GQL_URL` | Vite client | GraphQL endpoint (default `http://localhost:4000/`). **Required in production** builds (e.g. `https://api.sapience.fun/graphql`). |
| `GQL_PORT` | `graphql-server.js` | Listen port (default `4000`). |
| `KALSHI_KEY_ID`, `KALSHI_PRIVATE_KEY` | `kalshi-proxy.cjs` | Kalshi signing (PEM with `\n` for newlines in `.env.local`). |

Vite only exposes variables prefixed with **`VITE_`**.

## Project structure (high level)

```
src/
  components/     # Trade navbar, beta banner, access modal, …
  context/        # walletAuth, theme
  hooks/          # useWalletBalance
  pages/
    buy/market.jsx
    leaderboard/
    profile/
    comingsoon/   # /access landing + MetaMask connect
  utils/          # pointsLedger, graphqlClient, accessGate
graphql-server.js # Apollo + sapience-db.json
kalshi-proxy.cjs  # Express proxy for Kalshi + Manifold helper routes
```

## Beta access code (Markets)

New wallets hitting **Markets** may be prompted for a **6-character** code once per address. Allowed addresses are stored under `localStorage` key `sapience_beta_access_wallets`.

- **Change the code** → `src/utils/accessGate.js` (`BETA_ACCESS_CODE`).
- **Reset for testing** → remove `sapience_beta_access_wallets` in DevTools (or clear that key only).

## Production build

```bash
VITE_GQL_URL=https://your-api.example.com/graphql npm run build
```

Deploy the **`dist/`** folder to your static host (Netlify, Vercel, Cloudflare Pages, etc.). Run **GraphQL** (and optional Kalshi proxy) on a server or PaaS; point `VITE_GQL_URL` at the public HTTPS URL.

## License

Private / all rights reserved unless you add an explicit `LICENSE` file.

---

**Sapience.fun** — experimental beta; balances and markets are for demonstration unless you wire real settlement.
