/**
 * Minimal fetch-based GraphQL client.
 * Production builds always POST to {@link DEFAULT_GQL_URL_PROD} (https://api.sapience.fun/) so
 * the live site is not overridden by a stale CI env (e.g. an old onrender URL).
 * Local dev: set VITE_GQL_URL or default http://localhost:4000/ (POST to /, no /graphql).
 */

import { DEFAULT_GQL_URL_PROD } from '../config/site.js'

const rawGql = import.meta.env.VITE_GQL_URL
const GQL_URL = import.meta.env.DEV
  ? (typeof rawGql === 'string' && rawGql.trim() !== ''
      ? rawGql.trim()
      : 'http://localhost:4000/')
  : DEFAULT_GQL_URL_PROD

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function fetchWallet(address) {
  const data = await gql(`
    query GetWallet($address: String!) {
      wallet(address: $address) {
        address balance totalPredictions totalStaked totalRewards createdAt updatedAt
      }
    }
  `, { address })
  return data.wallet
}

export async function fetchWallets() {
  const data = await gql(`
    query { wallets { address balance totalPredictions totalStaked totalRewards createdAt updatedAt } }
  `)
  return data.wallets
}

export async function fetchPredictions(wallet = null, limit = null) {
  const data = await gql(`
    query GetPredictions($wallet: String, $limit: Int) {
      predictions(wallet: $wallet, limit: $limit) {
        id wallet marketId marketTitle side points createdAt
      }
    }
  `, { wallet, limit })
  return data.predictions
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function upsertWallet({ address, balance, totalPredictions, totalStaked, totalRewards }) {
  const data = await gql(`
    mutation UpsertWallet(
      $address: String! $balance: Int! $totalPredictions: Int! $totalStaked: Int! $totalRewards: Int!
    ) {
      upsertWallet(
        address: $address balance: $balance totalPredictions: $totalPredictions
        totalStaked: $totalStaked totalRewards: $totalRewards
      ) { address balance totalPredictions totalStaked totalRewards createdAt updatedAt }
    }
  `, { address, balance, totalPredictions, totalStaked, totalRewards })
  return data.upsertWallet
}

export async function savePrediction({ id, wallet, marketId, marketTitle, side, points }) {
  const data = await gql(`
    mutation SavePrediction(
      $id: ID! $wallet: String! $marketId: String! $marketTitle: String! $side: String! $points: Int!
    ) {
      savePrediction(
        id: $id wallet: $wallet marketId: $marketId marketTitle: $marketTitle side: $side points: $points
      ) { id wallet marketId marketTitle side points createdAt }
    }
  `, { id, wallet, marketId, marketTitle, side, points })
  return data.savePrediction
}
