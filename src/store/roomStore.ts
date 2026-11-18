import { create } from 'zustand'
import {
  ROOM_CLOSED,
  STATE_EVENT,
  type GameConfig,
  type HostCredentials,
  type PlayerCredentials,
  type PublicState,
} from '../../shared/protocol'
import { emit, socket } from '../lib/socket'

export type Mode = 'host' | 'player'

type RoomStore = {
  mode: Mode | null
  connected: boolean
  resuming: boolean
  state: PublicState | null
  lanIps: string[]
  playerId: string | null
  error: string | null
  enter: (mode: Mode) => void
  createRoom: (config: GameConfig) => Promise<boolean>
  joinRoom: (code: string) => Promise<boolean>
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

const errorOf = (res: { ok: false; error: string }) => res.error

export const storedPlayerCode = () => readStored<PlayerCredentials>(localStorage, PLAYER_KEY)?.code ?? null

export const useRoomStore = create<RoomStore>()((set, get) => {
  const resume = async () => {
    const { mode } = get()
    if (mode === 'host') {
      const creds = readStored<HostCredentials>(sessionStorage, HOST_KEY)
      if (!creds) return set({ state: null, resuming: false })
      set({ resuming: true })
      const res = await emit('host:resume', creds)
      if (res.ok) {
        set({ state: res.state as PublicState, lanIps: res.lanIps as string[], resuming: false, error: null })
      } else {
        clearHost()
        set({ state: null, resuming: false, error: errorOf(res) })
      }
      return
    }
    if (mode === 'player') {
      const creds = readStored<PlayerCredentials>(localStorage, PLAYER_KEY)
      if (!creds) return set({ state: null, resuming: false })
      set({ resuming: true })
      const res = await emit('player:join', { code: creds.code, token: creds.token })
      if (res.ok) {
        set({ state: res.state as PublicState, playerId: res.playerId as string, resuming: false, error: null })
      } else {
        clearPlayer()
        set({ state: null, playerId: null, resuming: false, error: errorOf(res) })
      }
    }
  }

  socket.on('connect', () => {
    set({ connected: true })
    void resume()
  })
  socket.on('disconnect', () => set({ connected: false }))
  socket.on(STATE_EVENT, (state: PublicState) => set({ state }))
  socket.on(ROOM_CLOSED, () => {
    clearHost()
    clearPlayer()
    set({ state: null, playerId: null, error: 'La sala se cerró' })
  })

  return {
    mode: null,
    connected: socket.connected,
    resuming: false,
    state: null,
    lanIps: [],
    playerId: null,
    error: null,

    enter: (mode) => {
      set({ mode, error: null })
      void resume()
    },

    createRoom: async (config) => {
      const res = await emit('host:create', config)
      if (!res.ok) {
        set({ error: errorOf(res) })
        return false
      }
      saveHost({ code: res.code as string, hostToken: res.hostToken as string })
      set({ state: res.state as PublicState, lanIps: res.lanIps as string[], error: null })
      return true
    },

    joinRoom: async (code) => {
      const normalized = code.trim().toUpperCase()
      const existing = readStored<PlayerCredentials>(localStorage, PLAYER_KEY)
      const res = await emit('player:join', {
        code: normalized,
        token: existing?.code === normalized ? existing.token : undefined,
      })
      if (!res.ok) {
        set({ error: errorOf(res) })
        return false
      }
      savePlayer({ code: normalized, token: res.token as string })
      set({ state: res.state as PublicState, playerId: res.playerId as string, error: null })
      return true
    },

    act: async (event, payload) => {
      const res = await emit(event, payload)
      if (!res.ok) {
        set({ error: errorOf(res) })
        return false
      }
      set({ error: null })
      return true
    },

    closeRoom: async () => {
      await emit('host:close')
      clearHost()
      set({ state: null, error: null })
    },

    leaveRoom: () => {
      clearPlayer()
      set({ state: null, playerId: null, error: null })
    },
  }
})
