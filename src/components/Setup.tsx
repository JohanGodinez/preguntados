import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCatalog } from '../lib/catalog'
import { sounds } from '../lib/sound'
import type { GameConfig } from '../../shared/protocol'

const MIN_TEAMS = 2
const MAX_TEAMS = 6
const TIMER_OPTIONS = [0, 10, 15, 20] as const

const panel = 'rounded-[22px] border border-line bg-linear-to-b from-ink-3/90 to-ink-2/90 p-6'

const chipBase = 'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 font-semibold transition-colors'

const chip = (on: boolean) =>
  `${chipBase} ${
    on ? 'border-paper bg-paper text-ink' : 'border-line bg-paper/5 text-muted hover:border-paper hover:text-paper'
  }`

const riseIn = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: 'easeOut' as const },
})

type Props = {
  busy: boolean
  onSubmit: (config: GameConfig) => void
}

export function Setup({ busy, onSubmit }: Props) {
  const catalogCategories = useCatalog((s) => s.categories)
  const catalogQuestions = useCatalog((s) => s.questions)
  const catalogError = useCatalog((s) => s.error)
  const loadCatalog = useCatalog((s) => s.load)
  const [teams, setTeams] = useState<string[]>(['', ''])
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [rounds, setRounds] = useState(10)
  const [timerSeconds, setTimerSeconds] = useState<number>(15)

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const categoryIds = catalogCategories
    .map((c) => c.id)
    .filter((id) => !excludedIds.includes(id))

  const getMaxRounds = (ids: string[]) =>
    catalogQuestions.filter((q) => ids.includes(q.categoryId)).length

  const maxRounds = getMaxRounds(categoryIds)
  const effectiveRounds = Math.min(rounds, maxRounds)
  const canStart = categoryIds.length > 0 && maxRounds > 0 && catalogCategories.length > 0

  const updateTeam = (index: number, value: string) =>
    setTeams((list) => list.map((t, i) => (i === index ? value : t)))

  const toggleCategory = (id: string) =>
    setExcludedIds((list) =>
      list.includes(id) ? list.filter((c) => c !== id) : [...list, id],
    )

  const handleStart = () => {
    sounds.start()
    onSubmit({
      teams: teams.map((t, i) => t.trim() || `Equipo ${i + 1}`),
      totalRounds: effectiveRounds,
      categoryIds,
      timerSeconds,
    })
  }

  return (
    <div className="flex flex-col">
      <motion.header {...riseIn(0)} className="py-6 pb-9">
        <p className="mb-1.5 text-[13px] font-bold tracking-[0.32em] text-cyan uppercase">
          Juego de trivia por equipos
        </p>
        <h1 className="m-0 font-display text-[clamp(56px,11vw,128px)] leading-[0.9] [text-shadow:4px_4px_0_var(--color-pink),-2px_-2px_0_var(--color-cyan)]">
          Pregun<span className="text-yellow [text-shadow:4px_4px_0_var(--color-pink)]">tados</span>
        </h1>
      </motion.header>

      {!catalogCategories.length ? (
        <p className="pt-10 text-center text-sm font-bold tracking-[0.2em] text-muted uppercase">
          {catalogError ?? 'Cargando preguntas…'}
        </p>
      ) : null}

      <div className={`grid grid-cols-1 gap-5 md:grid-cols-2 ${catalogCategories.length ? '' : 'hidden'}`}>
        <motion.section {...riseIn(0)} className={panel}>
          <h2 className="mb-4.5 flex items-center gap-3 font-display text-lg font-normal tracking-[0.04em] uppercase">
            <span className="grid size-9 -rotate-6 place-items-center rounded-[10px] bg-yellow text-sm text-ink">01</span>
            Equipos
          </h2>
          <ul className="m-0 grid list-none gap-2.5 p-0">
            <AnimatePresence initial={false}>
              {teams.map((name, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  style={{ ['--team' as string]: `var(--team-${i % 6})` }}
                  className="flex items-center gap-2 overflow-hidden border-l-4 border-(--team) pl-2"
                >
                  <input
                    value={name}
                    placeholder={`Equipo ${i + 1}`}
                    maxLength={18}
                    onChange={(e) => updateTeam(i, e.target.value)}
                    className="flex-1 rounded-xl border border-line bg-ink/60 px-3.5 py-3 text-base font-semibold outline-none focus:border-(--team)"
                  />
                  {teams.length > MIN_TEAMS ? (
                    <button
                      aria-label={`Quitar equipo ${i + 1}`}
                      onClick={() => setTeams((list) => list.filter((_, j) => j !== i))}
                      className="size-9 cursor-pointer rounded-full text-[22px] text-muted hover:bg-red/12 hover:text-red"
                    >
                      ×
                    </button>
                  ) : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {teams.length < MAX_TEAMS ? (
            <button
              onClick={() => setTeams((list) => [...list, ''])}
              className="mt-3 w-full cursor-pointer rounded-full border border-dashed border-line bg-transparent py-3 font-semibold text-muted hover:border-cyan hover:text-paper"
            >
              + Agregar equipo
            </button>
          ) : null}
        </motion.section>

        <motion.section {...riseIn(0.1)} className={panel}>
          <h2 className="mb-4.5 flex items-center gap-3 font-display text-lg font-normal tracking-[0.04em] uppercase">
            <span className="grid size-9 -rotate-6 place-items-center rounded-[10px] bg-yellow text-sm text-ink">02</span>
            Rondas
          </h2>
          <div className="mb-3.5 flex items-baseline gap-2.5">
            <motion.span
              key={effectiveRounds}
              initial={{ scale: 1.25, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-display text-6xl leading-none text-cyan [text-shadow:0_0_24px_rgb(45_226_230/0.5)]"
            >
              {effectiveRounds}
            </motion.span>
            <small className="text-xs tracking-[0.15em] text-muted uppercase">rondas</small>
          </div>
          <input
            type="range"
            min={1}
            max={Math.max(1, maxRounds)}
            value={effectiveRounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            disabled={maxRounds === 0}
            className="w-full accent-cyan"
          />
          <p className="mt-2.5 mb-0 text-sm text-muted">Máximo {maxRounds} con las categorías elegidas.</p>

          <h2 className="mt-7 mb-4.5 text-sm font-normal tracking-[0.04em] text-muted uppercase font-display">
            Tiempo por pregunta
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {TIMER_OPTIONS.map((t) => (
              <button key={t} className={chip(timerSeconds === t)} onClick={() => setTimerSeconds(t)}>
                {t === 0 ? 'Sin límite' : `${t} s`}
              </button>
            ))}
          </div>
        </motion.section>

        <motion.section {...riseIn(0.2)} className={`${panel} md:col-span-2`}>
          <h2 className="mb-4.5 flex items-center gap-3 font-display text-lg font-normal tracking-[0.04em] uppercase">
            <span className="grid size-9 -rotate-6 place-items-center rounded-[10px] bg-yellow text-sm text-ink">03</span>
            Categorías de la ruleta
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {catalogCategories.map((c) => {
              const on = categoryIds.includes(c.id)
              return (
                <motion.button
                  key={c.id}
                  whileTap={{ scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className={on ? `${chipBase} text-ink` : `${chipBase} border-line bg-paper/5 text-muted hover:text-paper`}
                  style={{
                    ['--cat' as string]: c.color,
                    background: on ? c.color : undefined,
                    borderColor: on ? c.color : undefined,
                  }}
                  onClick={() => toggleCategory(c.id)}
                >
                  <span
                    className="size-2.5 rounded-full bg-(--cat) shadow-[0_0_10px_var(--cat)] transition-opacity"
                    style={{ opacity: on ? 1 : 0.35 }}
                  />
                  {c.name}
                </motion.button>
              )
            })}
          </div>
        </motion.section>
      </div>

      <motion.footer {...riseIn(0.3)} className="mt-8 flex flex-wrap items-center justify-between gap-5">
        <motion.button
          whileHover={canStart ? { y: -2 } : undefined}
          whileTap={canStart ? { scale: 0.97 } : undefined}
          onClick={handleStart}
          disabled={!canStart || busy}
          className="cursor-pointer rounded-full bg-linear-to-br from-yellow to-pink px-10 py-4.5 font-display text-lg text-ink uppercase shadow-[0_10px_30px_-8px_rgb(255_61_127/0.7)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Creando sala…' : 'Crear sala'}
        </motion.button>
        <span className="text-sm text-muted">
          {teams.length} equipos · {effectiveRounds} rondas · {categoryIds.length} categorías
        </span>
      </motion.footer>
    </div>
  )
}
