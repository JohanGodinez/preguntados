import { useSettingsStore } from '../store/settingsStore'

export function SoundToggle() {
  const soundOn = useSettingsStore((s) => s.soundOn)
  const toggleSound = useSettingsStore((s) => s.toggleSound)

  return (
    <button
      onClick={toggleSound}
      aria-pressed={soundOn}
      className="cursor-pointer rounded-full border border-line bg-paper/5 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-paper hover:text-paper sm:px-4 sm:py-2 sm:text-sm"
    >
      {soundOn ? 'Sonido: activado' : 'Sonido: silenciado'}
    </button>
  )
}
