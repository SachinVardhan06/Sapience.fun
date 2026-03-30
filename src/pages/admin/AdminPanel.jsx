import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminCreditWallet,
  dismissPointRequest,
  fetchPointRequests,
  fetchPrivateMarkets,
  fetchWallets,
  fulfillPointRequest,
  getGraphqlHttpUrl,
} from '../../utils/graphqlClient'

const SESSION_KEY = 'sapience_admin_session_pc'

function formatGqlAdminHint(err) {
  const msg = String(err?.message || err || '')
  const looksLikeOldSchema =
    /cannot query field/i.test(msg) && /pointRequest/i.test(msg)
  if (!looksLikeOldSchema) return msg || 'Unlock failed.'
  const url = getGraphqlHttpUrl()
  return [
    'This GraphQL server does not include the admin API yet (no pointRequests query on the schema).',
    '',
    `Your app is posting to: ${url}`,
    '',
    'Deploy the latest graphql-server.js + graphql-persist.mjs from this repo to that host, restart the process, and set SAPIENCE_ADMIN_PASSCODE in the server environment.',
    '',
    'For local use: run npm run dev so Vite talks to http://localhost:4000/graphql and ensure node graphql-server.js is the same version as this repo.',
  ].join('\n')
}

function shortAddr(a) {
  if (!a) return ''
  const s = String(a)
  return s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s
}

export default function AdminPanel() {
  const [passcode, setPasscode] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [boot, setBoot] = useState(true)
  const [err, setErr] = useState('')
  const [requests, setRequests] = useState([])
  const [wallets, setWallets] = useState([])
  const [markets, setMarkets] = useState([])
  const [grantAddr, setGrantAddr] = useState('')
  const [grantAmt, setGrantAmt] = useState('500')
  const [fulfillPts, setFulfillPts] = useState({})
  const [busyId, setBusyId] = useState('')

  const getPasscode = useCallback(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) || passcode.trim()
    } catch {
      return passcode.trim()
    }
  }, [passcode])

  const refreshAll = useCallback(async () => {
    const code = getPasscode()
    if (!code) return
    const [req, wal, mkt] = await Promise.all([
      fetchPointRequests(code, null),
      fetchWallets(),
      fetchPrivateMarkets(),
    ])
    setRequests(Array.isArray(req) ? req : [])
    setWallets(Array.isArray(wal) ? wal : [])
    setMarkets(Array.isArray(mkt) ? mkt : [])
  }, [getPasscode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : ''
        if (!stored) {
          if (!cancelled) {
            setBoot(false)
            setErr('')
          }
          return
        }
        setPasscode(stored)
        await fetchPointRequests(stored, 'pending')
        if (cancelled) return
        setUnlocked(true)
        const [req, wal, mkt] = await Promise.all([
          fetchPointRequests(stored, null),
          fetchWallets(),
          fetchPrivateMarkets(),
        ])
        if (cancelled) return
        setRequests(Array.isArray(req) ? req : [])
        setWallets(Array.isArray(wal) ? wal : [])
        setMarkets(Array.isArray(mkt) ? mkt : [])
      } catch (e) {
        try {
          sessionStorage.removeItem(SESSION_KEY)
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setUnlocked(false)
          setErr(formatGqlAdminHint(e))
        }
      } finally {
        if (!cancelled) setBoot(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleUnlock = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await fetchPointRequests(passcode.trim(), 'pending')
      sessionStorage.setItem(SESSION_KEY, passcode.trim())
      setUnlocked(true)
      await refreshAll()
    } catch (ex) {
      setErr(formatGqlAdminHint(ex))
    }
  }

  const logoutAdmin = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
    setPasscode('')
    setUnlocked(false)
    setRequests([])
  }

  const handleFulfill = async (id) => {
    const raw = fulfillPts[id] ?? '500'
    const pts = Number.parseInt(String(raw).replace(/\D/g, ''), 10)
    if (!Number.isFinite(pts) || pts <= 0) {
      setErr('Enter a positive points amount.')
      return
    }
    setErr('')
    setBusyId(id)
    try {
      await fulfillPointRequest(getPasscode(), id, pts)
      await refreshAll()
    } catch (ex) {
      setErr(ex?.message || 'Fulfill failed.')
    } finally {
      setBusyId('')
    }
  }

  const handleDismiss = async (id) => {
    setErr('')
    setBusyId(`d-${id}`)
    try {
      await dismissPointRequest(getPasscode(), id)
      await refreshAll()
    } catch (ex) {
      setErr(ex?.message || 'Dismiss failed.')
    } finally {
      setBusyId('')
    }
  }

  const handleQuickGrant = async (e) => {
    e.preventDefault()
    const addr = grantAddr.trim().toLowerCase()
    const amt = Number.parseInt(String(grantAmt).replace(/\D/g, ''), 10)
    if (!addr.startsWith('0x') || addr.length < 10) {
      setErr('Enter a valid wallet address.')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr('Enter a valid amount.')
      return
    }
    setErr('')
    setBusyId('grant')
    try {
      await adminCreditWallet(getPasscode(), addr, amt)
      setGrantAddr('')
      await refreshAll()
    } catch (ex) {
      setErr(ex?.message || 'Grant failed.')
    } finally {
      setBusyId('')
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')

  return (
    <main
      id="main-content"
      className="relative min-h-dvh antialiased"
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
          style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 0%, var(--glow-radial), transparent)' }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--accent-label)' }}>
              Operator
            </p>
            <h1 className="m-0 text-2xl font-bold tracking-tight" style={{ color: 'var(--text-heading)' }}>
              Admin
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/"
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--border-g)', color: 'var(--text-secondary)' }}
            >
              Home
            </Link>
            {unlocked ? (
              <button
                type="button"
                onClick={logoutAdmin}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
                style={{ borderColor: 'var(--border-g)', color: 'var(--text-secondary)' }}
              >
                Lock panel
              </button>
            ) : null}
          </div>
        </div>

        {boot ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading…
          </p>
        ) : !unlocked ? (
          <div
            className="max-w-2xl rounded-2xl border p-6"
            style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)', backdropFilter: 'blur(10px)' }}
          >
            <p className="m-0 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Enter the API admin passcode (same value as <code className="font-mono text-xs">SAPIENCE_ADMIN_PASSCODE</code>{' '}
              on the GraphQL server). It is stored only in this browser tab until you lock the panel.
            </p>
            <form className="mt-5 flex flex-col gap-3" onSubmit={handleUnlock}>
              <input
                type="password"
                autoComplete="off"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value)
                  if (err) setErr('')
                }}
                placeholder="Admin passcode"
                className="rounded-xl border px-3 py-2.5 font-mono text-sm outline-none"
                style={{ borderColor: 'var(--border-g)', background: 'var(--bg-page)', color: 'var(--text-body)' }}
              />
              {err ? (
                <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: '#f87171' }}>
                  {err}
                </p>
              ) : null}
              <button
                type="submit"
                className="rounded-xl px-4 py-2.5 text-sm font-bold"
                style={{ background: 'var(--accent)', color: 'var(--accent-on, #052e16)' }}
              >
                Unlock
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {err ? (
              <div
                className="whitespace-pre-wrap rounded-xl border px-4 py-3 text-sm leading-relaxed"
                style={{ borderColor: '#7f1d1d', color: '#fecaca' }}
              >
                {err}
              </div>
            ) : null}

            <section
              className="rounded-2xl border p-5 sm:p-6"
              style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)', backdropFilter: 'blur(10px)' }}
            >
              <h2 className="m-0 text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
                Overview
              </h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Wallets (API)
                  </dt>
                  <dd className="m-0 mt-1 text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-text)' }}>
                    {wallets.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Private markets
                  </dt>
                  <dd className="m-0 mt-1 text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-text)' }}>
                    {markets.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Pending point requests
                  </dt>
                  <dd className="m-0 mt-1 text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-text)' }}>
                    {pending.length}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => refreshAll()}
                className="mt-4 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ borderColor: 'var(--border-g)', color: 'var(--text-secondary)' }}
              >
                Refresh data
              </button>
            </section>

            <section
              className="rounded-2xl border p-5 sm:p-6"
              style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)', backdropFilter: 'blur(10px)' }}
            >
              <h2 className="m-0 text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
                Point top-up requests
              </h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Users with zero balance can submit a request from the app. Fulfill to credit their wallet and close the
                ticket.
              </p>
              {pending.length === 0 ? (
                <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                  No pending requests.
                </p>
              ) : (
                <ul className="mt-4 flex list-none flex-col gap-3 p-0">
                  {pending.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border p-4"
                      style={{ borderColor: 'var(--border-g)', background: 'var(--bg-page)' }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="m-0 font-mono text-xs break-all" style={{ color: 'var(--text-heading)' }}>
                            {r.wallet}
                          </p>
                          <p className="mt-2 m-0 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                            {r.message?.trim() ? r.message : <em style={{ color: 'var(--text-muted)' }}>No message</em>}
                          </p>
                          <p className="mt-2 m-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {new Date(r.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={fulfillPts[r.id] ?? '500'}
                            onChange={(e) => setFulfillPts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="w-24 rounded-lg border px-2 py-1.5 font-mono text-sm"
                            style={{ borderColor: 'var(--border-g)', background: 'var(--bg-glass2)' }}
                            aria-label="Points to grant"
                          />
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => handleFulfill(r.id)}
                            className="rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-50"
                            style={{ background: 'var(--accent)', color: 'var(--accent-on, #052e16)' }}
                          >
                            Fulfill
                          </button>
                          <button
                            type="button"
                            disabled={busyId === `d-${r.id}`}
                            onClick={() => handleDismiss(r.id)}
                            className="rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                            style={{ borderColor: 'var(--border-g)', color: 'var(--text-secondary)' }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className="rounded-2xl border p-5 sm:p-6"
              style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)', backdropFilter: 'blur(10px)' }}
            >
              <h2 className="m-0 text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
                Quick grant
              </h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Credit any wallet directly (same as fulfill, without a request row).
              </p>
              <form className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={handleQuickGrant}>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Address
                  <input
                    value={grantAddr}
                    onChange={(e) => setGrantAddr(e.target.value)}
                    placeholder="0x…"
                    className="rounded-xl border px-3 py-2 font-mono text-sm"
                    style={{ borderColor: 'var(--border-g)', background: 'var(--bg-page)', color: 'var(--text-body)' }}
                  />
                </label>
                <label className="flex w-28 flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Points
                  <input
                    value={grantAmt}
                    onChange={(e) => setGrantAmt(e.target.value)}
                    inputMode="numeric"
                    className="rounded-xl border px-3 py-2 font-mono text-sm"
                    style={{ borderColor: 'var(--border-g)', background: 'var(--bg-page)', color: 'var(--text-body)' }}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busyId === 'grant'}
                  className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--accent-on, #052e16)' }}
                >
                  Grant
                </button>
              </form>
            </section>

            <section
              className="rounded-2xl border p-5 sm:p-6"
              style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)', backdropFilter: 'blur(10px)' }}
            >
              <h2 className="m-0 text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
                Wallets (leaderboard order)
              </h2>
              <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border" style={{ borderColor: 'var(--border-g)' }}>
                <table className="w-full border-collapse text-left text-xs sm:text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg-page)' }}>
                      <th className="sticky top-0 px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>
                        Address
                      </th>
                      <th className="sticky top-0 px-3 py-2 font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallets.slice(0, 80).map((w) => (
                      <tr key={w.address} style={{ borderTop: '1px solid var(--border-g)' }}>
                        <td className="px-3 py-2 font-mono">{shortAddr(w.address)}</td>
                        <td className="px-3 py-2 tabular-nums font-medium" style={{ color: 'var(--accent-text)' }}>
                          {Number(w.balance).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              className="rounded-2xl border p-5 sm:p-6"
              style={{ borderColor: 'var(--border-g2)', background: 'var(--bg-glass2)', backdropFilter: 'blur(10px)' }}
            >
              <h2 className="m-0 text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
                App routes
              </h2>
              <ul className="mt-3 list-none space-y-1 p-0 text-sm" style={{ color: 'var(--accent-text)' }}>
                <li>
                  <Link to="/prediction" className="underline-offset-2 hover:underline">
                    /prediction
                  </Link>{' '}
                  — Markets
                </li>
                <li>
                  <Link to="/btc-5m" className="underline-offset-2 hover:underline">
                    /btc-5m
                  </Link>{' '}
                  — BTC 5m
                </li>
                <li>
                  <Link to="/private-arena" className="underline-offset-2 hover:underline">
                    /private-arena
                  </Link>{' '}
                  — Private arena
                </li>
                <li>
                  <Link to="/leaderboard" className="underline-offset-2 hover:underline">
                    /leaderboard
                  </Link>
                </li>
                <li>
                  <Link to="/profile" className="underline-offset-2 hover:underline">
                    /profile
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
