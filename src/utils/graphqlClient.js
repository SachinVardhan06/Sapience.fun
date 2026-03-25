/**
 * Minimal fetch-based GraphQL client.
 * Dev: Apollo standalone on port 4000 (POST to /). Prod: set VITE_GQL_URL, e.g. https://api.sapience.fun/graphql
 */

const GQL_URL = import.meta.env.VITE_GQL_URL || 'http://localhost:4000/'

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
