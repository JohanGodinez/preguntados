export const POINTS_PER_CORRECT = 10

export type Phase = 'lobby' | 'playing' | 'finished'
export type Stage = 'spin' | 'question' | 'reveal'
export type Result = 'correct' | 'wrong' | 'timeout'

export type Category = {
  id: string
  name: string
  color: string
}

export type Question = {
  id: string
  categoryId: string
  text: string
  options: [string, string, string, string]
  correct: 0 | 1 | 2 | 3
}

/** Pregunta sin la respuesta correcta: lo único que ve un cliente. */
export type PublicBankQuestion = Omit<Question, 'correct'>

export type GameConfig = {
  teams: string[]
  totalRounds: number
  categoryIds: string[]
  timerSeconds: number
}

export type PublicQuestion = {
  id: string
  categoryId: string
  text: string
  options: string[]
}

export type PublicPlayer = {
  id: string
  name: string
  teamIndex: number | null
  online: boolean
}

export type PublicState = {
  code: string
  phase: Phase
  config: GameConfig
  players: PublicPlayer[]
  scores: number[]
  round: number
  turnTeam: number
  suddenDeath: boolean
  tiedTeams: number[]
  stage: Stage
  categoryId: string | null
  active: PublicQuestion | null
  correctIndex: number | null
  /** Respuesta elegida por cada equipo (índice de opción), alineada con config.teams. */
  answers: (number | null)[]
  /** Resultado de cada equipo, alineado con config.teams. */
  results: (Result | null)[]
  wheelCategoryIds: string[]
  deadlineIn: number | null
  /** Segundos hasta que el reveal avance solo (null fuera del reveal). */
  advanceIn: number | null
  hostOnline: boolean
}

/**
 * Estado del juego tal como se guarda en `games.state` (jsonb) y como
 * lo maneja el motor del host. Los datos presentes por realtime
 * (players, hostOnline) y el deadline relativo se agregan al vuelo.
 */
export type GameState = Omit<PublicState, 'code' | 'players' | 'hostOnline' | 'deadlineIn' | 'advanceIn'> & {
  deadlineAt: number | null
  advanceAt: number | null
  usedIds: string[]
}

export type HostCredentials = { code: string; hostToken: string }
export type PlayerCredentials = { code: string; token: string }

/** Fila de la tabla `players` tal como llega por realtime/REST. */
export type PlayerRow = {
  game_code: string
  id: string
  name: string
  team_index: number | null
}

/** Fila de la tabla `actions` (INSERT por realtime). */
export type ActionRow = {
  id: number
  game_code: string
  player_id: string
  type: string
  payload: unknown
}

/** Tipos de acción que un jugador puede enviar al host. */
export const PLAYER_ACTIONS = {
  ANSWER: 'answer',
  SPIN: 'spin',
  NEXT: 'next',
} as const

/** Milisegundos que el reveal queda en pantalla antes de avanzar solo. */
export const REVEAL_MS = 6000

export const GAME_CLOSED = 'game:closed'
