import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import type { PublicState } from '../../shared/protocol'
import { AdvanceCountdown } from '../components/AdvanceCountdown'
import { GameOver } from '../components/GameOver'
import { HostLobby } from '../components/HostLobby'
import { QuestionCard } from '../components/QuestionCard'
import { Roulette } from '../components/Roulette'
import { Scoreboard } from '../components/Scoreboard'
import { Setup } from '../components/Setup'
import { TeamStatus } from '../components/TeamStatus'
import { useCatalog } from '../lib/catalog'
import { storedPlayerCode, useRoomStore } from '../store/roomStore'

type Props = {
  /** 'host' = creador (además es jugador); 'player' = resto de los equipos. */
  mode: 'host' | 'player'
}

export function PlayView({ mode }: Props) {
  const enter = useRoomStore((s) => s.enter)
  const leaveRoom = useRoomStore((s) => s.leaveRoom)
  const closeRoom = useRoomStore((s) => s.closeRoom)
  const createRoom = useRoomStore((s) => s.createRoom)
  const state = useRoomStore((s) => s.state)
  const playerId = useRoomStore((s) => s.playerId)
  const resuming = useRoomStore((s) => s.resuming)
  const connected = useRoomStore((s) => s.connected)
  const error = useRoomStore((s) => s.error)
  const loadCatalog = useCatalog((s) => s.load)

  const [busy, setBusy] = useState(false)
  const [initialCode] = useState(() => new URLSearchParams(window.location.search).get('c')?.toUpperCase() ?? '')
  const isCreator = mode === 'host'

  useEffect(() => {
    if (!isCreator && initialCode && storedPlayerCode() !== initialCode) leaveRoom()
    enter(mode)
    void loadCatalog()
  }, [enter, leaveRoom, loadCatalog, mode, isCreator, initialCode])

  const handleCreate = async (config: Parameters<typeof createRoom>[0], playerName: string) => {
    setBusy(true)
    await createRoom(config, playerName)
    setBusy(false)
  }

  if (!connected) return <Status text={error ?? 'Conectando con el servidor…'} />
  if (resuming) return <Status text={isCreator ? 'Preparando tu sala…' : 'Entrando a la sala…'} />

  if (!state) {
    if (!isCreator) {
      return (
        <>
          {error ? <p className="mb-4 text-sm font-bold text-red">{error}</p> : null}
          <JoinForm initialCode={initialCode} />
        </>
      )
    }
    return (
      <>
        {error ? <p className="mb-4 text-sm font-bold text-red">{error}</p> : null}
        <Setup busy={busy} onSubmit={handleCreate} />
      </>
    )
  }

  const me = state.players.find((p) => p.id === playerId) ?? null

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-sm tracking-[0.15em] text-muted">SALA {state.code}</span>
        <div className="flex items-center gap-4">
          {isCreator ? (
            <>
              <a
                href={`/host?c=${state.code}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold tracking-[0.15em] text-muted no-underline uppercase hover:text-cyan"
              >
                Abrir tablero
              </a>
              <button
                onClick={() => {
                  if (window.confirm('¿Cerrar la sala para todos?')) void closeRoom()
                }}
                className="cursor-pointer text-xs font-bold tracking-[0.15em] text-muted uppercase hover:text-red"
              >
                Cerrar sala
              </button>
            </>
          ) : (
            <button
              onClick={leaveRoom}
              className="cursor-pointer text-xs font-bold tracking-[0.15em] text-muted uppercase hover:text-red"
            >
              Salir
            </button>
          )}
        </div>
      </header>

      {error ? <p className="m-0 text-sm font-bold text-red">{error}</p> : null}

      {!me ? (
        <p className="m-0 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
          Estás mirando la sala pero tu jugador no está registrado en este dispositivo.
        </p>
      ) : null}

      {state.phase === 'lobby' ? (
        <>
          {isCreator ? <HostLobby state={state} /> : <CodeBadge code={state.code} />}
          {me ? <TeamPicker state={state} myTeam={me.teamIndex} /> : null}
        </>
      ) : null}

      {state.phase === 'playing' && me && me.teamIndex === null ? (
        <TeamPicker
          state={state}
          myTeam={null}
          note="La partida ya empezó: elegí tu equipo para jugar."
        />
      ) : null}

      {state.phase === 'playing' && me && me.teamIndex !== null ? (
        <PlayerGame state={state} myTeam={me.teamIndex} />
      ) : null}

      {state.phase === 'finished' ? (
        <GameOver
          teams={state.config.teams}
          scores={state.scores}
          suddenDeath={state.suddenDeath}
          onNewGame={isCreator ? () => void closeRoom() : undefined}
        />
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

function CodeBadge({ code }: { code: string }) {
  return (
    <div className="flex flex-col gap-1 text-center">
      <span className="text-xs font-bold tracking-[0.3em] text-cyan uppercase">Sala</span>
      <span className="font-display text-5xl tracking-[0.15em] text-yellow">{code}</span>
    </div>
  )
}

function JoinForm({ initialCode }: { initialCode: string }) {
  const joinRoom = useRoomStore((s) => s.joinRoom)
  const error = useRoomStore((s) => s.error)
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    await joinRoom(code, name.trim())
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

      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-muted">Tu nombre</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={14}
          placeholder="Jugador"
          className="rounded-xl border border-line bg-ink-2/85 px-4 py-3.5 text-lg font-semibold outline-none focus:border-cyan"
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

      <p className="m-0 text-sm text-muted">
        ¿Organizás la partida?{' '}
        <a href="/crear" className="font-bold text-cyan no-underline hover:underline">
          Crear una sala
        </a>
      </p>
    </motion.form>
  )
}

function TeamPicker({
  state,
  myTeam,
  note = 'Esperando a que el creador inicie la partida.',
}: {
  state: PublicState
  myTeam: number | null
  note?: string
}) {
  const act = useRoomStore((s) => s.act)

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-xs font-bold tracking-[0.3em] text-cyan uppercase">Elige tu equipo</p>
        <p className="m-0 text-sm text-muted">{note}</p>
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
              <span className="text-sm font-bold opacity-80">
                {count} {count === 1 ? 'jugador' : 'jugadores'}
              </span>
            </motion.button>
          )
        })}
      </div>
    </motion.section>
  )
}

function PlayerGame({ state, myTeam }: { state: PublicState; myTeam: number | null }) {
  const act = useRoomStore((s) => s.act)
  const catalogCategories = useCatalog((s) => s.categories)
  const { config, turnTeam, stage, active, categoryId, correctIndex, answers, results, suddenDeath, tiedTeams } = state
  const turnName = config.teams[turnTeam] ?? ''
  const isSpinner = myTeam === turnTeam
  const inTiebreak = !suddenDeath || (myTeam !== null && tiedTeams.includes(myTeam))
  const myAnswer = myTeam !== null ? (answers[myTeam] ?? null) : null
  const answered = stage === 'question' && myAnswer !== null
  const wheelCategories = catalogCategories.filter((c) => state.wheelCategoryIds.includes(c.id))

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
          {stage === 'spin' ? (isSpinner ? 'Tu turno de girar' : `Gira ${turnName}`) : 'Responden ambos equipos'}
        </span>
      </div>

      <Scoreboard compact teams={config.teams} scores={state.scores} activeIndex={turnTeam} eligible={suddenDeath ? tiedTeams : undefined} />

      {stage === 'spin' ? (
        <div className="flex flex-col items-center gap-6 pb-20">
          <p className="m-0 text-center text-sm font-bold tracking-[0.2em] text-muted uppercase">
            {isSpinner ? 'Girá y elegí la categoría' : `Esperando el giro de ${turnName}…`}
          </p>
          <Roulette
            categories={wheelCategories}
            target={categoryId}
            onSpin={isSpinner ? () => void act('player:spin') : undefined}
            spinLabel="Girar"
          />
        </div>
      ) : null}

      {stage !== 'spin' && active ? (
        <div className="flex flex-col gap-5">
          {stage === 'question' ? <TeamStatus state={state} /> : null}

          {stage === 'question' && !inTiebreak ? (
            <p className="m-0 rounded-2xl border border-dashed border-line p-6 text-center font-display text-xl tracking-[0.05em] text-muted uppercase">
              Tu equipo no está en el desempate; mirá cómo juegan los demás.
            </p>
          ) : (
            <>
              <QuestionCard
                question={active}
                deadlineIn={stage === 'question' ? state.deadlineIn : null}
                correctIndex={correctIndex}
                answers={answers}
                results={results}
                teams={config.teams}
                myTeamIndex={myTeam}
                onAnswer={
                  stage === 'question' && !answered
                    ? (i) => void act('player:answer', { index: i })
                    : undefined
                }
              />

              {answered ? (
                <p className="m-0 text-center text-sm font-bold tracking-[0.2em] text-cyan uppercase">
                  Respuesta enviada. Esperando al otro equipo…
                </p>
              ) : null}

              {stage === 'reveal' && state.advanceIn !== null ? (
                <div className="flex justify-center">
                  <AdvanceCountdown seconds={state.advanceIn} />
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
