/**
 * Sapience GraphQL Server — Apollo Server 5
 *
 * Dev:   http://localhost:4000/
 * Prod:  **https://api.sapience.fun/** — attach this custom domain to the service running this file.
 *
 * Persistence (pick one for production safety):
 * - **PostgreSQL** — set `DATABASE_URL` (e.g. Render Postgres). Survives redeploys; best long-term.
 * - **JSON file** — default; use `SAPIENCE_DB_DIR` / `SAPIENCE_DB_PATH` on a persistent disk if no DB.
 *
 * Run standalone:  node graphql-server.js
 * Run with dev:    npm run dev  (concurrently handles it)
 */

import { ApolloServer } from '@apollo/server'
import { ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default'
import { startStandaloneServer } from '@apollo/server/standalone'
import { createServer as createNetServer } from 'net'
import { createPersistence } from './graphql-persist.mjs'

const persistence = await createPersistence()

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

const resolvers = {
  Query: {
    wallet(_, { address }) {
      return persistence.getWallet(address)
    },
    wallets() {
      return persistence.listWallets()
    },
    predictions(_, args) {
      return persistence.listPredictions(args)
    },
  },

  Mutation: {
    upsertWallet(_, args) {
      return persistence.upsertWallet(args)
    },
    savePrediction(_, args) {
      return persistence.savePrediction(args)
    },
  },
}

/** In production, default landing page is text-only; explicit plugin embeds Apollo Sandbox on GET /. */
const plugins =
  process.env.NODE_ENV === 'production'
    ? [ApolloServerPluginLandingPageProductionDefault({ embed: true })]
    : []

/** Apollo defaults introspection to off in production; Sandbox needs it to load the schema. Set GQL_DISABLE_INTROSPECTION=true to turn off. */
const introspection = process.env.GQL_DISABLE_INTROSPECTION !== 'true'

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins,
  introspection,
})

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
