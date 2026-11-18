import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import type { PublicState } from '../../shared/protocol'
import { GameOver } from '../components/GameOver'
import { QuestionCard } from '../components/QuestionCard'
import { Scoreboard } from '../components/Scoreboard'
import { storedPlayerCode, useRoomStore } from '../store/roomStore'

export function PlayerView() {
  const enter = useRoomStore((s) => s.enter)
  const leaveRoom = useRoomStore((s) => s.leaveRoom)
  const state = useRoomStore((s) => s.state)
  const playerId = useRoomStore((s) => s.playerId)
  const resuming = useRoomStore((s) => s.resuming)
  const connected = useRoomStore((s) => s.connected)
  const error = useRoomStore((s) => s.error)

  const [initialCode] = useState(() => new URLSearchParams(window.location.search).get('c')?.toUpperCase() ?? '')

  useEffect(() => {
    if (initialCode && storedPlayerCode() !== initialCode) leaveRoom()
    enter('player')
  }, [enter, leaveRoom, initialCode])

  if (!connected) return <Status text={error ?? 'Conectando con el servidor…'} />
  if (resuming) return <Status text="Entrando a la sala…" />

  const me = state?.players.find((p) => p.id === playerId) ?? null
  if (!state || !me) {
    return <JoinForm initialCode={initialCode} />
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <span className="font-display text-sm tracking-[0.15em] text-muted">SALA {state.code}</span>
        <button
          onClick={leaveRoom}
          className="cursor-pointer text-xs font-bold tracking-[0.15em] text-muted uppercase hover:text-red"
        >
          Salir
        </button>
      </header>

      {error ? <p className="m-0 text-sm font-bold text-red">{error}</p> : null}

      {state.phase === 'lobby' ? <TeamPicker state={state} myTeam={me.teamIndex} /> : null}
      {state.phase === 'playing' ? <PlayerGame state={state} myTeam={me.teamIndex} /> : null}
      {state.phase === 'finished' ? (
        <GameOver teams={state.config.teams} scores={state.scores} suddenDeath={state.suddenDeath} />
      ) : null}
    </div>
  )
}

function Status({ text }: { text: string }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="m-0 pt-20 text-center font-display text-xl tracking-[0.1em] text-muted uppercase"
    >
      {text}
    </motion.p>
  )
}

function JoinForm({ initialCode }: { initialCode: string }) {
  const joinRoom = useRoomStore((s) => s.joinRoom)
  const error = useRoomStore((s) => s.error)
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    await joinRoom(code)
    setBusy(false)
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={submit}
      className="flex flex-col gap-6 pt-6"
    >
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs font-bold tracking-[0.3em] text-cyan uppercase">Unirse a una sala</p>
        <h1 className="m-0 font-display text-5xl leading-none">Preguntados</h1>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-muted">Código de la sala</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={5}
          autoCapitalize="characters"
          placeholder="ABCDE"
          className="rounded-xl border border-line bg-ink-2/85 px-4 py-4 text-center font-display text-3xl tracking-[0.2em] text-yellow uppercase outline-none focus:border-cyan"
        />
      </label>

      {error ? <p className="m-0 text-sm font-bold text-red">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="cursor-pointer rounded-full bg-linear-to-br from-yellow to-pink px-8 py-4 font-display text-lg text-ink uppercase shadow-[0_10px_30px_-8px_rgb(255_61_127/0.7)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </motion.form>
  )
}

function TeamPicker({ state, myTeam }: { state: PublicState; myTeam: number | null }) {
  const act = useRoomStore((s) => s.act)

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-xs font-bold tracking-[0.3em] text-cyan uppercase">Elige tu equipo</p>
        <p className="m-0 text-sm text-muted">Esperando a que el host inicie la partida.</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {state.config.teams.map((name, i) => {
          const selected = myTeam === i
          const count = state.players.filter((p) => p.teamIndex === i).length
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.98 }}
              onClick={() => void act('player:team', { teamIndex: i })}
              style={{ ['--team' as string]: `var(--team-${i % 6})`, background: selected ? 'var(--team)' : undefined }}
              className={`flex cursor-pointer items-center justify-between rounded-2xl border-2 px-5 py-5 text-left transition-colors ${
                selected ? 'border-(--team) text-ink' : 'border-line bg-ink-2/85 text-paper hover:border-(--team)'
              }`}
            >
              <span className="font-display text-xl">{name}</span>
              <span className="text-sm font-bold opacity-80">{count} {count === 1 ? 'jugador' : 'jugadores'}</span>
            </motion.button>
          )
        })}
      </div>
    </motion.section>
  )
}

function PlayerGame({ state, myTeam }: { state: PublicState; myTeam: number | null }) {
  const act = useRoomStore((s) => s.act)
  const { config, turnTeam, stage, active, categoryId, result, selected, correctIndex, suddenDeath, tiedTeams } = state
  const turnName = config.teams[turnTeam] ?? ''
  const isMyTurn = myTeam === turnTeam
  const benched = suddenDeath && myTeam !== null && !tiedTeams.includes(myTeam)

  let caption = ''
  if (stage === 'spin') caption = categoryId ? 'Girando la ruleta…' : 'El host va a girar la ruleta'
  if (stage === 'question') caption = isMyTurn ? '¡Es tu turno! Responde ya' : `Esperando la respuesta de ${turnName}…`
  if (stage === 'reveal') caption = 'Esperando al host para seguir'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-[0.25em] text-muted uppercase">
          {suddenDeath ? 'Muerte súbita' : `Ronda ${state.round} de ${config.totalRounds}`}
        </span>
        <span
          className="font-display text-3xl leading-tight text-(--team)"
          style={{ ['--team' as string]: `var(--team-${turnTeam % 6})` }}
        >
          Turno de {turnName}
        </span>
      </div>

      <Scoreboard teams={config.teams} scores={state.scores} activeIndex={turnTeam} eligible={suddenDeath ? tiedTeams : undefined} />

      {benched ? (
        <p className="m-0 text-sm font-bold text-muted">Tu equipo no está en el desempate; mira cómo juegan los demás.</p>
      ) : null}

      {stage === 'spin' || !active ? (
        <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="m-0 font-display text-xl tracking-[0.05em] text-muted uppercase">{caption}</p>
        </div>
      ) : (
        <>
          <p className={`m-0 text-center text-sm font-bold tracking-[0.2em] uppercase ${isMyTurn && stage === 'question' ? 'text-yellow' : 'text-muted'}`}>
            {caption}
          </p>
          <QuestionCard
            key={active.id}
            question={active}
            deadlineIn={stage === 'question' ? state.deadlineIn : null}
            correctIndex={correctIndex}
            selected={selected}
            result={result}
            onAnswer={isMyTurn && stage === 'question' && !benched ? (i) => void act('player:answer', { index: i }) : undefined}
          />
        </>
      )}
    </div>
  )
}
