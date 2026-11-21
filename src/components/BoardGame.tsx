import { motion } from 'framer-motion'
import type { PublicState } from '../../shared/protocol'
import { useCatalog } from '../lib/catalog'
import { useRoomStore } from '../store/roomStore'
import { AdvanceCountdown } from './AdvanceCountdown'
import { CategoryIcon } from './CategoryIcon'
import { QuestionCard } from './QuestionCard'
import { Roulette } from './Roulette'
import { Scoreboard } from './Scoreboard'
import { TeamStatus } from './TeamStatus'

type Props = {
  state: PublicState
}

/**
 * Tablero opcional (TV / tablet): muestra el estado de la partida.
 * No ejecuta el motor ni crea la sala; el creador juega desde su celular.
 */
export function BoardGame({ state }: Props) {
  const boardNext = useRoomStore((s) => s.boardNext)
  const error = useRoomStore((s) => s.error)
  const catalogLoaded = useCatalog((s) => s.loaded)
  const catalogError = useCatalog((s) => s.error)
  const catalogCategories = useCatalog((s) => s.categories)
  const { config, turnTeam, round, suddenDeath, tiedTeams, stage, active, categoryId, correctIndex, answers, results } = state

  if (!catalogLoaded) {
    return (
      <p className="pt-16 text-center text-sm font-bold tracking-[0.2em] text-muted uppercase">
        {catalogError ?? 'Cargando categorías…'}
      </p>
    )
  }

  const teamName = config.teams[turnTeam] ?? ''
  const wheelCategories = catalogCategories.filter((c) => state.wheelCategoryIds.includes(c.id))
  const activeCategory = catalogCategories.find((c) => c.id === active?.categoryId)

  return (
    <div className="flex flex-col gap-5.5">
      {error ? <p className="m-0 text-sm font-bold text-red">{error}</p> : null}
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
          <span className="text-xs font-bold tracking-[0.25em] text-muted uppercase">
            Sala {state.code}
          </span>
          <motion.span
            key={turnTeam}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="font-display text-[34px] leading-tight text-(--team) max-md:text-2xl"
            style={{ ['--team' as string]: `var(--team-${turnTeam % 6})` }}
          >
            {stage === 'spin' ? `Gira ${teamName}` : 'Responden ambos'}
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
            className="flex flex-col items-center gap-6 pb-24"
          >
            <h2 className="m-0 text-center font-display text-[22px] font-normal tracking-[0.05em] uppercase">
              {categoryId ? 'Girando…' : `${teamName} elige categoría`}
            </h2>
            <Roulette categories={wheelCategories} target={categoryId} />
            <p className="m-0 text-sm font-bold tracking-[0.2em] text-muted uppercase">
              Desde el celular de {teamName} · todos responden la misma pregunta
            </p>
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
              className="flex items-center gap-2 rounded-md px-4 py-1.5 font-display text-[13px] tracking-[0.08em] text-ink uppercase"
              style={{ background: activeCategory?.color }}
            >
              {activeCategory ? <CategoryIcon id={activeCategory.id} className="size-4" strokeWidth={2.5} /> : null}
              {activeCategory?.name}
            </motion.span>

            <TeamStatus state={state} />

            <QuestionCard
              key={active.id}
              question={active}
              deadlineIn={stage === 'question' ? state.deadlineIn : null}
              correctIndex={correctIndex}
              answers={answers}
              results={results}
              teams={config.teams}
            />

            {stage === 'question' ? (
              <p className="m-0 text-sm font-bold tracking-[0.2em] text-muted uppercase">
                Cada equipo responde desde su celular
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap items-center justify-center gap-4">
                {state.advanceIn !== null ? <AdvanceCountdown seconds={state.advanceIn} /> : null}
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => void boardNext()}
                  className="cursor-pointer rounded-full bg-linear-to-br from-yellow to-pink px-6 py-3 font-display text-[15px] text-ink uppercase shadow-[0_10px_30px_-8px_rgb(255_61_127/0.7)]"
                >
                  Siguiente ahora
                </motion.button>
              </div>
            )}
          </motion.section>
        ) : null}
      </main>
    </div>
  )
}
