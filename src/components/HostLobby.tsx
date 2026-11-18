import { AnimatePresence, motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import type { PublicState } from '../../shared/protocol'
import { useRoomStore } from '../store/roomStore'

type Props = {
  state: PublicState
}

const joinUrl = (code: string) => `${window.location.origin}/unirse?c=${code}`

export function HostLobby({ state }: Props) {
  const act = useRoomStore((s) => s.act)
  const closeRoom = useRoomStore((s) => s.closeRoom)
  const error = useRoomStore((s) => s.error)

  const url = joinUrl(state.code)
  const unassigned = state.players.filter((p) => p.teamIndex === null)
  const teamsReady = state.config.teams.every((_, i) => state.players.some((p) => p.teamIndex === i))

  return (
    <div className="flex flex-col gap-8">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-start gap-2"
      >
        <p className="text-xs font-bold tracking-[0.3em] text-cyan uppercase">Sala de espera</p>
        <h1 className="m-0 font-display text-[clamp(40px,7vw,72px)] leading-none">Únete desde tu celular</h1>
      </motion.header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr]">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 rounded-[22px] border border-line bg-ink-2/85 p-6"
        >
          <div className="rounded-2xl bg-paper p-3">
            <QRCodeSVG value={url} size={200} bgColor="#f6f1ff" fgColor="#09071a" level="M" />
          </div>
          <div className="text-center">
            <p className="m-0 text-xs font-bold tracking-[0.25em] text-muted uppercase">Código</p>
            <p className="m-0 font-display text-5xl tracking-[0.15em] text-yellow">{state.code}</p>
          </div>
          <p className="m-0 max-w-55 text-center text-sm break-all text-muted">{url}</p>
        </motion.div>

        <div className="grid grid-cols-1 gap-3 self-start sm:grid-cols-2">
          {state.config.teams.map((name, i) => {
            const members = state.players.filter((p) => p.teamIndex === i)
            return (
              <motion.section
                key={i}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ ['--team' as string]: `var(--team-${i % 6})` }}
                className="flex min-h-32 flex-col gap-2 rounded-2xl border border-line border-t-4 border-t-(--team) bg-ink-2/85 p-4"
              >
                <div className="flex items-baseline justify-between">
                  <span className="truncate font-display text-lg text-(--team)">{name}</span>
                  <span className="text-xs font-bold text-muted">{members.length}</span>
                </div>
                <AnimatePresence initial={false}>
                  {members.map((p) => (
                    <motion.span
                      key={p.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className={`text-sm font-semibold ${p.online ? 'text-paper' : 'text-muted line-through'}`}
                    >
                      {p.name}
                    </motion.span>
                  ))}
                </AnimatePresence>
                {members.length === 0 ? <span className="text-sm text-muted">Sin jugadores</span> : null}
              </motion.section>
            )
          })}
        </div>
      </div>

      {unassigned.length > 0 ? (
        <p className="m-0 text-sm text-muted">
          Esperando que elijan equipo: {unassigned.map((p) => p.name).join(', ')}
        </p>
      ) : null}

      {error ? <p className="m-0 text-sm font-bold text-red">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-4">
        <motion.button
          whileHover={teamsReady ? { y: -2 } : undefined}
          whileTap={teamsReady ? { scale: 0.97 } : undefined}
          disabled={!teamsReady}
          onClick={() => void act('host:start')}
          className="cursor-pointer rounded-full bg-linear-to-br from-yellow to-pink px-10 py-4.5 font-display text-lg text-ink uppercase shadow-[0_10px_30px_-8px_rgb(255_61_127/0.7)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Iniciar partida
        </motion.button>
        <button
          onClick={() => void closeRoom()}
          className="cursor-pointer rounded-full border border-line px-5 py-3 font-semibold text-muted hover:border-red hover:text-red"
        >
          Cancelar sala
        </button>
        {teamsReady ? null : (
          <span className="text-sm text-muted">Cada equipo necesita al menos un jugador.</span>
        )}
      </div>
    </div>
  )
}
