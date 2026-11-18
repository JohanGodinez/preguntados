import { motion } from 'framer-motion'
import { useCatalog } from '../lib/catalog'
import type { PublicState } from '../../shared/protocol'
import { sounds } from '../lib/sound'
import { useRoomStore } from '../store/roomStore'
import { QuestionCard } from './QuestionCard'
import { Roulette } from './Roulette'
import { Scoreboard } from './Scoreboard'

type Props = {
  state: PublicState
}

export function HostGame({ state }: Props) {
  const act = useRoomStore((s) => s.act)
  const catalogCategories = useCatalog((s) => s.categories)
  const { config, turnTeam, round, suddenDeath, tiedTeams, stage, active, categoryId, result, selected, correctIndex } = state

  const teamName = config.teams[turnTeam] ?? ''
  const isLastRound = !suddenDeath && round >= config.totalRounds
  const wheelCategories = catalogCategories.filter((c) => state.wheelCategoryIds.includes(c.id))
  const activeCategory = catalogCategories.find((c) => c.id === active?.categoryId)
  const endsGame = suddenDeath ? result === 'correct' : isLastRound || state.wheelCategoryIds.length === 0

  return (
    <div className="flex flex-col gap-5.5">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-end justify-between gap-4"
      >
        <div className="flex flex-col">
          <span className="text-xs font-bold tracking-[0.25em] text-muted uppercase">
            {suddenDeath ? 'Muerte súbita' : 'Ronda'}
          </span>
          {suddenDeath ? (
            <span className="font-display text-5xl leading-none text-yellow">¡Desempate!</span>
          ) : (
            <span className="font-display text-5xl leading-none">
              {round}
              <small className="text-[22px] text-muted"> / {config.totalRounds}</small>
            </span>
          )}
        </div>
        <div className="flex flex-col text-right">
          <span className="text-xs font-bold tracking-[0.25em] text-muted uppercase">Turno de</span>
          <motion.span
            key={turnTeam}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="font-display text-[34px] leading-tight text-(--team) max-md:text-2xl"
            style={{ ['--team' as string]: `var(--team-${turnTeam % 6})`, textShadow: '0 0 22px currentColor' }}
          >
            {teamName}
          </motion.span>
        </div>
      </motion.header>

      <Scoreboard
        teams={config.teams}
        scores={state.scores}
        activeIndex={turnTeam}
        eligible={suddenDeath ? tiedTeams : undefined}
      />

      <main className="flex min-h-115 flex-col items-center justify-center max-md:min-h-0">
        {stage === 'spin' ? (
          <motion.section
            key={`spin-${round}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center pb-24"
          >
            <h2 className="mb-6 text-center font-display text-[22px] font-normal tracking-[0.05em] uppercase">
              {categoryId ? 'Girando…' : 'Elige una categoría'}
            </h2>
            <Roulette
              categories={wheelCategories}
              target={categoryId}
              onSpin={() => void act('host:spin')}
              onFinish={() => void act('host:show')}
            />
          </motion.section>
        ) : null}

        {stage !== 'spin' && active ? (
          <motion.section
            key={`q-${active.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex w-full flex-col items-center gap-5.5"
          >
            <motion.span
              initial={{ rotate: -6, scale: 0.7, opacity: 0 }}
              animate={{ rotate: -2, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="rounded-md px-4 py-1.5 font-display text-[13px] tracking-[0.08em] text-ink uppercase"
              style={{ background: activeCategory?.color }}
            >
              {activeCategory?.name}
            </motion.span>

            <QuestionCard
              key={active.id}
              question={active}
              deadlineIn={stage === 'question' ? state.deadlineIn : null}
              correctIndex={correctIndex}
              selected={selected}
              result={result}
            />

            {stage === 'question' ? (
              <p className="m-0 text-sm font-bold tracking-[0.2em] text-muted uppercase">
                Respondiendo: {teamName}
              </p>
            ) : (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  sounds.click()
                  void act('host:next')
                }}
                className="mt-1 cursor-pointer rounded-full bg-linear-to-br from-yellow to-pink px-6 py-3 font-display text-[15px] text-ink uppercase shadow-[0_10px_30px_-8px_rgb(255_61_127/0.7)]"
              >
                {endsGame ? 'Ver resultados' : suddenDeath ? 'Siguiente turno' : 'Siguiente ronda'}
              </motion.button>
            )}
          </motion.section>
        ) : null}
      </main>
    </div>
  )
}
