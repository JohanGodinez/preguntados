import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ActionRow,
  GameState,
  PlayerRow,
  Question,
} from '../../shared/protocol'
import { POINTS_PER_CORRECT, REVEAL_MS } from '../../shared/protocol'
import {
  getWheelCategoryIds,
  leadingTeams,
  pickQuestion,
  toPublicQuestion,
  type PickedQuestion,
} from './engine'

/** Duración de la animación de la ruleta antes de mostrar la pregunta. */
const SPIN_MS = 4400

/**
 * Motor del juego que corre en la pestaña del creador de la sala.
 * Reemplaza al servidor de socket.io: mantiene el estado en memoria,
 * aplica las transiciones y persiste cada cambio en `games.state`
 * mediante la RPC `update_game`. Los demás clientes lo reciben por realtime.
 *
 * Mecánica: ambos equipos responden la misma pregunta al mismo tiempo.
 * El equipo en turno gira la ruleta; cada equipo suma puntos si acierta.
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
  private spinTimer: number | null = null
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
    this.clearSpinTimer()
  }

  setPlayers(players: PlayerRow[]) {
    this.players = players
  }

  getTeamIndex(playerId: string): number | null {
    return this.players.find((p) => p.id === playerId)?.team_index ?? null
  }

  // ---------------------------------------------------------
  // Acciones del creador
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
      answers: this.state.config.teams.map(() => null),
      results: this.state.config.teams.map(() => null),
      wheelCategoryIds: this.state.config.categoryIds,
      deadlineAt: null,
      advanceAt: null,
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

    // La pregunta aparece al terminar la animación, sin depender de
    // que alguien pulse nada: el creador puede estar jugando.
    this.clearSpinTimer()
    this.spinTimer = window.setTimeout(() => {
      this.spinTimer = null
      void this.show()
    }, SPIN_MS)
  }

  async show() {
    if (!this.pending) return
    if (this.state.stage !== 'spin') return
    const active = this.pending
    this.pending = null
    const ms = this.state.config.timerSeconds * 1000
    this.state = {
      ...this.state,
      active: toPublicQuestion(active),
      usedIds: [...this.state.usedIds, active.question.id],
      stage: 'question',
      answers: this.state.config.teams.map(() => null),
      results: this.state.config.teams.map(() => null),
      correctIndex: null,
      deadlineAt: ms === 0 ? null : Date.now() + ms,
      advanceAt: null,
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
    this.clearSpinTimer()
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
      const raw = payload.index
      const index = raw === null || raw === undefined ? null : Number(raw)
      if (index !== null && (Number.isNaN(index) || index < 0 || index > 3)) {
        this.fail('Respuesta inválida')
      } else {
        await this.answer(action.player_id, index)
      }
    } else if (action.type === 'spin') {
      await this.spinForPlayer(action.player_id)
    } else if (action.type === 'next') {
      if (this.state.stage === 'reveal') await this.advance()
    }
    await this.db.rpc('clear_actions', {
      p_code: this.code,
      p_host_token: this.hostToken,
      p_ids: [action.id],
    })
  }

  private async spinForPlayer(playerId: string) {
    if (this.state.phase !== 'playing' || this.state.stage !== 'spin') return
    const team = this.getTeamIndex(playerId)
    if (team === null) return this.fail('Elegí un equipo antes de girar')
    if (team !== this.state.turnTeam) return this.fail('No es el turno de tu equipo para girar')
    await this.spin()
  }

  /** Equipos que deben responder esta pregunta (en desempate, solo los empatados). */
  private pendingTeams(): number[] {
    const all = this.state.config.teams.map((_, i) => i)
    return this.state.suddenDeath ? this.state.tiedTeams : all
  }

  private async answer(playerId: string, index: number | null) {
    if (this.state.stage !== 'question' || !this.state.active) return this.fail('No hay pregunta activa')
    const team = this.getTeamIndex(playerId)
    if (team === null) return this.fail('Elegí un equipo antes de responder')
    if (!this.pendingTeams().includes(team)) {
      return this.fail('Tu equipo no está en el desempate')
    }
    // Una respuesta por equipo: la primera queda fija.
    if (this.state.answers[team] !== null) return

    this.state = {
      ...this.state,
      answers: this.state.answers.map((a, i) => (i === team ? index : a)),
    }
    if (this.pendingTeams().every((t) => this.state.answers[t] !== null)) {
      this.resolve()
    }
    await this.write()
  }

  // ---------------------------------------------------------
  // Transiciones internas
  // ---------------------------------------------------------

  private resolve() {
    const correct = this.pendingCorrect()
    const pending = this.pendingTeams()
    const results = this.state.answers.map((answer, team) => {
      if (!pending.includes(team)) return null
      if (answer === null) return 'timeout' as const
      return answer === correct ? ('correct' as const) : ('wrong' as const)
    })
    this.state = {
      ...this.state,
      deadlineAt: null,
      correctIndex: correct,
      results,
      scores: this.state.scores.map((score, team) =>
        results[team] === 'correct' ? score + POINTS_PER_CORRECT : score,
      ),
      stage: 'reveal',
      advanceAt: Date.now() + REVEAL_MS,
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
      answers: this.state.config.teams.map(() => null),
      results: this.state.config.teams.map(() => null),
      deadlineAt: null,
      advanceAt: null,
    }
  }

  private async advance() {
    // Blindaje ante el ticker y el botón "Siguiente" disparando a la vez.
    if (this.state.stage !== 'reveal') return
    if (this.state.suddenDeath) {
      const correctTeams = this.state.tiedTeams.filter((t) => this.state.results[t] === 'correct')
      if (correctTeams.length === 1) return this.finish()
      // Ninguno o ambos acertaron: otra pregunta de desempate entre los mismos.
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
    this.state = { ...this.state, phase: 'finished', deadlineAt: null, advanceAt: null }
    await this.write()
  }

  // ---------------------------------------------------------
  // Persistencia y temporizadores
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

  /** Ticker de 1 s: cierra la pregunta al vencer y avanza el reveal solo. */
  private startTicker() {
    this.ticker = window.setInterval(() => {
      if (this.state.phase !== 'playing') return
      if (this.state.stage === 'question' && this.state.active && this.state.deadlineAt !== null) {
        if (Date.now() >= this.state.deadlineAt) {
          this.resolve()
          void this.write()
        }
      } else if (this.state.stage === 'reveal' && this.state.advanceAt !== null) {
        if (Date.now() >= this.state.advanceAt) {
          void this.advance()
        }
      }
    }, 1000)
  }

  private stopTicker() {
    if (this.ticker !== null) window.clearInterval(this.ticker)
    this.ticker = null
  }

  private clearSpinTimer() {
    if (this.spinTimer !== null) window.clearTimeout(this.spinTimer)
    this.spinTimer = null
  }
}
