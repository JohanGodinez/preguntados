import { useEffect, useState } from 'react'

type Props = {
  /** Segundos restantes en el momento en que aparece el reveal. */
  seconds: number
}

/** Cuenta atrás local del reveal; el motor avanza solo al terminar. */
export function AdvanceCountdown({ seconds }: Props) {
  const [endsAt] = useState(() => Date.now() + seconds * 1000)
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    }, 250)
    return () => window.clearInterval(id)
  }, [endsAt])

  return <span className="text-xs font-bold tracking-[0.2em] text-muted uppercase">Siguiente en {left}s</span>
}
