import { useEffect, useMemo, useState } from 'react'
import TradeNavbar from '../../components/tradeNavbar'
import { useWalletAuth } from '../../context/walletAuth'
import {
  BONUS_POINTS,
  PREDICTIONS_KEY,
  POINTS_CHANGED_EVENT,
  listWalletAccounts,
  mergePredictionLists,
  mergeWalletListsForLeaderboard,
  walletNetProfit,
} from '../../utils/pointsLedger'
import { fetchWallets, fetchPredictions } from '../../utils/graphqlClient'

function shortAddr(a) {
  if (!a) return '—'
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function LeaderboardPage() {
  const { walletAddress } = useWalletAuth()

  const [tab, setTab]             = useState('rankings')
  const [gqlWallets, setGqlWallets]         = useState(null)
  const [gqlPredictions, setGqlPredictions] = useState(null)
  const [pointsTick, setPointsTick]       = useState(0)

  useEffect(() => {
    const on = () => setPointsTick((t) => t + 1)
    window.addEventListener(POINTS_CHANGED_EVENT, on)
    return () => window.removeEventListener(POINTS_CHANGED_EVENT, on)
  }, [])

  // Try to fetch from GraphQL; merge with local wallets / predictions
  useEffect(() => {
    fetchWallets()
      .then((rows) => setGqlWallets(rows))
      .catch(() => setGqlWallets(null))

    fetchPredictions()
      .then((rows) => setGqlPredictions(rows))
      .catch(() => setGqlPredictions(null))
  }, [pointsTick])

  const localPredictions = useMemo(() => {
    try {
      const raw = localStorage.getItem(PREDICTIONS_KEY)
      const all = raw ? JSON.parse(raw) : []
      return Array.isArray(all) ? all : []
    } catch {
      return []
    }
  }, [pointsTick])

  const accounts = useMemo(
    () => mergeWalletListsForLeaderboard(gqlWallets ?? [], listWalletAccounts()),
    [gqlWallets, pointsTick],
  )

  const predictions = useMemo(
    () => mergePredictionLists(gqlPredictions, localPredictions),
    [gqlPredictions, localPredictions],
  )

  const ranked = useMemo(
    () =>
      [...accounts].sort((a, b) => {
        const d = walletNetProfit(b) - walletNetProfit(a)
        if (d !== 0) return d
        return (Number(b.balance) || 0) - (Number(a.balance) || 0)
      }),
    [accounts],
  )

  const combinedPnL = useMemo(
    () => ranked.reduce((s, a) => s + walletNetProfit(a), 0),
    [ranked],
  )

  const myRank = useMemo(() => {
    if (!walletAddress) return null
    const idx = ranked.findIndex(a => a.address === walletAddress.toLowerCase())
    return idx >= 0 ? idx + 1 : null
  }, [ranked, walletAddress])

  return (
    <main
      id="main-content"
      className="relative overflow-y-auto antialiased"
      style={{
        boxSizing: 'border-box',
        background: 'var(--bg-page)',
        color: 'var(--text-body)',
        minHeight: '100dvh',
        paddingTop: 'var(--beta-banner-height, 0px)',
      }}
    >

      {/* ── Background ─────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0" style={{ background: 'var(--bg-page)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -5%, var(--glow-radial), transparent)' }} />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom,var(--scanline) 0,var(--scanline) 1px,transparent 1px,transparent 3px)',
          }}
        />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 45%, var(--vignette) 100%)' }} />
      </div>

      <div className="relative z-10 w-full">
        <TradeNavbar />

        <div className="mx-auto max-w-5xl px-4 pb-16">
        {/* ── Hero heading ───────────────────────────────────────────── */}
        <div className="mt-8 mb-6 text-center">
          <h1 className="netlifypixel text-[clamp(36px,7vw,64px)] font-black leading-[0.9] tracking-tight" style={{ color: 'var(--text-heading)' }}>
            Wallet Points{' '}
            <span style={{ color: 'var(--accent-text)', textShadow: 'var(--glow-heading)' }}>
              Leaderboard
            </span>
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Every wallet starts with {BONUS_POINTS.toLocaleString()} bonus points. Ranks are by net profit (balance
            minus that starting stack)—not raw balance.
          </p>
        </div>

        {/* ── Stats strip ────────────────────────────────────────────── */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Wallets',        value: ranked.length },
            { label: 'Predictions',    value: predictions.length },
            {
              label: 'Combined P&L',
              value: `${new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(combinedPnL)} pts`,
              glow: true,
            },
            { label: 'Your Rank',      value: myRank ? `#${myRank}` : '—', glow: !!myRank },
          ].map(s => (
            <div
              key={s.label}
              className="rounded-xl border px-4 py-4"
              style={{ borderColor: 'var(--border-g)', background: 'var(--bg-glass)', backdropFilter: 'blur(6px)' }}
            >
              <p
                className="netlifypixel text-[9px] font-black uppercase tracking-[0.2em]"
                style={{ color: 'var(--accent-label)' }}
              >
                {s.label}
              </p>
              <p
                className="mt-2 text-2xl font-black tabular-nums"
                style={{
                  color: s.glow ? 'var(--accent-text)' : 'var(--text-heading)',
                  textShadow: s.glow ? 'var(--glow-balance)' : 'none',
                }}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────── */}
        <div
          className="mb-4 flex gap-1 rounded-xl border p-1"
          style={{ borderColor: 'var(--border-g)', background: 'var(--bg-glass)', width: 'fit-content' }}
        >
          {['rankings', 'activity'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded-lg px-5 py-1.5 text-[12px] font-bold uppercase tracking-wide transition"
              style={tab === t
                ? { background: 'var(--tab-active-bg)', color: 'var(--accent-text)', textShadow: 'var(--glow-small)' }
                : { background: 'transparent', color: 'var(--text-dim)' }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Rankings table ─────────────────────────────────────────── */}
        {tab === 'rankings' && (
          <div
            className="overflow-hidden rounded-2xl border"
            style={{ borderColor: 'var(--border-g)', background: 'var(--bg-glass)', backdropFilter: 'blur(6px)' }}
          >
            {/* Header */}
            <div
              className="grid border-b px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.15em]"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
                gridTemplateColumns: '60px 1fr 100px 100px 150px',
              }}
            >
              <span>Rank</span>
              <span>Wallet</span>
              <span>Profit</span>
              <span>Balance</span>
              <span>Activity</span>
            </div>

            {ranked.length === 0 ? (
              <p
                className="netlifypixel px-5 py-10 text-center text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: 'var(--accent-empty)' }}
              >
                No wallets yet.
              </p>
            ) : ranked.map((row, i) => {
              const isMe = row.address === walletAddress?.toLowerCase()
              const pnl = walletNetProfit(row)
              return (
                <div
                  key={row.address}
                  className="grid items-center border-b px-5 py-3 transition-colors duration-100 last:border-b-0"
                  style={{
                    borderColor: 'var(--border-row)',
                    gridTemplateColumns: '60px 1fr 100px 100px 150px',
                    background: isMe ? 'var(--accent-surface)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isMe) e.currentTarget.style.background = 'var(--row-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isMe ? 'var(--accent-surface)' : 'transparent' }}
                >
                  {/* Rank */}
                  <div className="flex items-center gap-1.5">
                    {i < 3
                      ? <span className="text-[16px] leading-none">{MEDALS[i]}</span>
                      : <span
                          className="netlifypixel text-[12px] font-black"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          #{i + 1}
                        </span>
                    }
                  </div>

                  {/* Address */}
                  <div className="flex items-center gap-2">
                    <code
                      className="text-[12px]"
                      style={{ color: isMe ? 'var(--accent-text)' : 'var(--text-body)' }}
                    >
                      {shortAddr(row.address)}
                    </code>
                    {isMe && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-black"
                        style={{ background: 'var(--accent-surface-strong)', color: 'var(--accent-text)' }}
                      >
                        you
                      </span>
                    )}
                  </div>

                  {/* Profit (net vs starting bonus) */}
                  <span
                    className="text-[13px] font-bold tabular-nums"
                    style={{
                      color: pnl > 0 ? '#4ade80' : pnl < 0 ? '#f87171' : 'var(--text-muted)',
                      textShadow: isMe ? 'var(--glow-balance)' : 'none',
                    }}
                  >
                    {new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(pnl)} pts
                  </span>

                  {/* Balance */}
                  <span
                    className="text-[13px] font-semibold tabular-nums"
                    style={{
                      color: isMe ? 'var(--accent-text)' : 'var(--text-heading)',
                    }}
                  >
                    {Number(row.balance || 0).toLocaleString()} pts
                  </span>

                  {/* Activity */}
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {row.totalPredictions || 0} trades · {Number(row.totalRewards || 0).toLocaleString()} rewards
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Activity feed ──────────────────────────────────────────── */}
        {tab === 'activity' && (
          <div
            className="overflow-hidden rounded-2xl border"
            style={{ borderColor: 'var(--border-g)', background: 'var(--bg-glass)', backdropFilter: 'blur(6px)' }}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="netlifypixel text-[11px] font-black uppercase tracking-[0.2em]"
                style={{ color: 'var(--accent-text)', textShadow: 'var(--glow-small)' }}
              >
                Recent Activity
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Latest {Math.min(predictions.length, 20)} entries
              </span>
            </div>

            {/* Column header */}
            <div
              className="grid border-b px-5 py-2 text-[10px] font-black uppercase tracking-[0.15em]"
              style={{
                borderColor: 'var(--border-row)',
                color: 'var(--text-muted)',
                gridTemplateColumns: '55px 90px 1fr 80px',
              }}
            >
              <span>Side</span>
              <span>Wallet</span>
              <span>Market</span>
              <span>Points</span>
            </div>

            {predictions.length === 0 ? (
              <p
                className="netlifypixel px-5 py-10 text-center text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: 'var(--accent-empty)' }}
              >
                No predictions placed yet.
              </p>
            ) : predictions.slice(0, 20).map(p => {
              const isMe = p.wallet?.toLowerCase() === walletAddress?.toLowerCase()
              return (
                <div
                  key={p.id}
                  className="grid items-center border-b px-5 py-2.5 transition-colors duration-100 last:border-b-0"
                  style={{
                    borderColor: 'var(--border-row)',
                    gridTemplateColumns: '55px 90px 1fr 80px',
                    background: isMe ? 'var(--accent-surface)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isMe) e.currentTarget.style.background = 'var(--row-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isMe ? 'var(--accent-surface)' : 'transparent' }}
                >
                  <span
                    className="w-fit rounded px-1.5 py-0.5 text-[9px] font-black"
                    style={p.side === 'YES'
                      ? { background: 'var(--accent-surface-strong)', color: 'var(--accent-text)' }
                      : { background: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                  >
                    {p.side}
                  </span>
                  <code className="text-[11px]" style={{ color: isMe ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                    {shortAddr(p.wallet)}
                  </code>
                  <p className="truncate pr-4 text-[12px]" style={{ color: 'var(--text-body)' }}>{p.marketTitle}</p>
                  <p className="text-[12px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {Number(p.points || 0).toLocaleString()} pts
                  </p>
                </div>
              )
            })}
          </div>
        )}
        </div>
      </div>
    </main>
  )
}
