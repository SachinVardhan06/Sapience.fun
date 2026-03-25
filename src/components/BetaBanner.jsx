import { useEffect } from 'react'

export default function BetaBanner() {
  useEffect(() => {
    document.documentElement.classList.add('beta-banner-on')
    return () => {
      document.documentElement.classList.remove('beta-banner-on')
    }
  }, [])

  return (
    <div
      className="fixed left-0 right-0 top-0 z-250 flex h-9 items-center justify-center gap-2 border-b px-4 text-center sm:gap-3"
      style={{
        background: 'var(--beta-banner-bg)',
        borderColor: 'var(--beta-banner-border)',
        color: 'var(--beta-banner-text)',
      }}
      role="status"
      aria-live="polite"
    >
      <span
        className="netlifypixel shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider sm:text-[10px]"
        style={{
          background: 'var(--beta-banner-chip-bg)',
          color: 'var(--beta-banner-chip-text)',
          border: '1px solid var(--beta-banner-chip-border)',
        }}
      >
        Beta
      </span>
      <p className="text-[11px] font-medium leading-tight sm:text-xs">
        You&apos;re on an early release — balances, markets, and features may change.
      </p>
    </div>
  )
}
