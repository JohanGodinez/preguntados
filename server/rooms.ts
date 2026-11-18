import { randomBytes, randomInt } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import type { Server, Socket } from 'socket.io'
import { categories, questions } from '../src/data/questions'
import {
  POINTS_PER_CORRECT,
  ROOM_CLOSED,
  STATE_EVENT,
  type Ack,
  type GameConfig,
  type Phase,
  type PublicQuestion,
  type PublicState,
  type Result,
  type Stage,
} from '../shared/protocol'
import {
  getAvailableCategoryIds,
  getWheelCategoryIds,
  leadingTeams,
  pickQuestion,
  type PickedQuestion,
} from './game'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const TIMER_OPTIONS = [0, 10, 15, 20]
const HOST_GRACE_MS = 15 * 60 * 1000

type PlayerRecord = {
  id: string
  token: string
  name: string
  teamIndex: number | null
  socketId: string | null
}

type Room = {
  code: string
  hostToken: string
  hostSocketId: string | null
  hostGrace: NodeJS.Timeout | null
  config: GameConfig
  phase: Phase
  players: PlayerRecord[]
  scores: number[]
  round: number
  turnTeam: number
  suddenDeath: boolean
  tiedTeams: number[]
  stage: Stage
  categoryId: string | null
  pending: PickedQuestion | null
  active: PickedQuestion | null
  selected: number | null
  result: Result | null
  usedIds: string[]
  deadlineAt: number | null
  timer: NodeJS.Timeout | null
}

type Reply = (res: Ack) => void

type Session = { role: 'host'; code: string } | { role: 'player'; code: string; token: string }

const rooms = new Map<string, Room>()
const sessions = new Map<string, Session>()
let io: Server

export const initRooms = (server: Server) => {
  io = server
}

const lanIps = () =>
  Object.values(networkInterfaces())
    .flatMap((list) =>
      (list ?? []).filter(
        (i) => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'),
      ),
    )
    .map((i) => i.address)
    .sort((a, b) => lanScore(b) - lanScore(a))

// Prioriza rangos de LAN real (192.168 / 10 / 172.16-31) sobre VPN/Tailscale (100.64-127).
const lanScore = (ip: string): number => {
  if (ip.startsWith('192.168.')) return 3
  if (ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return 1
  return 0
}

const randomCode = () => {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

const createCode = () => {
  let code = randomCode()
  while (rooms.has(code)) code = randomCode()
  return code
}

const toPublicQuestion = (picked: PickedQuestion): PublicQuestion => ({
  id: picked.question.id,
  categoryId: picked.question.categoryId,
  text: picked.question.text,
  options: picked.options,
})

type Viewer = 'host' | { teamIndex: number | null }

const publicState = (room: Room, viewer: Viewer): PublicState => {
  const showQuestion = viewer === 'host' || (viewer.teamIndex !== null && viewer.teamIndex === room.turnTeam)
  return {
    code: room.code,
    phase: room.phase,
    config: room.config,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      teamIndex: p.teamIndex,
      online: p.socketId !== null,
    })),
    scores: room.scores,
    round: room.round,
    turnTeam: room.turnTeam,
    suddenDeath: room.suddenDeath,
    tiedTeams: room.tiedTeams,
    stage: room.stage,
    categoryId: room.categoryId,
    active: showQuestion && room.active ? toPublicQuestion(room.active) : null,
    correctIndex: showQuestion && room.stage === 'reveal' && room.active ? room.active.correctIndex : null,
    selected: showQuestion ? room.selected : null,
    result: showQuestion ? room.result : null,
    wheelCategoryIds: getWheelCategoryIds(room.config.categoryIds, room.usedIds, room.suddenDeath),
    deadlineIn: showQuestion && room.deadlineAt !== null ? Math.max(0, room.deadlineAt - Date.now()) : null,
    hostOnline: room.hostSocketId !== null,
  }
}

const broadcast = (room: Room) => {
  if (room.hostSocketId) io.to(room.hostSocketId).emit(STATE_EVENT, publicState(room, 'host'))
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit(STATE_EVENT, publicState(room, { teamIndex: p.teamIndex }))
  }
}

const clearTimer = (room: Room) => {
  if (room.timer) clearTimeout(room.timer)
  room.timer = null
  room.deadlineAt = null
}

const closeRoom = (room: Room) => {
  clearTimer(room)
  if (room.hostGrace) clearTimeout(room.hostGrace)
  io.to(room.code).emit(ROOM_CLOSED)
  for (const [id, session] of sessions) {
    if (session.code === room.code) sessions.delete(id)
  }
  rooms.delete(room.code)
}

const startTimer = (room: Room) => {
  clearTimer(room)
  const ms = room.config.timerSeconds * 1000
  if (ms === 0 || !room.active) return
  const questionId = room.active.question.id
  room.deadlineAt = Date.now() + ms
  room.timer = setTimeout(() => {
    if (room.stage === 'question' && room.active?.question.id === questionId) {
      resolveAnswer(room, null)
    }
  }, ms)
}

const resolveAnswer = (room: Room, index: number | null) => {
  if (room.stage !== 'question' || !room.active) return
  clearTimer(room)
  const correct = index !== null && index === room.active.correctIndex
  room.result = index === null ? 'timeout' : correct ? 'correct' : 'wrong'
  if (correct) room.scores[room.turnTeam] += POINTS_PER_CORRECT
  room.selected = index
  room.stage = 'reveal'
  broadcast(room)
}

const resetTurn = (room: Room) => {
  clearTimer(room)
  room.stage = 'spin'
  room.categoryId = null
  room.pending = null
  room.active = null
  room.selected = null
  room.result = null
}

const finishGame = (room: Room) => {
  clearTimer(room)
  room.phase = 'finished'
  broadcast(room)
}

const advance = (room: Room) => {
  if (room.suddenDeath) {
    if (room.result === 'correct') return finishGame(room)
    const pos = room.tiedTeams.indexOf(room.turnTeam)
    room.turnTeam = room.tiedTeams[(pos + 1) % room.tiedTeams.length]
    room.round += 1
    resetTurn(room)
    return broadcast(room)
  }

  const available = getAvailableCategoryIds(room.config.categoryIds, room.usedIds)
  if (room.round < room.config.totalRounds && available.length > 0) {
    room.turnTeam = (room.turnTeam + 1) % room.config.teams.length
    room.round += 1
    resetTurn(room)
    return broadcast(room)
  }

  const leaders = leadingTeams(room.scores)
  if (leaders.length > 1) {
    room.suddenDeath = true
    room.tiedTeams = leaders
    room.turnTeam = leaders[0]
    room.round += 1
    resetTurn(room)
    return broadcast(room)
  }

  finishGame(room)
}

const sanitizeConfig = (input: unknown): GameConfig | string => {
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

  const maxRounds = questions.filter((q) => categoryIds.includes(q.categoryId)).length
  const requested = typeof raw.totalRounds === 'number' ? Math.floor(raw.totalRounds) : 10
  const totalRounds = Math.min(Math.max(requested, 1), maxRounds)

  const timerSeconds = typeof raw.timerSeconds === 'number' && TIMER_OPTIONS.includes(raw.timerSeconds)
    ? raw.timerSeconds
    : 15

  return { teams, totalRounds, categoryIds, timerSeconds }
}

const findHostRoom = (session: Session | undefined) => {
  if (!session || session.role !== 'host') return null
  return rooms.get(session.code) ?? null
}

const findPlayer = (room: Room, token: string) => room.players.find((p) => p.token === token) ?? null

export const registerSocket = (socket: Socket) => {
  const reply = (ack: unknown): Reply | null => (typeof ack === 'function' ? (ack as Reply) : null)

  socket.on('host:create', (payload: unknown, ack: unknown) => {
    const send = reply(ack)
    const config = sanitizeConfig(payload)
    if (typeof config === 'string') return send?.({ ok: false, error: config })

    const code = createCode()
    const room: Room = {
      code,
      hostToken: randomBytes(16).toString('hex'),
      hostSocketId: socket.id,
      hostGrace: null,
      config,
      phase: 'lobby',
      players: [],
      scores: config.teams.map(() => 0),
      round: 1,
      turnTeam: 0,
      suddenDeath: false,
      tiedTeams: [],
      stage: 'spin',
      categoryId: null,
      pending: null,
      active: null,
      selected: null,
      result: null,
      usedIds: [],
      deadlineAt: null,
      timer: null,
    }
    rooms.set(code, room)
    sessions.set(socket.id, { role: 'host', code })
    socket.join(code)
    send?.({ ok: true, code, hostToken: room.hostToken, lanIps: lanIps(), state: publicState(room, 'host') })
    broadcast(room)
  })

  socket.on('host:resume', (payload: { code?: string; hostToken?: string }, ack: unknown) => {
    const send = reply(ack)
    const code = String(payload?.code ?? '').toUpperCase()
    const room = rooms.get(code)
    if (!room || room.hostToken !== payload?.hostToken) {
      return send?.({ ok: false, error: 'La sala no existe o ya terminó' })
    }
    room.hostSocketId = socket.id
    if (room.hostGrace) clearTimeout(room.hostGrace)
    room.hostGrace = null
    sessions.set(socket.id, { role: 'host', code })
    socket.join(code)
    send?.({ ok: true, lanIps: lanIps(), state: publicState(room, 'host') })
    broadcast(room)
  })

  socket.on('host:start', (_: unknown, ack: unknown) => {
    const send = reply(ack)
    const room = findHostRoom(sessions.get(socket.id))
    if (!room) return send?.({ ok: false, error: 'Sala no encontrada' })
    if (room.phase !== 'lobby') return send?.({ ok: false, error: 'La partida ya comenzó' })
    const emptyTeam = room.config.teams.some((_, i) => !room.players.some((p) => p.teamIndex === i))
    if (emptyTeam) return send?.({ ok: false, error: 'Cada equipo necesita al menos un jugador' })

    room.phase = 'playing'
    room.scores = room.config.teams.map(() => 0)
    room.round = 1
    room.turnTeam = 0
    room.suddenDeath = false
    room.tiedTeams = []
    room.usedIds = []
    resetTurn(room)
    send?.({ ok: true })
    broadcast(room)
  })

  socket.on('host:spin', (_: unknown, ack: unknown) => {
    const send = reply(ack)
    const room = findHostRoom(sessions.get(socket.id))
    if (!room || room.phase !== 'playing') return send?.({ ok: false, error: 'No hay partida activa' })
    if (room.stage !== 'spin' || room.categoryId !== null) return send?.({ ok: false, error: 'Ya hay una categoría elegida' })

    const wheel = getWheelCategoryIds(room.config.categoryIds, room.usedIds, room.suddenDeath)
    if (wheel.length === 0) return send?.({ ok: false, error: 'No quedan preguntas' })
    const categoryId = wheel[randomInt(wheel.length)]
    const picked = pickQuestion(categoryId, room.usedIds)
    if (!picked) return send?.({ ok: false, error: 'No quedan preguntas' })

    room.pending = picked
    room.categoryId = categoryId
    send?.({ ok: true })
    broadcast(room)
  })

  socket.on('host:show', (_: unknown, ack: unknown) => {
    const send = reply(ack)
    const room = findHostRoom(sessions.get(socket.id))
    if (!room || !room.pending) return send?.({ ok: false, error: 'No hay pregunta lista' })

    room.active = room.pending
    room.pending = null
    room.usedIds.push(room.active.question.id)
    room.stage = 'question'
    room.selected = null
    room.result = null
    startTimer(room)
    send?.({ ok: true })
    broadcast(room)
  })

  socket.on('host:next', (_: unknown, ack: unknown) => {
    const send = reply(ack)
    const room = findHostRoom(sessions.get(socket.id))
    if (!room || room.phase !== 'playing' || room.stage !== 'reveal') {
      return send?.({ ok: false, error: 'Todavía no se puede avanzar' })
    }
    send?.({ ok: true })
    advance(room)
  })

  socket.on('host:close', (_: unknown, ack: unknown) => {
    const send = reply(ack)
    const room = findHostRoom(sessions.get(socket.id))
    if (!room) return send?.({ ok: false, error: 'Sala no encontrada' })
    send?.({ ok: true })
    closeRoom(room)
  })

  socket.on('player:join', (payload: { code?: string; token?: string; name?: string }, ack: unknown) => {
    const send = reply(ack)
    const code = String(payload?.code ?? '').toUpperCase().trim()
    const room = rooms.get(code)
    if (!room) return send?.({ ok: false, error: 'No existe una sala con ese código' })

    const existing = payload?.token ? findPlayer(room, payload.token) : null
    let player: PlayerRecord
    if (existing) {
      player = existing
    } else {
      if (room.phase === 'finished') return send?.({ ok: false, error: 'La partida ya terminó' })
      const name = String(payload?.name ?? '').trim().slice(0, 18) || `Jugador ${room.players.length + 1}`
      player = {
        id: randomBytes(4).toString('hex'),
        token: randomBytes(16).toString('hex'),
        name,
        teamIndex: null,
        socketId: null,
      }
      room.players.push(player)
    }

    player.socketId = socket.id
    sessions.set(socket.id, { role: 'player', code, token: player.token })
    socket.join(code)
    send?.({ ok: true, token: player.token, playerId: player.id, state: publicState(room, { teamIndex: player.teamIndex }) })
    broadcast(room)
  })

  socket.on('player:team', (payload: { teamIndex?: number }, ack: unknown) => {
    const send = reply(ack)
    const session = sessions.get(socket.id)
    if (!session || session.role !== 'player') return send?.({ ok: false, error: 'No estás en una sala' })
    const room = rooms.get(session.code)
    const player = room ? findPlayer(room, session.token) : null
    if (!room || !player) return send?.({ ok: false, error: 'No estás en una sala' })
    if (room.phase !== 'lobby') return send?.({ ok: false, error: 'Los equipos ya están fijos' })
    const teamIndex = payload?.teamIndex
    if (typeof teamIndex !== 'number' || !room.config.teams[teamIndex]) {
      return send?.({ ok: false, error: 'Equipo inválido' })
    }
    player.teamIndex = teamIndex
    send?.({ ok: true })
    broadcast(room)
  })

  socket.on('player:answer', (payload: { index?: number | null }, ack: unknown) => {
    const send = reply(ack)
    const session = sessions.get(socket.id)
    if (!session || session.role !== 'player') return send?.({ ok: false, error: 'No estás en una sala' })
    const room = rooms.get(session.code)
    const player = room ? findPlayer(room, session.token) : null
    if (!room || !player) return send?.({ ok: false, error: 'No estás en una sala' })
    if (room.stage !== 'question') return send?.({ ok: false, error: 'No hay pregunta activa' })
    if (player.teamIndex !== room.turnTeam) return send?.({ ok: false, error: 'No es el turno de tu equipo' })
    const index = payload?.index
    if (index !== null && (typeof index !== 'number' || index < 0 || index > 3)) {
      return send?.({ ok: false, error: 'Respuesta inválida' })
    }
    send?.({ ok: true })
    resolveAnswer(room, index)
  })

  socket.on('disconnect', () => {
    const session = sessions.get(socket.id)
    sessions.delete(socket.id)
    if (!session) return
    const room = rooms.get(session.code)
    if (!room) return

    if (session.role === 'host') {
      room.hostSocketId = null
      room.hostGrace = setTimeout(() => {
        if (room.hostSocketId === null) closeRoom(room)
      }, HOST_GRACE_MS)
    } else {
      const player = findPlayer(room, session.token)
      if (player) player.socketId = null
    }
    broadcast(room)
  })
}
