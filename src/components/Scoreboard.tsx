import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  teams: string[]
  scores: number[]
  activeIndex?: number
  eligible?: number[]
}

export function Scoreboard({ teams, scores, activeIndex, eligible }: Props) {
  return (
    <ol className="grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 p-0">
      {teams.map((name, i) => {
        const active = i === activeIndex
        const out = eligible !== undefined && !eligible.includes(i)
        return (
          <motion.li
            key={i}
            animate={{ y: active ? -4 : 0, opacity: out ? 0.4 : 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            style={{ ['--team' as string]: `var(--team-${i % 6})` }}
            className={`relative flex flex-col gap-1 rounded-2xl border border-t-4 border-line border-t-(--team) px-4 py-3.5 ${
              active
                ? 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--team)_22%,transparent),rgb(20_16_46/0.9))] shadow-[0_0_30px_-8px_var(--team)]'
                : 'bg-ink-2/80'
            }`}
          >
            <span className={`truncate text-sm font-bold ${active ? 'text-paper' : 'text-muted'}`}>
              {name}
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={scores[i] ?? 0}
                initial={{ opacity: 0, y: -10, scale: 1.3 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="font-display text-[34px] leading-none text-(--team)"
              >
                {scores[i] ?? 0}
              </motion.span>
            </AnimatePresence>
          </motion.li>
        )
      })}
    </ol>
  )
}
