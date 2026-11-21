import type { PublicState } from '../../shared/protocol'

/** Estado de respuesta por equipo durante la pregunta. */
export function TeamStatus({ state }: { state: PublicState }) {
  const { config, answers, suddenDeath, tiedTeams } = state
  return (
    <ul className="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
      {config.teams.map((name, i) => {
        const out = suddenDeath && !tiedTeams.includes(i)
        const answered = answers[i] !== null
        return (
          <li
            key={i}
            style={{ ['--team' as string]: `var(--team-${i % 6})` }}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
              out
                ? 'border-line text-muted opacity-50'
                : answered
                  ? 'border-(--team) bg-[color-mix(in_srgb,var(--team)_18%,transparent)] text-paper'
                  : 'border-line text-muted'
            }`}
          >
            <span className="size-2 rounded-full bg-(--team)" aria-hidden="true" />
            <span className="max-w-28 truncate">{name}</span>
            <span className="tracking-[0.08em] uppercase">{out ? 'fuera' : answered ? 'respondió' : 'pensando'}</span>
          </li>
        )
      })}
    </ul>
  )
}
