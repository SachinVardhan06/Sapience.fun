import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  walletNetProfit,
} from '../../utils/pointsLedger'
import { fetchWallet, fetchPredictions } from '../../utils/graphqlClient'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const QUICK_LINKS = [
  { to: '/prediction', label: 'Markets', hint: 'YES / NO desk' },
  { to: '/private-arena', label: 'Private', hint: 'Host & join rooms' },
  { to: '/btc-5m', label: 'BTC 5m', hint: 'Short rounds' },
  { to: '/leaderboard', label: 'Leaderboard', hint: 'Net P&L rank' },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const { walletAddress, walletShort, disconnectWallet } = useWalletAuth()
  const [copied, setCopied] = useState(false)

  const [gqlAccount, setGqlAccount] = useState(null)
  const [gqlPredictions, setGqlPredictions] = useState(null)
  const [pointsTick, setPointsTick] = useState(0)

  useEffect(() => {
    const on = () => setPointsTick((t) => t + 1)
    window.addEventListener(POINTS_CHANGED_EVENT, on)
    return () => window.removeEventListener(POINTS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    if (walletAddress) ensureWalletBonus(walletAddress)
  }, [walletAddress])

  useEffect(() => {
    if (!walletAddress) return
    fetchWallet(walletAddress)
      .then((w) => {
        if (w) setGqlAccount(w)
      })
      .catch(() => {})

    fetchPredictions(walletAddress)
      .then((rows) => setGqlPredictions(rows))
      .catch(() => {})
  }, [walletAddress])

  const localAccount = useMemo(() => {
    if (!walletAddress) return null
    return getWalletAccount(walletAddress)
  }, [walletAddress, pointsTick])

  const account = useMemo(() => mergeWalletRecords(gqlAccount, localAccount), [gqlAccount, localAccount])

  const localPredictions = useMemo(() => {
    if (!walletAddress) return []
    try {
      const raw = localStorage.getItem(PREDICTIONS_KEY)
      const all = raw ? JSON.parse(raw) : []
      return Array.isArray(all) ? all.filter((p) => p.wallet?.toLowerCase() === walletAddress.toLowerCase()) : []
    } catch {
      return []
    }
  }, [walletAddress, pointsTick])

  const predictions = useMemo(
    () => mergePredictionLists(gqlPredictions, localPredictions),
    [gqlPredictions, localPredictions],
  )

  const stats = useMemo(() => {
    const yes = predictions.filter((p) => p.side === 'YES').length
    const no = predictions.filter((p) => p.side === 'NO').length
    const staked = predictions.reduce((s, p) => s + (Number(p.points) || 0), 0)
    return { yes, no, staked, total: predictions.length }
  }, [predictions])

  const balance = account?.balance ?? BONUS_POINTS
  const netProfit = account ? walletNetProfit(account) : 0
  const totalStakedWallet = Number(account?.totalStaked) || 0
  const totalRewards = Number(account?.totalRewards) || 0

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

  return (
    <main
      id="main-content"
      className="relative flex h-dvh flex-col overflow-hidden antialiased"
      style={{
        boxSizing: 'border-box',
        background: 'var(--bg-page)',
        color: 'var(--text-body)',
        paddingTop: 'var(--beta-banner-height, 0px)',
      }}
    >
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0" style={{ background: 'var(--bg-page)' }} />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -5%, var(--glow-radial), transparent)' }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom,var(--scanline) 0,var(--scanline) 1px,transparent 1px,transparent 3px)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at center, transparent 45%, var(--vignette) 100%)' }}
        />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <TradeNavbar />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
            <header className="mb-8 max-w-2xl">
              <p
                className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] sm:text-[11px]"
                style={{ color: 'var(--accent-label)' }}
              >
                Your account
              </p>
              <h1 className="m-0 text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--text-heading)' }}>
                Profile
              </h1>
              <p className="mt-3 text-sm leading-relaxed sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                Wallet stats and every prediction you&apos;ve placed on Sapience—synced with the server when online, merged
                with this device so balances stay honest.
              </p>
            </header>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
              {/* Identity */}
              <div
                className="overflow-hidden rounded-2xl border shadow-[var(--nav-elev)]"
                style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)', backdropFilter: 'blur(10px)' }}
              >
                <div className="relative h-28 w-full sm:h-32" style={{ background: 'var(--profile-banner)' }}>
                  <div
                    className="absolute inset-0 opacity-25"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(to bottom,var(--scanline) 0,var(--scanline) 1px,transparent 1px,transparent 3px)',
                    }}
                  />
                </div>
                <div className="relative flex flex-col gap-5 px-5 pb-6 pt-0 sm:px-6">
                  <div className="flex flex-wrap items-end gap-4">
                    <div
                      className="relative -mt-14 grid h-[88px] w-[88px] shrink-0 place-items-center rounded-2xl border-2 sm:-mt-16 sm:h-24 sm:w-24"
                      style={{
                        borderColor: 'var(--border-g2)',
                        background: 'var(--panel-bg)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
                      }}
                    >
                      <img
                        src={sapienceLogo}
                        alt=""
                        className="absolute inset-0 h-full w-full rounded-[14px] object-cover sm:rounded-2xl"
                      />
                    </div>
                    <div className="min-w-0 flex-1 pt-2">
                      <p
                        className="netlifypixel m-0 text-lg font-black leading-tight tracking-wide sm:text-xl"
                        style={{ color: 'var(--text-heading)' }}
                      >
                        {walletShort || '—'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code
                          className="max-w-full truncate rounded-md border px-2 py-1 text-[10px] sm:text-[11px]"
                          style={{
                            borderColor: 'var(--border-g)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {walletAddress || 'Not connected'}
                        </code>
                        <button
                          type="button"
                          onClick={copyAddress}
                          disabled={!walletAddress}
                          aria-label="Copy wallet address"
                          className="rounded-lg border px-2.5 py-1 text-[10px] font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] disabled:cursor-not-allowed disabled:opacity-40 sm:text-[11px]"
                          style={{
                            borderColor: 'var(--border-g)',
                            background: copied ? 'var(--accent-surface-strong)' : 'var(--row-hover)',
                            color: copied ? 'var(--accent-text)' : 'var(--text-secondary)',
                          }}
                        >
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Joined {fmtDate(account?.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={signOut}
                      className="rounded-xl border px-4 py-2.5 text-xs font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] sm:text-sm"
                      style={{
                        borderColor: 'rgba(248,113,113,0.4)',
                        background: 'rgba(248,113,113,0.1)',
                        color: '#f87171',
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>

              {/* Balance spotlight */}
              <aside
                className="rounded-2xl border p-5 sm:p-6"
                style={{
                  borderColor: 'var(--accent-panel-border)',
                  background: 'linear-gradient(160deg, var(--accent-panel) 0%, var(--bg-glass) 100%)',
                  boxShadow: 'var(--nav-elev)',
                }}
                aria-labelledby="profile-balance-heading"
              >
                <p
                  id="profile-balance-heading"
                  className="netlifypixel m-0 text-[10px] font-black uppercase tracking-[0.2em]"
                  style={{ color: 'var(--accent-label)' }}
                >
                  Balance
                </p>
                <p
                  className="mt-3 font-mono text-3xl font-black tabular-nums tracking-tight sm:text-4xl"
                  style={{ color: 'var(--accent-text)', textShadow: 'var(--glow-small)' }}
                >
                  {balance.toLocaleString()}
                  <span className="ml-1 text-lg font-bold opacity-90 sm:text-xl">pts</span>
                </p>
                <div className="mt-4 space-y-2 border-t pt-4 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex justify-between gap-3">
                    <span style={{ color: 'var(--text-muted)' }}>Net vs start ({BONUS_POINTS.toLocaleString()} pts)</span>
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: netProfit >= 0 ? 'var(--accent-text)' : '#f87171' }}
                    >
                      {netProfit >= 0 ? '+' : ''}
                      {netProfit.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span style={{ color: 'var(--text-muted)' }}>Lifetime staked</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-heading)' }}>
                      {totalStakedWallet.toLocaleString()} pts
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span style={{ color: 'var(--text-muted)' }}>Rewards credited</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-heading)' }}>
                      {totalRewards.toLocaleString()} pts
                    </span>
                  </div>
                </div>
              </aside>
            </div>

            {/* Quick links */}
            <section className="mt-8" aria-labelledby="profile-quick-heading">
              <h2
                id="profile-quick-heading"
                className="netlifypixel m-0 text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: 'var(--accent-muted)' }}
              >
                Jump to
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {QUICK_LINKS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-xl border px-4 py-3 no-underline transition outline-none hover:border-[var(--border-g2)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]"
                    style={{
                      borderColor: 'var(--border-g)',
                      background: 'var(--bg-glass)',
                    }}
                  >
                    <span className="block text-sm font-bold" style={{ color: 'var(--text-heading)' }}>
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                      {item.hint}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Activity stats */}
            <section className="mt-8" aria-labelledby="profile-stats-heading">
              <h2
                id="profile-stats-heading"
                className="netlifypixel m-0 text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: 'var(--accent-muted)' }}
              >
                Activity
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'Predictions', value: stats.total, sub: 'Recorded picks' },
                  { label: 'YES', value: stats.yes, sub: 'Long / yes side' },
                  { label: 'NO', value: stats.no, sub: 'Short / no side' },
                  { label: 'In history', value: `${stats.staked.toLocaleString()} pts`, sub: 'Sum of stake amounts' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border px-4 py-4"
                    style={{
                      borderColor: 'var(--border-g)',
                      background: 'var(--panel-bg)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <p
                      className="netlifypixel m-0 text-[9px] font-black uppercase tracking-[0.18em]"
                      style={{ color: 'var(--accent-label)' }}
                    >
                      {s.label}
                    </p>
                    <p className="mt-2 text-xl font-black tabular-nums sm:text-2xl" style={{ color: 'var(--text-heading)' }}>
                      {s.value}
                    </p>
                    <p className="mt-1 text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                      {s.sub}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* History */}
            <section
              className="mt-8 overflow-hidden rounded-2xl border"
              style={{
                borderColor: 'var(--border-g)',
                background: 'var(--bg-glass)',
                backdropFilter: 'blur(8px)',
                boxShadow: 'var(--nav-elev)',
              }}
              aria-labelledby="profile-history-heading"
            >
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <h2
                  id="profile-history-heading"
                  className="netlifypixel m-0 text-[11px] font-black uppercase tracking-[0.2em]"
                  style={{ color: 'var(--accent-text)', textShadow: 'var(--glow-small)' }}
                >
                  Prediction history
                </h2>
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {predictions.length} total
                </span>
              </div>

              <div
                className="hidden border-b px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] sm:grid"
                style={{
                  borderColor: 'var(--border-row)',
                  color: 'var(--text-muted)',
                  gridTemplateColumns: '64px minmax(0,1fr) 72px 96px',
                }}
              >
                <span>Side</span>
                <span>Market</span>
                <span className="text-right sm:text-left">Pts</span>
                <span className="text-right sm:text-left">Date</span>
              </div>

              {predictions.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 px-4 py-16">
                  <div
                    className="relative grid h-14 w-14 place-items-center rounded-2xl border"
                    style={{ borderColor: 'var(--border-g)', background: 'var(--input-bg)' }}
                  >
                    <img src={sapienceLogo} alt="" className="absolute inset-0 h-full w-full rounded-2xl object-cover opacity-50" />
                  </div>
                  <p
                    className="netlifypixel m-0 max-w-xs text-center text-[10px] font-bold uppercase leading-relaxed tracking-[0.18em]"
                    style={{ color: 'var(--accent-empty)' }}
                  >
                    No predictions yet.
                    <br />
                    Open Markets and place your first stake.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/prediction')}
                    className="group relative mt-1 block h-11 min-w-[180px] cursor-pointer border-none bg-transparent p-0 text-sm font-bold"
                  >
                    <span
                      className="absolute inset-0 translate-y-[2px] rounded-xl transition-transform duration-300 group-hover:translate-y-[4px] group-active:translate-y-px"
                      style={{ background: 'var(--btn-depth)' }}
                    />
                    <span className="absolute inset-0 rounded-xl bg-[#0da91f]" />
                    <span className="relative flex h-full -translate-y-[4px] items-center justify-center rounded-xl bg-[#13f227] px-6 text-[#08240e] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-300 group-hover:-translate-y-[6px] group-active:-translate-y-[2px]">
                      Go to Markets
                    </span>
                  </button>
                </div>
              ) : (
                <ul
                  className="m-0 max-h-[min(52dvh,480px)] list-none overflow-y-auto p-0"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-g) transparent' }}
                >
                  {predictions.map((p) => (
                    <li
                      key={p.id}
                      className="border-b last:border-b-0 sm:grid sm:items-center"
                      style={{ borderColor: 'var(--border-row)' }}
                    >
                      <div
                        className="flex flex-col gap-2 px-4 py-3 transition-colors sm:grid sm:gap-0 sm:px-5 sm:py-2.5 sm:hover:bg-(--row-hover)"
                        style={{
                          gridTemplateColumns: '64px minmax(0,1fr) 72px 96px',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 sm:block">
                          <span
                            className="w-fit rounded-md px-2 py-0.5 text-[9px] font-black"
                            style={
                              p.side === 'YES'
                                ? { background: 'var(--accent-surface-strong)', color: 'var(--accent-text)' }
                                : { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
                            }
                          >
                            {p.side}
                          </span>
                          <span className="text-[10px] sm:hidden" style={{ color: 'var(--text-muted)' }}>
                            {fmtDate(p.createdAt)}
                          </span>
                        </div>
                        <p className="min-w-0 text-[13px] leading-snug sm:truncate sm:pr-3" style={{ color: 'var(--text-body)' }}>
                          {p.marketTitle}
                        </p>
                        <p
                          className="text-xs tabular-nums sm:text-[12px]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {Number(p.points || 0).toLocaleString()} pts
                        </p>
                        <p className="hidden text-[11px] sm:block" style={{ color: 'var(--text-muted)' }}>
                          {fmtDate(p.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
