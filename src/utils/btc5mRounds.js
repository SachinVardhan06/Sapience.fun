/** 5-minute BTC prediction windows aligned to Unix epoch (same instant for all users). */
export const BTC5M_WINDOW_MS = 5 * 60 * 1000

/** Total return on win at **start** of window (2× stake credited = stake profit). */
export const BTC5M_MAX_WIN_RETURN_MULT = 2
/** Total return on win with **no** time left (stake back only — no profit). */
export const BTC5M_MIN_WIN_RETURN_MULT = 1

/**
 * Win payout multiplier (total pts credited = round(stake × this)).
 * Drops linearly as the window runs out — bet early for up to 2×, late for closer to 1×.
 */
export function winReturnMultFromTimeLeft(untilEndMs) {
  const u = Math.max(0, untilEndMs)
  const r = Math.min(1, u / BTC5M_WINDOW_MS)
  return BTC5M_MIN_WIN_RETURN_MULT + r * (BTC5M_MAX_WIN_RETURN_MULT - BTC5M_MIN_WIN_RETURN_MULT)
}
export const BTC5M_ROUNDS_KEY = 'btc5m_rounds_v1'
export const BTC5M_PICKS_KEY = 'btc5m_picks_v1'
/** Offline cache of settled UP/DOWN/PUSH per slot (for “last windows” UI). */
export const BTC5M_OUTCOMES_KEY = 'btc5m_window_outcomes_v1'

const PUSH_EPS_OUTCOME = 0.01
const WINDOW_OUTCOMES_MAX = 400

export function slotIdFromTime(t = Date.now()) {
  return Math.floor(t / BTC5M_WINDOW_MS)
}

export function slotStartMs(slot) {
  return slot * BTC5M_WINDOW_MS
}

export function slotEndMs(slot) {
  return (slot + 1) * BTC5M_WINDOW_MS
}

export function msUntilSlotEnd(now = Date.now()) {
  const end = slotEndMs(slotIdFromTime(now))
  return Math.max(0, end - now)
}

export function readRounds() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(BTC5M_ROUNDS_KEY)
    const o = raw ? JSON.parse(raw) : {}
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

export function writeRounds(rounds) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(BTC5M_ROUNDS_KEY, JSON.stringify(rounds))
}

export function readPicks() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(BTC5M_PICKS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function writePicks(picks) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(BTC5M_PICKS_KEY, JSON.stringify(picks))
}

/** @returns {Record<string, { outcome: 'UP'|'DOWN'|'PUSH', savedAt: string }>} */
export function readWindowOutcomes() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(BTC5M_OUTCOMES_KEY)
    const o = raw ? JSON.parse(raw) : {}
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

function writeWindowOutcomes(map) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(BTC5M_OUTCOMES_KEY, JSON.stringify(map))
}

/**
 * Persist a settled window outcome locally (survives refresh / app close).
 * @returns {boolean} true if storage was updated
 */
export function saveWindowOutcome(slotId, outcome) {
  if (outcome !== 'UP' && outcome !== 'DOWN' && outcome !== 'PUSH') return false
  const sk = String(slotId)
  const map = readWindowOutcomes()
  if (map[sk]?.outcome === outcome) return false
  map[sk] = { outcome, savedAt: new Date().toISOString() }
  const keys = Object.keys(map)
  if (keys.length > WINDOW_OUTCOMES_MAX) {
    const sorted = [...keys].sort(
      (a, b) => new Date(map[a].savedAt).getTime() - new Date(map[b].savedAt).getTime(),
    )
    for (let i = 0; i < keys.length - WINDOW_OUTCOMES_MAX; i++) delete map[sorted[i]]
  }
  writeWindowOutcomes(map)
  return true
}

function outcomeFromRoundRow(row) {
  const o = row?.open
  const c = row?.close
  if (o == null || c == null || !Number.isFinite(o) || !Number.isFinite(c)) return null
  if (Math.abs(c - o) < PUSH_EPS_OUTCOME) return 'PUSH'
  return c > o ? 'UP' : 'DOWN'
}

/**
 * Backfill outcome cache from existing round rows (open+close) after upgrade or offline use.
 * @returns {number} number of newly written slots
 */
export function migrateWindowOutcomesFromRounds() {
  if (typeof window === 'undefined') return 0
  const rounds = readRounds()
  let n = 0
  for (const sk of Object.keys(rounds)) {
    const oc = outcomeFromRoundRow(rounds[sk])
    if (oc && saveWindowOutcome(sk, oc)) n += 1
  }
  return n
}

const fetchOpts = {
  headers: { Accept: 'application/json' },
  cache: 'no-store',
}

function parsePositiveUsd(raw) {
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Live BTC/USD — cache-busted; CoinGecko first, Coinbase fallback if rate-limited/down. */
export async function fetchBtcUsd() {
  const bust = Date.now()
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&_=${bust}`,
      fetchOpts,
    )
    if (r.ok) {
      const j = await r.json()
      const n = parsePositiveUsd(j?.bitcoin?.usd)
      if (n != null) return n
    }
  } catch {
    /* fall through */
  }

  const r2 = await fetch(`https://api.coinbase.com/v2/prices/BTC-USD/spot?_=${bust}`, fetchOpts)
  if (!r2.ok) throw new Error(`Price HTTP ${r2.status}`)
  const j2 = await r2.json()
  const n2 = parsePositiveUsd(j2?.data?.amount)
  if (n2 == null) throw new Error('Bad price payload')
  return n2
}

/** Coinbase Exchange public WebSocket — last-trade BTC-USD (push, no poll). */
export const COINBASE_EXCHANGE_WS = 'wss://ws-feed.exchange.coinbase.com'

/**
 * Stream BTC-USD from Coinbase Exchange `ticker` channel (updates on trades).
 * @param {(priceUsd: number) => void} onPrice
 * @param {{ onOpen?: () => void; onClose?: () => void; onTransientError?: (e: Error) => void }} [hooks]
 * @returns {() => void} disconnect (idempotent)
 */
export function connectCoinbaseBtcTicker(onPrice, hooks = {}) {
  let ws
  let stopped = false
  let reconnectTimer
  let attempt = 0

  const clearTimer = () => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (stopped) return
    clearTimer()
    const base = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))
    const jitter = Math.floor(Math.random() * 400)
    reconnectTimer = setTimeout(connect, base + jitter)
    attempt += 1
  }

  function connect() {
    if (stopped || typeof WebSocket === 'undefined') return

    clearTimer()
    try {
      ws = new WebSocket(COINBASE_EXCHANGE_WS)
    } catch (e) {
      hooks.onTransientError?.(e instanceof Error ? e : new Error(String(e)))
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      attempt = 0
      hooks.onOpen?.()
      try {
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            product_ids: ['BTC-USD'],
            channels: ['ticker'],
          }),
        )
      } catch (e) {
        hooks.onTransientError?.(e instanceof Error ? e : new Error(String(e)))
      }
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'ticker' && msg.product_id === 'BTC-USD') {
          const n = parsePositiveUsd(msg.price)
          if (n != null) onPrice(n)
        }
      } catch (e) {
        hooks.onTransientError?.(e instanceof Error ? e : new Error(String(e)))
      }
    }

    ws.onerror = () => {
      hooks.onTransientError?.(new Error('WebSocket error'))
    }

    ws.onclose = () => {
      hooks.onClose?.()
      ws = undefined
      if (!stopped) scheduleReconnect()
    }
  }

  connect()

  return () => {
    stopped = true
    clearTimer()
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
    ws = undefined
  }
}
