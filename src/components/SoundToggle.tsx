import { useSettingsStore } from '../store/settingsStore'

export function SoundToggle() {
  const soundOn = useSettingsStore((s) => s.soundOn)
  const toggleSound = useSettingsStore((s) => s.toggleSound)

  return (
    <button
      onClick={toggleSound}
      aria-pressed={soundOn}
      className="cursor-pointer rounded-full border border-line bg-paper/5 px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-paper hover:text-paper"
    >
      {soundOn ? 'Sonido: activado' : 'Sonido: silenciado'}
    </button>
  )
}
