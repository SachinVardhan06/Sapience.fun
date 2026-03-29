/**
 * GraphQL persistence: PostgreSQL (production) or JSON file (local dev).
 * Deploy the API process at **https://api.sapience.fun/graphql** (custom domain **api.sapience.fun**).
 * Keep in sync with BONUS_POINTS in src/utils/pointsLedger.js
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Must match `BONUS_POINTS` in src/utils/pointsLedger.js */
export const WALLET_START_PTS = 1000

function resolveDbFile() {
  const full = process.env.SAPIENCE_DB_PATH?.trim()
  if (full) return full
  const dir = process.env.SAPIENCE_DB_DIR?.trim()
  if (dir) return join(dir, 'sapience-db.json')
  return join(__dirname, 'sapience-db.json')
}

function mapWalletRow(row) {
  if (!row) return null
  const c = row.created_at
  const u = row.updated_at
  return {
    address: row.address,
    balance: row.balance,
    totalPredictions: row.total_predictions,
    totalStaked: row.total_staked,
    totalRewards: row.total_rewards,
    createdAt: c instanceof Date ? c.toISOString() : String(c),
    updatedAt: u instanceof Date ? u.toISOString() : String(u),
  }
}

function mapPredictionRow(row) {
  if (!row) return null
  const c = row.created_at
  return {
    id: row.id,
    wallet: row.wallet,
    marketId: row.market_id,
    marketTitle: row.market_title,
    side: row.side,
    points: row.points,
    createdAt: c instanceof Date ? c.toISOString() : String(c),
  }
}

async function ensurePgSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      address TEXT PRIMARY KEY,
      balance INTEGER NOT NULL,
      total_predictions INTEGER NOT NULL,
      total_staked INTEGER NOT NULL,
      total_rewards INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      market_id TEXT NOT NULL,
      market_title TEXT NOT NULL,
      side TEXT NOT NULL,
      points INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS predictions_wallet_idx ON predictions (wallet)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS predictions_created_at_idx ON predictions (created_at DESC)`)
}

function createFilePersistence(dbFile) {
  function readDB() {
    try {
      if (existsSync(dbFile)) return JSON.parse(readFileSync(dbFile, 'utf8'))
    } catch {
      /* ignore */
    }
    return { wallets: {}, predictions: [] }
  }

  function writeDB(db) {
    const dir = dirname(dbFile)
    if (dir && dir !== '.' && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(dbFile, JSON.stringify(db, null, 2))
  }

  return {
    mode: 'file',
    detail: dbFile,
    async getWallet(address) {
      const db = readDB()
      return db.wallets[address.toLowerCase()] ?? null
    },
    async listWallets() {
      const db = readDB()
      return Object.values(db.wallets).sort((a, b) => {
        const pa = (a.balance ?? 0) - WALLET_START_PTS
        const pb = (b.balance ?? 0) - WALLET_START_PTS
        if (pb !== pa) return pb - pa
        return (b.balance ?? 0) - (a.balance ?? 0)
      })
    },
    async listPredictions({ wallet, limit }) {
      const db = readDB()
      let rows = db.predictions
      if (wallet) rows = rows.filter((p) => p.wallet === wallet.toLowerCase())
      rows = rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return limit ? rows.slice(0, limit) : rows
    },
    async upsertWallet({ address, balance, totalPredictions, totalStaked, totalRewards }) {
      const db = readDB()
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
    async savePrediction({ id, wallet, marketId, marketTitle, side, points }) {
      const db = readDB()
      const key = wallet.toLowerCase()
      if (!db.predictions.find((p) => p.id === id)) {
        db.predictions.push({
          id,
          wallet: key,
          marketId,
          marketTitle,
          side,
          points,
          createdAt: new Date().toISOString(),
        })
        writeDB(db)
      }
      return db.predictions.find((p) => p.id === id)
    },
  }
}

function createPgPersistence(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl:
      process.env.DATABASE_SSL === '0' || process.env.DATABASE_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
  })

  pool.on('error', (err) => {
    console.error('[apollo] Postgres pool error:', err.message)
  })

  return {
    mode: 'postgres',
    detail: 'DATABASE_URL',
    pool,
    async getWallet(address) {
      const { rows } = await pool.query('SELECT * FROM wallets WHERE address = $1', [address.toLowerCase()])
      return mapWalletRow(rows[0]) ?? null
    },
    async listWallets() {
      const { rows } = await pool.query(
        `SELECT * FROM wallets ORDER BY (balance - $1) DESC, balance DESC`,
        [WALLET_START_PTS],
      )
      return rows.map(mapWalletRow)
    },
    async listPredictions({ wallet, limit }) {
      let sql = 'SELECT * FROM predictions'
      const params = []
      if (wallet) {
        params.push(wallet.toLowerCase())
        sql += ` WHERE wallet = $${params.length}`
      }
      sql += ' ORDER BY created_at DESC'
      if (limit != null && Number.isFinite(Number(limit))) {
        params.push(Number(limit))
        sql += ` LIMIT $${params.length}`
      }
      const { rows } = await pool.query(sql, params)
      return rows.map(mapPredictionRow)
    },
    async upsertWallet({ address, balance, totalPredictions, totalStaked, totalRewards }) {
      const key = address.toLowerCase()
      const { rows: existing } = await pool.query('SELECT created_at FROM wallets WHERE address = $1', [key])
      const now = new Date().toISOString()
      const createdAt = existing[0]?.created_at
        ? new Date(existing[0].created_at).toISOString()
        : now

      await pool.query(
        `INSERT INTO wallets (address, balance, total_predictions, total_staked, total_rewards, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
         ON CONFLICT (address) DO UPDATE SET
           balance = EXCLUDED.balance,
           total_predictions = EXCLUDED.total_predictions,
           total_staked = EXCLUDED.total_staked,
           total_rewards = EXCLUDED.total_rewards,
           updated_at = EXCLUDED.updated_at`,
        [key, balance, totalPredictions, totalStaked, totalRewards, createdAt, now],
      )
      const { rows } = await pool.query('SELECT * FROM wallets WHERE address = $1', [key])
      return mapWalletRow(rows[0])
    },
    async savePrediction({ id, wallet, marketId, marketTitle, side, points }) {
      const key = wallet.toLowerCase()
      await pool.query(
        `INSERT INTO predictions (id, wallet, market_id, market_title, side, points, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (id) DO NOTHING`,
        [id, key, marketId, marketTitle, side, points],
      )
      const { rows } = await pool.query('SELECT * FROM predictions WHERE id = $1', [id])
      return mapPredictionRow(rows[0])
    },
  }
}

/**
 * @returns {Promise<{ mode: string, detail?: string, getWallet, listWallets, listPredictions, upsertWallet, savePrediction, pool?: import('pg').Pool }>}
 */
export async function createPersistence() {
  const dbUrl = process.env.DATABASE_URL?.trim()
  if (dbUrl) {
    const store = createPgPersistence(dbUrl)
    await ensurePgSchema(store.pool)
    console.log('[apollo] Persistence: PostgreSQL (DATABASE_URL)')
    return store
  }

  const dbFile = resolveDbFile()
  console.log('[apollo] Persistence: JSON file')
  console.log(`[apollo] Database file: ${dbFile}`)
  return createFilePersistence(dbFile)
}
