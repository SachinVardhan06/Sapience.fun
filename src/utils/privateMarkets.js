import { addPoints, recordPrediction, spendPoints } from './pointsLedger.js'
import {
  fetchPrivateMarketByCode,
  fetchPrivateMarkets,
  syncPrivateMarket as gqlSyncPrivateMarket,
} from './graphqlClient.js'

export const PRIVATE_MARKETS_KEY = 'sapience_private_markets_v1'

export const PRIVATE_MIN_SEED = 25
export const PRIVATE_MIN_STAKE = 5
/** Custom invite codes: length after normalizing to A–Z / 0–9 */
export const PRIVATE_ACCESS_CODE_MIN = 4
export const PRIVATE_ACCESS_CODE_MAX = 8

function normalizeAddress(address) {
  return String(address || '').toLowerCase()
}

function readAll() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PRIVATE_MARKETS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAll(list) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PRIVATE_MARKETS_KEY, JSON.stringify(list))
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function uniqueCode(existing) {
  const codes = new Set(existing.map((m) => String(m.code || '').toUpperCase()))
  for (let i = 0; i < 40; i++) {
    const c = randomCode()
    if (!codes.has(c)) return c
  }
  return `P${Date.now().toString(36).toUpperCase().slice(-5)}`
}

export function normalizeAccessCode(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (s.length < PRIVATE_ACCESS_CODE_MIN || s.length > PRIVATE_ACCESS_CODE_MAX) return null
  return s
}

function isCodeTaken(code, list) {
  const u = String(code).toUpperCase()
  return list.some((m) => String(m.code || '').toUpperCase() === u)
}

function sumSide(stakes, side) {
  return stakes.filter((s) => s.side === side).reduce((a, s) => a + Number(s.points) || 0, 0)
}

/** Treat missing/odd status as open so older local rows still appear in feeds. */
export function isPrivateMarketOpen(m) {
  if (!m) return false
  const st = String(m.status == null ? 'open' : m.status)
    .trim()
    .toLowerCase()
  if (st !== 'open') return false
  if (m.closesAt) {
    const t = new Date(m.closesAt).getTime()
    if (Number.isFinite(t) && Date.now() > t) return false
  }
  return true
}

function docFromGql(m) {
  if (!m) return null
  return {
    id: m.id,
    code: String(m.code || '').toUpperCase(),
    creator: String(m.creator || '').toLowerCase(),
    title: m.title || '',
    description: m.description || '',
    seedPoints: Number(m.seedPoints) || 0,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt || m.createdAt,
    closesAt: m.closesAt ?? null,
    status: m.status || 'open',
    outcome: m.outcome ?? null,
    resolvedAt: m.resolvedAt ?? null,
    inviteCodeRequired: m.inviteCodeRequired === true,
    stakes: Array.isArray(m.stakes) ? m.stakes : [],
  }
}

function mergeRemoteList(remoteList) {
  const local = readAll()
  const byId = new Map(local.map((x) => [x.id, x]))
  for (const r of remoteList) {
    const doc = docFromGql(r)
    if (!doc) continue
    const ex = byId.get(doc.id)
    const tR = new Date(doc.updatedAt || doc.createdAt).getTime()
    const tL = ex ? new Date(ex.updatedAt || ex.createdAt || 0).getTime() : 0
    if (!ex || tR >= tL) byId.set(doc.id, doc)
  }
  writeAll([...byId.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
}

/** Pull all private markets from the API and merge into localStorage (newer `updatedAt` wins). */
export async function hydratePrivateMarkets() {
  try {
    const remote = await fetchPrivateMarkets()
    mergeRemoteList(remote)
  } catch {
    /* API offline */
  }
}

/** Fetch one room by code from API if missing locally (e.g. first-time join). */
export async function fetchAndMergePrivateMarketByCode(code) {
  const c = normalizeAccessCode(code)
  if (!c) return null
  const localFirst = getPrivateMarketByCode(c)
  if (localFirst) return localFirst
  try {
    const remote = await fetchPrivateMarketByCode(c)
    if (remote) {
      mergeRemoteList([remote])
      return getPrivateMarketByCode(c)
    }
  } catch {
    /* ignore */
  }
  return null
}

async function syncMarketToServer(market) {
  const doc = {
    ...market,
    stakes: market.stakes || [],
    updatedAt: market.updatedAt || new Date().toISOString(),
  }
  await gqlSyncPrivateMarket(doc)
}

function scheduleSyncMarket(market) {
  void syncMarketToServer(market).catch(() => {})
}

/**
 * @param {string} creator
 * @param {{
 *   title: string
 *   description?: string
 *   seedPoints: number
 *   closesInHours?: number | null
 *   wantCustomCode?: boolean
 *   customCode?: string
 *   listInMarkets?: boolean
 * }} input
 * @returns {Promise<{ ok: true, market: object } | { ok: true, market: object, syncError: string } | { ok: false, reason: string }>}
 */
export async function createPrivateMarket(creator, input) {
  const key = normalizeAddress(creator)
  if (!key) return { ok: false, reason: 'Connect a wallet first.' }

  const title = String(input.title || '').trim()
  if (title.length < 4) return { ok: false, reason: 'Title must be at least 4 characters.' }
  if (title.length > 200) return { ok: false, reason: 'Title is too long.' }

  const seedPoints = Math.floor(Number(input.seedPoints))
  if (!Number.isFinite(seedPoints) || seedPoints < PRIVATE_MIN_SEED) {
    return { ok: false, reason: `Seed pool must be at least ${PRIVATE_MIN_SEED} points.` }
  }

  const spent = spendPoints(key, seedPoints, { bumpPredictions: false, bumpStaked: true })
  if (!spent.ok) return spent

  const list = readAll()
  const wantCustom = Boolean(input.wantCustomCode)
  let code
  if (wantCustom) {
    const norm = normalizeAccessCode(input.customCode || '')
    if (norm) {
      if (isCodeTaken(norm, list)) {
        return { ok: false, reason: 'That invite code is already taken. Pick another or use a random code.' }
      }
      code = norm
    } else {
      code = uniqueCode(list)
    }
  } else {
    code = uniqueCode(list)
  }

  const id = `pm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const now = new Date().toISOString()

  let closesAt = null
  const h = input.closesInHours
  if (h != null && h !== '') {
    const n = Number(h)
    if (Number.isFinite(n) && n > 0 && n <= 24 * 90) {
      closesAt = new Date(Date.now() + n * 3600_000).toISOString()
    }
  }

  const listInMarkets = input.listInMarkets !== false
  const market = {
    id,
    code,
    creator: key,
    title,
    description: String(input.description || '').trim().slice(0, 500),
    seedPoints,
    createdAt: now,
    updatedAt: now,
    closesAt,
    status: 'open',
    outcome: null,
    resolvedAt: null,
    inviteCodeRequired: !listInMarkets,
    stakes: [],
  }
  list.push(market)
  writeAll(list)
  try {
    await syncMarketToServer(market)
  } catch (err) {
    return {
      ok: true,
      market,
      syncError: err instanceof Error ? err.message : String(err),
    }
  }
  return { ok: true, market }
}

export function getPrivateMarketByCode(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) return null
  return readAll().find((m) => String(m.code || '').toUpperCase() === c) || null
}

export function getPrivateMarketById(id) {
  return readAll().find((m) => m.id === id) || null
}

export function listPrivateMarketsForWallet(address) {
  const key = normalizeAddress(address)
  if (!key) return []
  return readAll().filter(
    (m) => m.creator === key || (m.stakes || []).some((s) => normalizeAddress(s.wallet) === key),
  )
}

export function listPrivateMarketsCreatedBy(address) {
  const key = normalizeAddress(address)
  return readAll().filter((m) => m.creator === key)
}

/** Open rooms you host or have staked on, with betting still allowed. */
export function listOpenPrivateMarketsForWallet(address) {
  return listPrivateMarketsForWallet(address).filter((m) => isPrivateMarketOpen(m))
}

/**
 * Open rooms that should appear in Markets → Private (not invite-code-only).
 * Call {@link hydratePrivateMarkets} first for server data.
 */
export function listOpenPrivateMarketsPublic() {
  return readAll().filter((m) => {
    if (!isPrivateMarketOpen(m)) return false
    if (m.inviteCodeRequired === true) return false
    return true
  })
}

/**
 * Row shape compatible with the main prediction market table (Kalshi / Manifold).
 * @param {object} m Private market from storage
 */
export function privateMarketToFeedRow(m) {
  const yesT = sumSide(m.stakes, 'YES')
  const noT = sumSide(m.stakes, 'NO')
  const pot = Number(m.seedPoints) + yesT + noT
  const denom = yesT + noT
  const forecast = denom === 0 ? 50 : Math.max(1, Math.min(99, Math.round((yesT / denom) * 100)))
  let closeDate = '—'
  let endsSoon = false
  if (m.closesAt) {
    const d = new Date(m.closesAt)
    if (!Number.isNaN(d.getTime())) {
      closeDate = d.toISOString().slice(0, 10)
      const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
      endsSoon = days >= 0 && days <= 7
    }
  }
  return {
    id: m.id,
    title: m.title,
    category: 'Private',
    closeDate,
    endsSoon,
    liquidity: `${pot} pts`,
    volume24h: '—',
    forecast,
    slug: m.code,
    source: 'private',
  }
}

function saveMarketUpdated(market) {
  const list = readAll()
  const i = list.findIndex((m) => m.id === market.id)
  if (i === -1) return
  const next = { ...market, updatedAt: new Date().toISOString() }
  list[i] = next
  writeAll(list)
  scheduleSyncMarket(next)
}

/**
 * @param {string} wallet
 * @param {string} marketId
 * @param {'YES'|'NO'} side
 * @param {number} points
 */
export function stakePrivateMarket(wallet, marketId, side, points) {
  const key = normalizeAddress(wallet)
  if (!key) return { ok: false, reason: 'Connect a wallet first.' }
  if (side !== 'YES' && side !== 'NO') return { ok: false, reason: 'Pick YES or NO.' }

  const pts = Math.floor(Number(points))
  if (!Number.isFinite(pts) || pts < PRIVATE_MIN_STAKE) {
    return { ok: false, reason: `Minimum stake is ${PRIVATE_MIN_STAKE} points.` }
  }

  const list = readAll()
  const market = list.find((m) => m.id === marketId)
  if (!market) return { ok: false, reason: 'Market not found.' }
  if (market.status !== 'open') return { ok: false, reason: 'This market is closed.' }
  if (market.closesAt && Date.now() > new Date(market.closesAt).getTime()) {
    return { ok: false, reason: 'Betting window ended.' }
  }

  const spent = spendPoints(key, pts, { bumpPredictions: true, bumpStaked: true })
  if (!spent.ok) return spent

  const stakeId = `${marketId}-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const stakes = Array.isArray(market.stakes) ? [...market.stakes] : []
  stakes.push({
    id: stakeId,
    wallet: key,
    side,
    points: pts,
    createdAt: new Date().toISOString(),
  })

  const next = { ...market, stakes }
  saveMarketUpdated(next)

  recordPrediction({
    id: stakeId,
    wallet: key,
    marketId: `private-${market.id}`,
    marketTitle: `[Private] ${market.title}`,
    side,
    points: pts,
  })

  return { ok: true, market: next }
}

/**
 * Creator resolves outcome; winning side splits full pot (seed + all stakes) proportionally.
 * @param {'YES'|'NO'} outcome
 */
export function resolvePrivateMarket(creatorWallet, marketId, outcome) {
  const key = normalizeAddress(creatorWallet)
  if (!key) return { ok: false, reason: 'Connect a wallet first.' }
  if (outcome !== 'YES' && outcome !== 'NO') return { ok: false, reason: 'Invalid outcome.' }

  const list = readAll()
  const market = list.find((m) => m.id === marketId)
  if (!market) return { ok: false, reason: 'Market not found.' }
  if (market.creator !== key) return { ok: false, reason: 'Only the host can resolve this market.' }
  if (market.status !== 'open') return { ok: false, reason: 'Already resolved.' }

  const stakes = Array.isArray(market.stakes) ? market.stakes : []
  const yesTotal = sumSide(stakes, 'YES')
  const noTotal = sumSide(stakes, 'NO')
  const pot = Number(market.seedPoints) + yesTotal + noTotal
  const winSum = outcome === 'YES' ? yesTotal : noTotal

  if (winSum <= 0) {
    for (const s of stakes) {
      addPoints(s.wallet, Number(s.points), { bumpRewards: false })
    }
    addPoints(market.creator, Number(market.seedPoints), { bumpRewards: false })
  } else {
    const winners = stakes.filter((s) => s.side === outcome)
    const payouts = winners.map((s) => {
      const share = (Number(s.points) / winSum) * pot
      return { wallet: s.wallet, stakeId: s.id, floor: Math.floor(share), frac: share - Math.floor(share) }
    })
    const totalFloors = payouts.reduce((a, p) => a + p.floor, 0)
    let remainder = pot - totalFloors
    payouts.sort((a, b) => b.frac - a.frac)
    let i = 0
    while (remainder > 0 && payouts.length) {
      payouts[i % payouts.length].floor += 1
      remainder -= 1
      i += 1
    }
    for (const p of payouts) {
      if (p.floor > 0) addPoints(p.wallet, p.floor, { bumpRewards: true })
    }
  }

  const resolved = {
    ...market,
    status: 'resolved',
    outcome,
    resolvedAt: new Date().toISOString(),
  }
  saveMarketUpdated(resolved)
  return { ok: true, market: resolved }
}
