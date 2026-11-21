import { useEffect, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { GameOver } from '../components/GameOver'
import { BoardGame } from '../components/BoardGame'
import { useCatalog } from '../lib/catalog'
import { useRoomStore } from '../store/roomStore'

const initialCode = () => new URLSearchParams(window.location.search).get('c')?.toUpperCase() ?? ''

/**
 * Tablero opcional: se abre en una TV o tablet y sigue la partida
 * en solo lectura. No crea la sala ni ejecuta el motor.
 */
export function BoardView() {
  const watch = useRoomStore((s) => s.watch)
  const state = useRoomStore((s) => s.state)
  const resuming = useRoomStore((s) => s.resuming)
  const error = useRoomStore((s) => s.error)
  const loadCatalog = useCatalog((s) => s.load)
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    if (started.current) return
    started.current = true
    const initial = initialCode()
    if (initial) void watch(initial)
  }, [watch])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    await watch(code)
    setBusy(false)
  }

  if (resuming) return <Status text={error ?? 'Conectando al tablero…'} />

  if (!state) {
    return (
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="flex flex-col gap-6 pt-6"
      >
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs font-bold tracking-[0.3em] text-cyan uppercase">Pantalla principal</p>
          <h1 className="m-0 font-display text-5xl leading-none">Tablero</h1>
          <p className="m-0 text-sm text-muted">
            Mostrá la partida en una TV o tablet. La sala se crea desde un celular.
          </p>
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
          {busy ? 'Conectando…' : 'Ver tablero'}
        </button>
      </motion.form>
    )
  }

  if (state.phase === 'finished') {
    return <GameOver teams={state.config.teams} scores={state.scores} suddenDeath={state.suddenDeath} />
  }

  if (state.phase === 'lobby') {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="m-0 text-xs font-bold tracking-[0.3em] text-cyan uppercase">Sala</p>
        <p className="m-0 font-display text-[clamp(56px,12vw,96px)] tracking-[0.15em] text-yellow">{state.code}</p>
        <p className="m-0 max-w-120 text-muted">
          Entren desde <span className="font-bold text-paper">{window.location.origin}/unirse</span> y esperen
          a que el creador inicie la partida.
        </p>
      </div>
    )
  }

  return <BoardGame state={state} />
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
