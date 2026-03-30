import { useState } from 'react'
import { submitPointRequest } from '../utils/graphqlClient'

const SNOOZE_KEY = 'sapience_zero_pts_snooze'

export function snoozeZeroPointsModal() {
  try {
    sessionStorage.setItem(SNOOZE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearZeroPointsSnooze() {
  try {
    sessionStorage.removeItem(SNOOZE_KEY)
  } catch {
    /* ignore */
  }
}

export function isZeroPointsModalSnoozed() {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === '1'
  } catch {
    return false
  }
}

export default function ZeroPointsRequestModal({ open, walletAddress, onClose, onSubmitted }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await submitPointRequest({ wallet: walletAddress, message: message.trim() })
      setDone(true)
      onSubmitted?.()
    } catch (ex) {
      setErr(ex?.message || 'Could not reach the server. Try again, or contact support with your wallet address.')
    } finally {
      setBusy(false)
    }
  }

  const handleSnooze = () => {
    snoozeZeroPointsModal()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[280] flex items-end justify-center p-4 sm:items-center sm:p-6"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="zero-pts-title"
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6"
        style={{
          borderColor: 'var(--border-g2)',
          background: 'var(--bg-glass2)',
          backdropFilter: 'blur(14px)',
          boxShadow: 'var(--nav-elev)',
        }}
      >
        {!done ? (
          <>
            <p
              className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ color: 'var(--accent-label)' }}
            >
              Points balance
            </p>
            <h2 id="zero-pts-title" className="m-0 text-xl font-bold tracking-tight" style={{ color: 'var(--text-heading)' }}>
              You&apos;re out of points
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Send a short note to the team. An admin can top up your wallet when they see your request—usually the same
              day during beta.
            </p>
            <p
              className="mt-2 break-all font-mono text-[11px] leading-snug sm:text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              {walletAddress}
            </p>
            <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Message <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. Played a lot on demo markets — could I get 500 pts to keep testing?"
                className="w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none transition focus-visible:ring-2"
                style={{
                  borderColor: 'var(--border-g)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-body)',
                }}
              />
              {err ? (
                <p className="m-0 text-sm" style={{ color: '#f87171' }}>
                  {err}
                </p>
              ) : null}
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={handleSnooze}
                  className="order-3 rounded-xl border px-4 py-2.5 text-sm font-semibold transition sm:order-1"
                  style={{ borderColor: 'var(--border-g)', color: 'var(--text-secondary)' }}
                >
                  Remind me later
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="order-1 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 sm:order-2"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--accent-on, #052e16)',
                    boxShadow: 'var(--glow-small)',
                  }}
                >
                  {busy ? 'Sending…' : 'Request top-up'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="m-0 text-xl font-bold tracking-tight" style={{ color: 'var(--text-heading)' }}>
              Request sent
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Thanks—an admin will review your wallet and grant points when they can. You can keep browsing; refresh your
              balance after you hear back.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-bold"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-on, #052e16)',
              }}
            >
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  )
}
