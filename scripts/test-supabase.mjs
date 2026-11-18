// Prueba de integración del backend Supabase (corre en Node, no se commitea).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const results = []
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'OK ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) process.exitCode = 1
}

// 1. Catálogo público
const cats = await sb.from('categories').select('id,name,color').order('id')
check('categories legible (anon)', !cats.error && cats.data?.length === 6, cats.error?.message ?? `${cats.data?.length} categorías`)
const qs = await sb.from('questions').select('id,text,options,correct')
check('questions SIN correct (column grants)', qs.error?.code === 'PGRST204' || (qs.error && /correct/.test(qs.error.message)), qs.error?.message ?? 'NO filtró la columna correct')
const qs2 = await sb.from('questions').select('id,category_id,text,options').limit(1)
check('questions legible sin correct', !qs2.error && qs2.data?.length === 1, qs2.error?.message ?? '')
const optsOk = Array.isArray(qs2.data?.[0]?.options) && qs2.data[0].options.length === 4
check('options como text[]', optsOk, JSON.stringify(qs2.data?.[0]?.options ?? []).slice(0, 60))

// 2. Crear sala
const initial = { phase: 'lobby', config: { teams: ['A', 'B'], totalRounds: 3, categoryIds: ['historia', 'ciencia'], timerSeconds: 15 }, scores: [0, 0], round: 1, turnTeam: 0, suddenDeath: false, tiedTeams: [], stage: 'spin', categoryId: null, active: null, correctIndex: null, selected: null, result: null, wheelCategoryIds: ['historia', 'ciencia'], deadlineAt: null, usedIds: [] }
const created = await sb.rpc('create_game', { p_config: initial.config, p_state: initial })
check('create_game RPC', !created.error && created.data?.[0]?.code, created.error?.message ?? `código ${created.data?.[0]?.code}`)
const code = created.data?.[0]?.code
const hostToken = created.data?.[0]?.host_token

// 3. get_questions (host)
const bank = await sb.rpc('get_questions', { p_code: code, p_host_token: hostToken })
check('get_questions (host) incluye correct', !bank.error && bank.data?.length > 0 && 'correct' in bank.data[0], bank.error?.message ?? `${bank.data?.length} preguntas`)

// 4. get_questions con token inválido
const badBank = await sb.rpc('get_questions', { p_code: code, p_host_token: 'nope' })
check('get_questions con token inválido → vacío', !badBank.error && (badBank.data?.length ?? 0) === 0, badBank.error?.message ?? `${badBank.data?.length} filas`)

// 5. join jugador
const joined = await sb.rpc('join_game', { p_code: code, p_name: 'Test Player', p_token: null })
check('join_game RPC', !joined.error && joined.data?.[0]?.player_id && joined.data?.[0]?.token, joined.error?.message ?? joined.data?.[0]?.player_id)
const playerId = joined.data?.[0]?.player_id
const playerToken = joined.data?.[0]?.token

// 6. set_team válido e inválido
const teamOk = await sb.rpc('set_team', { p_code: code, p_player_id: playerId, p_token: playerToken, p_team_index: 1 })
check('set_team (lobby)', !teamOk.error, teamOk.error?.message ?? '')
const teamBad = await sb.rpc('set_team', { p_code: code, p_player_id: playerId, p_token: 'bad-token', p_team_index: 0 })
check('set_team con token inválido → rechaza', !!teamBad.error, teamBad.error?.message ?? 'ACEPTÓ')
const teamBad2 = await sb.rpc('set_team', { p_code: code, p_player_id: playerId, p_token: playerToken, p_team_index: 5 })
check('set_team índice inválido → rechaza', !!teamBad2.error, teamBad2.error?.message ?? 'ACEPTÓ')

// 7. update_game (host)
const updated = { ...initial, phase: 'playing' }
const up = await sb.rpc('update_game', { p_code: code, p_host_token: hostToken, p_state: updated })
check('update_game (host)', !up.error, up.error?.message ?? '')
const readBack = await sb.from('games').select('state').eq('code', code).single()
check('estado actualizado legible', !readBack.error && readBack.data?.state?.phase === 'playing', readBack.error?.message ?? readBack.data?.state?.phase)
const upBad = await sb.rpc('update_game', { p_code: code, p_host_token: 'bad', p_state: updated })
check('update_game con token inválido → rechaza', !!upBad.error, upBad.error?.message ?? 'ACEPTÓ')

// 8. Acción de jugador + clear_actions
const act = await sb.from('actions').insert({ game_code: code, player_id: playerId, type: 'answer', payload: { index: 2 } }).select('id')
check('actions insert (anon)', !act.error, act.error?.message ?? `id ${act.data?.[0]?.id}`)
const cleared = await sb.rpc('clear_actions', { p_code: code, p_host_token: hostToken, p_ids: [act.data?.[0]?.id] })
check('clear_actions (host)', !cleared.error, cleared.error?.message ?? '')
const left = await sb.from('actions').select('id').eq('game_code', code)
check('acciones consumidas', !left.error && left.data?.length === 0, left.error?.message ?? `${left.data?.length} restantes`)

// 9. Rejoin con token
const rejoin = await sb.rpc('join_game', { p_code: code, p_name: '', p_token: playerToken })
check('rejoin con token → mismo jugador', !rejoin.error && rejoin.data?.[0]?.player_id === playerId, rejoin.error?.message ?? rejoin.data?.[0]?.player_id)

// 10. leave_game y cierre
const left2 = await sb.rpc('leave_game', { p_code: code, p_player_id: playerId, p_token: playerToken })
check('leave_game', !left2.error, left2.error?.message ?? '')
const closed = await sb.rpc('close_game', { p_code: code, p_host_token: hostToken })
check('close_game', !closed.error, closed.error?.message ?? '')
const gone = await sb.from('games').select('code').eq('code', code).maybeSingle()
check('sala eliminada (cascade)', !gone.error && !gone.data, gone.error?.message ?? 'aún existe')

console.log(results.join('\n'))
