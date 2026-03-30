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

function mapPointRequestDoc(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: String(raw.id),
    wallet: String(raw.wallet || '').toLowerCase(),
    message: String(raw.message ?? ''),
    status: String(raw.status || 'pending'),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    grantedPoints: raw.grantedPoints != null ? Number(raw.grantedPoints) : null,
  }
}

function mapPointRequestPgRow(row) {
  if (!row) return null
  const c = row.created_at
  const u = row.updated_at
  return {
    id: row.id,
    wallet: String(row.wallet || '').toLowerCase(),
    message: String(row.message ?? ''),
    status: String(row.status || 'pending'),
    createdAt: c instanceof Date ? c.toISOString() : String(c),
    updatedAt: u instanceof Date ? u.toISOString() : String(u),
    grantedPoints: row.granted_points != null ? Number(row.granted_points) : null,
  }
}

function normalizePrivateMarketDoc(raw) {
  if (!raw || typeof raw !== 'object') return null
  const stakes = Array.isArray(raw.stakes) ? raw.stakes : []
  const now = new Date().toISOString()
  return {
    id: String(raw.id),
    code: String(raw.code || '').toUpperCase(),
    creator: String(raw.creator || '').toLowerCase(),
    title: String(raw.title || ''),
    description: String(raw.description || ''),
    seedPoints: Number(raw.seedPoints) || 0,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    closesAt: raw.closesAt ?? null,
    status: raw.status || 'open',
    outcome: raw.outcome ?? null,
    resolvedAt: raw.resolvedAt ?? null,
    inviteCodeRequired: raw.inviteCodeRequired === true,
    stakes: stakes.map((s) => ({
      id: String(s.id),
      wallet: String(s.wallet || '').toLowerCase(),
      side: String(s.side),
      points: Number(s.points) || 0,
      createdAt: s.createdAt || now,
    })),
  }
}

async function ensurePrivateMarketsPgSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS private_markets (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      body JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
}

async function ensurePointRequestsPgSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS point_requests (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      granted_points INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS point_requests_wallet_idx ON point_requests (wallet)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS point_requests_status_idx ON point_requests (status)`)
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
  await ensurePointRequestsPgSchema(pool)
}

function createFilePersistence(dbFile) {
  function readDB() {
    try {
      if (existsSync(dbFile)) {
        const db = JSON.parse(readFileSync(dbFile, 'utf8'))
        if (!Array.isArray(db.privateMarkets)) db.privateMarkets = []
        if (!Array.isArray(db.pointRequests)) db.pointRequests = []
        return db
      }
    } catch {
      /* ignore */
    }
    return { wallets: {}, predictions: [], privateMarkets: [], pointRequests: [] }
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
    async listPrivateMarkets({ status }) {
      const db = readDB()
      let rows = (db.privateMarkets || []).map((m) => normalizePrivateMarketDoc(m)).filter(Boolean)
      if (status) rows = rows.filter((m) => m.status === status)
      return rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    },
    async getPrivateMarketByCode(code) {
      const c = String(code || '').trim().toUpperCase()
      if (!c) return null
      const db = readDB()
      const raw = (db.privateMarkets || []).find((m) => String(m.code).toUpperCase() === c)
      return raw ? normalizePrivateMarketDoc(raw) : null
    },
    async upsertPrivateMarket(market) {
      const db = readDB()
      if (!Array.isArray(db.privateMarkets)) db.privateMarkets = []
      const m = normalizePrivateMarketDoc(market)
      if (!m) throw new Error('Invalid private market payload')
      const conflict = db.privateMarkets.find(
        (x) => String(x.code).toUpperCase() === m.code && String(x.id) !== m.id,
      )
      if (conflict) throw new Error('Invite code already in use')
      m.updatedAt = m.updatedAt || new Date().toISOString()
      const i = db.privateMarkets.findIndex((x) => String(x.id) === m.id)
      if (i >= 0) db.privateMarkets[i] = m
      else db.privateMarkets.push(m)
      writeDB(db)
      return m
    },
    async deletePrivateMarket({ id, creator }) {
      const key = String(creator || '').trim().toLowerCase()
      if (!key) return false
      const db = readDB()
      if (!Array.isArray(db.privateMarkets)) db.privateMarkets = []
      const i = db.privateMarkets.findIndex((x) => String(x.id) === String(id))
      if (i < 0) return true
      const raw = db.privateMarkets[i]
      if (String(raw.creator || '').toLowerCase() !== key) return false
      db.privateMarkets.splice(i, 1)
      writeDB(db)
      return true
    },
    async submitPointRequest({ wallet, message }) {
      const db = readDB()
      if (!Array.isArray(db.pointRequests)) db.pointRequests = []
      const key = String(wallet || '')
        .trim()
        .toLowerCase()
      if (!key.startsWith('0x') || key.length < 10) throw new Error('Invalid wallet address.')
      const msg = String(message || '')
        .trim()
        .slice(0, 500)
      const now = new Date().toISOString()
      const pendingIdx = db.pointRequests.findIndex((r) => r.wallet === key && r.status === 'pending')
      if (pendingIdx >= 0) {
        db.pointRequests[pendingIdx] = {
          ...db.pointRequests[pendingIdx],
          message: msg,
          updatedAt: now,
        }
        writeDB(db)
        return mapPointRequestDoc(db.pointRequests[pendingIdx])
      }
      const id = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      const row = {
        id,
        wallet: key,
        message: msg,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        grantedPoints: null,
      }
      db.pointRequests.push(row)
      writeDB(db)
      return mapPointRequestDoc(row)
    },
    async listPointRequests({ status }) {
      const db = readDB()
      let rows = (db.pointRequests || []).map((r) => mapPointRequestDoc(r)).filter(Boolean)
      if (status) rows = rows.filter((r) => r.status === status)
      return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },
    async getPointRequest(id) {
      const db = readDB()
      const raw = (db.pointRequests || []).find((r) => String(r.id) === String(id))
      return raw ? mapPointRequestDoc(raw) : null
    },
    async fulfillPointRequest({ id, points }) {
      const db = readDB()
      const i = (db.pointRequests || []).findIndex((r) => String(r.id) === String(id))
      if (i < 0) throw new Error('Request not found.')
      const cur = db.pointRequests[i]
      if (cur.status !== 'pending') throw new Error('Request is not pending.')
      const pts = Number(points)
      if (!Number.isFinite(pts) || pts <= 0) throw new Error('Invalid points amount.')
      const now = new Date().toISOString()
      db.pointRequests[i] = {
        ...cur,
        status: 'fulfilled',
        grantedPoints: pts,
        updatedAt: now,
      }
      writeDB(db)
      return mapPointRequestDoc(db.pointRequests[i])
    },
    async dismissPointRequest({ id }) {
      const db = readDB()
      const i = (db.pointRequests || []).findIndex((r) => String(r.id) === String(id))
      if (i < 0) throw new Error('Request not found.')
      const cur = db.pointRequests[i]
      if (cur.status !== 'pending') throw new Error('Request is not pending.')
      const now = new Date().toISOString()
      db.pointRequests[i] = {
        ...cur,
        status: 'dismissed',
        updatedAt: now,
      }
      writeDB(db)
      return mapPointRequestDoc(db.pointRequests[i])
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
    async listPrivateMarkets({ status }) {
      const { rows } = await pool.query(
        'SELECT body FROM private_markets ORDER BY updated_at DESC',
      )
      let list = rows.map((r) => normalizePrivateMarketDoc(r.body)).filter(Boolean)
      if (status) list = list.filter((m) => m.status === status)
      return list
    },
    async getPrivateMarketByCode(code) {
      const c = String(code || '').trim().toUpperCase()
      if (!c) return null
      const { rows } = await pool.query('SELECT body FROM private_markets WHERE code = $1', [c])
      return rows[0] ? normalizePrivateMarketDoc(rows[0].body) : null
    },
    async upsertPrivateMarket(market) {
      const m = normalizePrivateMarketDoc(market)
      if (!m) throw new Error('Invalid private market payload')
      const { rows: conflict } = await pool.query(
        'SELECT id FROM private_markets WHERE code = $1 AND id <> $2',
        [m.code, m.id],
      )
      if (conflict.length) throw new Error('Invite code already in use')
      m.updatedAt = m.updatedAt || new Date().toISOString()
      await pool.query(
        `INSERT INTO private_markets (id, code, body, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::timestamptz)
         ON CONFLICT (id) DO UPDATE SET
           code = EXCLUDED.code,
           body = EXCLUDED.body,
           updated_at = EXCLUDED.updated_at`,
        [m.id, m.code, JSON.stringify(m), m.updatedAt],
      )
      return m
    },
    async deletePrivateMarket({ id, creator }) {
      const key = String(creator || '').trim().toLowerCase()
      if (!key) return false
      const { rows } = await pool.query(`SELECT body FROM private_markets WHERE id = $1`, [String(id)])
      if (!rows.length) return true
      const c = String(rows[0].body?.creator || '').toLowerCase()
      if (c !== key) return false
      await pool.query(`DELETE FROM private_markets WHERE id = $1`, [String(id)])
      return true
    },
    async submitPointRequest({ wallet, message }) {
      const key = String(wallet || '')
        .trim()
        .toLowerCase()
      if (!key.startsWith('0x') || key.length < 10) throw new Error('Invalid wallet address.')
      const msg = String(message || '')
        .trim()
        .slice(0, 500)
      const now = new Date().toISOString()
      const { rows: pend } = await pool.query(
        `SELECT id FROM point_requests WHERE wallet = $1 AND status = 'pending' LIMIT 1`,
        [key],
      )
      if (pend.length) {
        await pool.query(
          `UPDATE point_requests SET message = $2, updated_at = $3::timestamptz WHERE id = $1`,
          [pend[0].id, msg, now],
        )
        const { rows } = await pool.query(`SELECT * FROM point_requests WHERE id = $1`, [pend[0].id])
        return mapPointRequestPgRow(rows[0])
      }
      const id = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      await pool.query(
        `INSERT INTO point_requests (id, wallet, message, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4::timestamptz, $4::timestamptz)`,
        [id, key, msg, now],
      )
      const { rows } = await pool.query(`SELECT * FROM point_requests WHERE id = $1`, [id])
      return mapPointRequestPgRow(rows[0])
    },
    async listPointRequests({ status }) {
      let sql = 'SELECT * FROM point_requests'
      const params = []
      if (status) {
        params.push(status)
        sql += ` WHERE status = $${params.length}`
      }
      sql += ' ORDER BY created_at DESC'
      const { rows } = await pool.query(sql, params)
      return rows.map(mapPointRequestPgRow)
    },
    async getPointRequest(id) {
      const { rows } = await pool.query(`SELECT * FROM point_requests WHERE id = $1`, [String(id)])
      return rows[0] ? mapPointRequestPgRow(rows[0]) : null
    },
    async fulfillPointRequest({ id, points }) {
      const now = new Date().toISOString()
      const pts = Number(points)
      const { rows } = await pool.query(
        `UPDATE point_requests SET status = 'fulfilled', granted_points = $2, updated_at = $3::timestamptz
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [String(id), pts, now],
      )
      if (!rows.length) throw new Error('Request not found or not pending.')
      return mapPointRequestPgRow(rows[0])
    },
    async dismissPointRequest({ id }) {
      const now = new Date().toISOString()
      const { rows } = await pool.query(
        `UPDATE point_requests SET status = 'dismissed', updated_at = $2::timestamptz
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [String(id), now],
      )
      if (!rows.length) throw new Error('Request not found or not pending.')
      return mapPointRequestPgRow(rows[0])
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
    await ensurePrivateMarketsPgSchema(store.pool)
    console.log('[apollo] Persistence: PostgreSQL (DATABASE_URL)')
    return store
  }

  const dbFile = resolveDbFile()
  console.log('[apollo] Persistence: JSON file')
  console.log(`[apollo] Database file: ${dbFile}`)
  return createFilePersistence(dbFile)
}
