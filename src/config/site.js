/**
 * Canonical public origin of this SPA (no trailing slash).
 *
 * Deploy the trading UI (markets, BTC 5m, profile, leaderboard) at **app.sapience.fun**.
 * Override with `VITE_APP_ORIGIN` if you host elsewhere.
 *
 * GraphQL (Apollo standalone) is intended at **https://api.sapience.fun/** — POST JSON to the
 * origin root (not `/graphql`). Set `VITE_GQL_URL` in production builds, or the client falls back to
 * {@link DEFAULT_GQL_URL_PROD} when `import.meta.env.PROD` is true.
 */
/** Production GraphQL HTTP endpoint (trailing slash). */
export const DEFAULT_GQL_URL_PROD = 'https://api.sapience.fun/'
export function getAppOrigin() {
  const fromEnv = import.meta.env.VITE_APP_ORIGIN
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '')
  }
  if (import.meta.env.PROD) {
    return 'https://app.sapience.fun'
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}
