import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Category } from '../../shared/protocol'
import { sounds } from '../lib/sound'

const SIZE = 300
const CENTER = SIZE / 2
const RADIUS = CENTER - 6
const SPIN_SECONDS = 4.2
const FULL_TURNS = 6

type Props = {
  categories: Category[]
  target: string | null
  onSpin: () => void
  onFinish: (categoryId: string) => void
}

const polar = (angle: number, r: number) => {
  const rad = (angle * Math.PI) / 180
  return { x: CENTER + r * Math.sin(rad), y: CENTER - r * Math.cos(rad) }
}

const slicePath = (start: number, end: number) => {
  const a = polar(start, RADIUS)
  const b = polar(end, RADIUS)
  const large = end - start > 180 ? 1 : 0
  return `M ${CENTER} ${CENTER} L ${a.x} ${a.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${b.x} ${b.y} Z`
}

export function Roulette({ categories, target, onSpin, onFinish }: Props) {
  const slice = 360 / categories.length
  const targetIndex = categories.findIndex((c) => c.id === target)
  const landing = targetIndex >= 0 ? (360 - (targetIndex * slice + slice / 2)) % 360 : 0
  const rotation = targetIndex >= 0 ? FULL_TURNS * 360 + landing : 0

  useEffect(() => {
    if (targetIndex >= 0) sounds.spin(SPIN_SECONDS)
  }, [targetIndex])

  return (
    <div className="relative flex aspect-square w-[min(80vw,360px)] items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute -top-4.5 left-1/2 z-10 -translate-x-1/2 drop-shadow-[0_4px_6px_rgb(0_0_0/0.6)]"
        style={{
          width: 0,
          height: 0,
          borderLeft: '18px solid transparent',
          borderRight: '18px solid transparent',
          borderTop: '32px solid var(--color-paper)',
        }}
      />

      <div className="size-full rounded-full shadow-[0_0_0_8px_var(--color-ink-3),0_0_0_11px_var(--color-yellow),0_30px_60px_-20px_rgb(0_0_0/0.8),0_0_80px_-10px_rgb(255_61_127/0.35)]">
        <motion.div
          className="size-full will-change-transform"
          initial={{ rotate: 0 }}
          animate={{ rotate: rotation }}
          transition={{ duration: SPIN_SECONDS, ease: [0.17, 0.67, 0.12, 0.99] }}
          onAnimationComplete={() => {
            if (target) onFinish(target)
          }}
        >
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full rounded-full">
            {categories.map((cat, i) => {
              const start = i * slice
              const end = start + slice
              const mid = start + slice / 2
              const label = polar(mid, RADIUS * 0.58)
              return (
                <g key={cat.id}>
                  {categories.length === 1 ? (
                    <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={cat.color} />
                  ) : (
                    <path d={slicePath(start, end)} fill={cat.color} stroke="#09071a" strokeWidth={3} />
                  )}
                  <text
                    x={label.x}
                    y={label.y}
                    transform={`rotate(${mid} ${label.x} ${label.y})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="font-display text-[11px] fill-white tracking-[0.02em]"
                    stroke="rgb(9 7 26 / 0.5)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {cat.name}
                  </text>
                </g>
              )
            })}
            <circle cx={CENTER} cy={CENTER} r={22} className="fill-ink stroke-yellow" strokeWidth={5} />
          </svg>
        </motion.div>
      </div>

      {target ? null : (
        <motion.button
          onClick={onSpin}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="absolute -bottom-20 cursor-pointer rounded-full bg-linear-to-br from-yellow to-pink px-6 py-3 font-display text-[15px] uppercase text-ink shadow-[0_10px_30px_-8px_rgb(255_61_127/0.7)]"
        >
          Girar ruleta
        </motion.button>
      )}
    </div>
  )
}
