/**
 * Canonical public origin of this SPA (no trailing slash).
 *
 * Deploy the trading UI (markets, BTC 5m, profile, leaderboard) at **app.sapience.fun**.
 * Override with `VITE_APP_ORIGIN` if you host elsewhere.
 *
 * GraphQL is at **https://api.sapience.fun/graphql** — POST JSON to that path.
 * Production SPA builds always use {@link DEFAULT_GQL_URL_PROD}; use `VITE_GQL_URL` only for local dev
 * (see `graphqlClient.js`).
 */
/** Production GraphQL HTTP endpoint (no trailing slash after `/graphql`). */
export const DEFAULT_GQL_URL_PROD = 'https://api.sapience.fun/graphql'
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
