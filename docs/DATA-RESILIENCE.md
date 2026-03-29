# Storing user data safely (now → long term)

**API host:** run GraphQL at **`https://api.sapience.fun/graphql`** (DNS `api` → your Node host under **sapience.fun**). The production SPA on **`https://app.sapience.fun`** POSTs there (see `src/utils/graphqlClient.js`); `VITE_GQL_URL` is for local dev only (`.env.example`).

This app keeps **two layers** of data:

| Layer | Where | What | Survives redeploy? |
|--------|--------|------|---------------------|
| **Browser** | `localStorage` | Wallet points map, predictions list, BTC 5m picks | Yes (per device), until user clears site data |
| **Server** | GraphQL backend | Same wallets + predictions synced for leaderboard / multi-device | **Only if** you use durable storage below |

Redeploying the **Render web service** wipes the container disk. **JSON next to the code is not durable** unless that file lives on a **mounted disk**.

## Recommended: PostgreSQL (`DATABASE_URL`)

Best default for production:

1. Create a **managed Postgres** (e.g. **Render PostgreSQL**, Neon, Supabase, RDS).
2. Copy the **connection string** into your GraphQL service as **`DATABASE_URL`**.
3. Redeploy the GraphQL app — it will **create tables** on first start (`wallets`, `predictions`).
4. Turn on **automated backups** in the provider (Render/Neon/etc.).

Optional: **`DATABASE_SSL=0`** or **`false`** only for local Postgres without TLS.

## Fallback: JSON on a persistent disk

If you are not using Postgres yet:

1. Attach a **persistent disk** to the GraphQL service (e.g. Render Disk at `/data`).
2. Set **`SAPIENCE_DB_DIR=/data`** (or **`SAPIENCE_DB_PATH`** to a full file path).

Still **back up** that volume or export `sapience-db.json` periodically — disks can fail.

## Client-only data

Even with a healthy server, users can lose **local** data if they clear cookies/storage or use another browser. The server copy (Postgres or file) is the **source of truth** for cross-device leaderboard sync when the client successfully calls GraphQL.

## Security & privacy

- Treat **`DATABASE_URL`** as a secret; never commit it or expose it in the frontend.
- This stack is **play-money / demo-style**; for real money or regulated use you need legal review, stronger auth, and stricter retention policies.

## Summary

- **Goal “safe to the end”** → use **`DATABASE_URL`** (Postgres) + provider backups.
- **Disk + JSON** is OK for small projects but weaker than a real database.
