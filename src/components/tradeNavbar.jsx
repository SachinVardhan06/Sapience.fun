import { NavLink, useNavigate } from 'react-router-dom'
import { useWalletAuth } from '../context/walletAuth'
import { useTheme } from '../context/themeContext'
import { useWalletBalance } from '../hooks/useWalletBalance'

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2"  x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2"  y1="12" x2="5"  y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
      <line x1="4.22"  y1="4.22"  x2="6.34"  y2="6.34"/>
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
      <line x1="4.22"  y1="19.78" x2="6.34"  y2="17.66"/>
      <line x1="17.66" y1="6.34"  x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function TradeNavbar() {
  const navigate = useNavigate()
  const { isConnected, walletAddress, walletShort, switchWallet, disconnectWallet } = useWalletAuth()
  const { isDark, toggle } = useTheme()
  const walletPts = useWalletBalance(isConnected ? walletAddress : '')

  return (
    <nav className="relative z-20 w-full shrink-0 bg-transparent px-3 pt-2 pb-0 sm:px-6 sm:pt-3">
      <div
        className="mx-auto w-full max-w-[1440px] rounded-2xl border backdrop-blur-2xl sm:rounded-3xl"
        style={{
          background: 'var(--nav-glass-bg)',
          borderColor: 'var(--border-g)',
          boxShadow: 'var(--nav-elev)',
        }}
      >
      <div className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 sm:min-h-16 sm:gap-3 sm:px-6 sm:py-2.5">
      {/* Logo */}
      <p
        className="netlifypixel shrink-0 select-none text-[clamp(15px,3.8vw,20px)] font-black leading-none tracking-[0.14em] sm:text-[21px] sm:tracking-[0.16em]"
        style={{ textShadow: isDark ? '0 0 15px rgba(0,0,0,0.5)' : 'none' }}
      >
        <span style={{ color: 'var(--text-heading)' }}>SAPIENCE.</span>
        <span className="pl-[0.06em]" style={{ color: 'var(--accent)', textShadow: 'var(--glow-title)' }}>
          FUN
        </span>
      </p>

      {/* Nav links — scroll horizontally on narrow viewports instead of clipping */}
      <div className="nav-links-scroll flex min-w-0 items-center justify-center gap-0.5 overflow-x-auto sm:gap-0.5">
        {[
          { to: '/prediction', label: 'Markets' },
          { to: '/btc-5m', label: 'BTC 5m' },
          { to: '/leaderboard', label: 'Leaderboard' },
          { to: '/profile', label: 'Profile' },
        ].map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className="shrink-0 whitespace-nowrap rounded-md border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold leading-snug tracking-[0.02em] antialiased transition-[color,opacity,border-color,background] duration-150 hover:opacity-90 sm:px-4 sm:py-2.5 sm:text-[14px]"
            style={({ isActive }) => ({
              color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)',
              fontWeight: isActive ? 700 : 600,
              textShadow: isActive ? 'var(--glow-small)' : 'none',
              borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
              background: isActive ? 'var(--accent-surface)' : 'transparent',
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* Theme + wallet */}
      <div className="flex shrink-0 items-center justify-end gap-1.5 text-[12px] font-medium leading-snug tracking-[0.01em] antialiased sm:gap-3 sm:text-[13px]">

        <button
          type="button"
          onClick={toggle}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center rounded-lg transition"
          style={{
            width: 32,
            height: 32,
            background: 'var(--nav-toggle-bg)',
            border: '1px solid var(--border-g)',
            color: 'var(--nav-toggle-fg)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--nav-toggle-hover-bg)'
            e.currentTarget.style.color = 'var(--nav-toggle-hover-fg)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--nav-toggle-bg)'
            e.currentTarget.style.color = 'var(--nav-toggle-fg)'
          }}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        <span className="hidden sm:inline" style={{ color: 'var(--border-g)' }} aria-hidden>|</span>

        {isConnected ? (
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <span className="hidden min-w-0 items-center gap-1.5 sm:flex" style={{ color: 'var(--text-secondary)' }}>
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: 'var(--accent)', boxShadow: '0 0 6px color-mix(in srgb, var(--accent) 55%, transparent)' }}
              />
              <span className="max-w-[88px] truncate font-mono text-[12px] font-medium tabular-nums tracking-tight sm:max-w-[140px] sm:text-[13px]">
                {walletShort}
              </span>
            </span>
            <span className="sm:hidden" style={{ color: 'var(--border-g)' }} aria-hidden>·</span>
            <button
              type="button"
              onClick={() => switchWallet()}
              className="shrink-0 rounded-md px-1 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition sm:text-xs"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent-text)'
                e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.opacity = '1'
              }}
            >
              Switch
            </button>
            <span className="hidden sm:inline" style={{ color: 'var(--border-g)' }} aria-hidden>·</span>
            <span
              className="hidden shrink-0 text-[12px] font-semibold tabular-nums tracking-tight sm:inline sm:text-[13px]"
              style={{ color: 'var(--accent-text)', textShadow: 'var(--glow-balance)' }}
            >
              {walletPts.toLocaleString()}
              <span className="ml-0.5 text-[11px] font-medium opacity-85 sm:text-xs">pts</span>
            </span>
            <span className="hidden sm:inline" style={{ color: 'var(--border-g)' }} aria-hidden>·</span>
            <button
              type="button"
              onClick={async () => { await disconnectWallet(); navigate('/access', { replace: true }) }}
              className="shrink-0 rounded-md px-1 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition sm:text-xs"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden">Out</span>
            </button>
          </div>
        ) : (
          <span className="hidden sm:inline text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            Not connected
          </span>
        )}
      </div>
      </div>
      </div>
    </nav>
  )
}

export default TradeNavbar
