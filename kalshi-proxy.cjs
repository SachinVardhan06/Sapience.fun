/**
 * Kalshi API proxy server
 *
 * Runs on port 3001 alongside the Vite dev server.
 * Holds the RSA private key, signs every request, and forwards it to Kalshi.
 *
 * Environment variables (in .env.local):
 *   KALSHI_KEY_ID       – your API key UUID
 *   KALSHI_PRIVATE_KEY  – full PEM content, newlines replaced with \n
 */

const express  = require('express')
const cors     = require('cors')
const crypto   = require('crypto')
const https    = require('https')
const fs       = require('fs')
const path     = require('path')

// ─── load env ──────────────────────────────────────────────────────────────────
// Support .env.local without adding dotenv as a dependency
function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvLocal()

const KALSHI_BASE   = 'https://api.kalshi.co'
const KALSHI_KEY_ID = process.env.KALSHI_KEY_ID || ''
// Support \n escapes in env values
const RAW_PEM       = (process.env.KALSHI_PRIVATE_KEY || '').replace(/\\n/g, '\n')

/** False when PEM is missing, placeholder, or OpenSSL cannot decode it (stops log spam). */
function canSignKalshiRequests() {
  if (!KALSHI_KEY_ID || !RAW_PEM) return false
  try {
    const sign = crypto.createSign('RSA-SHA256')
    sign.update('kalshi-pem-check')
    sign.end()
    sign.sign({
      key        : RAW_PEM,
      padding    : crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength : crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    return true
  } catch {
    return false
  }
}
const KALSHI_SIGNING_OK = canSignKalshiRequests()

// ─── signing ───────────────────────────────────────────────────────────────────
/**
 * Signs the canonical string (timestamp + METHOD + path-without-query)
 * using RSA-PSS with SHA-256.
 */
function signRequest(timestampMs, method, fullPath) {
  if (!RAW_PEM) throw new Error('KALSHI_PRIVATE_KEY is not set in .env.local')
  const pathWithoutQuery = fullPath.split('?')[0]
  const message         = `${timestampMs}${method.toUpperCase()}${pathWithoutQuery}`
  const sign            = crypto.createSign('RSA-SHA256')
  sign.update(message)
  sign.end()
  const signature = sign.sign({
    key        : RAW_PEM,
    padding    : crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength : crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  })
  return signature.toString('base64')
}

function buildHeaders(method, apiPath) {
  const ts  = Date.now().toString()
  const sig = signRequest(ts, method, apiPath)
  return {
    'Content-Type'           : 'application/json',
    'KALSHI-ACCESS-KEY'      : KALSHI_KEY_ID,
    'KALSHI-ACCESS-TIMESTAMP': ts,
    'KALSHI-ACCESS-SIGNATURE': sig,
  }
}

// ─── proxy helper ──────────────────────────────────────────────────────────────
function kalshiGet(apiPath) {
  return new Promise((resolve, reject) => {
    const headers = buildHeaders('GET', apiPath)
    const url     = `${KALSHI_BASE}${apiPath}`
    const req     = https.get(url, { headers }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) })
        } catch {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })
    req.on('error', reject)
  })
}

// ─── server ────────────────────────────────────────────────────────────────────
const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())

/**
 * GET /api/kalshi/markets
 * Query params forwarded to Kalshi: limit, cursor, status, series_ticker
 */
app.get('/api/kalshi/markets', async (req, res) => {
  if (!KALSHI_SIGNING_OK) {
    return res.status(503).json({
      error: !KALSHI_KEY_ID || !RAW_PEM
        ? 'Kalshi credentials not configured. Add KALSHI_KEY_ID and KALSHI_PRIVATE_KEY to .env.local'
        : 'Kalshi private key cannot be loaded (check PEM format / line breaks in .env.local).',
    })
  }
  try {
    const params = new URLSearchParams()
    if (req.query.limit)         params.set('limit',         req.query.limit)
    if (req.query.cursor)        params.set('cursor',        req.query.cursor)
    if (req.query.status)        params.set('status',        req.query.status)
    if (req.query.series_ticker) params.set('series_ticker', req.query.series_ticker)
    if (!params.has('limit'))    params.set('limit', '50')
    if (!params.has('status'))   params.set('status', 'open')

    const apiPath  = `/trade-api/v2/markets?${params.toString()}`
    const { status, data } = await kalshiGet(apiPath)
    res.status(status).json(data)
  } catch (err) {
    console.error('[kalshi-proxy] error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

/**
 * GET /api/kalshi/events
 * Returns Kalshi events (each contains associated markets).
 */
app.get('/api/kalshi/events', async (req, res) => {
  if (!KALSHI_SIGNING_OK) {
    return res.status(503).json({ error: 'Kalshi signing not available (missing or invalid private key).' })
  }
  try {
    const params = new URLSearchParams()
    if (req.query.limit)  params.set('limit',  req.query.limit)
    if (req.query.cursor) params.set('cursor', req.query.cursor)
    if (req.query.status) params.set('status', req.query.status)
    if (!params.has('limit'))  params.set('limit',  '50')
    if (!params.has('status')) params.set('status', 'open')

    const apiPath = `/trade-api/v2/events?${params.toString()}`
    const { status, data } = await kalshiGet(apiPath)
    res.status(status).json(data)
  } catch (err) {
    console.error('[kalshi-proxy] error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

/**
 * GET /api/manifold/markets
 * Proxies Manifold Markets public API (no auth needed, globally accessible).
 */
app.get('/api/manifold/markets', async (req, res) => {
  try {
    const limit = req.query.limit || '50'
    // search-markets supports sort=liquidity and filter=open (plain /markets does not)
    const url   = `https://api.manifold.markets/v0/search-markets?term=&limit=${limit}&sort=liquidity&contractType=BINARY&filter=open`
    const response = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'sapience-proxy/1.0' } }, (r) => {
        let body = ''
        r.on('data', (c) => { body += c })
        r.on('end', () => {
          try { resolve({ status: r.statusCode, data: JSON.parse(body) }) }
          catch { resolve({ status: r.statusCode, data: body }) }
        })
      }).on('error', reject)
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    console.error('[manifold-proxy] error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

/** Health check */
app.get('/api/health', (_req, res) => {
  res.json({
    ok       : true,
    keyId    : KALSHI_KEY_ID ? `${KALSHI_KEY_ID.slice(0, 8)}…` : 'NOT SET',
    keyReady   : Boolean(RAW_PEM),
    signingOk  : KALSHI_SIGNING_OK,
  })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`[kalshi-proxy] listening on http://localhost:${PORT}`)
  if (!KALSHI_KEY_ID) console.warn('[kalshi-proxy] ⚠  KALSHI_KEY_ID not set')
  if (!RAW_PEM)       console.warn('[kalshi-proxy] ⚠  KALSHI_PRIVATE_KEY not set')
  else if (!KALSHI_SIGNING_OK) {
    console.warn('[kalshi-proxy] ⚠  KALSHI_PRIVATE_KEY is set but OpenSSL cannot use it — fix PEM (PKCS#1 RSA, proper \\n). Kalshi routes return 503.')
  }
})
