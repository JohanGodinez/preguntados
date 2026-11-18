export const POINTS_PER_CORRECT = 10

export type Phase = 'lobby' | 'playing' | 'finished'
export type Stage = 'spin' | 'question' | 'reveal'
export type Result = 'correct' | 'wrong' | 'timeout'

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
  selected: number | null
  result: Result | null
  wheelCategoryIds: string[]
  deadlineIn: number | null
  hostOnline: boolean
}

export type Ack =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string }

export type CreateRoomPayload = GameConfig

export type HostCredentials = { code: string; hostToken: string }
export type PlayerCredentials = { code: string; token: string }

export const ROOM_CLOSED = 'room:closed'
export const STATE_EVENT = 'state'
