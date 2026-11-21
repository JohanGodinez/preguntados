import { motion } from 'framer-motion'
import { BoardView } from './views/BoardView'
import { PlayView } from './views/PlayView'
import { SoundToggle } from './components/SoundToggle'

function Home() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-10 pt-10"
    >
      <div className="flex flex-col gap-3">
        <h1 className="m-0 font-display text-[clamp(56px,11vw,128px)] leading-[0.9] [text-shadow:4px_4px_0_var(--color-pink),-2px_-2px_0_var(--color-cyan)]">
          Pregun<span className="text-yellow">tados</span>
        </h1>
        <p className="m-0 max-w-140 text-muted">
          Ambos equipos responden la misma pregunta al mismo tiempo. El equipo en turno gira la
          ruleta; el que acierta suma puntos.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <a
          href="/crear"
          className="flex flex-col gap-3 rounded-[22px] border border-line bg-ink-2/85 p-7 no-underline transition-colors hover:border-yellow"
        >
          <span className="font-display text-2xl text-yellow">Crear sala</span>
          <span className="text-muted">Configurá equipos y jugá desde este dispositivo. No hace falta otra pantalla.</span>
        </a>
        <a
          href="/unirse"
          className="flex flex-col gap-3 rounded-[22px] border border-line bg-ink-2/85 p-7 no-underline transition-colors hover:border-cyan"
        >
          <span className="font-display text-2xl text-cyan">Unirse</span>
          <span className="text-muted">Entrá con el código de 5 letras o el QR que comparte el creador.</span>
        </a>
        <a
          href="/host"
          className="flex flex-col gap-3 rounded-[22px] border border-line bg-ink-2/85 p-7 no-underline transition-colors hover:border-pink"
        >
          <span className="font-display text-2xl text-pink">Tablero</span>
          <span className="text-muted">Pantalla grande opcional (TV o tablet) para que todos sigan la partida.</span>
        </a>
      </div>
    </motion.div>
  )
}

function App() {
  const path = window.location.pathname

  let view = <Home />
  if (path.startsWith('/crear')) view = <PlayView mode="host" />
  else if (path.startsWith('/unirse')) view = <PlayView mode="player" />
  else if (path.startsWith('/host') || path.startsWith('/tablero')) view = <BoardView />

  return (
    <main className="mx-auto flex min-h-dvh max-w-270 flex-col px-[max(1.25rem,var(--sal))] pt-[max(1.5rem,var(--sat))] pb-[max(1.25rem,var(--sab))] sm:pt-8 sm:pb-16">
      <div className="mb-2 flex justify-end sm:mb-4">
        <SoundToggle />
      </div>
      {view}
    </main>
  )
}

export default App
