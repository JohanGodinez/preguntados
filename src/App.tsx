import { motion } from 'framer-motion'
import { HostView } from './views/HostView'
import { PlayerView } from './views/PlayerView'
import { SoundToggle } from './components/SoundToggle'

function Home() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-10 pt-10"
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] font-bold tracking-[0.32em] text-cyan uppercase">Trivia por equipos</p>
        <h1 className="m-0 font-display text-[clamp(56px,11vw,128px)] leading-[0.9] [text-shadow:4px_4px_0_var(--color-pink),-2px_-2px_0_var(--color-cyan)]">
          Pregun<span className="text-yellow">tados</span>
        </h1>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <a
          href="/host"
          className="flex flex-col gap-3 rounded-[22px] border border-line bg-ink-2/85 p-7 no-underline transition-colors hover:border-yellow"
        >
          <span className="font-display text-2xl text-yellow">Pantalla principal</span>
          <span className="text-muted">Crea la sala, muestra el código y gira la ruleta.</span>
        </a>
        <a
          href="/unirse"
          className="flex flex-col gap-3 rounded-[22px] border border-line bg-ink-2/85 p-7 no-underline transition-colors hover:border-cyan"
        >
          <span className="font-display text-2xl text-cyan">Unirse desde el celular</span>
          <span className="text-muted">Escribe el código de la sala o escanea el QR.</span>
        </a>
      </div>
    </motion.div>
  )
}

function App() {
  const path = window.location.pathname

  let view = <Home />
  if (path.startsWith('/host')) view = <HostView />
  else if (path.startsWith('/unirse')) view = <PlayerView />

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
