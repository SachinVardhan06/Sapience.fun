import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TradeNavbar from '../../components/tradeNavbar'
import sapienceLogo from '../../assets/sapiencelogo.jpeg'
import { useWalletAuth } from '../../context/walletAuth'
import {
  BONUS_POINTS,
  PREDICTIONS_KEY,
  POINTS_CHANGED_EVENT,
  ensureWalletBonus,
  getWalletAccount,
  mergePredictionLists,
  mergeWalletRecords,
} from '../../utils/pointsLedger'
import { fetchWallet, fetchPredictions } from '../../utils/graphqlClient'

function shortAddr(a) {
  if (!a) return '—'
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ProfilePage() {
  const navigate      = useNavigate()
  const { walletAddress, walletShort, disconnectWallet } = useWalletAuth()
  const [copied, setCopied] = useState(false)

  const [gqlAccount,     setGqlAccount]     = useState(null)
  const [gqlPredictions, setGqlPredictions] = useState(null)
  const [pointsTick, setPointsTick]       = useState(0)

  useEffect(() => {
    const on = () => setPointsTick((t) => t + 1)
    window.addEventListener(POINTS_CHANGED_EVENT, on)
    return () => window.removeEventListener(POINTS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    if (walletAddress) ensureWalletBonus(walletAddress)
  }, [walletAddress])

  // Fetch live data from GraphQL; merge with local so balance / history stay correct if server lags
  useEffect(() => {
    if (!walletAddress) return
    fetchWallet(walletAddress)
      .then((w) => { if (w) setGqlAccount(w) })
      .catch(() => {})

    fetchPredictions(walletAddress)
      .then((rows) => setGqlPredictions(rows))
      .catch(() => {})
  }, [walletAddress])

  const localAccount = useMemo(() => {
    if (!walletAddress) return null
    return getWalletAccount(walletAddress)
  }, [walletAddress, pointsTick])

  const account = useMemo(
    () => mergeWalletRecords(gqlAccount, localAccount),
    [gqlAccount, localAccount],
  )

  const localPredictions = useMemo(() => {
    if (!walletAddress) return []
    try {
      const raw = localStorage.getItem(PREDICTIONS_KEY)
      const all = raw ? JSON.parse(raw) : []
      return Array.isArray(all) ? all.filter(p => p.wallet?.toLowerCase() === walletAddress.toLowerCase()) : []
    } catch {
      return []
    }
  }, [walletAddress, pointsTick])

  const predictions = useMemo(
    () => mergePredictionLists(gqlPredictions, localPredictions),
    [gqlPredictions, localPredictions],
  )

  const stats = useMemo(() => {
    const yes    = predictions.filter(p => p.side === 'YES').length
    const no     = predictions.filter(p => p.side === 'NO').length
    const staked = predictions.reduce((s, p) => s + (Number(p.points) || 0), 0)
    return { yes, no, staked, total: predictions.length }
  }, [predictions])

  const copyAddress = async () => {
    if (!walletAddress) return
    await navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const signOut = async () => {
    await disconnectWallet()
    navigate('/access', { replace: true })
  }

  const balance = account?.balance ?? BONUS_POINTS

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

      {/* ── Background ──────────────────────────────────────────────── */}
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

        <div className="mx-auto flex max-w-4xl flex-col px-4 pb-16">
        {/* ── Profile card ──────────────────────────────────────────── */}
        <div
          className="mt-6 overflow-hidden rounded-2xl border"
          style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)', backdropFilter: 'blur(8px)' }}
        >
          {/* Top banner */}
          <div
            className="relative h-24 w-full"
            style={{ background: 'var(--profile-banner)' }}
          >
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: 'repeating-linear-gradient(to bottom,var(--scanline) 0,var(--scanline) 1px,transparent 1px,transparent 3px)',
            }} />
          </div>

          {/* Avatar + info row */}
          <div className="relative flex flex-wrap items-end gap-4 px-6 pb-6">
            {/* Avatar — lifted up into banner */}
            <div
              className="relative -mt-12 grid h-20 w-20 shrink-0 place-items-center rounded-2xl border-2 shadow-[0_0_30px_rgba(19,242,39,0.2)]"
              style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)' }}
            >
              <img src={sapienceLogo} alt="avatar" className="absolute inset-0 h-full w-full rounded-2xl object-cover" />
            </div>

            {/* Name + address */}
            <div className="flex flex-1 flex-col gap-1">
              <p
                className="netlifypixel text-[20px] font-black leading-none tracking-wide"
                style={{ color: 'var(--text-heading)' }}
              >
                {walletShort || '—'}
              </p>
              <div className="flex items-center gap-2">
                <code className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {walletAddress || 'Not connected'}
                </code>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold transition"
                  style={{
                    background: copied ? 'var(--accent-surface-strong)' : 'var(--row-hover)',
                    border: '1px solid var(--border-g)',
                    color: copied ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Joined {fmtDate(account?.createdAt)}
              </p>
            </div>

            {/* Sign out */}
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg px-4 py-2 text-[12px] font-bold transition"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* ── Stats strip ───────────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Balance',     value: `${balance.toLocaleString()} pts`, glow: true },
            { label: 'Predictions', value: stats.total },
            { label: 'YES bets',    value: stats.yes },
            { label: 'NO bets',     value: stats.no },
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

        {/* ── Prediction history ────────────────────────────────────── */}
        <div
          className="mt-4 overflow-hidden rounded-2xl border"
          style={{ borderColor: 'var(--border-g)', background: 'var(--bg-glass)', backdropFilter: 'blur(6px)' }}
        >
          {/* Section header */}
          <div
            className="flex items-center justify-between border-b px-5 py-3.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <span
              className="netlifypixel text-[11px] font-black uppercase tracking-[0.2em]"
              style={{ color: 'var(--accent-text)', textShadow: 'var(--glow-small)' }}
            >
              Prediction History
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {predictions.length} total
            </span>
          </div>

          {/* Column headers */}
          <div
            className="grid border-b px-5 py-2 text-[10px] font-black uppercase tracking-[0.15em]"
            style={{
              borderColor: 'var(--border-row)',
              color: 'var(--text-muted)',
              gridTemplateColumns: '60px 1fr 70px 100px',
            }}
          >
            <span>Side</span>
            <span>Market</span>
            <span>Points</span>
            <span>Date</span>
          </div>

          {/* Rows */}
          {predictions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14">
              <div
                className="relative grid h-12 w-12 place-items-center rounded-xl border"
                style={{ borderColor: 'var(--border-g)', background: 'var(--bg-glass)' }}
              >
                <img src={sapienceLogo} alt="" className="absolute inset-0 h-full w-full rounded-xl object-cover opacity-60" />
              </div>
              <p
                className="netlifypixel text-center text-[10px] font-bold uppercase leading-relaxed tracking-[0.18em]"
                style={{ color: 'var(--accent-empty)' }}
              >
                No predictions yet.<br />Head to Markets to start.
              </p>
              <button
                type="button"
                onClick={() => navigate('/prediction')}
                className="group relative mt-1 h-9 cursor-pointer border-none bg-transparent px-6 text-[12px] font-bold"
              >
                <span className="absolute inset-0 translate-y-[2px] rounded-lg bg-black/30 transition-transform group-hover:translate-y-[3px]" />
                <span className="absolute inset-0 rounded-lg bg-[#0da91f]" />
                <span className="relative flex h-full -translate-y-[2px] items-center justify-center rounded-lg bg-[#13f227] px-6 text-[#08240e] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform group-hover:-translate-y-[3px]">
                  Go to Markets
                </span>
              </button>
            </div>
          ) : (
            <div
              className="max-h-[420px] overflow-y-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-g) transparent' }}
            >
              {predictions.map(p => (
                <div
                  key={p.id}
                  className="grid items-center border-b px-5 py-2.5 transition-colors duration-100"
                  style={{
                    borderColor: 'var(--border-row)',
                    gridTemplateColumns: '60px 1fr 70px 100px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--row-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span
                    className="w-fit rounded px-1.5 py-0.5 text-[9px] font-black"
                    style={p.side === 'YES'
                      ? { background: 'var(--accent-surface-strong)', color: 'var(--accent-text)' }
                      : { background: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                  >
                    {p.side}
                  </span>
                  <p className="truncate pr-4 text-[12px]" style={{ color: 'var(--text-body)' }}>{p.marketTitle}</p>
                  <p className="text-[12px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {Number(p.points || 0).toLocaleString()} pts
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {fmtDate(p.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </main>
  )
}
