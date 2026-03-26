/**
 * Sapience GraphQL Server — Apollo Server 4
 *
 * Dev:   http://localhost:4000/graphql
 * Prod:  http://api.sapience.fun/graphql  (set PORT=80 on your VPS)
 *
 * Run standalone:  node graphql-server.js
 * Run with dev:    npm run dev  (concurrently handles it)
 */

import { ApolloServer }       from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createServer as createNetServer } from 'net'
import { join, dirname }      from 'path'
import { fileURLToPath }      from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_FILE   = join(__dirname, 'sapience-db.json')
/** Must match `BONUS_POINTS` in src/utils/pointsLedger.js */
const WALLET_START_PTS = 1000

// ─── JSON database ────────────────────────────────────────────────────────────
function readDB() {
  try {
    if (existsSync(DB_FILE)) return JSON.parse(readFileSync(DB_FILE, 'utf8'))
  } catch {}
  return { wallets: {}, predictions: [] }
}

function writeDB(db) {
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

// ─── Schema (SDL) ─────────────────────────────────────────────────────────────
const typeDefs = `#graphql
  type Wallet {
    address:          String!
    balance:          Int!
    totalPredictions: Int!
    totalStaked:      Int!
    totalRewards:     Int!
    createdAt:        String!
    updatedAt:        String!
  }

  type Prediction {
    id:          ID!
    wallet:      String!
    marketId:    String!
    marketTitle: String!
    side:        String!
    points:      Int!
    createdAt:   String!
  }

  type Query {
    "Get a single wallet by address"
    wallet(address: String!): Wallet

    "All wallets sorted by net profit vs 1k start (leaderboard)"
    wallets: [Wallet!]!

    "Predictions — optionally filtered by wallet address"
    predictions(wallet: String, limit: Int): [Prediction!]!
  }

  type Mutation {
    "Create or update wallet stats"
    upsertWallet(
      address:          String!
      balance:          Int!
      totalPredictions: Int!
      totalStaked:      Int!
      totalRewards:     Int!
    ): Wallet!

    "Save a prediction (idempotent — duplicate IDs are ignored)"
    savePrediction(
      id:          ID!
      wallet:      String!
      marketId:    String!
      marketTitle: String!
      side:        String!
      points:      Int!
    ): Prediction!
  }
`

// ─── Resolvers ────────────────────────────────────────────────────────────────
const resolvers = {
  Query: {
    wallet(_, { address }) {
      const db = readDB()
      return db.wallets[address.toLowerCase()] ?? null
    },

    wallets() {
      const db = readDB()
      return Object.values(db.wallets).sort((a, b) => {
        const pa = (a.balance ?? 0) - WALLET_START_PTS
        const pb = (b.balance ?? 0) - WALLET_START_PTS
        if (pb !== pa) return pb - pa
        return (b.balance ?? 0) - (a.balance ?? 0)
      })
    },

    predictions(_, { wallet, limit }) {
      const db  = readDB()
      let rows  = db.predictions
      if (wallet) rows = rows.filter(p => p.wallet === wallet.toLowerCase())
      rows = rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return limit ? rows.slice(0, limit) : rows
    },
  },

  Mutation: {
    upsertWallet(_, { address, balance, totalPredictions, totalStaked, totalRewards }) {
      const db  = readDB()
      const key = address.toLowerCase()
      const now = new Date().toISOString()
      db.wallets[key] = {
        address: key,
        balance,
        totalPredictions,
        totalStaked,
        totalRewards,
        createdAt: db.wallets[key]?.createdAt ?? now,
        updatedAt: now,
      }
      writeDB(db)
      return db.wallets[key]
    },

    savePrediction(_, { id, wallet, marketId, marketTitle, side, points }) {
      const db  = readDB()
      const key = wallet.toLowerCase()
      if (!db.predictions.find(p => p.id === id)) {
        db.predictions.push({
          id, wallet: key, marketId, marketTitle, side, points,
          createdAt: new Date().toISOString(),
        })
        writeDB(db)
      }
      return db.predictions.find(p => p.id === id)
    },
  },
}

// ─── Start ────────────────────────────────────────────────────────────────────
const server = new ApolloServer({ typeDefs, resolvers })

const PREFERRED = Number(process.env.GQL_PORT ?? 4000)

/** Pick first free port in [preferred, preferred + 14] so `npm run dev` survives a stuck node on 4000. */
async function pickListenPort(preferred) {
  for (let port = preferred; port < preferred + 15; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer()
      s.once('error', () => resolve(false))
      s.listen(port, () => {
        s.close(() => resolve(true))
      })
    })
    if (free) return port
    console.warn(`[apollo] Port ${port} in use, trying ${port + 1}…`)
  }
  throw new Error(
    `[apollo] No free port ${preferred}–${preferred + 14}. Stop the other process (Windows: netstat -ano | findstr :${preferred}) or set GQL_PORT.`,
  )
}

const PORT = await pickListenPort(PREFERRED)

const { url } = await startStandaloneServer(server, {
  listen: { port: PORT },
  context: async () => ({}),
})

console.log(`[apollo] GraphQL server ready at ${url}`)
if (PORT !== PREFERRED) {
  console.warn(
    `[apollo] Using port ${PORT} instead of ${PREFERRED}. Set VITE_GQL_URL=http://localhost:${PORT}/ in .env.local so the React app hits this server.`,
  )
}
