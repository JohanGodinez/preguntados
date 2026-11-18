import { questions, type Question } from '../src/data/questions'

export type PickedQuestion = {
  question: Question
  options: string[]
  correctIndex: number
}

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const getAvailableCategoryIds = (categoryIds: string[], usedIds: string[]) =>
  categoryIds.filter((id) =>
    questions.some((q) => q.categoryId === id && !usedIds.includes(q.id)),
  )

export const getWheelCategoryIds = (categoryIds: string[], usedIds: string[], suddenDeath: boolean) =>
  suddenDeath ? categoryIds : getAvailableCategoryIds(categoryIds, usedIds)

export const leadingTeams = (scores: number[]) => {
  const max = Math.max(...scores)
  return scores.flatMap((score, i) => (score === max ? [i] : []))
}

export const pickQuestion = (categoryId: string, usedIds: string[]): PickedQuestion | null => {
  const all = questions.filter((q) => q.categoryId === categoryId)
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
