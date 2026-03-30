/**
 * Sapience GraphQL Server — Apollo Server 5
 *
 * Dev:   http://localhost:4000/graphql  (GET / redirects here)
 * Prod:  **https://api.sapience.fun/graphql** — attach **api.sapience.fun** to this service.
 *
 * Persistence (pick one for production safety):
 * - **PostgreSQL** — set `DATABASE_URL` (e.g. Render Postgres). Survives redeploys; best long-term.
 * - **JSON file** — default; use `SAPIENCE_DB_DIR` / `SAPIENCE_DB_PATH` on a persistent disk if no DB.
 *
 * Run standalone:  node graphql-server.js
 * Run with dev:    npm run dev  (concurrently handles it)
 *
 * Read-only API (no Mutation in schema): GQL_DISABLE_MUTATIONS=true (breaks SPA GraphQL writes).
 *
 * Hide Mutation in introspection only (Sandbox/docs look query-only; POST mutations still work): default ON.
 * Show Mutation in Sandbox again: GQL_SHOW_MUTATIONS_IN_INTROSPECTION=true
 */

import { ApolloServer, HeaderMap } from '@apollo/server'
import { ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import bodyParser from 'body-parser'
import { parse as parseContentType } from 'content-type'
import cors from 'cors'
import finalhandler from 'finalhandler'
import http from 'http'
import { createServer as createNetServer } from 'net'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, parse as urlParse } from 'url'
import { createPersistence, WALLET_START_PTS } from './graphql-persist.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Load `.env.local` without dotenv (same idea as kalshi-proxy.cjs). Does not override existing env. */
function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvLocal()

const validCharset = /^utf-(8|((16|32)(le|be)?))$/i

/** HTTP path for GraphQL (must match production URL path). Override with GQL_HTTP_PATH=/other */
const GQL_HTTP_PATH = (process.env.GQL_HTTP_PATH || '/graphql').replace(/\/+$/, '') || '/graphql'

function normalizeReqPath(reqUrl) {
  const pathname = urlParse(reqUrl).pathname || '/'
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

function isGraphQLHttpPath(reqUrl) {
  return normalizeReqPath(reqUrl) === GQL_HTTP_PATH
}

const persistence = await createPersistence()

const mutationsDisabled = process.env.GQL_DISABLE_MUTATIONS === 'true'

function assertAdminPasscode(passcode) {
  const expected = process.env.SAPIENCE_ADMIN_PASSCODE?.trim()
  if (!expected) {
    throw new Error('Admin is not configured on this API (set SAPIENCE_ADMIN_PASSCODE).')
  }
  if (String(passcode || '') !== expected) {
    throw new Error('Invalid admin passcode.')
  }
}

/** Credit points without bumping totalRewards (admin / top-up). */
async function adminCreditWalletCore(address, amount) {
  const key = String(address || '').trim().toLowerCase()
  if (!key.startsWith('0x') || key.length < 10) throw new Error('Invalid wallet address.')
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid amount.')
  const w = await persistence.getWallet(key)
  if (!w) {
    return persistence.upsertWallet({
      address: key,
      balance: WALLET_START_PTS + amt,
      totalPredictions: 0,
      totalStaked: 0,
      totalRewards: 0,
    })
  }
  return persistence.upsertWallet({
    address: key,
    balance: w.balance + amt,
    totalPredictions: w.totalPredictions,
    totalStaked: w.totalStaked,
    totalRewards: w.totalRewards,
  })
}

/** Strip Mutation from introspection JSON so Apollo Sandbox does not list it; real mutation operations still execute. */
const hideMutationsFromIntrospection =
  process.env.GQL_SHOW_MUTATIONS_IN_INTROSPECTION !== 'true'

function stripMutationFromIntrospectionData(data) {
  if (!data || typeof data !== 'object') return
  if (Object.prototype.hasOwnProperty.call(data, '__schema') && data.__schema && typeof data.__schema === 'object') {
    const s = data.__schema
    if (s.mutationType != null) s.mutationType = null
    if (Array.isArray(s.types)) {
      s.types = s.types.filter((t) => !t || t.name !== 'Mutation')
    }
  }
  if (data.__type?.name === 'Mutation') {
    data.__type = null
  }
}

function apolloPluginStripMutationIntrospection() {
  return {
    async requestDidStart() {
      return {
        async willSendResponse(requestContext) {
          if (!hideMutationsFromIntrospection || mutationsDisabled) return
          const body = requestContext.response.body
          if (body?.kind !== 'single' || body.singleResult?.data == null) return
          stripMutationFromIntrospectionData(body.singleResult.data)
        },
      }
    },
  }
}

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

  type PrivateStake {
    id:        ID!
    wallet:    String!
    side:      String!
    points:    Int!
    createdAt: String!
  }

  type PrivateMarket {
    id:          ID!
    code:        String!
    creator:     String!
    title:       String!
    description: String!
    seedPoints:  Int!
    createdAt:   String!
    updatedAt:   String!
    closesAt:    String
    status:      String!
    outcome:     String
    resolvedAt:  String
    "When true, room is hidden from the public Markets list; join only via code or link."
    inviteCodeRequired: Boolean
    stakes:      [PrivateStake!]!
  }

  type PointRequest {
    id:            ID!
    wallet:        String!
    message:       String!
    status:        String!
    createdAt:     String!
    updatedAt:     String!
    grantedPoints: Int
  }

  type Query {
    "Get a single wallet by address"
    wallet(address: String!): Wallet

    "All wallets sorted by net profit vs 1k start (leaderboard)"
    wallets: [Wallet!]!

    "Predictions — optionally filtered by wallet address"
    predictions(wallet: String, limit: Int): [Prediction!]!

    "All private competition markets (optional status: open | resolved)"
    privateMarkets(status: String): [PrivateMarket!]!

    "Single private market by invite code"
    privateMarketByCode(code: String!): PrivateMarket

    "Pending / all point top-up requests (requires SAPIENCE_ADMIN_PASSCODE)"
    pointRequests(adminPasscode: String!, status: String): [PointRequest!]!
  }

  input PrivateStakeInput {
    id:        ID!
    wallet:    String!
    side:      String!
    points:    Int!
    createdAt: String!
  }
${
  mutationsDisabled
    ? ''
    : `
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

    "Create or replace a private market (full document — keep in sync with clients)"
    syncPrivateMarket(
      id:          ID!
      code:        String!
      creator:     String!
      title:       String!
      description: String!
      seedPoints:  Int!
      createdAt:   String!
      updatedAt:   String!
      closesAt:    String
      status:      String!
      outcome:     String
      resolvedAt:  String
      inviteCodeRequired: Boolean
      stakes:      [PrivateStakeInput!]!
    ): PrivateMarket!

    "Remove a private market (creator only). Returns true if a row was deleted."
    deletePrivateMarket(id: ID!, creator: String!): Boolean!

    "User submits a top-up request when balance is depleted (shown in admin panel)"
    submitPointRequest(wallet: String!, message: String): PointRequest!

    "Grant points and mark request fulfilled"
    fulfillPointRequest(adminPasscode: String!, id: ID!, points: Int!): PointRequest!

    "Dismiss a pending request without granting points"
    dismissPointRequest(adminPasscode: String!, id: ID!): PointRequest!

    "Direct credit any wallet (admin)"
    adminCreditWallet(adminPasscode: String!, address: String!, amount: Int!): Wallet!
  }
`
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
    privateMarkets(_, args) {
      return persistence.listPrivateMarkets(args)
    },
    privateMarketByCode(_, { code }) {
      return persistence.getPrivateMarketByCode(code)
    },
    pointRequests(_, { adminPasscode, status }) {
      assertAdminPasscode(adminPasscode)
      return persistence.listPointRequests({ status: status || null })
    },
  },
  ...(mutationsDisabled
    ? {}
    : {
        Mutation: {
          upsertWallet(_, args) {
            return persistence.upsertWallet(args)
          },
          savePrediction(_, args) {
            return persistence.savePrediction(args)
          },
          syncPrivateMarket(_, args) {
            const stakes = (args.stakes || []).map((s) => ({
              id: s.id,
              wallet: s.wallet,
              side: s.side,
              points: s.points,
              createdAt: s.createdAt,
            }))
            return persistence.upsertPrivateMarket({
              id: args.id,
              code: args.code,
              creator: args.creator,
              title: args.title,
              description: args.description,
              seedPoints: args.seedPoints,
              createdAt: args.createdAt,
              updatedAt: args.updatedAt,
              closesAt: args.closesAt,
              status: args.status,
              outcome: args.outcome,
              resolvedAt: args.resolvedAt,
              inviteCodeRequired: args.inviteCodeRequired === true,
              stakes,
            })
          },
          deletePrivateMarket(_, args) {
            return persistence.deletePrivateMarket({
              id: args.id,
              creator: String(args.creator || '').toLowerCase(),
            })
          },
          submitPointRequest(_, args) {
            return persistence.submitPointRequest({
              wallet: args.wallet,
              message: args.message ?? '',
            })
          },
          async fulfillPointRequest(_, args) {
            assertAdminPasscode(args.adminPasscode)
            const pr = await persistence.getPointRequest(args.id)
            if (!pr || pr.status !== 'pending') {
              throw new Error('Request not found or not pending.')
            }
            await adminCreditWalletCore(pr.wallet, args.points)
            return persistence.fulfillPointRequest({ id: args.id, points: args.points })
          },
          dismissPointRequest(_, args) {
            assertAdminPasscode(args.adminPasscode)
            return persistence.dismissPointRequest({ id: args.id })
          },
          adminCreditWallet(_, args) {
            assertAdminPasscode(args.adminPasscode)
            return adminCreditWalletCore(args.address, args.amount)
          },
        },
      }),
}

/** Landing page in production; introspection scrubber in all environments (unless GQL_SHOW_MUTATIONS_IN_INTROSPECTION=true). */
const plugins = [apolloPluginStripMutationIntrospection()]
if (process.env.NODE_ENV === 'production') {
  plugins.push(ApolloServerPluginLandingPageProductionDefault({ embed: true }))
}

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

const corsHandler = cors()
const jsonHandler = bodyParser.json({
  verify(req) {
    const charset = parseContentType(req).parameters.charset || 'utf-8'
    if (!charset.match(validCharset)) {
      throw Object.assign(new Error(`unsupported charset "${charset.toUpperCase()}"`), {
        status: 415,
        name: 'UnsupportedMediaTypeError',
        charset,
        type: 'charset.unsupported',
      })
    }
  },
  limit: '50mb',
})

const httpServer = http.createServer((req, res) => {
  const errorHandler = finalhandler(req, res, {
    onerror(err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(err.stack || err.toString())
      }
    },
  })

  if (!isGraphQLHttpPath(req.url)) {
    if (req.method === 'GET' && normalizeReqPath(req.url) === '/') {
      res.writeHead(302, { Location: GQL_HTTP_PATH })
      res.end()
      return
    }
    res.statusCode = 404
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Not found')
    return
  }

  corsHandler(req, res, (err) => {
    if (err) {
      errorHandler(err)
      return
    }
    jsonHandler(req, res, (err2) => {
      if (err2) {
        errorHandler(err2)
        return
      }
      const headers = new HeaderMap()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value)
        }
      }
      const httpGraphQLRequest = {
        method: req.method.toUpperCase(),
        headers,
        search: urlParse(req.url).search ?? '',
        body: 'body' in req ? req.body : undefined,
      }
      server
        .executeHTTPGraphQLRequest({
          httpGraphQLRequest,
          context: async () => ({}),
        })
        .then(async (httpGraphQLResponse) => {
          for (const [key, value] of httpGraphQLResponse.headers) {
            res.setHeader(key, value)
          }
          res.statusCode = httpGraphQLResponse.status || 200
          if (httpGraphQLResponse.body.kind === 'complete') {
            res.end(httpGraphQLResponse.body.string)
            return
          }
          for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
            res.write(chunk)
          }
          res.end()
        })
        .catch((e) => {
          errorHandler(e)
        })
    })
  })
})

server.addPlugin(ApolloServerPluginDrainHttpServer({ httpServer }))
await server.start()
await new Promise((resolve) => {
  httpServer.listen({ port: PORT }, resolve)
})

const localUrl = `http://127.0.0.1:${PORT}${GQL_HTTP_PATH}`
console.log(`[apollo] GraphQL server ready at ${localUrl}`)
if (mutationsDisabled) {
  console.warn('[apollo] Mutations are OFF (GQL_DISABLE_MUTATIONS=true). SPA wallet/prediction sync will fail until unset.')
}
if (PORT !== PREFERRED) {
  console.warn(
    `[apollo] Using port ${PORT} instead of ${PREFERRED}. Set VITE_GQL_URL=http://localhost:${PORT}${GQL_HTTP_PATH} in .env.local so the React app hits this server.`,
  )
}
