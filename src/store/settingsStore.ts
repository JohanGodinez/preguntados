import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SettingsState = {
  soundOn: boolean
  toggleSound: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundOn: true,
      toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
    }),
    { name: 'preguntados-ajustes', version: 1 },
  ),
)
