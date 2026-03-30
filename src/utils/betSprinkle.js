/** Dispatched after any successful stake / bet so the global sprinkle layer can celebrate. */
export const BET_PLACED_EVENT = 'sapience-bet-placed'

export function triggerBetSprinkle() {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  window.dispatchEvent(new CustomEvent(BET_PLACED_EVENT))
}
