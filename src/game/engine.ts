import type {
  Category,
  GameConfig,
  GameState,
  PublicBankQuestion,
  Question,
} from '../../shared/protocol'

export type PickedQuestion = {
  question: Question
  options: string[]
  correctIndex: number
}

export const TIMER_OPTIONS = [0, 10, 15, 20]

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const getAvailableCategoryIds = (categoryIds: string[], bank: PublicBankQuestion[], usedIds: string[]) =>
  categoryIds.filter((id) => bank.some((q) => q.categoryId === id && !usedIds.includes(q.id)))

export const getWheelCategoryIds = (
  categoryIds: string[],
  bank: PublicBankQuestion[],
  usedIds: string[],
  suddenDeath: boolean,
) => (suddenDeath ? categoryIds : getAvailableCategoryIds(categoryIds, bank, usedIds))

export const leadingTeams = (scores: number[]) => {
  const max = Math.max(...scores)
  return scores.flatMap((score, i) => (score === max ? [i] : []))
}

export const pickQuestion = (bank: Question[], categoryId: string, usedIds: string[]): PickedQuestion | null => {
  const all = bank.filter((q) => q.categoryId === categoryId)
  const unused = all.filter((q) => !usedIds.includes(q.id))
  const pool = unused.length > 0 ? unused : all
  if (pool.length === 0) return null
  const question = pool[Math.floor(Math.random() * pool.length)]
  const order = shuffle([0, 1, 2, 3])
  return {
    question,
    options: order.map((i) => question.options[i]),
    correctIndex: order.indexOf(question.correct),
  }
}

export const toPublicQuestion = (picked: PickedQuestion) => ({
  id: picked.question.id,
  categoryId: picked.question.categoryId,
  text: picked.question.text,
  options: picked.options,
})

export const sanitizeConfig = (
  input: unknown,
  categories: Category[],
  bank: PublicBankQuestion[],
): GameConfig | string => {
  if (typeof input !== 'object' || input === null) return 'Configuración inválida'
  const raw = input as Partial<Record<keyof GameConfig, unknown>>

  const teams = Array.isArray(raw.teams)
    ? raw.teams.slice(0, 6).map((t, i) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, 18) : `Equipo ${i + 1}`))
    : []
  if (teams.length < 2) return 'Se necesitan al menos 2 equipos'

  const validCategoryIds = categories.map((c) => c.id)
  const categoryIds = Array.isArray(raw.categoryIds)
    ? raw.categoryIds.filter((c): c is string => typeof c === 'string' && validCategoryIds.includes(c))
    : []
  if (categoryIds.length === 0) return 'Elige al menos una categoría'

  const maxRounds = bank.filter((q) => categoryIds.includes(q.categoryId)).length
  const requested = typeof raw.totalRounds === 'number' ? Math.floor(raw.totalRounds) : 10
  const totalRounds = Math.min(Math.max(requested, 1), maxRounds)

  const timerSeconds =
    typeof raw.timerSeconds === 'number' && (TIMER_OPTIONS as number[]).includes(raw.timerSeconds)
      ? raw.timerSeconds
      : 15

  return { teams, totalRounds, categoryIds, timerSeconds }
}

export const initialState = (config: GameConfig): GameState => ({
  phase: 'lobby',
  config,
  scores: config.teams.map(() => 0),
  round: 1,
  turnTeam: 0,
  suddenDeath: false,
  tiedTeams: [],
  stage: 'spin',
  categoryId: null,
  active: null,
  correctIndex: null,
  selected: null,
  result: null,
  wheelCategoryIds: config.categoryIds,
  deadlineAt: null,
  usedIds: [],
})
