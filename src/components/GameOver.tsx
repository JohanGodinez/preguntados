import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { sounds } from '../lib/sound'

type Props = {
  teams: string[]
  scores: number[]
  suddenDeath: boolean
  onNewGame?: () => void
}

export function GameOver({ teams, scores, suddenDeath, onNewGame }: Props) {
  useEffect(() => {
    sounds.win()
  }, [])

  const ranking = teams
    .map((name, i) => ({ name, score: scores[i] ?? 0, index: i }))
    .sort((a, b) => b.score - a.score)
  const top = ranking[0]
  if (!top) return null
  const winners = ranking.filter((r) => r.score === top.score)
  const isTie = winners.length > 1

  return (
    <div className="flex flex-col items-center gap-3 pt-4 text-center sm:gap-4 sm:pt-6">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-1.5 text-[13px] font-bold tracking-[0.32em] text-cyan uppercase"
      >
        Partida terminada
      </motion.p>
      <motion.h1
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="m-0 font-display text-[clamp(40px,11vw,96px)] leading-none font-normal [text-shadow:4px_4px_0_var(--color-pink),-3px_-3px_0_var(--color-cyan)]"
      >
        {isTie ? '¡Empate!' : '¡Campeón!'}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="m-0 font-display text-[clamp(24px,4vw,40px)] text-(--team)"
        style={{ ['--team' as string]: `var(--team-${top.index % 6})`, textShadow: '0 0 26px currentColor' }}
      >
        {isTie ? winners.map((w) => w.name).join(' · ') : top.name}
      </motion.p>
      {suddenDeath && !isTie ? (
        <p className="m-0 text-sm font-bold tracking-[0.2em] text-yellow uppercase">Ganó por muerte súbita</p>
      ) : null}

      <ol className="m-0 mt-4 mb-2 grid w-[min(560px,100%)] list-none gap-2 p-0 sm:mt-5 sm:mb-3 sm:gap-2.5">
        {ranking.map((team, pos) => (
          <motion.li
            key={team.index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + pos * 0.08, duration: 0.3 }}
            style={{ ['--team' as string]: `var(--team-${team.index % 6})` }}
            className="grid grid-cols-[36px_1fr_auto] items-center gap-2 rounded-2xl border border-line border-l-[6px] border-l-(--team) bg-ink-2/85 px-3 py-2.5 sm:grid-cols-[56px_1fr_auto] sm:gap-3 sm:px-5 sm:py-3.5"
          >
            <span className="font-display text-lg text-(--team) sm:text-[22px]">{pos + 1}</span>
            <span className="text-left text-base font-bold sm:text-lg">{team.name}</span>
            <span className="font-display text-2xl text-paper sm:text-[28px]">{team.score}</span>
          </motion.li>
        ))}
      </ol>

      {onNewGame ? (
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.15 }}
          onClick={onNewGame}
          className="w-full cursor-pointer rounded-full bg-linear-to-br from-yellow to-pink px-10 py-4 font-display text-lg text-ink uppercase shadow-[0_10px_30px_-8px_rgb(255_61_127/0.7)] sm:w-auto sm:py-4.5"
        >
          Nueva partida
        </motion.button>
      ) : null}
    </div>
  )
}
