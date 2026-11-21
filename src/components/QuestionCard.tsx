import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { POINTS_PER_CORRECT, type PublicQuestion, type Result } from '../../shared/protocol'
import { sounds } from '../lib/sound'

const LETTERS = ['A', 'B', 'C', 'D']

type Props = {
  question: PublicQuestion
  deadlineIn: number | null
  correctIndex: number | null
  /** Respuesta de cada equipo (índice de opción). */
  answers: (number | null)[]
  results: (Result | null)[]
  teams: string[]
  myTeamIndex?: number | null
  onAnswer?: (index: number) => void
}

type OptionState = 'idle' | 'chosen' | 'correct' | 'wrong' | 'dim'

const optionClass = (state: OptionState) => {
  switch (state) {
    case 'correct':
      return 'border-green bg-green text-ink shadow-[0_0_36px_-6px_var(--color-green)]'
    case 'wrong':
      return 'border-red bg-red text-white'
    case 'chosen':
      return 'border-cyan bg-cyan/20 text-paper shadow-[0_0_24px_-8px_var(--color-cyan)]'
    case 'dim':
      return 'border-line bg-ink-2/85 text-paper opacity-35'
    default:
      return 'border-line bg-ink-2/85 text-paper hover:border-cyan hover:bg-cyan/10'
  }
}

const letterClass = (state: OptionState) => {
  switch (state) {
    case 'correct':
      return 'bg-ink text-green'
    case 'wrong':
      return 'bg-white text-red'
    case 'chosen':
      return 'bg-cyan text-ink'
    default:
      return 'bg-ink-3 text-yellow'
  }
}

const verdict = (result: Result | null) => {
  switch (result) {
    case 'correct':
      return { text: `+${POINTS_PER_CORRECT}`, className: 'text-green' }
    case 'wrong':
      return { text: 'Falló', className: 'text-red' }
    case 'timeout':
      return { text: 'Sin respuesta', className: 'text-yellow' }
    default:
      return { text: '', className: '' }
  }
}

export function QuestionCard({
  question,
  deadlineIn,
  correctIndex,
  answers,
  results,
  teams,
  myTeamIndex = null,
  onAnswer,
}: Props) {
  const revealed = correctIndex !== null
  const interactive = Boolean(onAnswer) && !revealed
  const [endsAt] = useState(() => (deadlineIn === null ? null : Date.now() + deadlineIn))
  const [now, setNow] = useState(() => Date.now())
  const timed = endsAt !== null && !revealed
  const myPick =
    myTeamIndex !== null && myTeamIndex !== undefined ? (answers[myTeamIndex] ?? null) : null

  useEffect(() => {
    if (!timed) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [timed])

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000))
  const total = deadlineIn === null ? 1 : Math.max(1, Math.round(deadlineIn / 1000))
  const progress = endsAt === null ? 100 : Math.min(100, ((endsAt - now) / (total * 1000)) * 100)
  const urgent = timed && remaining <= 5

  useEffect(() => {
    if (timed && remaining > 0 && remaining <= 5) sounds.tick()
  }, [timed, remaining])

  useEffect(() => {
    if (myTeamIndex === null || myTeamIndex === undefined) return
    const result = results[myTeamIndex] ?? null
    if (result === 'correct') sounds.correct()
    else if (result === 'wrong') sounds.wrong()
    else if (result === 'timeout') sounds.timeout()
  }, [results, myTeamIndex])

  return (
    <section className="flex w-full flex-col items-center gap-6">
      {timed ? (
        <div className="flex w-full max-w-140 items-center gap-3.5">
          <motion.span
            key={remaining}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            className={`min-w-14 text-center font-display text-4xl leading-none ${urgent ? 'text-red' : 'text-cyan'}`}
          >
            {remaining}
          </motion.span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-paper/10">
            <motion.div
              className={`h-full rounded-full ${urgent ? 'bg-linear-to-r from-red to-yellow' : 'bg-linear-to-r from-cyan to-green'}`}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.25, ease: 'linear' }}
            />
          </div>
        </div>
      ) : null}

      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="m-0 max-w-200 text-balance text-center text-[clamp(22px,3.4vw,34px)] leading-tight font-bold"
      >
        {question.text}
      </motion.h2>

      <div className="grid w-full grid-cols-1 gap-3.5 md:grid-cols-2">
        {question.options.map((option, i) => {
          const pickedBy = teams.flatMap((_, t) => (revealed && answers[t] === i ? [t] : []))
          const isWrongPick = pickedBy.some((t) => results[t] !== 'correct')
          let state: OptionState = 'idle'
          if (revealed) {
            if (i === correctIndex) state = 'correct'
            else if (isWrongPick) state = 'wrong'
            else state = 'dim'
          } else if (myPick === i) {
            state = 'chosen'
          }
          return (
            <motion.button
              key={option}
              initial={{ opacity: 0, y: 18 }}
              animate={{
                opacity: state === 'dim' ? 0.35 : 1,
                y: 0,
                scale: state === 'correct' ? [1, 1.03, 1] : 1,
              }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}
              whileHover={interactive ? { y: -2 } : undefined}
              whileTap={interactive ? { scale: 0.98 } : undefined}
              disabled={!interactive}
              onClick={() => onAnswer?.(i)}
              className={`flex items-center gap-3.5 rounded-2xl border px-5 py-4.5 text-left text-lg font-semibold transition-colors duration-300 ${optionClass(state)} ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`grid size-9.5 shrink-0 place-items-center rounded-[10px] font-display text-[15px] ${letterClass(state)}`}>
                {LETTERS[i]}
              </span>
              <span className="flex-1">{option}</span>
              {!revealed && myPick === i ? (
                <span className="shrink-0 text-[11px] font-bold tracking-[0.12em] text-cyan uppercase">
                  Tu respuesta
                </span>
              ) : null}
              {revealed && pickedBy.length > 0 ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  {pickedBy.map((t) => (
                    <span
                      key={t}
                      className="inline-block size-3 rounded-full ring-2 ring-ink"
                      style={{ background: `var(--team-${t % 6})` }}
                      title={teams[t]}
                    />
                  ))}
                </span>
              ) : null}
            </motion.button>
          )
        })}
      </div>

      {revealed ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
        >
          {teams.map((team, t) => {
            const result = results[t] ?? null
            if (result === null) return null
            const { text, className } = verdict(result)
            return (
              <span key={t} className="flex items-center gap-2">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ background: `var(--team-${t % 6})` }}
                  aria-hidden="true"
                />
                <span className="font-display text-[17px] tracking-[0.04em] uppercase">{team}</span>
                <span className={`font-display text-[17px] uppercase ${className}`}>{text}</span>
              </span>
            )
          })}
        </motion.div>
      ) : null}
    </section>
  )
}
