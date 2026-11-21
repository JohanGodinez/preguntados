import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Category } from '../../shared/protocol'
import { CategoryIcon } from './CategoryIcon'
import { sounds } from '../lib/sound'

const SIZE = 300
const CENTER = SIZE / 2
const RADIUS = CENTER - 6
const SPIN_SECONDS = 4.2
const FULL_TURNS = 6

type Props = {
  categories: Category[]
  target: string | null
  onSpin?: () => void
  spinLabel?: string
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

export function Roulette({ categories, target, onSpin, spinLabel }: Props) {
  const slice = categories.length > 0 ? 360 / categories.length : 0
  const targetIndex = categories.findIndex((c) => c.id === target)
  const landing = targetIndex >= 0 ? (360 - (targetIndex * slice + slice / 2)) % 360 : 0
  const rotation = targetIndex >= 0 ? FULL_TURNS * 360 + landing : 0
  const landed = targetIndex >= 0 ? categories[targetIndex] : null

  useEffect(() => {
    if (targetIndex >= 0) sounds.spin(SPIN_SECONDS)
  }, [targetIndex])

  if (categories.length === 0) {
    return (
      <p className="m-0 py-16 text-center text-sm font-bold tracking-[0.2em] text-muted uppercase">
        Sin categorías disponibles
      </p>
    )
  }

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
          className="relative size-full will-change-transform"
          initial={{ rotate: 0 }}
          animate={{ rotate: rotation }}
          transition={{ duration: SPIN_SECONDS, ease: [0.17, 0.67, 0.12, 0.99] }}
        >
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full rounded-full">
            {categories.map((cat, i) => {
              const start = i * slice
              const end = start + slice
              return (
                <g key={cat.id}>
                  {categories.length === 1 ? (
                    <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={cat.color} />
                  ) : (
                    <path d={slicePath(start, end)} fill={cat.color} stroke="#09071a" strokeWidth={3} />
                  )}
                </g>
              )
            })}
            <circle cx={CENTER} cy={CENTER} r={22} className="fill-ink stroke-yellow" strokeWidth={5} />
          </svg>

          {/* Iconos de categoría sobre cada porción: rotan con la rueda
              pero se dibujan en HTML para escalar y no desbordar. */}
          <div aria-hidden="true" className="absolute inset-0">
            {categories.map((cat, i) => {
              const mid = i * slice + slice / 2
              const label = polar(mid, RADIUS * 0.58)
              return (
                <span
                  key={cat.id}
                  title={cat.name}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-white [filter:drop-shadow(0_2px_3px_rgb(9_7_26/0.7))]"
                  style={{ left: `${(label.x / SIZE) * 100}%`, top: `${(label.y / SIZE) * 100}%` }}
                >
                  <CategoryIcon id={cat.id} className="size-[clamp(18px,6vw,27px)]" />
                </span>
              )
            })}
          </div>
        </motion.div>
      </div>

      {landed ? (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-16 m-0 font-display text-lg tracking-[0.06em] uppercase"
          style={{ color: landed.color }}
        >
          {landed.name}
        </motion.p>
      ) : onSpin ? (
        <motion.button
          onClick={onSpin}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="absolute -bottom-16 cursor-pointer rounded-full bg-linear-to-br from-yellow to-pink px-6 py-3 font-display text-[15px] uppercase text-ink shadow-[0_10px_30px_-8px_rgb(255_61_127/0.7)]"
        >
          {spinLabel ?? 'Girar ruleta'}
        </motion.button>
      ) : null}
    </div>
  )
}
