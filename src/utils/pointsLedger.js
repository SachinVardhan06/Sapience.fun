import { upsertWallet as gqlUpsertWallet, savePrediction as gqlSavePrediction } from './graphqlClient.js'

export const WALLET_POINTS_KEY = 'sapience_wallet_points_v1'
export const PREDICTIONS_KEY   = 'sapience_v2_predictions'
export const BONUS_POINTS      = 1000
export const PREDICTION_REWARD = 10

/** Net P&L vs starting bonus (every wallet begins at {@link BONUS_POINTS}). */
export function walletNetProfit(account) {
  const b = Number(account?.balance)
  if (!Number.isFinite(b)) return 0
  return Math.round(b - BONUS_POINTS)
}

/** Dispatched when balance or predictions change locally (navbar / other tabs can refresh). */
export const POINTS_CHANGED_EVENT = 'sapience-points-changed'

function notifyPointsChanged() {
  if (typeof window === 'undefined') return
  queueMicrotask(() => window.dispatchEvent(new CustomEvent(POINTS_CHANGED_EVENT)))
}

function isoTime(iso) {
  const t = iso ? new Date(iso).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

/** Pick the fresher wallet row (local vs GraphQL) so UI never shows stale balance. */
export function mergeWalletRecords(server, local) {
  if (!server && !local) return null
  if (!server) return local
  if (!local) return server
  const st = isoTime(server.updatedAt)
  const lt = isoTime(local.updatedAt)
  if (lt > st) return local
  if (st > lt) return server
  return Number(local.balance) >= Number(server.balance) ? local : server
}

/** Leaderboard: union GraphQL wallets with local-only wallets; reconcile duplicates. */
export function mergeWalletListsForLeaderboard(gqlList, localList) {
  const map = new Map()
  for (const w of gqlList || []) {
    if (!w?.address) continue
    const k = String(w.address).toLowerCase()
    map.set(k, { ...w, address: k })
  }
  for (const w of localList || []) {
    if (!w?.address) continue
    const k = String(w.address).toLowerCase()
    const ex = map.get(k)
    if (!ex) {
      map.set(k, { ...w, address: k })
      continue
    }
    map.set(k, mergeWalletRecords(ex, { ...w, address: k }))
  }
  return [...map.values()]
}

/** Dedupe predictions by id; merge server + local lists. */
export function mergePredictionLists(serverList, localList) {
  const map = new Map()
  for (const p of [...(serverList || []), ...(localList || [])]) {
    if (!p?.id) continue
    const ex = map.get(p.id)
    if (!ex || isoTime(p.createdAt) >= isoTime(ex.createdAt)) map.set(p.id, p)
  }
  return [...map.values()].sort((a, b) => isoTime(b.createdAt) - isoTime(a.createdAt))
}

function normalizeAddress(address) {
  return (address || '').toLowerCase()
}

function readMap() {
  if (typeof window === 'undefined') return {}
  try {
    const raw    = window.localStorage.getItem(WALLET_POINTS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WALLET_POINTS_KEY, JSON.stringify(map))
}

function syncWallet(account) {
  gqlUpsertWallet(account).catch(() => {
    // server offline — localStorage already up to date
  })
}

export function ensureWalletBonus(address) {
  const key = normalizeAddress(address)
  if (!key) return null

  const map = readMap()
  if (!map[key]) {
    map[key] = {
      address         : key,
      balance         : BONUS_POINTS,
      totalPredictions: 0,
      totalStaked     : 0,
      totalRewards    : 0,
      createdAt       : new Date().toISOString(),
      updatedAt       : new Date().toISOString(),
    }
    writeMap(map)
    syncWallet(map[key])
    notifyPointsChanged()
  }
  return map[key]
}

export function getWalletAccount(address) {
  const key = normalizeAddress(address)
  if (!key) return null
  const map = readMap()
  return map[key] || null
}

export function applyPredictionBatch(address, stakePerPrediction, count) {
  const key = normalizeAddress(address)
  if (!key) return { ok: false, reason: 'Missing wallet address.' }

  ensureWalletBonus(key)
  const map     = readMap()
  const current = map[key]

  const stake            = Number(stakePerPrediction)
  const predictionsCount = Number(count)
  if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(predictionsCount) || predictionsCount <= 0) {
    return { ok: false, reason: 'Invalid stake or prediction count.' }
  }

  const totalStake  = stake * predictionsCount
  const totalReward = PREDICTION_REWARD * predictionsCount
  const nextBalance = current.balance - totalStake + totalReward
  if (nextBalance < 0) return { ok: false, reason: 'Insufficient points balance.' }

  const next = {
    ...current,
    balance         : nextBalance,
    totalPredictions: current.totalPredictions + predictionsCount,
    totalStaked     : current.totalStaked + totalStake,
    totalRewards    : current.totalRewards + totalReward,
    updatedAt       : new Date().toISOString(),
  }
  map[key] = next
  writeMap(map)
  syncWallet(next)
  notifyPointsChanged()

  return { ok: true, account: next, totalStake, totalReward }
}

/**
 * Persist a single prediction to localStorage + GraphQL server.
 * The id should be a stable unique string per bet (e.g. `${wallet}-${marketId}-${Date.now()}`).
 */
export function recordPrediction({ id, wallet, marketId, marketTitle, side, points }) {
  const key = normalizeAddress(wallet)
  if (!key || !id) return

  // append to localStorage predictions list
  try {
    const raw  = window.localStorage.getItem(PREDICTIONS_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (!list.find(p => p.id === id)) {
      list.push({ id, wallet: key, marketId, marketTitle, side, points, createdAt: new Date().toISOString() })
      window.localStorage.setItem(PREDICTIONS_KEY, JSON.stringify(list))
    }
  } catch {}

  // fire-and-forget to server
  gqlSavePrediction({ id, wallet: key, marketId, marketTitle, side, points }).catch(() => {})
}

export function listWalletAccounts() {
  const map = readMap()
  return Object.values(map)
}

/** Deduct stake for a 5m BTC pick (no instant reward — settlement pays winners). */
export function stake5mPick(address, stake) {
  const key = normalizeAddress(address)
  if (!key) return { ok: false, reason: 'Missing wallet address.' }

  ensureWalletBonus(key)
  const map = readMap()
  const current = map[key]
  const stakeN = Number(stake)
  if (!Number.isFinite(stakeN) || stakeN <= 0) return { ok: false, reason: 'Invalid stake.' }
  if (stakeN > current.balance) return { ok: false, reason: 'Insufficient points balance.' }

  const next = {
    ...current,
    balance: current.balance - stakeN,
    totalPredictions: current.totalPredictions + 1,
    totalStaked: current.totalStaked + stakeN,
    updatedAt: new Date().toISOString(),
  }
  map[key] = next
  writeMap(map)
  syncWallet(next)
  notifyPointsChanged()
  return { ok: true, account: next, staked: stakeN }
}

/** Credit points after a 5m round resolves (win, push refund, etc.). */
export function credit5mPayout(address, amount) {
  const key = normalizeAddress(address)
  if (!key) return { ok: false, reason: 'Missing wallet address.' }

  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, reason: 'Invalid payout.' }

  ensureWalletBonus(key)
  const map = readMap()
  const current = map[key]
  const next = {
    ...current,
    balance: current.balance + amt,
    totalRewards: current.totalRewards + amt,
    updatedAt: new Date().toISOString(),
  }
  map[key] = next
  writeMap(map)
  syncWallet(next)
  notifyPointsChanged()
  return { ok: true, account: next, credited: amt }
}
