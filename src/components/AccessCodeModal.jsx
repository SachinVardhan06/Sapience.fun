import { useEffect, useState } from 'react'
import { normalizeAccessInput, verifyAccessCode } from '../utils/accessGate'

export default function AccessCodeModal({ open, walletShort, onVerified }) {
  const [accessInput, setAccessInput] = useState('')
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    if (open) {
      setAccessInput('')
      setAccessError('')
    }
  }, [open, walletShort])

  const submit = (e) => {
    e.preventDefault()
    const entered = normalizeAccessInput(accessInput)
    if (entered.length !== 6) {
      setAccessError('Enter the 6-character code.')
      return
    }
    if (!verifyAccessCode(accessInput)) {
      setAccessError('Invalid access code.')
      return
    }
    setAccessError('')
    onVerified()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'color-mix(in srgb, var(--bg-page) 88%, transparent)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-code-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border p-6 shadow-xl sm:p-8"
        style={{
          background: 'var(--bg-glass2)',
          borderColor: 'var(--border-g2)',
          boxShadow: '0 0 40px color-mix(in srgb, var(--accent) 12%, transparent)',
        }}
      >
        <p
          id="access-code-title"
          className="netlifypixel mb-1 text-center text-[11px] font-black uppercase tracking-[0.2em]"
          style={{ color: 'var(--accent-text)' }}
        >
          Beta signup
        </p>
        <h2 className="mb-2 text-center text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
          Enter access code
        </h2>
        <p className="mb-1 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          New wallets need a 6-character code to use markets.
        </p>
        {walletShort ? (
          <p className="mb-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            Signed in as {walletShort}
          </p>
        ) : (
          <div className="mb-4" />
        )}
        <label className="sr-only" htmlFor="market-access-code-input">
          Access code
        </label>
        <input
          id="market-access-code-input"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={6}
          value={accessInput}
          onChange={(ev) => {
            const v = normalizeAccessInput(ev.target.value).slice(0, 6)
            setAccessInput(v)
            setAccessError('')
          }}
          placeholder="••••••"
          autoFocus
          className="mb-4 w-full rounded-xl px-4 py-3 text-center font-mono text-lg tracking-[0.35em] outline-none"
          style={{
            color: 'var(--text-body)',
            background: 'var(--input-bg)',
            border: '1px solid var(--border-g)',
          }}
        />
        {accessError ? (
          <p className="mb-3 text-center text-sm text-rose-400">{accessError}</p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-xl py-3 text-sm font-bold transition hover:opacity-95"
          style={{
            background: 'var(--accent)',
            color: '#08240e',
            boxShadow: 'var(--glow-small)',
          }}
        >
          Continue
        </button>
        <p className="mt-3 text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Code is shared by your team — ask an admin if you don&apos;t have it.
        </p>
      </form>
    </div>
  )
}
