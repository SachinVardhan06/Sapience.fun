import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TradeNavbar from '../../components/tradeNavbar'
import { useWalletAuth } from '../../context/walletAuth'
import sapienceLogo from '../../assets/sapiencelogo.jpeg'
import { fetchWallet } from '../../utils/graphqlClient'
import {
  BONUS_POINTS,
  POINTS_CHANGED_EVENT,
  PREDICTIONS_KEY,
  applyPredictionBatch,
  ensureWalletBonus,
  getWalletAccount,
  mergeWalletRecords,
  recordPrediction,
} from '../../utils/pointsLedger'

// ─── API endpoints ────────────────────────────────────────────────────────────
const KALSHI_PROXY =
  import.meta.env.VITE_KALSHI_PROXY_URL || 'http://localhost:3001/api/kalshi/markets?limit=50&status=open'
const PAGE_SIZE    = 10
const manifoldUrl  = (offset = 0) =>
  `https://api.manifold.markets/v0/search-markets?term=&limit=${PAGE_SIZE}&sort=liquidity&contractType=BINARY&filter=open&offset=${offset}`

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtUSD(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

const CATEGORY_RULES = [
  { re: /trump|biden|election|president|congress|senate|vote|democrat|republican|white house|gop/i, label: 'Politics' },
  { re: /bitcoin|btc|ethereum|eth|crypto|usd|solana|coin|defi|nft|token/i,                         label: 'Crypto' },
  { re: /nba|nfl|soccer|football|basketball|world cup|ufc|mma|tennis|golf|baseball|olympic/i,       label: 'Sports' },
  { re: /gta|rockstar|game|gaming|steam|console|ps5|xbox|pc launch|videogame/i,                     label: 'Gaming' },
  { re: /ai|openai|gpt|claude|gemini|llm|google|apple|microsoft|nvidia|meta|amazon|tech/i,          label: 'Tech' },
  { re: /fed|rate|inflation|gdp|recession|stocks|sp500|nasdaq|economy/i,                            label: 'Finance' },
  { re: /russia|ukraine|war|ceasefire|nato|china|taiwan|military|nuclear/i,                         label: 'Geopolitics' },
  { re: /oscar|grammy|emmy|award|album|film|movie|celebrity/i,                                      label: 'Entertainment' },
]
function detectCategory(q, ev) {
  const t = `${q} ${ev}`
  for (const r of CATEGORY_RULES) if (r.re.test(t)) return r.label
  return 'General'
}

// ─── transforms ───────────────────────────────────────────────────────────────
function transformKalshi(raw) {
  if (!raw?.title && !raw?.ticker) return null
  const yesPrice  = raw.yes_ask ?? raw.last_price ?? 50
  const forecast  = Math.max(1, Math.min(99, Math.round(yesPrice)))
  const endDate   = raw.close_time ? raw.close_time.slice(0, 10) : '—'
  const daysToEnd = endDate !== '—' ? Math.ceil((new Date(endDate) - Date.now()) / 86_400_000) : 999
  return {
    id: raw.ticker || String(raw.id || ''), title: raw.title || raw.ticker || '',
    category: detectCategory(raw.title || '', raw.event_ticker || ''),
    closeDate: endDate, endsSoon: daysToEnd >= 0 && daysToEnd <= 7,
    liquidity: raw.open_interest ? fmtUSD(raw.open_interest / 100) : '—',
    volume24h: raw.volume_24h    ? fmtUSD(raw.volume_24h / 100)    : '—',
    forecast, slug: null, source: 'kalshi',
  }
}
function transformManifold(raw) {
  if (!raw?.question || raw.outcomeType !== 'BINARY' || raw.isResolved) return null
  const forecast  = Math.max(1, Math.min(99, Math.round((raw.probability || 0.5) * 100)))
  const closeDate = raw.closeTime ? new Date(raw.closeTime).toISOString().slice(0, 10) : '—'
  const daysToEnd = closeDate !== '—' ? Math.ceil((new Date(closeDate) - Date.now()) / 86_400_000) : 999
  return {
    id: raw.id, title: raw.question,
    category: detectCategory(raw.question, (raw.groupSlugs || []).join(' ')),
    closeDate, endsSoon: daysToEnd >= 0 && daysToEnd <= 7,
    liquidity: raw.totalLiquidity ? fmtUSD(raw.totalLiquidity) : '—',
    volume24h: raw.volume24Hours  ? fmtUSD(raw.volume24Hours)  : '—',
    forecast, slug: raw.slug || null, source: 'manifold',
  }
}

const FALLBACK = [
  { id:'f1', title:'Will GTA 6 release before Dec 31, 2026?',               category:'Gaming',   closeDate:'2026-12-31', endsSoon:false, liquidity:'$18.4K', volume24h:'—', forecast:62, slug:null, source:'demo' },
  { id:'f2', title:'Will Rockstar release GTA 6 Trailer 2 before Jul 2026?', category:'Gaming',   closeDate:'2026-06-30', endsSoon:true,  liquidity:'$290',   volume24h:'—', forecast:54, slug:null, source:'demo' },
  { id:'f3', title:'Will GTA 6 launch on PC the same day as console?',       category:'Gaming',   closeDate:'2026-12-31', endsSoon:false, liquidity:'$3.1K',  volume24h:'—', forecast:29, slug:null, source:'demo' },
  { id:'f4', title:'Will standard GTA 6 launch price be above $70?',         category:'Gaming',   closeDate:'2026-12-31', endsSoon:false, liquidity:'—',      volume24h:'—', forecast:41, slug:null, source:'demo' },
  { id:'f5', title:'Will GTA Online 2.0 be available on launch day?',        category:'Gaming',   closeDate:'2026-12-31', endsSoon:false, liquidity:'—',      volume24h:'—', forecast:48, slug:null, source:'demo' },
  { id:'f6', title:'Will GTA 6 first-week sales exceed 20 million copies?',  category:'Sales',    closeDate:'2027-01-07', endsSoon:false, liquidity:'$2.9K',  volume24h:'—', forecast:57, slug:null, source:'demo' },
  { id:'f7', title:'Will GTA 6 score above 95 on Metacritic?',               category:'Reviews',  closeDate:'2027-01-31', endsSoon:false, liquidity:'—',      volume24h:'—', forecast:38, slug:null, source:'demo' },
  { id:'f8', title:'Will GTA 6 map be larger than Red Dead Redemption 2?',   category:'Gameplay', closeDate:'2026-12-31', endsSoon:false, liquidity:'$1.5K',  volume24h:'—', forecast:71, slug:null, source:'demo' },
]

function catColor(cat) {
  const map = { Politics:'#ef4444', Crypto:'#f59e0b', Sports:'#3b82f6', Tech:'#8b5cf6', Finance:'#06b6d4', Geopolitics:'#f97316', Entertainment:'#ec4899' }
  return map[cat] || '#6b7280'
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PredictionMarket() {
  const { walletShort, walletAddress } = useWalletAuth()

  const [markets,      setMarkets]      = useState(FALLBACK)
  const [loading,      setLoading]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [apiError,     setApiError]     = useState(null)
  const [isLive,       setIsLive]       = useState(false)
  const [sourceLabel,  setSourceLabel]  = useState('Demo')
  const [lastUpdated,  setLastUpdated]  = useState(null)
  const [offset,       setOffset]       = useState(0)
  const [hasMore,      setHasMore]      = useState(true)
  const sentinelRef = useRef(null)
  const tableScrollRef = useRef(null)

  const [search,       setSearch]       = useState('')
  const [activeTab,    setActiveTab]    = useState('All')
  const [sortBy,       setSortBy]       = useState('open_interest')
  const [statusFilter, setStatusFilter] = useState('Unresolved')
  const [stakeInput,   setStakeInput]   = useState('10')
  const [listening,    setListening]    = useState(false)
  const [done,         setDone]         = useState(false)
  const [notice,       setNotice]       = useState('')
  const [noticeOk,     setNoticeOk]     = useState(true)
  const [walletPts,    setWalletPts]    = useState(BONUS_POINTS)
  const [selections,   setSelections]   = useState({})
  const [basket,       setBasket]       = useState([])
  const [history,      setHistory]      = useState(() => {
    try { const r = localStorage.getItem(PREDICTIONS_KEY); return r ? JSON.parse(r) : [] }
    catch { return [] }
  })

  useEffect(() => {
    if (!walletAddress) {
      setWalletPts(BONUS_POINTS)
      return
    }
    const local = ensureWalletBonus(walletAddress) || getWalletAccount(walletAddress)
    setWalletPts(Number(local?.balance) || BONUS_POINTS)
    let cancelled = false
    fetchWallet(walletAddress)
      .then((w) => {
        if (cancelled || !w) return
        const fresh =
          getWalletAccount(walletAddress) || ensureWalletBonus(walletAddress) || local
        const m = mergeWalletRecords(w, fresh)
        if (m) setWalletPts(Number(m.balance) || BONUS_POINTS)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [walletAddress])

  useEffect(() => {
    const bump = () => {
      if (!walletAddress) return
      const acc = getWalletAccount(walletAddress) || ensureWalletBonus(walletAddress)
      if (acc) setWalletPts(Number(acc.balance) || BONUS_POINTS)
    }
    window.addEventListener(POINTS_CHANGED_EVENT, bump)
    return () => window.removeEventListener(POINTS_CHANGED_EVENT, bump)
  }, [walletAddress])

  const fetchMarkets = useCallback(async () => {
    setLoading(true); setApiError(null); setOffset(0); setHasMore(true)
    try {
      const r = await fetch(KALSHI_PROXY)
      if (r.ok) {
        const json = await r.json()
        const rows = (Array.isArray(json) ? json : (json.markets || [])).map(transformKalshi).filter(Boolean)
        if (rows.length) {
          setMarkets(rows); setIsLive(true); setSourceLabel('Kalshi')
          setLastUpdated(new Date()); setHasMore(false); setLoading(false); return
        }
      }
    } catch { /* fall through */ }
    try {
      const r = await fetch(manifoldUrl(0))
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const rows = (Array.isArray(data) ? data : []).map(transformManifold).filter(Boolean)
      if (rows.length) {
        setMarkets(rows); setIsLive(true); setSourceLabel('Manifold')
        setLastUpdated(new Date()); setOffset(PAGE_SIZE)
        setHasMore(rows.length === PAGE_SIZE)
      } else {
        setApiError('No markets returned — showing demo data.')
        setHasMore(false)
      }
    } catch {
      setApiError('Live data unavailable — showing demo markets.')
      setIsLive(false); setSourceLabel('Demo'); setHasMore(false)
    }
    setLoading(false)
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || sourceLabel !== 'Manifold') return
    setLoadingMore(true)
    try {
      const r = await fetch(manifoldUrl(offset))
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const rows = (Array.isArray(data) ? data : []).map(transformManifold).filter(Boolean)
      if (rows.length) {
        setMarkets(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          return [...prev, ...rows.filter(m => !existingIds.has(m.id))]
        })
        setOffset(o => o + PAGE_SIZE)
        setHasMore(rows.length === PAGE_SIZE)
      } else {
        setHasMore(false)
      }
    } catch { setHasMore(false) }
    setLoadingMore(false)
  }, [loadingMore, hasMore, sourceLabel, offset])

  useEffect(() => { fetchMarkets() }, [fetchMarkets])

  const tabs = useMemo(() => ['All', ...new Set(markets.map(m => m.category))], [markets])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pool = markets.filter(m =>
      (activeTab === 'All' || m.category === activeTab) &&
      (!q || m.title.toLowerCase().includes(q))
    )
    if (sortBy === 'open_interest') return [...pool].sort((a, b) => (b.liquidity || '').localeCompare(a.liquidity || ''))
    if (sortBy === 'forecast')      return [...pool].sort((a, b) => b.forecast - a.forecast)
    if (sortBy === 'resolution')    return [...pool].sort((a, b) => a.closeDate.localeCompare(b.closeDate))
    return pool
  }, [search, activeTab, sortBy, markets])

  // Infinite scroll: observe sentinel inside the table scroll container (not viewport)
  useEffect(() => {
    const root = tableScrollRef.current
    const el = sentinelRef.current
    if (!el || !root) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { root, rootMargin: '120px 0px 0px 0px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, loading, hasMore, filteredRows.length])

  const pick = (marketId, side, title) => {
    setSelections(prev => {
      const same = prev[marketId] === side
      const next = { ...prev }
      if (same) {
        delete next[marketId]
        setBasket(b => b.filter(r => r.id !== marketId))
      } else {
        next[marketId] = side
        setBasket(b => {
          const ex = b.find(r => r.id === marketId)
          if (ex) return b.map(r => r.id === marketId ? { ...r, side } : r)
          return [...b, { id: marketId, title, side }]
        })
      }
      return next
    })
    setDone(false); setListening(false)
  }

  const removePick = id => {
    setSelections(p => { const n = { ...p }; delete n[id]; return n })
    setBasket(b => b.filter(r => r.id !== id))
    setDone(false)
  }

  const submit = () => {
    if (!basket.length || !walletAddress) return
    setListening(true); setDone(false); setNotice('')
    setTimeout(() => {
      const pts   = Math.max(1, Number(stakeInput) || 1)
      const batch = applyPredictionBatch(walletAddress, pts, basket.length)
      if (!batch.ok) { setListening(false); setNotice(batch.reason); setNoticeOk(false); return }
      setListening(false); setDone(true)
      const base = Date.now()
      const entries = basket.map((row, i) => ({
        id: `${base}-${i}-${Math.random().toString(16).slice(2, 10)}`,
        wallet: walletAddress,
        marketId: row.id,
        marketTitle: row.title,
        side: row.side,
        points: pts,
        createdAt: new Date().toISOString(),
      }))
      const next = [...entries, ...history]
      localStorage.setItem(PREDICTIONS_KEY, JSON.stringify(next))
      setHistory(next)
      setWalletPts(batch.account.balance)
      for (const e of entries) {
        recordPrediction({
          id: e.id,
          wallet: e.wallet,
          marketId: e.marketId,
          marketTitle: e.marketTitle,
          side: e.side,
          points: e.points,
        })
      }
      setNotice(
        `${basket.length} prediction${basket.length > 1 ? 's' : ''} placed · −${batch.totalStake} pts staked`,
      )
      setNoticeOk(true)
    }, 1800)
  }

  const implied = basket.length
    ? basket.reduce((acc, row) => {
        const m = markets.find(x => x.id === row.id); if (!m) return acc
        return acc * (row.side === 'YES' ? m.forecast / 100 : (100 - m.forecast) / 100)
      }, 1) * 100
    : null
  const payout = implied ? Number(stakeInput || 0) / (implied / 100) : 0

  return (
    <main
      className="relative overflow-hidden antialiased"
      style={{
        boxSizing: 'border-box',
        background: 'var(--bg-page)',
        color: 'var(--text-body)',
        height: '100dvh',
        paddingTop: 'var(--beta-banner-height, 0px)',
      }}
    >

      {/* ── Background ────────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0" style={{ background: 'var(--bg-page)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -5%, var(--glow-radial), transparent)' }} />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom,var(--scanline) 0,var(--scanline) 1px,transparent 1px,transparent 3px)',
          }}
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 45%, var(--vignette) 100%)' }} />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-16"
          style={{ background: 'linear-gradient(to bottom, var(--fade-top), transparent)' }}
        />
      </div>

      {/* ── Content — navbar full width; body capped at 1440px ───────── */}
      <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
        <TradeNavbar />

        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-1 flex-col overflow-hidden">
        {/* ── Main + side panel (stacked on small screens) ───────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">

          {/* ══ LEFT ══════════════════════════════════════════════════════ */}
          <div
            className="flex min-h-[200px] flex-1 flex-col overflow-hidden border-b lg:min-h-0 lg:border-b-0 lg:border-r"
            style={{ borderColor: 'var(--border-g)' }}
          >

            {/* ── Filter bar ────────────────────────────────────────────── */}
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-2.5"
              style={{ background: 'var(--bg-glass)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2"
                  width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="var(--icon-stroke)" strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search questions"
                  className="h-7 w-36 min-w-0 max-w-[min(100%,11rem)] rounded-lg pl-7 pr-3 text-[12px] outline-none sm:w-40"
                  style={{ background:'var(--input-bg)', border:'1px solid var(--border-g)', color:'var(--text-body)' }}
                />
              </div>

              <select
                defaultValue="manifold"
                className="h-7 appearance-none rounded-lg px-2 pr-5 text-[12px] outline-none"
                style={{ background:'var(--input-bg)', border:'1px solid var(--border-g)', color:'var(--text-body)' }}
              >
                <option value="manifold">Manifold</option>
                <option value="kalshi">Kalshi</option>
              </select>

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="h-7 appearance-none rounded-lg px-2 pr-5 text-[12px] outline-none"
                style={{ background:'var(--input-bg)', border:'1px solid var(--border-g)', color:'var(--text-body)' }}
              >
                <option value="open_interest">Any open interest</option>
                <option value="forecast">By forecast</option>
                <option value="resolution">Time to resolution</option>
              </select>

              <select
                value={activeTab}
                onChange={e => setActiveTab(e.target.value)}
                className="h-7 appearance-none rounded-lg px-2 pr-5 text-[12px] outline-none"
                style={{ background:'var(--input-bg)', border:'1px solid var(--border-g)', color:'var(--text-body)' }}
              >
                {tabs.map(t => <option key={t} value={t}>{t === 'All' ? 'All categories' : t}</option>)}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-7 appearance-none rounded-lg px-2 pr-5 text-[12px] outline-none"
                style={{ background:'var(--input-bg)', border:'1px solid var(--border-g)', color:'var(--text-body)' }}
              >
                <option>Unresolved</option>
                <option>All</option>
              </select>

              <div className="ml-auto flex items-center gap-2">
                {isLive ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--accent-text)' }}>
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full"
                      style={{ background: 'var(--accent)', boxShadow: '0 0 6px color-mix(in srgb, var(--accent) 55%, transparent)' }}
                    />
                    Live · {sourceLabel}
                  </span>
                ) : apiError ? (
                  <span className="text-[11px] text-rose-300">{apiError}</span>
                ) : null}
                {lastUpdated && (
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            {/* ── Table (wide grid — scroll X+Y together on narrow screens) ─ */}
            <div
              ref={tableScrollRef}
              className="market-scroll min-h-0 min-w-0 flex-1 overflow-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-g) transparent' }}
            >
              <div className="min-w-[640px]">
            <div
              className="grid shrink-0 border-b px-5 py-2 text-[10px] font-black uppercase tracking-[0.15em]"
              style={{
                background: 'var(--panel-bg)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
                gridTemplateColumns: '1fr 100px 110px 168px',
              }}
            >
              <span>Question</span>
              <span>Forecast</span>
              <span>Ends <span className="opacity-50">↑</span></span>
              <span>Select Predictions</span>
            </div>

            {/* ── Rows ──────────────────────────────────────────────────── */}
            <div>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="grid items-center border-b px-5 py-3"
                      style={{ borderColor:'var(--border-row)', gridTemplateColumns:'1fr 100px 110px 168px' }}
                    >
                      <div className="flex items-center gap-3 pr-4">
                        <div
                          className="market-skeleton-pulse h-5 w-5 shrink-0 rounded"
                          style={{ background:'var(--accent-surface)', animationDelay: `${i * 45}ms` }}
                        />
                        <div
                          className="market-skeleton-pulse h-2.5 w-3/4 rounded-full"
                          style={{ background:'var(--progress-bg)', animationDelay: `${i * 55}ms` }}
                        />
                      </div>
                      {[0,1,2].map(j => (
                        <div
                          key={j}
                          className="market-skeleton-pulse h-2.5 w-14 rounded-full"
                          style={{ background:'var(--progress-bg)', animationDelay: `${(i * 3 + j) * 40}ms` }}
                        />
                      ))}
                    </div>
                  ))
                : filteredRows.length === 0
                  ? <p className="px-5 py-10 text-sm" style={{ color:'var(--text-muted)' }}>No markets match your filters.</p>
                  : filteredRows.map(m => {
                      const sel = selections[m.id]
                      return (
                        <div
                          key={m.id}
                          className={`grid items-center border-b px-5 py-2.5 transition-[background-color,box-shadow] duration-200 ease-out ${
                            sel
                              ? 'shadow-[inset_3px_0_0_0_var(--accent)]'
                              : 'hover:bg-(--row-hover)'
                          }`}
                          style={{
                            borderColor: 'var(--border-row)',
                            gridTemplateColumns: '1fr 100px 110px 168px',
                            ...(sel ? { background: 'var(--accent-surface)' } : {}),
                          }}
                        >
                          {/* Question */}
                          <div className="flex min-w-0 items-center gap-2.5 pr-4">
                            <div
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-black"
                              style={{
                                background: catColor(m.category) + '20',
                                border: `1px solid ${catColor(m.category)}40`,
                                color: catColor(m.category),
                              }}
                            >
                              {m.category[0]}
                            </div>
                            <p
                              className="min-w-0 flex-1 cursor-default truncate text-[13px] leading-snug underline decoration-[0.5px] underline-offset-2 sm:text-[14px]"
                              style={{ color: 'var(--text-body)', textDecorationColor: 'var(--text-faint)' }}
                            >
                              {m.title}
                            </p>
                          </div>

                          {/* Forecast */}
                          <span
                            className="text-[12px] font-bold tabular-nums"
                            style={{
                              color: m.forecast >= 60 ? 'var(--accent-text)' : m.forecast >= 40 ? '#f59e0b' : '#f87171',
                              textShadow: m.forecast >= 60 ? 'var(--glow-forecast)' : 'none',
                            }}
                          >
                            {m.forecast}%
                          </span>

                          {/* Ends */}
                          {m.endsSoon
                            ? <span
                                className="netlifypixel text-[10px] font-black uppercase tracking-wide"
                                style={{ color:'var(--accent-text)', textShadow:'var(--glow-forecast)' }}
                              >
                                ENDS SOON
                              </span>
                            : <span className="text-[12px] tabular-nums" style={{ color:'var(--text-muted)' }}>
                                {m.closeDate.slice(5)}
                              </span>
                          }

                          {/* YES / NO — same 3-layer 3D button as commingsoon */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => pick(m.id, 'YES', m.title)}
                              className="group relative h-7 w-[52px] shrink-0 cursor-pointer border-none bg-transparent p-0 text-[10px] font-black"
                            >
                              <span className="absolute inset-0 translate-y-[2px] rounded bg-[#0a7a12] transition-transform duration-200 ease-out group-hover:translate-y-[3px] group-active:translate-y-px" />
                              <span className="absolute inset-0 rounded bg-[#0da91f]" />
                              <span
                                className="relative flex h-full -translate-y-[2px] items-center justify-center rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform duration-200 ease-out group-hover:-translate-y-[3px] group-active:-translate-y-px"
                                style={{ background: sel === 'YES' ? '#13f227' : 'var(--yes-inactive)', color: '#08240e' }}
                              >
                                YES
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => pick(m.id, 'NO', m.title)}
                              className="group relative h-7 w-[52px] shrink-0 cursor-pointer border-none bg-transparent p-0 text-[10px] font-black"
                            >
                              <span className="absolute inset-0 translate-y-[2px] rounded bg-[#7a0a0a] transition-transform duration-200 ease-out group-hover:translate-y-[3px] group-active:translate-y-px" />
                              <span className="absolute inset-0 rounded bg-[#b91c1c]" />
                              <span
                                className="relative flex h-full -translate-y-[2px] items-center justify-center rounded text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-transform duration-200 ease-out group-hover:-translate-y-[3px] group-active:-translate-y-px"
                                style={{ background: sel === 'NO' ? '#ef4444' : 'rgba(239,68,68,0.5)' }}
                              >
                                NO
                              </span>
                            </button>

                            {m.source === 'manifold' && m.slug && (
                              <a
                                href={`https://manifold.markets/${m.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-0.5 text-[10px] transition hover:opacity-80"
                                style={{ color: 'var(--accent-faint)' }}
                              >
                                ↗
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })
              }

              {/* Sentinel — triggers loadMore when scrolled into view */}
              {!loading && (
                <div ref={sentinelRef} className="flex items-center justify-center py-4">
                  {loadingMore ? (
                    <span className="flex items-center gap-2 text-[11px] font-medium" style={{ color: 'var(--accent-muted)' }}>
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full"
                        style={{ background: 'var(--accent)', boxShadow: '0 0 6px color-mix(in srgb, var(--accent) 50%, transparent)' }}
                      />
                      Loading more…
                    </span>
                  ) : !hasMore && markets.length > PAGE_SIZE ? (
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      — all {markets.length} markets loaded —
                    </span>
                  ) : null}
                </div>
              )}
            </div>
              </div>
            </div>
          </div>

          {/* ══ RIGHT — YOUR POSITION ════════════════════════════════════ */}
          <div
            className="relative flex max-h-[min(42dvh,340px)] w-full shrink-0 flex-col border-t lg:max-h-none lg:w-72 lg:border-l lg:border-t-0"
            style={{
              background: 'var(--panel-bg)',
              borderColor: 'var(--border-g)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {/* Same scanlines as commingsoon */}
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to bottom,var(--scanline) 0,var(--scanline) 1px,transparent 1px,transparent 3px)',
              }}
              aria-hidden="true"
            />

            {/* Header */}
            <div
              className="relative flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: 'var(--border-g)' }}
            >
              <span
                className="netlifypixel text-[13px] font-black uppercase tracking-[0.2em]"
                style={{ color: 'var(--accent-text)', textShadow: 'var(--glow-title)' }}
              >
                Your Position
              </span>
              {basket.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setSelections({}); setBasket([]); setDone(false) }}
                      className="text-[11px] transition"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                  clear all
                </button>
              )}
            </div>

            {/* Empty state — mirrors commingsoon "Coming Soon" centered layout */}
            {basket.length === 0 ? (
              <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-6">
                {/* Mini logo box */}
                <div
                  className="relative grid h-12 w-12 place-items-center rounded-[12px] border shadow-[0_0_20px_rgba(19,242,39,0.12)]"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
                    background: `linear-gradient(to bottom, var(--chip-bg-top), var(--chip-bg-bottom))`,
                    boxShadow: '0 0 20px rgba(19,242,39,0.08), inset 0 0 12px var(--chip-inset)',
                  }}
                  aria-hidden="true"
                >
                  <img src={sapienceLogo} alt="" className="absolute inset-0 h-full w-full rounded-[12px] object-cover opacity-80" />
                </div>
                <p
                  className="netlifypixel text-center text-[10px] font-bold uppercase leading-relaxed tracking-[0.18em]"
                  style={{ color: 'var(--accent-empty)' }}
                >
                  Add predictions<br />to see your<br />potential payout
                </p>
              </div>
            ) : (
              <div
                className="market-scroll relative max-h-52 overflow-y-auto border-b"
                style={{ borderColor:'var(--border-subtle)', scrollbarWidth:'thin', scrollbarColor:'var(--border-g) transparent' }}
              >
                {basket.map(row => (
                  <div
                    key={row.id}
                    className="flex items-start gap-2 border-b px-5 py-2.5"
                    style={{ borderColor: 'var(--border-row)' }}
                  >
                    <span
                      className="mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-black"
                      style={row.side === 'YES'
                        ? { background:'var(--accent-surface-strong)', color:'var(--accent-text)' }
                        : { background:'rgba(239,68,68,0.15)', color:'#f87171' }}
                    >
                      {row.side}
                    </span>
                    <p className="min-w-0 flex-1 text-[12px] leading-snug sm:text-[13px]" style={{ color: 'var(--text-secondary)' }}>{row.title}</p>
                    <button
                      type="button"
                      onClick={() => removePick(row.id)}
                      className="shrink-0 text-[15px] leading-none transition"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Stake + payout + submit */}
            {basket.length > 0 && (
              <div className="relative space-y-3 border-t p-5" style={{ borderColor: 'var(--border-g)' }}>
                <div>
                  <p
                    className="netlifypixel mb-1.5 text-[9px] font-black uppercase tracking-[0.2em]"
                    style={{ color: 'var(--accent-label)' }}
                  >
                    Stake
                  </p>
                  <div
                    className="flex overflow-hidden rounded-xl"
                    style={{ background:'var(--input-bg)', border:'1px solid var(--border-g2)' }}
                  >
                    <input
                      type="number"
                      min="1"
                      value={stakeInput}
                      onChange={e => setStakeInput(e.target.value)}
                      className="h-10 flex-1 bg-transparent px-3 text-[14px] font-semibold tabular-nums outline-none" style={{ color: 'var(--text-body)' }}
                    />
                    <span
                      className="netlifypixel self-center pr-3 text-[9px] font-black"
                      style={{ color: 'var(--accent-label)' }}
                    >
                      PTS
                    </span>
                  </div>
                </div>

                {implied !== null && (
                  <div
                    className="rounded-xl p-3.5"
                    style={{ background:'var(--accent-panel)', border:'1px solid var(--accent-panel-border)' }}
                  >
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: 'var(--text-secondary)' }}>Implied chance</span>
                      <span style={{ color: 'var(--text-body)' }}>{implied.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[12px]">
                      <span style={{ color: 'var(--text-secondary)' }}>Potential payout</span>
                      <span
                        className="font-bold tabular-nums"
                        style={{ color:'var(--accent-text)', textShadow:'var(--glow-balance)' }}
                      >
                        {payout.toFixed(0)} pts
                      </span>
                    </div>
                    <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full" style={{ background:'var(--progress-bg)' }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{ width:`${Math.min(implied,100)}%`, background:'var(--accent)', boxShadow:'0 0 6px color-mix(in srgb, var(--accent) 45%, transparent)' }}
                      />
                    </div>
                  </div>
                )}

                {/* 3D press button — exact copy from commingsoon */}
                <button
                  type="button"
                  disabled={listening}
                  onClick={done ? () => setDone(false) : submit}
                  className="group relative block h-[48px] w-full cursor-pointer border-none bg-transparent p-0 text-base disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="absolute left-0 top-0 h-full w-full translate-y-[2px] rounded-xl transition-transform duration-300 group-hover:translate-y-[4px] group-active:translate-y-px" style={{ background: 'var(--btn-depth)' }} />
                  <span className="absolute left-0 top-0 h-full w-full rounded-xl bg-[#0da91f]" />
                  <span className="relative flex h-full -translate-y-[4px] items-center justify-center rounded-xl bg-[#13f227] px-3 font-bold text-[#08240e] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-300 group-hover:-translate-y-[6px] group-active:-translate-y-[2px]">
                    {listening ? 'Placing…' : done ? 'Confirmed ✓' : 'Place bet'}
                  </span>
                </button>

                {notice && (
                  <p className="text-[11px] font-medium" style={{ color: noticeOk ? 'var(--accent-text)' : '#f87171' }}>{notice}</p>
                )}
              </div>
            )}

            {/* Recent bids */}
            {history.length > 0 && (
              <div className="relative border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <p
                  className="netlifypixel px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.2em]"
                  style={{ color: 'var(--accent-faint)' }}
                >
                  Recent bids
                </p>
                {history.slice(0, 4).map(e => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 border-t px-5 py-2"
                    style={{ borderColor: 'var(--border-row)' }}
                  >
                    <span
                      className="shrink-0 rounded px-1 py-0.5 text-[9px] font-black"
                      style={e.side === 'YES'
                        ? { background:'var(--accent-surface)', color:'var(--accent-text)' }
                        : { background:'rgba(239,68,68,0.12)', color:'#f87171' }}
                    >
                      {e.side}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[12px] sm:text-[13px]" style={{ color:'var(--text-secondary)' }}>{e.marketTitle}</p>
                    <span className="shrink-0 tabular-nums text-[11px]" style={{ color:'var(--text-muted)' }}>{e.points} pts</span>
                  </div>
                ))}
              </div>
            )}

            {/* Wallet strip */}
            <div
              className="relative mt-auto border-t px-5 py-3"
              style={{ borderColor: 'var(--border-g)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color:'var(--text-muted)' }}>
                  {walletShort || 'Not connected'}
                </span>
                <span
                  className="netlifypixel text-[11px] font-black tabular-nums"
                  style={{ color:'var(--accent-text)', textShadow:'var(--glow-balance)' }}
                >
                  {walletPts.toLocaleString()} pts
                </span>
              </div>
            </div>
          </div>

        </div>
        </div>
      </div>
    </main>
  )
}
