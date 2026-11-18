import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ActionRow,
  GameState,
  PlayerRow,
  Question,
} from '../../shared/protocol'
import { POINTS_PER_CORRECT } from '../../shared/protocol'
import {
  getWheelCategoryIds,
  leadingTeams,
  pickQuestion,
  toPublicQuestion,
  type PickedQuestion,
} from './engine'

/**
 * Motor del juego que corre en el navegador del host.
 * Reemplaza al servidor de socket.io: mantiene el estado en memoria,
 * aplica las transiciones y persiste cada cambio en `games.state`
 * mediante la RPC `update_game`. Los demás clientes lo reciben por realtime.
 */
export class HostEngine {
  private readonly db: SupabaseClient
  readonly code: string
  private readonly hostToken: string
  private state: GameState
  private bank: Question[]
  private pending: PickedQuestion | null = null
  private players: PlayerRow[] = []
  private ticker: number | null = null
  private onState: (state: GameState) => void
  private onError: (message: string) => void

  constructor(opts: {
    db: SupabaseClient
    code: string
    hostToken: string
    state: GameState
    bank: Question[]
    onState: (state: GameState) => void
    onError: (message: string) => void
  }) {
    this.db = opts.db
    this.code = opts.code
    this.hostToken = opts.hostToken
    this.state = opts.state
    this.bank = opts.bank
    this.onState = opts.onState
    this.onError = opts.onError
    this.startTicker()
  }

  dispose() {
    this.stopTicker()
  }

  setPlayers(players: PlayerRow[]) {
    this.players = players
  }

  getTeamIndex(playerId: string): number | null {
    return this.players.find((p) => p.id === playerId)?.team_index ?? null
  }

  // ---------------------------------------------------------
  // Acciones del host
  // ---------------------------------------------------------

  async start() {
    if (this.state.phase !== 'lobby') return this.fail('La partida ya comenzó')
    const emptyTeam = this.state.config.teams.some(
      (_, i) => !this.players.some((p) => p.team_index === i),
    )
    if (emptyTeam) return this.fail('Cada equipo necesita al menos un jugador')

    this.state = {
      ...this.state,
      phase: 'playing',
      scores: this.state.config.teams.map(() => 0),
      round: 1,
      turnTeam: 0,
      suddenDeath: false,
      tiedTeams: [],
      usedIds: [],
      stage: 'spin',
      categoryId: null,
      active: null,
      correctIndex: null,
      selected: null,
      result: null,
      wheelCategoryIds: this.state.config.categoryIds,
      deadlineAt: null,
    }
    await this.write()
  }

  async spin() {
    if (this.state.phase !== 'playing') return this.fail('No hay partida activa')
    if (this.state.stage !== 'spin' || this.state.categoryId !== null) {
      return this.fail('Ya hay una categoría elegida')
    }
    const wheel = getWheelCategoryIds(
      this.state.config.categoryIds,
      this.bank,
      this.state.usedIds,
      this.state.suddenDeath,
    )
    if (wheel.length === 0) return this.fail('No quedan preguntas')

    const categoryId = wheel[Math.floor(Math.random() * wheel.length)]
    const picked = pickQuestion(this.bank, categoryId, this.state.usedIds)
    if (!picked) return this.fail('No quedan preguntas')

    this.pending = picked
    this.state = { ...this.state, categoryId }
    await this.write()
  }

  async show() {
    if (!this.pending) return this.fail('No hay pregunta lista')
    const active = this.pending
    this.pending = null
    const ms = this.state.config.timerSeconds * 1000
    this.state = {
      ...this.state,
      active: toPublicQuestion(active),
      usedIds: [...this.state.usedIds, active.question.id],
      stage: 'question',
      selected: null,
      result: null,
      deadlineAt: ms === 0 ? null : Date.now() + ms,
    }
    await this.write()
  }

  async next() {
    if (this.state.phase !== 'playing' || this.state.stage !== 'reveal') {
      return this.fail('Todavía no se puede avanzar')
    }
    await this.advance()
  }

  async close() {
    this.stopTicker()
    const { error } = await this.db.rpc('close_game', {
      p_code: this.code,
      p_host_token: this.hostToken,
    })
    if (error) this.onError(error.message)
  }

  // ---------------------------------------------------------
  // Acciones de jugadores (llegan vía tabla `actions`)
  // ---------------------------------------------------------

  async processAction(action: ActionRow) {
    if (action.type === 'answer') {
      const payload = (action.payload ?? {}) as { index?: unknown }
      const index = payload.index
      await this.answer(action.player_id, index === null ? null : (index as number))
    }
    await this.db.rpc('clear_actions', {
      p_code: this.code,
      p_host_token: this.hostToken,
      p_ids: [action.id],
    })
  }

  private async answer(playerId: string, index: number | null) {
    if (this.state.stage !== 'question' || !this.state.active) return this.fail('No hay pregunta activa')
    if (this.getTeamIndex(playerId) !== this.state.turnTeam) {
      return this.fail('No es el turno de tu equipo')
    }
    if (index !== null && (typeof index !== 'number' || index < 0 || index > 3)) {
      return this.fail('Respuesta inválida')
    }
    this.resolve(index)
    await this.write()
  }

  // ---------------------------------------------------------
  // Transiciones internas (puerto fiel de server/rooms.ts)
  // ---------------------------------------------------------

  private resolve(index: number | null) {
    const correct = this.pendingCorrect()
    this.state = {
      ...this.state,
      deadlineAt: null,
      correctIndex: correct,
      result: index === null ? 'timeout' : index === correct ? 'correct' : 'wrong',
      scores:
        index !== null && correct !== null && index === correct
          ? this.state.scores.map((s, i) => (i === this.state.turnTeam ? s + POINTS_PER_CORRECT : s))
          : this.state.scores,
      selected: index,
      stage: 'reveal',
    }
  }

  private pendingCorrect(): number | null {
    // La ordenación de opciones barajada está en state.active.options,
    // así que el índice correcto es la posición del texto correcto ahí.
    const id = this.state.active?.id
    if (!id) return null
    const question = this.bank.find((q) => q.id === id)
    if (!question) return null
    return this.state.active?.options.indexOf(question.options[question.correct]) ?? null
  }

  private resetTurn() {
    this.state = {
      ...this.state,
      stage: 'spin',
      categoryId: null,
      active: null,
      correctIndex: null,
      selected: null,
      result: null,
      deadlineAt: null,
    }
  }

  private async advance() {
    if (this.state.suddenDeath) {
      if (this.state.result === 'correct') return this.finish()
      const pos = this.state.tiedTeams.indexOf(this.state.turnTeam)
      this.state = {
        ...this.state,
        turnTeam: this.state.tiedTeams[(pos + 1) % this.state.tiedTeams.length],
        round: this.state.round + 1,
      }
      this.resetTurn()
      return this.write()
    }

    const available = this.state.config.categoryIds.filter((id) =>
      this.bank.some((q) => q.categoryId === id && !this.state.usedIds.includes(q.id)),
    )
    if (this.state.round < this.state.config.totalRounds && available.length > 0) {
      this.state = {
        ...this.state,
        turnTeam: (this.state.turnTeam + 1) % this.state.config.teams.length,
        round: this.state.round + 1,
      }
      this.resetTurn()
      return this.write()
    }

    const leaders = leadingTeams(this.state.scores)
    if (leaders.length > 1) {
      this.state = {
        ...this.state,
        suddenDeath: true,
        tiedTeams: leaders,
        turnTeam: leaders[0],
        round: this.state.round + 1,
      }
      this.resetTurn()
      return this.write()
    }

    return this.finish()
  }

  private async finish() {
    this.state = { ...this.state, phase: 'finished', deadlineAt: null }
    await this.write()
  }

  // ---------------------------------------------------------
  // Persistencia y ticker de tiempo
  // ---------------------------------------------------------

  private async write() {
    const { error } = await this.db.rpc('update_game', {
      p_code: this.code,
      p_host_token: this.hostToken,
      p_state: this.state,
    })
    if (error) return this.onError(error.message)
    this.onState(this.state)
  }

  private fail(message: string) {
    this.onError(message)
  }

  /** Reemplaza el setTimeout del servidor: deadline absoluto en el estado. */
  private startTicker() {
    this.ticker = window.setInterval(() => {
      if (this.state.stage === 'question' && this.state.active && this.state.deadlineAt !== null) {
        if (Date.now() >= this.state.deadlineAt) {
          this.resolve(null)
          void this.write()
        }
      }
    }, 1000)
  }

  private stopTicker() {
    if (this.ticker !== null) window.clearInterval(this.ticker)
    this.ticker = null
  }
}
