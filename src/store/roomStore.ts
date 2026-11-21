import { create } from 'zustand'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import {
  type ActionRow,
  type GameConfig,
  type GameState,
  type HostCredentials,
  type PlayerCredentials,
  type PlayerRow,
  type PublicState,
  type Question,
} from '../../shared/protocol'
import { PLAYER_ACTIONS } from '../../shared/protocol'
import { HostEngine } from '../game/hostEngine'
import { initialState, sanitizeConfig } from '../game/engine'
import { supabase as db, isSupabaseConfigured, MISSING_CONFIG_ERROR } from '../lib/supabase'
import { useCatalog } from '../lib/catalog'

export type Mode = 'host' | 'player'

type RoomStore = {
  mode: Mode | null
  connected: boolean
  resuming: boolean
  state: PublicState | null
  playerId: string | null
  error: string | null
  enter: (mode: Mode) => void
  createRoom: (config: GameConfig, playerName: string) => Promise<boolean>
  joinRoom: (code: string, name: string) => Promise<boolean>
  watch: (code: string) => Promise<void>
  boardNext: () => Promise<void>
  act: (event: string, payload?: unknown) => Promise<boolean>
  closeRoom: () => Promise<void>
  leaveRoom: () => void
}

const HOST_KEY = 'preguntados-host'
const PLAYER_KEY = 'preguntados-player'

const readStored = <T>(storage: Storage, key: string): T | null => {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

const saveHost = (creds: HostCredentials) => sessionStorage.setItem(HOST_KEY, JSON.stringify(creds))
const clearHost = () => sessionStorage.removeItem(HOST_KEY)
const savePlayer = (creds: PlayerCredentials) => localStorage.setItem(PLAYER_KEY, JSON.stringify(creds))
const clearPlayer = () => localStorage.removeItem(PLAYER_KEY)

/** Restaura el estado si el host refrescó a mitad de giro (pending no persiste). */
const repairResumedState = (state: GameState): GameState => {
  const normalized: GameState = {
    ...state,
    answers: Array.isArray(state.answers) ? state.answers : state.config.teams.map(() => null),
    results: Array.isArray(state.results) ? state.results : state.config.teams.map(() => null),
    advanceAt: state.advanceAt ?? null,
  }
  if (normalized.phase === 'playing' && normalized.stage === 'spin' && normalized.categoryId !== null) {
    return { ...normalized, categoryId: null, answers: normalized.config.teams.map(() => null) }
  }
  return normalized
}

export const storedPlayerCode = () => readStored<PlayerCredentials>(localStorage, PLAYER_KEY)?.code ?? null

export const useRoomStore = create<RoomStore>()((set, get) => {
  const client: SupabaseClient | null = db

  // ---------------------------------------------------------
  // Fusión de estado: games.state + players + presence
  // ---------------------------------------------------------

  let gameRaw: GameState | null = null
  let playersRows: PlayerRow[] = []
  let presence: Record<string, Array<{ role?: string; playerId?: string }>> = {}
  let channel: RealtimeChannel | null = null
  let engine: HostEngine | null = null
  let actionQueue: Promise<void> = Promise.resolve()
  let currentCode: string | null = null
  let retrack: (() => void) | null = null

  const recompute = () => {
    if (!gameRaw || !currentCode) {
      set({ state: null })
      return
    }
    // Presencia: las entradas traen el playerId además de la clave del canal.
    const onlineIds = new Set<string>()
    let hostOnline = false
    for (const entries of Object.values(presence)) {
      for (const entry of entries) {
        if (entry.role === 'host') hostOnline = true
        if (entry.playerId) onlineIds.add(entry.playerId)
      }
    }
    // Salas creadas antes de la mecánica simultánea no tienen answers/results.
    const normalized: GameState = {
      ...gameRaw,
      answers: Array.isArray(gameRaw.answers) ? gameRaw.answers : gameRaw.config.teams.map(() => null),
      results: Array.isArray(gameRaw.results) ? gameRaw.results : gameRaw.config.teams.map(() => null),
      advanceAt: gameRaw.advanceAt ?? null,
    }
    const state: PublicState = {
      code: currentCode,
      ...normalized,
      players: playersRows.map((p) => ({
        id: p.id,
        name: p.name,
        teamIndex: p.team_index,
        online: onlineIds.has(p.id),
      })),
      hostOnline,
      deadlineIn:
        normalized.deadlineAt !== null ? Math.max(0, normalized.deadlineAt - Date.now()) : null,
      advanceIn:
        normalized.advanceAt !== null ? Math.max(0, Math.ceil((normalized.advanceAt - Date.now()) / 1000)) : null,
    }
    set({ state })
  }

  const teardownRoom = () => {
    engine?.dispose()
    engine = null
    if (channel) void client?.removeChannel(channel)
    channel = null
    retrack = null
    gameRaw = null
    playersRows = []
    presence = {}
    currentCode = null
  }

  const handleClosed = () => {
    teardownRoom()
    // El tablero también recibe este evento; no debe borrar credenciales ajenas.
    const { mode } = get()
    if (mode === 'host') clearHost()
    if (mode === 'player') clearPlayer()
    set({ state: null, playerId: null, error: 'La sala se cerró' })
  }

  const handleGameChange = (row: Record<string, unknown>) => {
    if (!row.state) return
    gameRaw = row.state as GameState
    recompute()
  }

  const handlePlayersChange = () => {
    void (async () => {
      if (!client || !currentCode) return
      const { data } = await client.from('players').select('game_code, id, name, team_index').eq('game_code', currentCode)
      playersRows = (data ?? []) as PlayerRow[]
      if (engine) engine.setPlayers(playersRows)
      recompute()
    })()
  }

  const handleActionInsert = (row: ActionRow) => {
    if (!engine) return
    actionQueue = actionQueue.then(async () => {
      const current = engine
      if (!current) return
      await current.processAction(row)
    }).catch(() => {})
  }

  const subscribeRoom = (code: string, presenceKey: string, role: 'host' | 'player' | 'board') => {
    if (!client) return
    currentCode = code
    const ch = client
      .channel(`room:${code}`, { config: { presence: { key: presenceKey } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `code=eq.${code}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return handleClosed()
          handleGameChange(payload.new as Record<string, unknown>)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_code=eq.${code}` },
        () => handlePlayersChange(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'actions', filter: `game_code=eq.${code}` },
        (payload) => handleActionInsert(payload.new as ActionRow),
      )
      .on('presence', { event: 'sync' }, () => {
        presence = ch.presenceState() as typeof presence
        recompute()
      })
    channel = ch
    // El creador puede registrarse como jugador DESPUÉS de suscribirse,
    // así que la pista de presencia se re-emite al entrar y con cada sync.
    retrack = () => {
      const playerId = get().playerId
      if (role === 'board') void ch.track({ role: 'board' })
      else if (role === 'host') void ch.track({ role: 'host', playerId })
      else void ch.track({ role: 'player', playerId: presenceKey })
    }
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        set({ error: null })
        retrack?.()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        set({ error: 'No se pudo conectar a Supabase Realtime' })
      }
    })
  }

  const fetchRoomSnapshot = async (code: string) => {
    if (!client) return
    const [game, players] = await Promise.all([
      client.from('games').select('code, state').eq('code', code).maybeSingle(),
      client.from('players').select('game_code, id, name, team_index').eq('game_code', code),
    ])
    if (game.error || players.error) {
      set({ error: game.error?.message ?? players.error?.message ?? 'Error de conexión' })
      return
    }
    if (!game.data) return handleClosed()
    playersRows = (players.data ?? []) as PlayerRow[]
    gameRaw = (game.data.state as GameState) ?? null
    if (engine) engine.setPlayers(playersRows)
    recompute()
  }

  const resume = async () => {
    const { mode } = get()
    if (!client) return set({ state: null, resuming: false })
    if (mode === 'host') {
      const creds = readStored<HostCredentials>(sessionStorage, HOST_KEY)
      if (!creds) return set({ state: null, resuming: false })
      set({ resuming: true })
      const { data, error } = await client.rpc('resume_game', { p_code: creds.code, p_host_token: creds.hostToken })
      if (error || !data) {
        clearHost()
        set({ state: null, resuming: false, error: error?.message ?? 'La sala no existe o ya terminó' })
        return
      }
      const bank = await loadBank(creds.code, creds.hostToken)
      if (!bank) return set({ state: null, resuming: false })
      // Limpia suscripciones previas ANTES de crear el engine,
      // porque teardownRoom() anula `engine`.
      teardownRoom()
      const fixed = repairResumedState(data as GameState)
      engine = new HostEngine({
        db: client,
        code: creds.code,
        hostToken: creds.hostToken,
        state: fixed,
        bank,
        onState: (s) => {
          gameRaw = s
          recompute()
        },
        onError: (message) => set({ error: message }),
      })
      subscribeRoom(creds.code, 'host', 'host')
      // El creador también juega: recupera su identidad de jugador.
      const playerCreds = readStored<PlayerCredentials>(localStorage, PLAYER_KEY)
      if (playerCreds?.code === creds.code) {
        await joinWithToken(creds.code, '', playerCreds.token)
        retrack?.()
      }
      await fetchRoomSnapshot(creds.code)
      set({ resuming: false, error: null })
      return
    }
    if (mode === 'player') {
      const creds = readStored<PlayerCredentials>(localStorage, PLAYER_KEY)
      if (!creds) return set({ state: null, playerId: null, resuming: false })
      set({ resuming: true })
      const joined = await joinWithToken(creds.code, '', creds.token)
      if (!joined) {
        set({ resuming: false })
        return
      }
      teardownRoom()
      subscribeRoom(creds.code, get().playerId ?? '', 'player')
      await fetchRoomSnapshot(creds.code)
      set({ resuming: false, error: null })
    }
  }

  const loadBank = async (code: string, hostToken: string): Promise<Question[] | null> => {
    if (!client) return null
    const { data, error } = await client.rpc('get_questions', { p_code: code, p_host_token: hostToken })
    if (error || !data) {
      set({ error: error?.message ?? 'No se pudieron cargar las preguntas' })
      return null
    }
    // PostgREST devuelve snake_case; el protocolo usa camelCase.
    return (data as Array<Record<string, unknown>>).map((q) => ({
      id: q.id as string,
      categoryId: q.category_id as string,
      text: q.text as string,
      options: q.options as string[] as Question['options'],
      correct: q.correct as Question['correct'],
    }))
  }

  const joinWithToken = async (
    code: string,
    name: string,
    token?: string,
  ): Promise<PlayerCredentials | null> => {
    if (!client) {
      set({ error: MISSING_CONFIG_ERROR })
      return null
    }
    const { data, error } = await client.rpc('join_game', {
      p_code: code,
      p_name: name,
      p_token: token ?? null,
    })
    if (error || !data) {
      if (token) clearPlayer()
      set({ error: error?.message ?? 'No se pudo entrar a la sala' })
      return null
    }
    const row = Array.isArray(data) ? data[0] : data
    const creds: PlayerCredentials = { code, token: row.token as string }
    savePlayer(creds)
    set({ playerId: row.player_id as string })
    return creds
  }

  // ---------------------------------------------------------
  // API del store (misma interfaz que usan las vistas)
  // ---------------------------------------------------------

  return {
    mode: null,
    connected: isSupabaseConfigured,
    resuming: false,
    state: null,
    playerId: null,
    error: isSupabaseConfigured ? null : MISSING_CONFIG_ERROR,

    enter: (mode) => {
      if (get().mode === mode) return
      set({ mode, error: client ? null : MISSING_CONFIG_ERROR })
      void resume()
    },

    createRoom: async (config, playerName) => {
      if (!client) {
        set({ error: MISSING_CONFIG_ERROR })
        return false
      }
      const catalog = useCatalog.getState()
      if (!catalog.loaded) await catalog.load()
      const valid = sanitizeConfig(config, catalog.categories, catalog.questions)
      if (typeof valid === 'string') {
        set({ error: valid })
        return false
      }
      const { data, error } = await client.rpc('create_game', {
        p_config: valid,
        p_state: initialState(valid),
      })
      if (error || !data) {
        set({ error: error?.message ?? 'No se pudo crear la sala' })
        return false
      }
      const row = Array.isArray(data) ? data[0] : data
      const code = row.code as string
      const hostToken = row.host_token as string

      const bank = await loadBank(code, hostToken)
      if (!bank) return false

      teardownRoom()
      engine = new HostEngine({
        db: client,
        code,
        hostToken,
        state: initialState(valid),
        bank,
        onState: (s) => {
          gameRaw = s
          recompute()
        },
        onError: (message) => set({ error: message }),
      })
      saveHost({ code, hostToken })
      subscribeRoom(code, 'host', 'host')
      // El creador entra como un jugador más: juega desde su misma pestaña.
      const joined = await joinWithToken(code, playerName.trim() || 'Jugador 1')
      retrack?.()
      if (!joined) {
        teardownRoom()
        clearHost()
        return false
      }
      await fetchRoomSnapshot(code)
      set({ error: null })
      return true
    },

    joinRoom: async (code, name) => {
      const normalized = code.trim().toUpperCase()
      const existing = readStored<PlayerCredentials>(localStorage, PLAYER_KEY)
      const creds = await joinWithToken(
        normalized,
        name,
        existing?.code === normalized ? existing.token : undefined,
      )
      if (!creds) return false
      teardownRoom()
      subscribeRoom(normalized, get().playerId ?? '', 'player')
      await fetchRoomSnapshot(normalized)
      set({ error: null })
      return true
    },

    // Tablero espectador: se suscribe sin credenciales ni motor.
    watch: async (code) => {
      if (!client) {
        set({ error: MISSING_CONFIG_ERROR })
        return
      }
      teardownRoom()
      set({ resuming: true, error: null })
      subscribeRoom(code.trim().toUpperCase(), `board-${Math.random().toString(36).slice(2, 8)}`, 'board')
      await fetchRoomSnapshot(code.trim().toUpperCase())
      set({ resuming: false })
    },

    // El tablero puede acelerar el reveal; el creador no necesita estar mirando.
    boardNext: async () => {
      if (!client || !currentCode) return
      const { error } = await client.from('actions').insert({
        game_code: currentCode,
        player_id: 'tablero',
        type: PLAYER_ACTIONS.NEXT,
        payload: {},
      })
      if (error) set({ error: error.message })
    },

    act: async (event, payload) => {
      if (!client) {
        set({ error: MISSING_CONFIG_ERROR })
        return false
      }
      // Acciones que ejecuta el motor en la pestaña del creador.
      if (event === 'host:start') {
        if (!engine) {
          set({ error: 'La partida no está activa en este dispositivo' })
          return false
        }
        await engine.start()
        set({ error: null })
        return true
      }
      // Acciones de jugador: valen igual para el creador y para el resto,
      // porque viajan por la tabla `actions` hasta el motor.
      const creds = readStored<PlayerCredentials>(localStorage, PLAYER_KEY)
      const playerId = get().playerId
      if (!creds || !playerId) {
        set({ error: 'No estás en una sala' })
        return false
      }
      if (event === 'player:team') {
        const teamIndex = (payload as { teamIndex?: number } | undefined)?.teamIndex
        const { error } = await client.rpc('set_team', {
          p_code: creds.code,
          p_player_id: playerId,
          p_token: creds.token,
          p_team_index: teamIndex ?? null,
        })
        if (error) {
          set({ error: error.message })
          return false
        }
        set({ error: null })
        return true
      }
      const type =
        event === 'player:answer'
          ? PLAYER_ACTIONS.ANSWER
          : event === 'player:spin'
            ? PLAYER_ACTIONS.SPIN
            : event === 'player:next'
              ? PLAYER_ACTIONS.NEXT
              : null
      if (!type) {
        set({ error: `Acción desconocida: ${event}` })
        return false
      }
      const { error } = await client.from('actions').insert({
        game_code: creds.code,
        player_id: playerId,
        type,
        payload: payload ?? {},
      })
      if (error) {
        set({ error: error.message })
        return false
      }
      set({ error: null })
      return true
    },

    closeRoom: async () => {
      if (engine) {
        await engine.close()
        engine = null
      }
      teardownRoom()
      clearHost()
      clearPlayer()
      set({ state: null, playerId: null, error: null })
    },

    leaveRoom: () => {
      const creds = readStored<PlayerCredentials>(localStorage, PLAYER_KEY)
      const playerId = get().playerId
      if (client && creds && playerId) {
        void client.rpc('leave_game', { p_code: creds.code, p_player_id: playerId, p_token: creds.token })
      }
      teardownRoom()
      clearPlayer()
      set({ state: null, playerId: null, error: null })
    },
  }
})
