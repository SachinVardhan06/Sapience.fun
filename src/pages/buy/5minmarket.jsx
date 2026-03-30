import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TradeNavbar from '../../components/tradeNavbar'
import { useWalletAuth } from '../../context/walletAuth'
import { useWalletBalance } from '../../hooks/useWalletBalance'
import {
  BTC5M_MAX_WIN_RETURN_MULT,
  BTC5M_WINDOW_MS,
  connectCoinbaseBtcTicker,
  fetchBtcUsd,
  migrateWindowOutcomesFromRounds,
  msUntilSlotEnd,
  readPicks,
  readRounds,
  readWindowOutcomes,
  saveWindowOutcome,
  slotEndMs,
  slotIdFromTime,
  slotStartMs,
  winReturnMultFromTimeLeft,
  writePicks,
  writeRounds,
} from '../../utils/btc5mRounds'
import { triggerBetSprinkle } from '../../utils/betSprinkle'
import { credit5mPayout, recordPrediction, stake5mPick } from '../../utils/pointsLedger'

const LOCK_MS = 15_000
/** Past slots to scan for pending settlement (covers ~2 days if user was away). */
const SETTLEMENT_SLOT_LOOKBACK = 600
/** Rare HTTP sample if WebSocket stalls (Coinbase REST; stays under limits). */
const PRICE_BACKUP_POLL_MS = 45_000

function formatUsdFull(n) {
  if (n == null || !Number.isFinite(n)) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
/** Price difference below this (USD) counts as a push — stake returned. */
const PUSH_EPS_USD = 0.01
function formatCountdown(ms) {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function utcRangeLabel(slot) {
  const a = new Date(slotStartMs(slot)).toISOString().slice(11, 16)
  const b = new Date(slotEndMs(slot)).toISOString().slice(11, 16)
  return `${a}–${b} UTC`
}

function outcomeFromOpenClose(open, close) {
  if (open == null || close == null || !Number.isFinite(open) || !Number.isFinite(close)) return null
  if (Math.abs(close - open) < PUSH_EPS_USD) return 'PUSH'
  return close > open ? 'UP' : 'DOWN'
}

function isBtc5mPick(p) {
  return typeof p?.id === 'string' && p.id.startsWith('btc5m-')
}

function slotOutcomeFromStorage(slotId, offlineOutcomes, roundsMap, picksList) {
  const sk = String(slotId)
  const cached = offlineOutcomes[sk]?.outcome
  if (cached === 'UP' || cached === 'DOWN' || cached === 'PUSH') return cached
  const row = roundsMap[sk]
  const oc = outcomeFromOpenClose(row?.open, row?.close)
  if (oc) return oc
  const fromPick = picksList.find((p) => p.slotId === slotId && p.outcome && p.status !== 'pending')
  return fromPick?.outcome ?? null
}

/** Full live BTC/USD readout (replaces chart). */
function BtcLivePriceFull({ liveBtc, openPrice, priceError, lastUpdatedMs, streamConnected }) {
  const formatted = formatUsdFull(liveBtc)
  const openFmt = formatUsdFull(openPrice)
  const diff =
    liveBtc != null && openPrice != null && Number.isFinite(liveBtc) && Number.isFinite(openPrice)
      ? liveBtc - openPrice
      : null

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border px-3 py-4 sm:px-5 sm:py-5"
      style={{
        borderColor: 'var(--border-g)',
        background: 'linear-gradient(165deg, color-mix(in srgb, var(--accent) 8%, var(--input-bg)) 0%, var(--input-bg) 55%, var(--bg-glass) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 32px color-mix(in srgb, var(--accent) 6%, transparent)',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="relative flex h-2 w-2 shrink-0 rounded-full"
            style={{ background: '#22c55e', boxShadow: '0 0 10px rgba(34,197,94,0.85)' }}
            aria-hidden
          />
          <span
            className="netlifypixel text-[10px] font-black uppercase tracking-[0.2em] sm:text-[11px]"
            style={{ color: 'var(--accent-text)' }}
          >
            Live BTC/USD
          </span>
        </div>
        <span className="text-[10px] tabular-nums sm:text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {streamConnected ? 'WebSocket · Coinbase ticker' : 'Connecting stream…'}
          {lastUpdatedMs
            ? ` · ${new Date(lastUpdatedMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
            : ''}
        </span>
      </div>

      <p
        className="w-full break-all text-center font-mono font-bold leading-none tracking-tight text-[clamp(1.35rem,7.5vw,2.75rem)] tabular-nums sm:text-[clamp(1.5rem,6vw,3rem)]"
        style={{
          color: 'var(--text-heading)',
          textShadow: '0 0 40px color-mix(in srgb, var(--accent) 25%, transparent)',
        }}
        aria-live="polite"
      >
        {formatted ?? '—'}
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-center gap-x-6 gap-y-2 border-t pt-3 text-center" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Window open anchor
          </p>
          <p className="font-mono text-base font-bold tabular-nums sm:text-lg" style={{ color: '#facc15' }}>
            {openFmt ?? '…'}
          </p>
        </div>
        {diff != null ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              vs anchor
            </p>
            <p
              className="font-mono text-base font-bold tabular-nums sm:text-lg"
              style={{ color: diff >= 0 ? '#4ade80' : '#f87171' }}
            >
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                signDisplay: 'exceptZero',
              }).format(diff)}
            </p>
          </div>
        ) : null}
      </div>

      {priceError ? (
        <p className="mt-2 text-center text-[11px] font-medium leading-snug text-rose-300 sm:text-xs">{priceError}</p>
      ) : null}
    </div>
  )
}

export default function Btc5MinMarket() {
  const { walletAddress, walletShort } = useWalletAuth()
  const walletPts = useWalletBalance(walletAddress || '')

  const [now, setNow] = useState(() => Date.now())
  const [liveBtc, setLiveBtc] = useState(null)
  const [priceUpdatedAt, setPriceUpdatedAt] = useState(null)
  const [priceError, setPriceError] = useState('')
  const [btcStreamConnected, setBtcStreamConnected] = useState(false)
  const [rounds, setRounds] = useState(() => readRounds())
  const [picks, setPicks] = useState(() => readPicks())
  const [stakeInput, setStakeInput] = useState('25')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ text: '', ok: true })
  const [payoutFlash, setPayoutFlash] = useState(null)
  const picksRef = useRef(null)
  /** Bumps when offline outcome cache is backfilled so we re-read localStorage. */
  const [outcomesRev, setOutcomesRev] = useState(0)

  const slot = useMemo(() => slotIdFromTime(now), [now])
  const untilEnd = useMemo(() => msUntilSlotEnd(now), [now])
  const locked = untilEnd <= LOCK_MS

  const slotKey = String(slot)
  const roundOpen = rounds[slotKey]?.open ?? null

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const samplePrice = useCallback(async () => {
    try {
      setPriceError('')
      const p = await fetchBtcUsd()
      setLiveBtc(p)
      setPriceUpdatedAt(Date.now())
      return p
    } catch (e) {
      setPriceError(e?.message || 'Could not load BTC price.')
      return null
    }
  }, [])

  const sampleRef = useRef(samplePrice)
  sampleRef.current = samplePrice

  useEffect(() => {
    const tick = () => {
      void sampleRef.current()
    }
    tick()
    const id = setInterval(tick, PRICE_BACKUP_POLL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    const disconnect = connectCoinbaseBtcTicker(
      (p) => {
        if (!alive) return
        setLiveBtc(p)
        setPriceUpdatedAt(Date.now())
        setPriceError('')
      },
      {
        onOpen: () => {
          if (alive) setBtcStreamConnected(true)
        },
        onClose: () => {
          if (alive) setBtcStreamConnected(false)
        },
      },
    )
    return () => {
      alive = false
      disconnect()
    }
  }, [])

  const runSettlementRef = useRef(async () => {})

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void sampleRef.current()
        void runSettlementRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  /** Backfill offline window outcomes from older round rows (upgrade / offline-only data). */
  useEffect(() => {
    if (migrateWindowOutcomesFromRounds() > 0) setOutcomesRev((v) => v + 1)
  }, [])

  /** Sync rounds from storage when slot changes (e.g. other tab). */
  useEffect(() => {
    setRounds(readRounds())
  }, [slotKey])

  /**
   * Anchor open for the current slot: use latest live price once it exists.
   * (Avoids a stuck anchor if the first fetch fails while the poll later succeeds.)
   */
  useEffect(() => {
    if (liveBtc == null || !Number.isFinite(liveBtc)) return
    const r = readRounds()
    if (r[slotKey]?.open != null) return
    const next = {
      ...r,
      [slotKey]: { ...(r[slotKey] || {}), open: liveBtc, openAt: new Date().toISOString() },
    }
    writeRounds(next)
    setRounds(next)
  }, [liveBtc, slotKey])

  /** Resolve finished rounds: fetch close once, settle pending picks, credit wallets. Runs on timer + when tab/app regains focus. */
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const t = Date.now()
      const current = slotIdFromTime(t)
      let r = readRounds()

      for (let s = current - SETTLEMENT_SLOT_LOOKBACK; s < current; s++) {
        if (cancelled) return
        if (t < slotEndMs(s)) continue

        const sk = String(s)
        let row = { ...(r[sk] || {}) }

        let anchorOpen = row.open
        if (anchorOpen == null || !Number.isFinite(anchorOpen)) {
          const slotPicks = readPicks().filter((p) => p.slotId === s && Number.isFinite(p.openPrice))
          if (slotPicks.length) anchorOpen = slotPicks[0].openPrice
        }
        if (anchorOpen == null || !Number.isFinite(anchorOpen)) continue

        if (row.open == null || !Number.isFinite(row.open)) {
          row = { ...row, open: anchorOpen, openAt: row.openAt || new Date().toISOString() }
          r = { ...r, [sk]: row }
          writeRounds(r)
        }

        if (row.picksSettled) continue

        let close = row.close
        if (close == null) {
          try {
            close = await fetchBtcUsd()
          } catch {
            continue
          }
          row = { ...row, close, closeAt: new Date().toISOString() }
          r = { ...r, [sk]: row }
          writeRounds(r)
        }

        const o = row.open
        const c = row.close
        let outcome
        if (Math.abs(c - o) < PUSH_EPS_USD) outcome = 'PUSH'
        else if (c > o) outcome = 'UP'
        else outcome = 'DOWN'

        saveWindowOutcome(s, outcome)

        let list = readPicks()
        const hadPending = list.some((pick) => pick.slotId === s && pick.status === 'pending')
        if (hadPending) {
          list = list.map((pick) => {
            if (pick.slotId !== s || pick.status !== 'pending') return pick
            let payout = 0
            if (outcome === 'PUSH') payout = pick.stake
            else if (pick.side === outcome) {
              const mult =
                pick.winReturnMult != null && Number.isFinite(pick.winReturnMult)
                  ? pick.winReturnMult
                  : BTC5M_MAX_WIN_RETURN_MULT
              payout = Math.round(pick.stake * mult)
            }
            if (payout > 0) credit5mPayout(pick.wallet, payout)
            return {
              ...pick,
              status: outcome === 'PUSH' ? 'push' : pick.side === outcome ? 'won' : 'lost',
              closePrice: c,
              outcome,
              payout,
              resolvedAt: new Date().toISOString(),
            }
          })
          writePicks(list)
        }

        r = { ...r, [sk]: { ...row, picksSettled: true } }
        writeRounds(r)
      }

      if (!cancelled) {
        setRounds(readRounds())
        setPicks(readPicks())
      }
    }

    runSettlementRef.current = run

    run()
    const id = setInterval(run, 5000)
    const onPageShow = () => void run()
    const onWinFocus = () => void run()
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onWinFocus)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onWinFocus)
    }
  }, [])

  useEffect(() => {
    const prev = picksRef.current ?? []
    for (const p of picks) {
      const was = prev.find((x) => x.id === p.id)
      if (was?.status === 'pending' && p.status !== 'pending' && p.payout > 0) {
        setPayoutFlash({
          key: `${p.id}-${p.resolvedAt || ''}`,
          text:
            p.status === 'push'
              ? `Push — ${p.payout} pts returned to your balance.`
              : `${p.payout} pts credited — you called it (${p.side}).`,
        })
        break
      }
    }
    picksRef.current = picks
  }, [picks])

  useEffect(() => {
    if (!payoutFlash) return
    const t = setTimeout(() => setPayoutFlash(null), 6500)
    return () => clearTimeout(t)
  }, [payoutFlash])

  const stakeNum = Math.max(1, Math.floor(Number(stakeInput) || 0))

  const liveWinMult = useMemo(() => winReturnMultFromTimeLeft(untilEnd), [untilEnd])
  const liveWinTotalPts = useMemo(() => Math.round(stakeNum * liveWinMult), [stakeNum, liveWinMult])
  const liveWinProfitPts = useMemo(() => Math.max(0, liveWinTotalPts - stakeNum), [liveWinTotalPts, stakeNum])

  const myPickThisSlot = useMemo(
    () =>
      walletAddress
        ? picks.find((p) => p.slotId === slot && p.wallet === walletAddress.toLowerCase())
        : null,
    [picks, slot, walletAddress],
  )

  const recentPicks = useMemo(() => {
    return [...picks]
      .filter((p) => !walletAddress || p.wallet === walletAddress.toLowerCase())
      .sort((a, b) => b.slotId - a.slotId)
      .slice(0, 12)
  }, [picks, walletAddress])

  /** Sum of all stakes placed on this 5m window (local session — every wallet on this device). */
  const currentSlotTotalVolume = useMemo(() => {
    return picks.filter((p) => p.slotId === slot).reduce((sum, p) => sum + (Number(p.stake) || 0), 0)
  }, [picks, slot])

  const offlineWindowOutcomes = useMemo(() => readWindowOutcomes(), [rounds, picks, outcomesRev])

  const hasPlayedBtc5mOnDevice = useMemo(() => picks.some(isBtc5mPick), [picks])

  const lastFiveWindows = useMemo(() => {
    const rows = []
    for (let i = 1; i <= 5; i++) {
      const sid = slot - i
      rows.push({
        slotId: sid,
        label: utcRangeLabel(sid),
        outcome: slotOutcomeFromStorage(sid, offlineWindowOutcomes, rounds, picks),
      })
    }
    return rows
  }, [rounds, picks, slot, offlineWindowOutcomes])

  const placePick = async (side) => {
    if (!walletAddress || busy || locked || myPickThisSlot) return
    const stake = Math.max(1, Math.floor(Number(stakeInput) || 0))
    if (!Number.isFinite(stake) || stake < 1) {
      setNotice({ text: 'Enter a valid stake (min 1 pt).', ok: false })
      return
    }
    const open = rounds[slotKey]?.open
    if (open == null) {
      setNotice({ text: 'Waiting for anchor BTC price…', ok: false })
      return
    }

    setBusy(true)
    setNotice({ text: '', ok: true })
    const res = stake5mPick(walletAddress, stake)
    if (!res.ok) {
      setNotice({ text: res.reason, ok: false })
      setBusy(false)
      return
    }

    const winReturnMult = winReturnMultFromTimeLeft(msUntilSlotEnd(Date.now()))
    const id = `btc5m-${slot}-${walletAddress.toLowerCase()}`
    const pick = {
      id,
      wallet: walletAddress.toLowerCase(),
      slotId: slot,
      side,
      stake,
      openPrice: open,
      winReturnMult,
      status: 'pending',
      placedAt: new Date().toISOString(),
    }
    const list = [...readPicks().filter((p) => p.id !== id), pick]
    writePicks(list)
    setPicks(list)

    recordPrediction({
      id,
      wallet: walletAddress,
      marketId: `btc5m-${slot}`,
      marketTitle: `BTC 5m ${utcRangeLabel(slot)}`,
      side,
      points: stake,
    })

    const winPts = Math.round(stake * winReturnMult)
    setNotice({
      text: `${side} locked · on win ~${winPts} pts (${winReturnMult.toFixed(2)}× stake) — earlier bets pay more.`,
      ok: true,
    })
    triggerBetSprinkle()
    setBusy(false)
  }

  return (
    <main
      id="main-content"
      className="relative flex flex-col overscroll-none antialiased"
      style={{
        boxSizing: 'border-box',
        background: 'var(--bg-page)',
        color: 'var(--text-body)',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        paddingTop: 'var(--beta-banner-height, 0px)',
      }}
    >
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0" style={{ background: 'var(--bg-page)' }} />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -5%, var(--glow-radial), transparent)' }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom,var(--scanline) 0,var(--scanline) 1px,transparent 1px,transparent 3px)',
          }}
        />
      </div>

      <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col">
        <TradeNavbar />

        <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-3 pb-2 pt-1 sm:px-4">
          <div className="mb-1 shrink-0 text-center">
            <p
              className="netlifypixel text-[10px] font-black uppercase tracking-[0.2em] sm:text-[11px]"
              style={{ color: 'var(--accent-text)' }}
            >
              {BTC5M_WINDOW_MS / 60_000}m · UTC · time-weighted win
            </p>
            <h1 className="text-lg font-bold leading-tight sm:text-xl" style={{ color: 'var(--text-heading)' }}>
              BTC 5-minute market
            </h1>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:items-stretch">
            {/* Recent trades — left on desktop */}
            <aside
              className="order-2 flex max-h-[min(40vh,220px)] min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl border p-3 sm:max-h-[min(38vh,260px)] lg:order-1 lg:max-h-none lg:w-52 lg:max-w-52 xl:w-56 xl:max-w-56"
              style={{
                background: 'var(--bg-glass2)',
                borderColor: 'var(--border-g2)',
                boxShadow: '0 0 28px color-mix(in srgb, var(--accent) 6%, transparent)',
              }}
            >
              <p
                className="mb-2 shrink-0 text-[11px] font-bold uppercase tracking-wider sm:text-xs"
                style={{ color: 'var(--accent-text)' }}
              >
                Recent trades
              </p>
              {!walletAddress ? (
                <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                  Connect wallet to see your history.
                </p>
              ) : recentPicks.length === 0 ? (
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  No picks yet.
                </p>
              ) : (
                <ul
                  className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 text-[11px] sm:text-xs"
                  style={{ scrollbarGutter: 'stable' }}
                >
                  {recentPicks.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-glass)' }}
                    >
                      <span className="min-w-0 truncate font-mono" style={{ color: 'var(--text-secondary)' }}>
                        #{p.slotId}{' '}
                        <span style={{ color: 'var(--text-body)' }}>{p.side}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span
                          style={{
                            color:
                              p.status === 'won' || p.status === 'push'
                                ? 'var(--accent-text)'
                                : p.status === 'lost'
                                  ? '#f87171'
                                  : 'var(--text-secondary)',
                          }}
                        >
                          {p.status}
                        </span>
                        {p.payout > 0 ? (
                          <span className="ml-1" style={{ color: 'var(--accent-text)' }}>
                            +{p.payout}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            {/* Main BTC 5m panel */}
            <div
              className="order-1 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-2xl border p-3 sm:p-4 lg:order-2"
              style={{
                background: 'var(--bg-glass2)',
                borderColor: 'var(--border-g2)',
                boxShadow: '0 0 40px color-mix(in srgb, var(--accent) 8%, transparent)',
              }}
            >
            <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Current window
                </p>
                <p className="text-base font-bold tabular-nums sm:text-lg" style={{ color: 'var(--text-heading)' }}>
                  {utcRangeLabel(slot)}
                </p>
                <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  #{slot}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Closes
                </p>
                <p
                  className="font-mono text-xl font-semibold tabular-nums tracking-[0.12em] sm:text-2xl sm:tracking-[0.18em]"
                  style={{
                    color: locked ? '#f87171' : 'var(--accent-text)',
                    textShadow: locked ? '0 0 14px rgba(248,113,113,0.45)' : 'var(--glow-small)',
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {formatCountdown(untilEnd)}
                </p>
                {locked ? (
                  <p className="text-[11px] font-semibold text-rose-300 sm:text-xs">Locked</p>
                ) : null}
              </div>
            </div>

            <div className="shrink-0">
              <BtcLivePriceFull
                liveBtc={liveBtc}
                openPrice={roundOpen}
                priceError={priceError}
                lastUpdatedMs={priceUpdatedAt}
                streamConnected={btcStreamConnected}
              />
            </div>

            {payoutFlash ? (
              <div
                key={payoutFlash.key}
                className="shrink-0 rounded-lg border px-2 py-1.5 text-center text-[12px] font-semibold leading-snug sm:text-[13px]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  color: 'var(--accent-text)',
                  boxShadow: 'var(--glow-small)',
                }}
                role="status"
              >
                Points distributed · {payoutFlash.text}
              </div>
            ) : null}

            <p
              className="shrink-0 text-[11px] leading-relaxed sm:text-xs"
              style={{ borderColor: 'var(--border-g)', color: 'var(--text-body)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--accent-text)' }}>Win</span> ~{liveWinTotalPts} pts
              <span style={{ color: 'var(--text-secondary)' }}> (+{liveWinProfitPts} net · {liveWinMult.toFixed(2)}×)</span>{' '}
              — drops as time runs out ·{' '}
              <span className="font-semibold text-amber-300">Push</span> {stakeNum} ·{' '}
              <span className="font-semibold text-rose-300">Lose</span> 0
            </p>

            <div className="flex shrink-0 items-end gap-2">
              <label className="sr-only" htmlFor="btc5m-stake">
                Stake points
              </label>
              <div className="min-w-0 flex-1">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Stake
                </span>
                <input
                  id="btc5m-stake"
                  type="number"
                  min={1}
                  value={stakeInput}
                  onChange={(e) => setStakeInput(e.target.value)}
                  disabled={Boolean(myPickThisSlot) || locked}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-g)',
                    color: 'var(--text-body)',
                  }}
                />
              </div>
            </div>

            {/* UP / DOWN — same 3-layer 3D pattern as YES / NO on Markets */}
            <div className="grid min-h-0 shrink-0 grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!walletAddress || busy || locked || myPickThisSlot || roundOpen == null}
                onClick={() => placePick('UP')}
                className="group relative h-8 w-full min-w-0 shrink-0 cursor-pointer border-none bg-transparent p-0 text-[11px] font-black disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:text-xs"
              >
                <span className="absolute inset-0 translate-y-[2px] rounded bg-[#0a7a12] transition-transform duration-200 ease-out group-hover:translate-y-[3px] group-active:translate-y-px group-disabled:translate-y-[2px]" />
                <span className="absolute inset-0 rounded bg-[#0da91f]" />
                <span
                  className="relative flex h-full -translate-y-[2px] items-center justify-center rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform duration-200 ease-out group-hover:-translate-y-[3px] group-active:-translate-y-px group-disabled:translate-y-0"
                  style={{
                    background: myPickThisSlot?.side === 'UP' ? '#13f227' : 'var(--yes-inactive)',
                    color: myPickThisSlot?.side === 'UP' ? '#052209' : 'var(--text-heading)',
                    textShadow:
                      myPickThisSlot?.side === 'UP'
                        ? 'none'
                        : '0 0 12px color-mix(in srgb, var(--bg-page) 80%, transparent), 0 1px 0 rgba(0,0,0,0.35)',
                  }}
                >
                  UP
                </span>
              </button>

              <button
                type="button"
                disabled={!walletAddress || busy || locked || myPickThisSlot || roundOpen == null}
                onClick={() => placePick('DOWN')}
                className="group relative h-8 w-full min-w-0 shrink-0 cursor-pointer border-none bg-transparent p-0 text-[11px] font-black disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:text-xs"
              >
                <span className="absolute inset-0 translate-y-[2px] rounded bg-[#7a0a0a] transition-transform duration-200 ease-out group-hover:translate-y-[3px] group-active:translate-y-px group-disabled:translate-y-[2px]" />
                <span className="absolute inset-0 rounded bg-[#b91c1c]" />
                <span
                  className="relative flex h-full -translate-y-[2px] items-center justify-center rounded font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-200 ease-out group-hover:-translate-y-[3px] group-active:-translate-y-px group-disabled:translate-y-0"
                  style={{
                    background: myPickThisSlot?.side === 'DOWN' ? '#ef4444' : 'rgba(239,68,68,0.55)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  }}
                >
                  DOWN
                </span>
              </button>
            </div>
            <p className="shrink-0 text-center text-[11px] leading-snug sm:text-xs" style={{ color: 'var(--text-secondary)' }}>
              UP/DOWN · win ~{liveWinTotalPts} pts now (+{liveWinProfitPts} net) — earlier in the window = more points
            </p>

            <div className="shrink-0 space-y-1">
              {!walletAddress ? (
                <p className="text-center text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Connect wallet to play.
                </p>
              ) : null}
              {myPickThisSlot ? (
                <p className="text-center text-[11px] font-medium leading-tight" style={{ color: 'var(--accent-text)' }}>
                  {myPickThisSlot.side} {myPickThisSlot.stake} pts — {myPickThisSlot.status}
                  {myPickThisSlot.status === 'pending' &&
                  myPickThisSlot.winReturnMult != null &&
                  Number.isFinite(myPickThisSlot.winReturnMult)
                    ? ` · win ~${Math.round(myPickThisSlot.stake * myPickThisSlot.winReturnMult)} pts (${myPickThisSlot.winReturnMult.toFixed(2)}×)`
                    : null}
                  {myPickThisSlot.payout ? ` · +${myPickThisSlot.payout}` : ''}
                </p>
              ) : null}
              {notice.text ? (
                <p
                  className={`text-center text-[11px] font-medium leading-snug sm:text-xs ${notice.ok ? '' : 'text-rose-300'}`}
                  style={notice.ok ? { color: 'var(--text-body)' } : undefined}
                >
                  {notice.text}
                </p>
              ) : null}
            </div>

            <p className="shrink-0 pt-1 text-center text-[11px] sm:text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="netlifypixel font-black tabular-nums" style={{ color: 'var(--accent-text)' }}>
                {walletPts.toLocaleString()}
              </span>{' '}
              pts
              {walletShort ? (
                <>
                  {' '}
                  · <span style={{ color: 'var(--text-body)' }}>{walletShort}</span>
                </>
              ) : null}
            </p>
            </div>

            {/* Last 5 windows + current volume — right on desktop */}
            <aside
              className="order-3 flex max-h-[min(36vh,240px)] min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl border p-3 sm:max-h-[min(34vh,280px)] lg:max-h-none lg:w-52 lg:max-w-52 xl:w-56 xl:max-w-56"
              style={{
                background: 'var(--bg-glass2)',
                borderColor: 'var(--border-g2)',
                boxShadow: '0 0 28px color-mix(in srgb, var(--accent) 6%, transparent)',
              }}
            >
              <p
                className="mb-2 shrink-0 text-[11px] font-bold uppercase tracking-wider sm:text-xs"
                style={{ color: 'var(--accent-text)' }}
              >
                Current window volume
              </p>
              <p
                className="mb-3 shrink-0 font-mono text-lg font-bold tabular-nums sm:text-xl"
                style={{ color: 'var(--text-heading)' }}
              >
                {currentSlotTotalVolume.toLocaleString()}{' '}
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  pts staked
                </span>
              </p>
              <p
                className="mb-1.5 shrink-0 border-t pt-2 text-[11px] font-bold uppercase tracking-wider sm:text-xs"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--accent-text)' }}
              >
                Last 5 windows
              </p>
              {!hasPlayedBtc5mOnDevice ? (
                <p className="text-[11px] leading-relaxed sm:text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Place your first 5m trade to unlock this feed. Results are saved on this device only (offline-friendly).
                </p>
              ) : (
                <ul
                  className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 text-[11px] sm:text-xs"
                  style={{ scrollbarGutter: 'stable' }}
                >
                  {lastFiveWindows.map((w) => {
                    const oc = w.outcome
                    const color =
                      oc === 'UP' ? '#4ade80' : oc === 'DOWN' ? '#f87171' : oc === 'PUSH' ? '#fbbf24' : 'var(--text-secondary)'
                    return (
                      <li
                        key={w.slotId}
                        className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-glass)' }}
                      >
                        <span className="min-w-0 truncate font-mono text-[10px] sm:text-[11px]" style={{ color: 'var(--text-body)' }}>
                          {w.label}
                        </span>
                        <span className="shrink-0 font-black tabular-nums" style={{ color }}>
                          {oc ?? '—'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </aside>
          </div>
        </div>
      </div>
    </main>
  )
}
