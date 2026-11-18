import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { GameConfig } from '../../shared/protocol'
import { GameOver } from '../components/GameOver'
import { HostGame } from '../components/HostGame'
import { HostLobby } from '../components/HostLobby'
import { Setup } from '../components/Setup'
import { useRoomStore } from '../store/roomStore'

export function HostView() {
  const enter = useRoomStore((s) => s.enter)
  const state = useRoomStore((s) => s.state)
  const resuming = useRoomStore((s) => s.resuming)
  const connected = useRoomStore((s) => s.connected)
  const error = useRoomStore((s) => s.error)
  const createRoom = useRoomStore((s) => s.createRoom)
  const closeRoom = useRoomStore((s) => s.closeRoom)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    enter('host')
  }, [enter])

  const handleCreate = async (config: GameConfig) => {
    setBusy(true)
    await createRoom(config)
    setBusy(false)
  }

  if (!connected) {
    return <Status text={error ?? 'Conectando con el servidor…'} />
  }
  if (resuming) {
    return <Status text="Recuperando tu sala…" />
  }
  if (!state) {
    return (
      <>
        {error ? <p className="mb-4 text-sm font-bold text-red">{error}</p> : null}
        <Setup busy={busy} onSubmit={handleCreate} />
      </>
    )
  }
  if (state.phase === 'lobby') {
    return <HostLobby state={state} />
  }
  if (state.phase === 'playing') {
    return <HostGame state={state} />
  }
  return (
    <GameOver
      teams={state.config.teams}
      scores={state.scores}
      suddenDeath={state.suddenDeath}
      onNewGame={() => void closeRoom()}
    />
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
