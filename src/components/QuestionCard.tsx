import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { POINTS_PER_CORRECT, type PublicQuestion, type Result } from '../../shared/protocol'
import { sounds } from '../lib/sound'

const LETTERS = ['A', 'B', 'C', 'D']

type Props = {
  question: PublicQuestion
  deadlineIn: number | null
  correctIndex: number | null
  selected: number | null
  result: Result | null
  onAnswer?: (index: number) => void
}

type OptionState = 'idle' | 'correct' | 'wrong' | 'dim'

const optionClass = (state: OptionState) => {
  switch (state) {
    case 'correct':
      return 'border-green bg-green text-ink shadow-[0_0_36px_-6px_var(--color-green)]'
    case 'wrong':
      return 'border-red bg-red text-white'
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
    default:
      return 'bg-ink-3 text-yellow'
  }
}

const verdictColor = (result: Result | null) => {
  switch (result) {
    case 'correct':
      return 'text-green'
    case 'wrong':
      return 'text-red'
    case 'timeout':
      return 'text-yellow'
    default:
      return ''
  }
}

export function QuestionCard({ question, deadlineIn, correctIndex, selected, result, onAnswer }: Props) {
  const revealed = correctIndex !== null
  const interactive = Boolean(onAnswer) && !revealed
  const [endsAt] = useState(() => (deadlineIn === null ? null : Date.now() + deadlineIn))
  const [now, setNow] = useState(() => Date.now())
  const timed = endsAt !== null && !revealed

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
    if (result === 'correct') sounds.correct()
    else if (result === 'wrong') sounds.wrong()
    else if (result === 'timeout') sounds.timeout()
  }, [result])

  return (
    <section className="player-stack flex w-full flex-col items-center gap-4 sm:gap-6">
      {timed ? (
        <div className="flex w-full max-w-140 items-center gap-3">
          <motion.span
            key={remaining}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            className={`min-w-11 text-center font-display text-3xl leading-none sm:min-w-14 sm:text-4xl ${urgent ? 'text-red' : 'text-cyan'}`}
          >
            {remaining}
          </motion.span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper/10 sm:h-3">
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
        className="player-question m-0 max-w-200 text-center text-[clamp(20px,5.2vw,30px)] leading-tight font-bold md:text-[clamp(22px,3.4vw,34px)]"
      >
        {question.text}
      </motion.h2>

      <div className="player-options grid w-full grid-cols-1 gap-2.5 sm:gap-3.5 md:grid-cols-2">
        {question.options.map((option, i) => {
          const isCorrect = i === correctIndex
          const isSelected = i === selected
          let state: OptionState = 'idle'
          if (revealed) {
            if (isCorrect) state = 'correct'
            else if (isSelected) state = 'wrong'
            else state = 'dim'
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
              whileTap={interactive ? { scale: 0.97 } : undefined}
              disabled={!interactive}
              onClick={() => onAnswer?.(i)}
              className={`player-option flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-base font-semibold transition-colors duration-300 sm:gap-3.5 sm:px-5 sm:py-4.5 sm:text-lg ${optionClass(state)} ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`player-option-letter grid size-8.5 shrink-0 place-items-center rounded-[10px] font-display text-sm sm:size-9.5 sm:text-[15px] ${letterClass(state)}`}>
                {LETTERS[i]}
              </span>
              <span>{option}</span>
            </motion.button>
          )
        })}
      </div>

      {revealed ? (
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`m-0 font-display text-lg tracking-[0.04em] uppercase sm:text-[22px] ${verdictColor(result)}`}
          aria-live="polite"
        >
          {result === 'correct' ? `¡Correcto! +${POINTS_PER_CORRECT} puntos` : null}
          {result === 'wrong' ? 'Respuesta incorrecta' : null}
          {result === 'timeout' ? 'Se acabó el tiempo' : null}
        </motion.p>
      ) : null}
    </section>
  )
}
