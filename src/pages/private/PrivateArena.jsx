import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TradeNavbar from '../../components/tradeNavbar'
import { useWalletAuth } from '../../context/walletAuth'
import { useWalletBalance } from '../../hooks/useWalletBalance'
import { triggerBetSprinkle } from '../../utils/betSprinkle'
import { POINTS_CHANGED_EVENT, ensureWalletBonus } from '../../utils/pointsLedger'
import {
  PRIVATE_ACCESS_CODE_MAX,
  PRIVATE_ACCESS_CODE_MIN,
  PRIVATE_MIN_SEED,
  PRIVATE_MIN_STAKE,
  createPrivateMarket,
  deletePrivateMarket,
  fetchAndMergePrivateMarketByCode,
  getPrivateMarketById,
  hydratePrivateMarkets,
  listPrivateMarketsForWallet,
  normalizeAccessCode,
  resolvePrivateMarket,
  stakePrivateMarket,
} from '../../utils/privateMarkets'

function sumSide(stakes, side) {
  return (stakes || []).filter((s) => s.side === side).reduce((a, s) => a + Number(s.points) || 0, 0)
}

export default function PrivateArena() {
  const { walletAddress } = useWalletAuth()
  const pts = useWalletBalance(walletAddress || '')
  const [searchParams, setSearchParams] = useSearchParams()
  const urlCodeNorm = useMemo(
    () => normalizeAccessCode(searchParams.get('c') || ''),
    [searchParams],
  )

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [seed, setSeed] = useState(String(PRIVATE_MIN_SEED))
  const [closesInHours, setClosesInHours] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [stakeAmount, setStakeAmount] = useState(String(PRIVATE_MIN_STAKE))
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [mine, setMine] = useState([])
  const [focused, setFocused] = useState(null)
  const [wantCustomCode, setWantCustomCode] = useState(false)
  const [customAccessCode, setCustomAccessCode] = useState('')
  /** false → inviteCodeRequired: room hidden from Markets; true → listed in Markets (no code needed to find). */
  const [listInMarketsPublic, setListInMarketsPublic] = useState(true)
  /** In-app delete confirmation (replaces window.confirm). */
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const refreshMine = useCallback(() => {
    if (!walletAddress) {
      setMine([])
      return
    }
    ensureWalletBonus(walletAddress)
    setMine(listPrivateMarketsForWallet(walletAddress))
  }, [walletAddress])

  useEffect(() => {
    void hydratePrivateMarkets().then(() => refreshMine())
  }, [refreshMine])

  useEffect(() => {
    const onPts = () => {
      void hydratePrivateMarkets().then(() => refreshMine())
    }
    window.addEventListener(POINTS_CHANGED_EVENT, onPts)
    return () => window.removeEventListener(POINTS_CHANGED_EVENT, onPts)
  }, [refreshMine])

  useEffect(() => {
    if (!urlCodeNorm) return
    setJoinCode(urlCodeNorm)
    let cancelled = false
    void (async () => {
      const m = await fetchAndMergePrivateMarketByCode(urlCodeNorm)
      if (!cancelled) setFocused(m ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [urlCodeNorm])

  const shareUrl = useMemo(() => {
    if (!focused?.code || typeof window === 'undefined') return ''
    const u = new URL(window.location.origin + window.location.pathname)
    u.pathname = '/private-arena'
    u.searchParams.set('c', focused.code)
    return u.toString()
  }, [focused])

  const showMessage = (text, ok = true) => {
    setMsg({ text, ok })
    if (text) window.setTimeout(() => setMsg((m) => (m.text === text ? { text: '', ok: true } : m)), 5000)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!walletAddress) return
    await hydratePrivateMarkets()
    const seedN = Math.floor(Number(seed))
    const r = await createPrivateMarket(walletAddress, {
      title,
      description,
      seedPoints: seedN,
      closesInHours: closesInHours === '' ? null : Number(closesInHours),
      wantCustomCode,
      customCode: customAccessCode,
      listInMarkets: listInMarketsPublic,
    })
    if (!r.ok) {
      showMessage(r.reason, false)
      return
    }
    if (r.syncError) {
      showMessage(
        listInMarketsPublic
          ? `Room created — code ${r.market.code}. Server sync failed (${r.syncError}). It appears on this device only until the API accepts private markets.`
          : `Room created — code ${r.market.code}. Server sync failed (${r.syncError}). Share the link; joins may fail for others until sync works.`,
        false,
      )
    } else {
      showMessage(
        listInMarketsPublic
          ? `Room created — code ${r.market.code}. It will show under Markets → Private for everyone (synced to server).`
          : `Room created — code ${r.market.code}. Code-only: share the link; it stays off the public Markets list.`,
        true,
      )
    }
    setTitle('')
    setDescription('')
    setSeed(String(PRIVATE_MIN_SEED))
    setClosesInHours('')
    setWantCustomCode(false)
    setCustomAccessCode('')
    setListInMarketsPublic(true)
    setFocused(r.market)
    setSearchParams({ c: r.market.code })
    refreshMine()
  }

  const handleOpenCode = async () => {
    const c = normalizeAccessCode(joinCode)
    if (!c) {
      showMessage(
        `Enter a valid code (${PRIVATE_ACCESS_CODE_MIN}–${PRIVATE_ACCESS_CODE_MAX} letters or numbers).`,
        false,
      )
      return
    }
    const m = await fetchAndMergePrivateMarketByCode(c)
    if (!m) {
      showMessage(
        'No room matches that code. Check spelling, or try again if the server is offline.',
        false,
      )
      return
    }
    setFocused(m)
    setSearchParams({ c: m.code })
  }

  const handleStake = (side) => {
    if (!walletAddress || !focused) return
    const n = Math.floor(Number(stakeAmount))
    const r = stakePrivateMarket(walletAddress, focused.id, side, n)
    if (!r.ok) {
      showMessage(r.reason, false)
      return
    }
    showMessage(`Staked ${n} pts on ${side}.`, true)
    triggerBetSprinkle()
    setFocused(r.market)
    refreshMine()
  }

  const handleResolve = (outcome) => {
    if (!walletAddress || !focused) return
    const r = resolvePrivateMarket(walletAddress, focused.id, outcome)
    if (!r.ok) {
      showMessage(r.reason, false)
      return
    }
    showMessage(`Resolved as ${outcome}. Payouts sent to winners.`, true)
    setFocused(r.market)
    refreshMine()
  }

  const clearRoomFromUrl = () => {
    setSearchParams({})
  }

  const getMarketMetaForDelete = (marketId) => {
    const fromFocused = focused?.id === marketId ? focused : null
    const fromMine = mine.find((m) => m.id === marketId)
    const fromStore = getPrivateMarketById(marketId)
    const m = fromFocused || fromMine || fromStore
    return {
      title: m?.title || 'this private market',
      code: m?.code ? String(m.code).toUpperCase() : '',
    }
  }

  const openDeleteConfirm = (marketId) => {
    const { title, code } = getMarketMetaForDelete(marketId)
    setDeleteConfirm({ id: marketId, title, code })
  }

  const closeDeleteConfirm = () => setDeleteConfirm(null)

  const confirmDeleteMarket = async () => {
    if (!walletAddress || !deleteConfirm) return
    const marketId = deleteConfirm.id
    const r = await deletePrivateMarket(walletAddress, marketId)
    setDeleteConfirm(null)
    if (!r.ok) {
      showMessage(r.reason, false)
      return
    }
    showMessage('Room deleted — points refunded.', true)
    if (focused?.id === marketId) {
      setFocused(null)
      clearRoomFromUrl()
    }
    refreshMine()
  }

  useEffect(() => {
    if (!deleteConfirm) return
    const onKey = (e) => {
      if (e.key === 'Escape') setDeleteConfirm(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteConfirm])

  useEffect(() => {
    if (!focused?.id) return
    const m = getPrivateMarketById(focused.id)
    if (m) setFocused(m)
  }, [focused?.id, pts, walletAddress])

  const isCreator =
    walletAddress && focused && String(focused.creator).toLowerCase() === String(walletAddress).toLowerCase()
  const yesT = sumSide(focused?.stakes, 'YES')
  const noT = sumSide(focused?.stakes, 'NO')
  const pot = (focused ? Number(focused.seedPoints) : 0) + yesT + noT
  const bettingClosed =
    focused?.closesAt && Date.now() > new Date(focused.closesAt).getTime() && focused.status === 'open'

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden antialiased"
      style={{
        background: 'var(--bg-page)',
        color: 'var(--text-body)',
        paddingTop: 'var(--beta-banner-height, 0px)',
      }}
    >
      <TradeNavbar />

      {deleteConfirm ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          role="presentation"
          onClick={closeDeleteConfirm}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-market-dialog-title"
            aria-describedby="delete-market-dialog-desc"
            onClick={(e) => e.stopPropagation()}
            style={{
              borderColor: 'var(--border-g2)',
              background: 'var(--panel-bg)',
              boxShadow: 'var(--nav-elev)',
            }}
          >
            <h2
              id="delete-market-dialog-title"
              className="m-0 text-lg font-bold sm:text-xl"
              style={{ color: 'var(--text-heading)' }}
            >
              Delete this market?
            </h2>
            <p
              id="delete-market-dialog-desc"
              className="mt-3 text-sm leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              Are you sure you want to delete this market? Your seed and every player stake will be refunded. This cannot be
              undone.
            </p>
            {deleteConfirm.code ? (
              <p className="mt-2 font-mono text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-text)' }}>
                Code {deleteConfirm.code}
              </p>
            ) : null}
            <p className="mt-2 text-sm font-medium leading-snug" style={{ color: 'var(--text-heading)' }}>
              {deleteConfirm.title}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
                style={{
                  borderColor: 'var(--border-g2)',
                  background: 'var(--bg-glass)',
                  color: 'var(--text-heading)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteMarket()}
                className="rounded-xl border px-4 py-2.5 text-sm font-bold"
                style={{
                  borderColor: 'rgba(248,113,113,0.55)',
                  background: 'rgba(248,113,113,0.18)',
                  color: '#fecaca',
                }}
              >
                Yes, delete market
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main
        id="main-content"
        className="relative z-10 mx-auto w-full max-w-6xl min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-16 pt-6 sm:px-6 sm:pt-8"
      >
        <header className="mb-8">
          <p
            className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] sm:text-[11px]"
            style={{ color: 'var(--accent-label)' }}
          >
            Private rooms
          </p>
          <h1 className="m-0 text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--text-heading)' }}>
            Host a competition with your points
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed sm:text-base" style={{ color: 'var(--text-secondary)' }}>
            Stake a seed pool, share a short invite code, and let friends trade YES / NO on your question. When you resolve
            the outcome, winners split the whole pot fairly—play money only, same wallet points as the rest of Sapience.
          </p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Trust the host to resolve honestly; this is a social layer for your crew, not a custody product.
          </p>
        </header>

        {msg.text ? (
          <p
            className="mb-6 rounded-xl border px-4 py-3 text-sm"
            role="status"
            style={{
              borderColor: msg.ok ? 'var(--accent-panel-border)' : 'rgba(248,113,113,0.45)',
              background: msg.ok ? 'var(--accent-panel)' : 'rgba(248,113,113,0.08)',
              color: msg.ok ? 'var(--text-body)' : '#fecaca',
            }}
          >
            {msg.text}
          </p>
        ) : null}

        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6 sm:space-y-8 lg:col-start-1 lg:row-start-1">
          <section
            className="rounded-2xl border p-5 sm:p-6"
            style={{
              borderColor: 'var(--border-g)',
              background: 'var(--bg-glass)',
              boxShadow: 'var(--nav-elev)',
            }}
            aria-labelledby="create-heading"
          >
            <h2 id="create-heading" className="m-0 text-lg font-bold sm:text-xl" style={{ color: 'var(--text-heading)' }}>
              Create a room
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Minimum seed {PRIVATE_MIN_SEED} pts — that amount is locked into the prize pool until you resolve. New rooms
              are saved to the Sapience API so anyone can find them by code or in the public Markets feed (Private).
            </p>
            <form className="mt-5 space-y-4" onSubmit={handleCreate}>
              <div>
                <label htmlFor="pm-title" className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Question
                </label>
                <input
                  id="pm-title"
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition sm:text-base"
                  style={{
                    borderColor: 'var(--border-g)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-heading)',
                  }}
                  placeholder="Will our team ship before Friday?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="pm-desc" className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Rules / context (optional)
                </label>
                <textarea
                  id="pm-desc"
                  rows={3}
                  className="w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none sm:text-base"
                  style={{
                    borderColor: 'var(--border-g)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-heading)',
                  }}
                  placeholder="How you’ll decide YES vs NO…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                />
              </div>

              <fieldset className="space-y-2 border-0 p-0">
                <legend
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Who can find this room?
                </legend>
                <label className="flex cursor-pointer items-start gap-2 text-sm leading-snug" style={{ color: 'var(--text-body)' }}>
                  <input
                    type="radio"
                    name="pm-listing"
                    checked={listInMarketsPublic}
                    onChange={() => setListInMarketsPublic(true)}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    <span className="font-semibold" style={{ color: 'var(--text-heading)' }}>
                      No invite code needed to find it
                    </span>
                    {' — '}listed in Markets → Private so anyone can browse and join (you still get a code for sharing).
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm leading-snug" style={{ color: 'var(--text-body)' }}>
                  <input
                    type="radio"
                    name="pm-listing"
                    checked={!listInMarketsPublic}
                    onChange={() => setListInMarketsPublic(false)}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    <span className="font-semibold" style={{ color: 'var(--text-heading)' }}>
                      Invite code required
                    </span>
                    {' — '}hidden from the Markets list; only people with your link or code can open the room.
                  </span>
                </label>
              </fieldset>

              <fieldset className="space-y-2 border-0 p-0">
                <legend
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Invite code
                </legend>
                <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--text-body)' }}>
                  <input
                    type="radio"
                    name="pm-code-mode"
                    checked={!wantCustomCode}
                    onChange={() => setWantCustomCode(false)}
                    className="shrink-0"
                  />
                  Random code (we pick one)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--text-body)' }}>
                  <input
                    type="radio"
                    name="pm-code-mode"
                    checked={wantCustomCode}
                    onChange={() => setWantCustomCode(true)}
                    className="shrink-0"
                  />
                  I want my own access code
                </label>
                {wantCustomCode ? (
                  <div className="pt-1">
                    <input
                      id="pm-custom-code"
                      type="text"
                      value={customAccessCode}
                      onChange={(e) => setCustomAccessCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder={`${PRIVATE_ACCESS_CODE_MIN}–${PRIVATE_ACCESS_CODE_MAX} letters or numbers`}
                      maxLength={PRIVATE_ACCESS_CODE_MAX}
                      autoComplete="off"
                      className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm uppercase tracking-widest outline-none sm:text-base"
                      style={{
                        borderColor: 'var(--border-g)',
                        background: 'var(--input-bg)',
                        color: 'var(--text-heading)',
                      }}
                    />
                    <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      If you leave this empty, we assign a random code anyway. Use only A–Z and 0–9 (
                      {PRIVATE_ACCESS_CODE_MIN}–{PRIVATE_ACCESS_CODE_MAX} characters).
                    </p>
                  </div>
                ) : null}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pm-seed" className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Seed pool (pts)
                  </label>
                  <input
                    id="pm-seed"
                    type="number"
                    min={PRIVATE_MIN_SEED}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm tabular-nums outline-none sm:text-base"
                    style={{
                      borderColor: 'var(--border-g)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-heading)',
                    }}
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="pm-close" className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Stop bets after (hours, optional)
                  </label>
                  <input
                    id="pm-close"
                    type="number"
                    min={1}
                    max={2160}
                    placeholder="No limit"
                    className="w-full rounded-xl border px-3 py-2.5 text-sm tabular-nums outline-none sm:text-base"
                    style={{
                      borderColor: 'var(--border-g)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-heading)',
                    }}
                    value={closesInHours}
                    onChange={(e) => setClosesInHours(e.target.value)}
                  />
                </div>
              </div>
              {/* Same 3D primary CTA as Markets → Place bet */}
              <button
                type="submit"
                disabled={!walletAddress}
                className="group relative mt-1 block h-[48px] w-full cursor-pointer border-none bg-transparent p-0 text-base disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className="absolute left-0 top-0 h-full w-full translate-y-[2px] rounded-xl transition-transform duration-300 group-hover:translate-y-[4px] group-active:translate-y-px group-disabled:translate-y-[2px]"
                  style={{ background: 'var(--btn-depth)' }}
                />
                <span className="absolute left-0 top-0 h-full w-full rounded-xl bg-[#0da91f]" />
                <span className="relative flex h-full -translate-y-[4px] items-center justify-center rounded-xl bg-[#13f227] px-3 font-bold text-[#08240e] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-300 group-hover:-translate-y-[6px] group-active:-translate-y-[2px] group-disabled:-translate-y-[4px]">
                  Create & lock seed
                </span>
              </button>
            </form>
          </section>

          {focused ? (
            <section
              className="rounded-2xl border p-5 sm:p-6"
              style={{
                borderColor: 'var(--border-g2)',
                background: 'linear-gradient(160deg, var(--accent-surface) 0%, var(--bg-glass) 100%)',
                boxShadow: 'var(--nav-elev)',
              }}
              aria-labelledby="room-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 font-mono text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-text)' }}>
                    Code {focused.code}
                  </p>
                  <h2 id="room-heading" className="mt-2 m-0 text-lg font-bold sm:text-xl" style={{ color: 'var(--text-heading)' }}>
                    {focused.title}
                  </h2>
                  {focused.description ? (
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {focused.description}
                    </p>
                  ) : null}
                </div>
                <span
                  className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: focused.status === 'open' ? 'var(--accent-surface-strong)' : 'rgba(113,113,122,0.35)',
                    color: focused.status === 'open' ? 'var(--accent-text)' : 'var(--text-muted)',
                  }}
                >
                  {focused.status === 'open' ? (bettingClosed ? 'Closed for bets' : 'Open') : `Resolved · ${focused.outcome}`}
                </span>
              </div>

              {focused.closesAt ? (
                <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Betting window ends {new Date(focused.closesAt).toLocaleString()}.
                </p>
              ) : null}

              <div className="mt-6 grid grid-cols-3 gap-2 text-center sm:gap-3">
                {[
                  ['Pool', pot],
                  ['YES', yesT],
                  ['NO', noT],
                ].map(([label, v]) => (
                  <div
                    key={label}
                    className="rounded-xl border py-3"
                    style={{ borderColor: 'var(--border-subtle)', background: 'var(--input-bg)' }}
                  >
                    <p className="m-0 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      {label}
                    </p>
                    <p className="mt-1 m-0 font-mono text-lg font-bold tabular-nums" style={{ color: 'var(--text-heading)' }}>
                      {v}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                Balance:{' '}
                <span className="font-semibold tabular-nums" style={{ color: 'var(--accent-text)' }}>
                  {pts.toLocaleString()} pts
                </span>
              </p>

              {focused.status === 'open' && !bettingClosed ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="pm-stake" className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Stake (min {PRIVATE_MIN_STAKE})
                    </label>
                    <input
                      id="pm-stake"
                      type="number"
                      min={PRIVATE_MIN_STAKE}
                      className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm tabular-nums outline-none"
                      style={{
                        borderColor: 'var(--border-g)',
                        background: 'var(--input-bg)',
                        color: 'var(--text-heading)',
                      }}
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStake('YES')}
                      className="group relative h-9 min-w-[56px] flex-1 cursor-pointer border-none bg-transparent p-0 text-[11px] font-black sm:h-10 sm:min-w-[64px] sm:text-xs"
                    >
                      <span className="absolute inset-0 translate-y-[2px] rounded-lg bg-[#0a7a12] transition-transform duration-200 ease-out group-hover:translate-y-[3px] group-active:translate-y-px" />
                      <span className="absolute inset-0 rounded-lg bg-[#0da91f]" />
                      <span
                        className="relative flex h-full -translate-y-[2px] items-center justify-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform duration-200 ease-out group-hover:-translate-y-[3px] group-active:-translate-y-px"
                        style={{ background: '#13f227', color: '#08240e' }}
                      >
                        YES
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStake('NO')}
                      className="group relative h-9 min-w-[56px] flex-1 cursor-pointer border-none bg-transparent p-0 text-[11px] font-black sm:h-10 sm:min-w-[64px] sm:text-xs"
                    >
                      <span className="absolute inset-0 translate-y-[2px] rounded-lg bg-[#7a0a0a] transition-transform duration-200 ease-out group-hover:translate-y-[3px] group-active:translate-y-px" />
                      <span className="absolute inset-0 rounded-lg bg-[#b91c1c]" />
                      <span className="relative flex h-full -translate-y-[2px] items-center justify-center rounded-lg bg-[#ef4444] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-transform duration-200 ease-out group-hover:-translate-y-[3px] group-active:-translate-y-px">
                        NO
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              {focused.status === 'open' && bettingClosed ? (
                <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Betting has ended. Host: resolve the market when you’re ready.
                </p>
              ) : null}

              {isCreator && focused.status === 'open' ? (
                <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <p className="m-0 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Host — final outcome
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolve('YES')}
                      className="group relative h-10 min-w-[8.5rem] cursor-pointer border-none bg-transparent p-0 text-xs font-bold sm:text-sm"
                    >
                      <span
                        className="absolute inset-0 translate-y-[2px] rounded-xl transition-transform duration-200 group-hover:translate-y-[3px] group-active:translate-y-px"
                        style={{ background: 'var(--btn-depth)' }}
                      />
                      <span className="absolute inset-0 rounded-xl bg-[#0da91f]" />
                      <span className="relative flex h-full -translate-y-[2px] items-center justify-center rounded-xl bg-[#13f227] px-4 text-[#08240e] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform duration-200 group-hover:-translate-y-[3px] group-active:-translate-y-px">
                        Resolve YES
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolve('NO')}
                      className="group relative h-10 min-w-[8.5rem] cursor-pointer border-none bg-transparent p-0 text-xs font-bold sm:text-sm"
                    >
                      <span className="absolute inset-0 translate-y-[2px] rounded-xl bg-[#7a0a0a] transition-transform duration-200 group-hover:translate-y-[3px] group-active:translate-y-px" />
                      <span className="absolute inset-0 rounded-xl bg-[#b91c1c]" />
                      <span className="relative flex h-full -translate-y-[2px] items-center justify-center rounded-xl bg-[#ef4444] px-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-transform duration-200 group-hover:-translate-y-[3px] group-active:-translate-y-px">
                        Resolve NO
                      </span>
                    </button>
                  </div>
                  <div className="mt-5 rounded-xl border px-4 py-3" style={{ borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.06)' }}>
                    <p className="m-0 text-xs font-bold uppercase tracking-wider" style={{ color: '#fca5a5' }}>
                      Host — delete room
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      Cancels the competition and refunds all points (your seed + stakes). Only works while the room is still open.
                    </p>
                    <button
                      type="button"
                      onClick={() => openDeleteConfirm(focused.id)}
                      className="mt-3 rounded-lg border px-3 py-2 text-xs font-bold"
                      style={{
                        borderColor: 'rgba(248,113,113,0.5)',
                        background: 'rgba(248,113,113,0.12)',
                        color: '#fecaca',
                      }}
                    >
                      Delete room
                    </button>
                  </div>
                </div>
              ) : null}

              {shareUrl ? (
                <div className="mt-5">
                  <p className="m-0 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Invite link
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code
                      className="block min-w-0 flex-1 truncate rounded-lg border px-2 py-1.5 text-[11px] sm:text-xs"
                      style={{ borderColor: 'var(--border-g)', background: 'var(--input-bg)', color: 'var(--text-secondary)' }}
                    >
                      {shareUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl).then(
                          () => showMessage('Link copied.', true),
                          () => showMessage('Could not copy — select the link manually.', false),
                        )
                      }}
                      className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      style={{ borderColor: 'var(--border-g)', color: 'var(--text-heading)' }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section aria-labelledby="mine-heading">
            <h2 id="mine-heading" className="m-0 text-lg font-bold sm:text-xl" style={{ color: 'var(--text-heading)' }}>
              Your rooms
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Markets you host or have staked on (stored on this device).
            </p>
            <ul className="mt-4 list-none space-y-3 p-0">
              {mine.length === 0 ? (
                <li className="rounded-xl border px-4 py-6 text-center text-sm" style={{ borderColor: 'var(--border-g)', color: 'var(--text-muted)' }}>
                  No private rooms yet — create one or join with a code.
                </li>
              ) : (
                mine.map((m) => {
                  const iAmHost =
                    walletAddress &&
                    String(m.creator || '').toLowerCase() === String(walletAddress).toLowerCase()
                  const canDeleteHost = iAmHost && m.status === 'open'
                  return (
                    <li key={m.id} className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFocused(m)
                          setSearchParams({ c: m.code })
                        }}
                        className="min-w-0 flex-1 rounded-xl border px-4 py-4 text-left transition hover:opacity-95"
                        style={{
                          borderColor: 'var(--border-g)',
                          background: 'var(--bg-glass)',
                          color: 'var(--text-body)',
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium" style={{ color: 'var(--text-heading)' }}>
                            {m.title}
                          </span>
                          <span className="font-mono text-xs font-bold tracking-widest" style={{ color: 'var(--accent-text)' }}>
                            {m.code}
                          </span>
                        </div>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                          {m.status === 'open' ? 'Open' : `Resolved ${m.outcome}`} · pool{' '}
                          {Number(m.seedPoints) + sumSide(m.stakes, 'YES') + sumSide(m.stakes, 'NO')} pts
                        </p>
                      </button>
                      {canDeleteHost ? (
                        <button
                          type="button"
                          aria-label={`Delete room ${m.code}`}
                          onClick={(e) => {
                            e.preventDefault()
                            openDeleteConfirm(m.id)
                          }}
                          className="shrink-0 self-stretch rounded-xl border px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider sm:self-center sm:px-3"
                          style={{
                            borderColor: 'rgba(248,113,113,0.45)',
                            background: 'rgba(248,113,113,0.1)',
                            color: '#fecaca',
                          }}
                        >
                          Del
                        </button>
                      ) : null}
                    </li>
                  )
                })
              )}
            </ul>
          </section>

          <p className="text-center text-xs lg:text-left" style={{ color: 'var(--text-muted)' }}>
            <Link to="/prediction" className="font-semibold underline-offset-2" style={{ color: 'var(--accent-text)' }}>
              Public markets
            </Link>
            {' · '}
            <Link to="/" className="font-semibold underline-offset-2" style={{ color: 'var(--accent-text)' }}>
              Home
            </Link>
          </p>
          </div>

          <aside
            className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start"
            aria-labelledby="join-heading"
          >
            <section
              className="rounded-2xl border p-5 sm:p-6"
              style={{ borderColor: 'var(--border-g)', background: 'var(--panel-bg)' }}
            >
              <h2 id="join-heading" className="m-0 text-lg font-bold sm:text-xl" style={{ color: 'var(--text-heading)' }}>
                Join with a code
              </h2>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Rooms listed in Markets → Private can be found there. For code-only rooms, enter the host&apos;s code or
                open their invite link.
              </p>
              <form
                className="mt-4 flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleOpenCode()
                }}
              >
                <input
                  aria-label="Invite code"
                  className="min-w-0 w-full rounded-xl border px-3 py-2.5 font-mono text-sm uppercase tracking-widest outline-none sm:text-base"
                  style={{
                    borderColor: 'var(--border-g)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-heading)',
                  }}
                  placeholder="e.g. ABC123"
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  maxLength={PRIVATE_ACCESS_CODE_MAX}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="group relative mt-1 block h-[48px] w-full shrink-0 cursor-pointer border-none bg-transparent p-0 text-base"
                >
                  <span
                    className="absolute left-0 top-0 h-full w-full translate-y-[2px] rounded-xl transition-transform duration-300 group-hover:translate-y-[4px] group-active:translate-y-px"
                    style={{ background: 'var(--btn-depth)' }}
                  />
                  <span className="absolute left-0 top-0 h-full w-full rounded-xl bg-[#0da91f]" />
                  <span className="relative flex h-full -translate-y-[4px] items-center justify-center rounded-xl bg-[#13f227] px-3 font-bold text-[#08240e] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-300 group-hover:-translate-y-[6px] group-active:-translate-y-[2px]">
                    Open room
                  </span>
                </button>
              </form>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
