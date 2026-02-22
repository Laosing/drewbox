import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SoundStore {
  sfxEnabled: boolean
  musicEnabled: boolean
  sfxVolume: number
  musicVolume: number
  setSfxEnabled: (v: boolean) => void
  setMusicEnabled: (v: boolean) => void
  setSfxVolume: (v: number) => void
  setMusicVolume: (v: number) => void
}

export const useSoundStore = create<SoundStore>()(
  persist(
    (set) => ({
      sfxEnabled: true,
      musicEnabled: true,
      sfxVolume: 0.8,
      musicVolume: 0.5,
      setSfxEnabled: (sfxEnabled) => set({ sfxEnabled }),
      setMusicEnabled: (musicEnabled) => set({ musicEnabled }),
      setSfxVolume: (sfxVolume) => set({ sfxVolume }),
      setMusicVolume: (musicVolume) => set({ musicVolume }),
    }),
    { name: "drewbox-sound-settings" },
  ),
)
