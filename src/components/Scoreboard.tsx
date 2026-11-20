import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  teams: string[]
  scores: number[]
  activeIndex?: number
  eligible?: number[]
  compact?: boolean
}

const teamStyle = (i: number) => ({ ['--team' as string]: `var(--team-${i % 6})` })

export function Scoreboard({ teams, scores, activeIndex, eligible, compact = false }: Props) {
  return (
    <>
      {compact ? (
        <ol className="player-scoreboard no-scrollbar flex list-none gap-2 overflow-x-auto p-0 md:hidden">
          {teams.map((name, i) => {
            const active = i === activeIndex
            const out = eligible !== undefined && !eligible.includes(i)
            return (
              <motion.li
                key={i}
                animate={{ opacity: out ? 0.4 : 1 }}
                transition={{ duration: 0.2 }}
                style={teamStyle(i)}
                className={`flex min-w-20 shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-2.5 pl-2.5 ${
                  active
                    ? 'border-(--team) bg-[color-mix(in_srgb,var(--team)_18%,transparent)]'
                    : 'border-line bg-ink-2/80'
                }`}
              >
                <span className="size-2 shrink-0 rounded-full bg-(--team) shadow-[0_0_8px_var(--team)]" aria-hidden="true" />
                <span className="max-w-16 truncate text-xs font-bold text-paper/80">{name}</span>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={scores[i] ?? 0}
                    initial={{ opacity: 0, y: -6, scale: 1.2 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="font-display text-lg leading-none text-(--team) tabular-nums"
                  >
                    {scores[i] ?? 0}
                  </motion.span>
                </AnimatePresence>
              </motion.li>
            )
          })}
        </ol>
      ) : null}

      <ol
        className={`${
          compact ? 'player-scoreboard-cards hidden md:grid' : 'grid'
        } list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 p-0`}
      >
        {teams.map((name, i) => {
          const active = i === activeIndex
          const out = eligible !== undefined && !eligible.includes(i)
          return (
            <motion.li
              key={i}
              animate={{ y: active ? -4 : 0, opacity: out ? 0.4 : 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              style={teamStyle(i)}
              className={`relative flex flex-col gap-1 rounded-2xl border border-[color-mix(in_srgb,var(--team)_45%,transparent)] px-4 py-3.5 ${
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
    </>
  )
}
