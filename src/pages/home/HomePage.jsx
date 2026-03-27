import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import sapienceLogo from '../../assets/sapiencelogo.jpeg'
import { useWalletAuth } from '../../context/walletAuth'
import { useTheme } from '../../context/themeContext'

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

const FEATURES = [
  {
    title: 'Prediction markets',
    body: 'Browse live-style questions, stake points on YES or NO, and track outcomes as the crowd moves.',
    tag: 'Markets',
  },
  {
    title: 'BTC 5-minute windows',
    body: 'Short rounds against a UTC anchor price—UP or DOWN—with live Coinbase stream and time-weighted payouts.',
    tag: 'Fast',
  },
  {
    title: 'Profit leaderboard',
    body: 'Rankings by net P&L vs your starting bonus—not just who sits on the biggest balance.',
    tag: 'Social',
  },
  {
    title: 'Points wallet',
    body: 'Every wallet gets starter points on-chain vibes, locally—predict, win, and climb without gas on reads.',
    tag: 'Wallet',
  },
]

const FLOW_STEPS = [
  { n: '01', title: 'Connect', body: 'MetaMask in one tap—your address becomes your Sapience identity.' },
  { n: '02', title: 'Stake points', body: 'Use starter bonus + winnings. Every pick moves your P&L, not just a static balance.' },
  { n: '03', title: 'Resolve & rank', body: 'Markets settle into wins, pushes, or lessons. Leaderboard sorts by profit.' },
  { n: '04', title: 'Go deeper', body: 'BTC 5m for pulse trades, profile for history, Discord for the crew.' },
]

const FAQ = [
  { q: 'Is this real money?', a: 'Points are in-app play money—great for conviction and leaderboards without wiring fiat.' },
  { q: 'What wallet do I need?', a: 'We target MetaMask and compatible EIP-1193 browsers. Connect once per session.' },
  { q: 'How does BTC 5m pricing work?', a: 'Live BTC/USD streams from Coinbase; each 5m UTC window locks an anchor for UP/DOWN.' },
]

const CLOSING_CARDS = [
  {
    title: 'Markets',
    body: 'YES / NO desks, batch stakes, and live-style questions.',
    to: '/prediction',
    tag: 'Trade',
  },
  {
    title: 'BTC 5m',
    body: 'Five-minute epochs, live ticker, time-weighted wins.',
    to: '/btc-5m',
    tag: 'Speed',
  },
  {
    title: 'Leaderboard',
    body: 'Climb by net profit—not who hoards the biggest stack.',
    to: '/leaderboard',
    tag: 'Rank',
  },
]

const STATS = [
  { label: 'Starter stack', value: '1,000', unit: 'pts' },
  { label: 'BTC window', value: '5', unit: 'min' },
  { label: 'Max win curve', value: '2×', unit: 'early' },
  { label: 'Venues', value: '2+', unit: 'modes' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { isConnected, connectWallet, isConnecting, authError, clearAuthError } = useWalletAuth()
  const { isDark, toggle } = useTheme()

  const mainRef = useRef(null)
  const contentRef = useRef(null)
  const [faqOpen, setFaqOpen] = useState(null)

  const launchPath = isConnected ? '/prediction' : '/access'

  useEffect(() => {
    const main = mainRef.current
    const content = contentRef.current
    if (!main || !content) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const lenis = new Lenis({
      wrapper: main,
      content,
      lerp: 0.048,
      wheelMultiplier: 0.78,
      touchMultiplier: 0.82,
      smoothWheel: true,
      syncTouch: true,
      anchors: true,
      autoRaf: true,
    })

    return () => lenis.destroy()
  }, [])

  const handlePrimary = async () => {
    if (isConnected) {
      navigate('/prediction')
      return
    }
    clearAuthError()
    await connectWallet()
    navigate('/prediction', { replace: true })
  }

  const navLinkClass =
    'rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] no-underline transition-opacity hover:opacity-80 sm:px-3 sm:text-xs'

  return (
    <main
      ref={mainRef}
      className="home-root home-root-scroll relative h-[100dvh] overflow-x-hidden overflow-y-auto overscroll-y-contain antialiased"
      style={{
        boxSizing: 'border-box',
        background: 'var(--bg-page)',
        color: 'var(--text-body)',
        paddingTop: 'var(--beta-banner-height, 0px)',
      }}
    >
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div className="home-mesh absolute inset-0 opacity-90" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, var(--scanline) 0, var(--scanline) 1px, transparent 1px, transparent 3px)',
          }}
        />
        <div className="home-orb home-orb-a" />
        <div className="home-orb home-orb-b" />
        <div className="home-orb home-orb-c" />
        <div className="home-orb home-orb-d" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, transparent 40%, var(--vignette) 100%)',
          }}
        />
      </div>

      <div ref={contentRef} className="home-scroll-content relative z-10">
        <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link to="/" className="group flex items-center gap-3 no-underline">
            <div
              className="relative h-11 w-11 overflow-hidden rounded-xl border shadow-lg transition-transform duration-300 group-hover:scale-[1.03]"
              style={{
                borderColor: 'var(--border-g)',
                boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 15%, transparent)',
              }}
            >
              <img src={sapienceLogo} alt="" className="h-full w-full object-cover" />
            </div>
            <p
              className="netlifypixel m-0 text-lg font-black leading-none tracking-[0.12em] sm:text-xl sm:tracking-[0.14em]"
              style={{ color: 'var(--text-heading)' }}
            >
              <span>SAPIENCE.</span>
              <span style={{ color: 'var(--accent)', textShadow: 'var(--glow-title)' }}>FUN</span>
            </p>
          </Link>

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Page sections">
            {[
              ['#signals', 'Signals'],
              ['#flow', 'Flow'],
              ['#arena', 'Arena'],
              ['#faq', 'FAQ'],
            ].map(([href, label]) => (
              <a key={href} href={href} className={navLinkClass} style={{ color: 'var(--text-secondary)' }}>
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggle}
              title={isDark ? 'Light mode' : 'Dark mode'}
              className="flex h-10 w-10 items-center justify-center rounded-xl transition sm:h-11 sm:w-11"
              style={{
                background: 'var(--nav-toggle-bg)',
                border: '1px solid var(--border-g)',
                color: 'var(--nav-toggle-fg)',
              }}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <Link
              to={launchPath}
              className="hidden rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:opacity-90 sm:inline-block"
              style={{
                borderColor: 'var(--border-g)',
                color: 'var(--text-secondary)',
                background: 'var(--bg-glass)',
              }}
            >
              {isConnected ? 'Markets' : 'Sign in'}
            </Link>
          </div>
        </header>

        <div className="home-marquee border-y" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="home-marquee-track netlifypixel font-black tracking-[0.35em]">
            <span className="flex shrink-0 items-center gap-10">
              <span>PREDICT</span>
              <span aria-hidden>·</span>
              <span>STAKE</span>
              <span aria-hidden>·</span>
              <span>RESOLVE</span>
              <span aria-hidden>·</span>
              <span>CLIMB</span>
              <span aria-hidden>·</span>
            </span>
            <span className="flex shrink-0 items-center gap-10" aria-hidden>
              <span>PREDICT</span>
              <span>·</span>
              <span>STAKE</span>
              <span>·</span>
              <span>RESOLVE</span>
              <span>·</span>
              <span>CLIMB</span>
              <span>·</span>
            </span>
          </div>
        </div>

        <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pb-24 sm:pt-10">
          <div className="mx-auto max-w-4xl text-center">
            <p
              className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] sm:text-xs"
              style={{
                borderColor: 'var(--accent-panel-border)',
                background: 'var(--accent-panel)',
                color: 'var(--accent-label)',
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: 'var(--accent)',
                  boxShadow: '0 0 10px color-mix(in srgb, var(--accent) 60%, transparent)',
                }}
              />
              On-chain curiosity · off-chain points
            </p>

            <h1
              className="home-reveal m-0 text-balance text-[clamp(2.25rem,8vw,4.25rem)] font-extrabold leading-[0.95] tracking-[-0.03em]"
              style={{ color: 'var(--text-heading)' }}
            >
              Predict the future.
              <br />
              <span
                className="netlifypixel text-[clamp(2.5rem,8.5vw,4.75rem)] tracking-[0.06em]"
                style={{ color: 'var(--accent)', textShadow: 'var(--glow-heading)' }}
              >
                Stack the signal.
              </span>
            </h1>

            <p
              className="home-reveal mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed sm:text-lg"
              style={{ color: 'var(--text-secondary)' }}
            >
              Sapience.fun is a prediction playground: markets, lightning BTC rounds, and a leaderboard ranked by profit—not
              vanity balances. Scroll slow—the page is built for it.
            </p>

            <div className="home-reveal mt-10 flex flex-col items-stretch justify-center gap-3 sm:mt-12 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={isConnecting}
                onClick={handlePrimary}
                className="home-cta-primary group relative h-[52px] w-full border-none bg-transparent p-0 text-base font-bold sm:w-auto sm:min-w-[220px]"
              >
                <span className="absolute inset-0 translate-y-[3px] rounded-xl bg-black/25 transition-transform duration-300 group-hover:translate-y-[5px] group-active:translate-y-px dark:bg-black/40" />
                <span className="absolute inset-0 rounded-xl" style={{ background: 'var(--accent)' }} />
                <span
                  className="relative flex h-full -translate-y-[5px] items-center justify-center rounded-xl px-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform duration-300 group-hover:-translate-y-[7px] group-active:-translate-y-[2px]"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 88%, white)',
                    color: isDark ? '#06280c' : '#fff',
                  }}
                >
                  {isConnecting ? 'Connecting…' : isConnected ? 'Open markets' : 'Connect wallet'}
                </span>
              </button>
              <Link
                to="/access"
                className="flex h-[52px] items-center justify-center rounded-xl border px-8 text-base font-semibold no-underline transition hover:opacity-90"
                style={{
                  borderColor: 'var(--border-g2)',
                  color: 'var(--text-heading)',
                  background: 'var(--bg-glass)',
                }}
              >
                Welcome video
              </Link>
            </div>
            {authError ? (
              <p className="mt-4 text-center text-sm text-rose-400" role="alert">
                {authError}
              </p>
            ) : null}

            <a
              href="#signals"
              className="home-scroll-hint mx-auto mt-14 flex w-fit flex-col items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] no-underline sm:mt-20"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>Explore</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: 'var(--border-g)', color: 'var(--accent-text)' }}>
                <ChevronDownIcon />
              </span>
            </a>
          </div>

          <div
            id="signals"
            className="home-reveal mx-auto mt-20 scroll-mt-28 sm:mt-28"
          >
            <p
              className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.25em] sm:text-[11px]"
              style={{ color: 'var(--accent-label)' }}
            >
              At a glance
            </p>
            <h2 className="m-0 text-center text-2xl font-bold sm:text-3xl" style={{ color: 'var(--text-heading)' }}>
              Built for momentum
            </h2>
            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="home-stat-card rounded-2xl border p-5 text-center sm:p-6"
                  style={{
                    borderColor: 'var(--border-g)',
                    background: 'linear-gradient(160deg, var(--accent-surface) 0%, var(--bg-glass) 100%)',
                  }}
                >
                  <p className="m-0 font-mono text-[clamp(1.75rem,5vw,2.75rem)] font-bold tabular-nums leading-none" style={{ color: 'var(--accent-text)' }}>
                    {s.value}
                    <span className="text-lg font-semibold opacity-80 sm:text-xl"> {s.unit}</span>
                  </p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wider sm:text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            id="flow"
            className="home-reveal mx-auto mt-24 max-w-3xl scroll-mt-28 sm:mt-32"
          >
            <p
              className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.25em] sm:text-[11px]"
              style={{ color: 'var(--accent-label)' }}
            >
              How it flows
            </p>
            <h2 className="m-0 text-center text-2xl font-bold sm:text-3xl" style={{ color: 'var(--text-heading)' }}>
              From wallet to leaderboard
            </h2>
            <div className="relative mt-12">
              <span
                className="pointer-events-none absolute left-[1.125rem] top-3 bottom-3 w-px sm:left-5"
                style={{ background: 'linear-gradient(to bottom, var(--accent-muted), transparent)' }}
                aria-hidden
              />
              <ul className="list-none space-y-0 p-0">
              {FLOW_STEPS.map((step) => (
                <li key={step.n} className="relative flex gap-5 pb-12 pl-0 last:pb-0 sm:gap-8">
                  <div
                    className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-black sm:h-11 sm:w-11 sm:text-sm"
                    style={{
                      borderColor: 'var(--accent)',
                      background: 'var(--bg-glass)',
                      color: 'var(--accent-text)',
                      boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 25%, transparent)',
                    }}
                  >
                    {step.n}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="m-0 text-lg font-bold sm:text-xl" style={{ color: 'var(--text-heading)' }}>
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
              </ul>
            </div>
          </div>

          <div className="home-reveal mx-auto mt-20 grid max-w-5xl gap-4 sm:mt-28 sm:grid-cols-2 lg:gap-5">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="home-card group relative overflow-hidden rounded-2xl border p-6 sm:p-8"
                style={{
                  borderColor: 'var(--border-g)',
                  background: 'linear-gradient(155deg, color-mix(in srgb, var(--accent) 6%, var(--bg-glass)) 0%, var(--bg-glass) 100%)',
                  boxShadow: 'var(--nav-elev)',
                }}
              >
                <span
                  className="mb-3 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: 'var(--accent-surface-strong)',
                    color: 'var(--accent-text)',
                  }}
                >
                  {f.tag}
                </span>
                <h2 className="m-0 text-xl font-bold sm:text-2xl" style={{ color: 'var(--text-heading)' }}>
                  {f.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed sm:text-[15px]" style={{ color: 'var(--text-secondary)' }}>
                  {f.body}
                </p>
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}
                />
              </article>
            ))}
          </div>

          <div
            id="arena"
            className="home-reveal mx-auto mt-24 grid max-w-5xl scroll-mt-28 gap-5 lg:grid-cols-2 sm:mt-32"
          >
            <div
              className="rounded-2xl border p-8 sm:p-10"
              style={{
                borderColor: 'var(--border-g)',
                background: 'linear-gradient(145deg, var(--accent-panel) 0%, var(--bg-glass2) 100%)',
              }}
            >
              <p className="m-0 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--accent-label)' }}>
                Arena A
              </p>
              <h3 className="mt-2 text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>
                Multi-market desk
              </h3>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Filter, batch-stake, and feel the tape. Built for scanning many questions—not just one ticker.
              </p>
              <Link
                to={isConnected ? '/prediction' : '/access'}
                className="mt-6 inline-block text-sm font-bold no-underline"
                style={{ color: 'var(--accent-text)' }}
              >
                Enter markets →
              </Link>
            </div>
            <div
              className="rounded-2xl border p-8 sm:p-10"
              style={{
                borderColor: 'var(--border-g)',
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--accent) 8%, var(--panel-bg)) 0%, var(--bg-glass) 100%)',
              }}
            >
              <p className="m-0 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--accent-label)' }}>
                Arena B
              </p>
              <h3 className="mt-2 text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>
                BTC pulse rounds
              </h3>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Five-minute epochs, live WebSocket price, payouts that reward early conviction in the window.
              </p>
              <Link
                to={isConnected ? '/btc-5m' : '/access'}
                className="mt-6 inline-block text-sm font-bold no-underline"
                style={{ color: 'var(--accent-text)' }}
              >
                Open BTC 5m →
              </Link>
            </div>
          </div>

          <blockquote
            className="home-reveal relative mx-auto mt-24 max-w-3xl overflow-hidden rounded-2xl border px-8 py-12 text-center sm:mt-32 sm:px-12 sm:py-16"
            style={{
              borderColor: 'var(--border-g2)',
              background: 'linear-gradient(135deg, var(--bg-glass) 0%, var(--accent-surface) 45%, var(--bg-glass2) 100%)',
            }}
          >
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.3em]" style={{ color: 'var(--accent-label)' }}>
              Manifesto
            </p>
            <p className="mt-6 text-lg font-medium italic leading-relaxed sm:text-xl" style={{ color: 'var(--text-heading)' }}>
              The edge isn&apos;t knowing the future—it&apos;s measuring how hard you&apos;re willing to back a thesis when the crowd
              disagrees.
            </p>
          </blockquote>

          <div id="faq" className="home-reveal mx-auto mt-24 max-w-2xl scroll-mt-28 sm:mt-32">
            <h2 className="m-0 text-center text-2xl font-bold sm:text-3xl" style={{ color: 'var(--text-heading)' }}>
              FAQ
            </h2>
            <div className="mt-8 space-y-2">
              {FAQ.map((item, i) => {
                const open = faqOpen === i
                return (
                  <div
                    key={item.q}
                    className="overflow-hidden rounded-xl border"
                    style={{ borderColor: 'var(--border-g)', background: 'var(--bg-glass)' }}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-sm font-semibold sm:px-5 sm:text-base"
                      style={{ color: 'var(--text-heading)' }}
                      aria-expanded={open}
                      onClick={() => setFaqOpen(open ? null : i)}
                    >
                      {item.q}
                      <span className="shrink-0 text-lg leading-none opacity-70" aria-hidden>
                        {open ? '−' : '+'}
                      </span>
                    </button>
                    {open ? (
                      <p className="m-0 border-t px-4 py-3 text-sm leading-relaxed sm:px-5" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                        {item.a}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div
            className="home-reveal mx-auto mt-24 max-w-4xl overflow-hidden rounded-2xl border text-center sm:mt-32"
            style={{
              borderColor: 'var(--border-g)',
              background: 'linear-gradient(135deg, var(--accent-surface) 0%, var(--bg-glass2) 50%, var(--panel-bg) 100%)',
            }}
          >
            <div className="px-6 py-14 sm:px-10 sm:py-16">
              <h2 className="m-0 text-2xl font-bold sm:text-3xl" style={{ color: 'var(--text-heading)' }}>
                Pressure-tested scroll. Zero rush.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                One wallet unlocks markets, BTC 5m, profile, and the profit leaderboard. Take the long way down this page—we
                smoothed every tick.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Link
                  to={isConnected ? '/prediction' : '/access'}
                  className="rounded-xl px-6 py-3 text-sm font-bold no-underline sm:text-base"
                  style={{
                    background: 'var(--accent)',
                    color: isDark ? '#06280c' : '#fff',
                    boxShadow: 'var(--glow-small)',
                  }}
                >
                  {isConnected ? 'Go to markets' : 'Start with MetaMask'}
                </Link>
                <a
                  href="https://discord.gg/DfrB5hnb8f"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold no-underline sm:text-base"
                  style={{ color: 'var(--accent-text)' }}
                >
                  Join Discord →
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          className="relative z-10 border-t px-4 pb-6 pt-16 sm:px-6 sm:pb-8 sm:pt-20"
          style={{ borderColor: 'var(--border-subtle)' }}
          aria-labelledby="home-closing-cards-heading"
        >
          <h2 id="home-closing-cards-heading" className="sr-only">
            Jump back in
          </h2>
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-3 sm:gap-5">
            {CLOSING_CARDS.map((c) => (
              <Link
                key={c.title}
                to={isConnected ? c.to : '/access'}
                className="home-closing-card group relative overflow-hidden rounded-2xl border p-6 no-underline transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 sm:p-8"
                style={{
                  borderColor: 'var(--border-g)',
                  background: 'linear-gradient(165deg, color-mix(in srgb, var(--accent) 10%, var(--bg-glass)) 0%, var(--bg-glass) 55%, var(--panel-bg) 100%)',
                  boxShadow: 'var(--nav-elev)',
                }}
              >
                <span
                  className="mb-3 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: 'var(--accent-surface-strong)',
                    color: 'var(--accent-text)',
                  }}
                >
                  {c.tag}
                </span>
                <h3 className="m-0 text-xl font-bold sm:text-2xl" style={{ color: 'var(--text-heading)' }}>
                  {c.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {c.body}
                </p>
                <span className="mt-4 inline-flex items-center text-sm font-bold" style={{ color: 'var(--accent-text)' }}>
                  {isConnected ? 'Open →' : 'Connect to open →'}
                </span>
                <div
                  className="pointer-events-none absolute -right-6 -bottom-6 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}
                />
              </Link>
            ))}
          </div>

          <div className="home-reveal mx-auto mt-16 max-w-[min(100%,1200px)] px-2 text-center sm:mt-24">
            <p
              className="netlifypixel m-0 select-none text-[clamp(2.75rem,14vw,7.5rem)] font-black leading-[0.88] tracking-[0.06em] sm:tracking-[0.1em]"
              style={{ textShadow: isDark ? '0 0 40px rgba(0,0,0,0.45)' : 'none' }}
            >
              <span className="block sm:inline" style={{ color: 'var(--text-heading)' }}>
                SAPIENCE.
              </span>
              <span
                className="block sm:inline"
                style={{
                  color: 'var(--accent)',
                  textShadow: 'var(--glow-heading)',
                }}
              >
                FUN
              </span>
            </p>
            <p className="mt-4 text-sm font-medium sm:mt-5 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              Play-money points · wallet-native · built for conviction
            </p>
          </div>
        </section>

        <footer
          className="relative z-10 border-t px-4 py-12 sm:px-6 sm:py-14"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 sm:flex-row">
            <p className="m-0 text-center text-sm sm:text-left">
              <span className="netlifypixel font-bold tracking-wide" style={{ color: 'var(--text-heading)' }}>
                SAPIENCE.FUN
              </span>
              <span className="mt-1 block text-xs sm:mt-0 sm:ml-2 sm:inline">Play money points. Real conviction.</span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium">
              <a href="https://x.com/sapiencedotfun" target="_blank" rel="noreferrer" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                X / Twitter
              </a>
              <a href="https://discord.gg/DfrB5hnb8f" target="_blank" rel="noreferrer" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                Discord
              </a>
              <Link to="/access" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                Sign in
              </Link>
              <a href="#signals" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                Back to top
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}
