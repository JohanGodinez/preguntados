// Prueba E2E del flujo del host: realtime + transiciones (corre en Node).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const initial = {
  phase: 'playing',
  config: { teams: ['A', 'B'], totalRounds: 3, categoryIds: ['historia', 'ciencia'], timerSeconds: 15 },
  scores: [0, 0], round: 1, turnTeam: 0, suddenDeath: false, tiedTeams: [],
  stage: 'spin', categoryId: null, active: null, correctIndex: null, selected: null,
  result: null, wheelCategoryIds: ['historia', 'ciencia'], deadlineAt: null, usedIds: [],
}

const created = await sb.rpc('create_game', { p_config: initial.config, p_state: initial })
const row = Array.isArray(created.data) ? created.data[0] : created.data
const code = row.code
const hostToken = row.host_token
console.log(`sala ${code} creada`)

// Canal realtime con los mismos filtros que usa roomStore.
const events = []
let subStatus = null
const ch = sb
  .channel(`room:${code}`, { config: { presence: { key: 'host' } } })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `code=eq.${code}` },
    (p) => events.push(['games', p.eventType]))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_code=eq.${code}` },
    (p) => events.push(['players', p.eventType]))
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actions', filter: `game_code=eq.${code}` },
    (p) => events.push(['actions', p.eventType]))
  .subscribe((status) => {
    subStatus = status
    if (status === 'SUBSCRIBED') console.log('realtime SUSCRITO')
  })

const waitSub = () => new Promise((res) => {
  const t0 = Date.now()
  const iv = setInterval(() => {
    if (subStatus === 'SUBSCRIBED' || Date.now() - t0 > 8000) { clearInterval(iv); res() }
  }, 200)
})
await waitSub()
console.log('estado de suscripción:', subStatus)

// Simula el "spin": update_game con categoryId (lo que hace HostEngine).
const spinState = { ...initial, categoryId: 'historia' }
const up = await sb.rpc('update_game', { p_code: code, p_host_token: hostToken, p_state: spinState })
console.log('update_game:', up.error ? `ERROR ${up.error.message}` : 'OK')

// Simula la acción de un jugador: insert en actions.
const ins = await sb.from('actions').insert({ game_code: code, player_id: 'testplayer', type: 'answer', payload: { index: 1 } })
console.log('insert action:', ins.error ? `ERROR ${ins.error.message}` : 'OK')

await new Promise((res) => setTimeout(res, 3000))
console.log('eventos realtime recibidos:', JSON.stringify(events))

const gotGame = events.some(([t, e]) => t === 'games' && e === 'UPDATE')
const gotAction = events.some(([t, e]) => t === 'actions' && e === 'INSERT')
console.log(`games UPDATE: ${gotGame ? 'OK' : 'FALLO'} | actions INSERT: ${gotAction ? 'OK' : 'FALLO'}`)

await sb.rpc('close_game', { p_code: code, p_host_token: hostToken })
console.log('sala cerrada')
process.exit(gotGame && gotAction ? 0 : 1)
