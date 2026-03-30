import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BET_PLACED_EVENT } from '../utils/betSprinkle.js'

const COLORS = ['#4ade80', '#86efac', '#22c55e', '#bbf7d0', '#fbbf24', '#fde68a', '#fafafa', '#34d399']

function makeBurst() {
  const id = Date.now()
  return Array.from({ length: 72 }, (_, i) => ({
    id: `${id}-${i}`,
    leftPct: Math.random() * 100,
    delay: Math.random() * 0.35,
    dur: 1.15 + Math.random() * 1.05,
    driftPx: (Math.random() - 0.5) * 80,
    size: 6 + Math.random() * 8,
    wide: Math.random() > 0.5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }))
}

export default function BetSprinkleLayer() {
  const [particles, setParticles] = useState(null)
  const clearRef = useRef(null)

  useEffect(() => {
    const onBet = () => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      setParticles(makeBurst())
      if (clearRef.current) window.clearTimeout(clearRef.current)
      clearRef.current = window.setTimeout(() => {
        setParticles(null)
        clearRef.current = null
      }, 3600)
    }
    window.addEventListener(BET_PLACED_EVENT, onBet)
    return () => {
      window.removeEventListener(BET_PLACED_EVENT, onBet)
      if (clearRef.current) window.clearTimeout(clearRef.current)
    }
  }, [])

  if (!particles?.length) return null

  const layer = (
    <div
      className="bet-sprinkle-root pointer-events-none fixed inset-0 overflow-hidden"
      style={{
        zIndex: 2147483646,
        isolation: 'isolate',
      }}
      aria-hidden="true"
    >
      {particles.map((p) => {
        const w = p.wide ? p.size * 2.4 : p.size
        const h = p.wide ? p.size * 0.5 : p.size
        return (
          <span
            key={p.id}
            className="absolute will-change-transform"
            style={{
              left: `${p.leftPct}%`,
              top: '-8%',
              width: 0,
              height: 0,
              animation: `bet-sprinkle-y ${p.dur}s cubic-bezier(0.2, 0.65, 0.35, 1) ${p.delay}s forwards`,
            }}
          >
            <span
              style={{
                display: 'block',
                width: w,
                height: h,
                marginLeft: -w / 2,
                marginTop: -h / 2,
                borderRadius: p.wide ? 9999 : '50%',
                background: p.color,
                boxShadow: `0 0 ${Math.min(16, Math.ceil(p.size + 4))}px ${p.color}`,
                opacity: 0.95,
                transform: `translateX(${p.driftPx}px)`,
              }}
            />
          </span>
        )
      })}
    </div>
  )

  return createPortal(layer, document.body)
}
