import { useRef, useCallback, useEffect } from "react"

/**
 * Generic hook for playing sounds from external URLs.
 * Audio instances are preloaded on mount and cached for zero-latency playback.
 *
 * @param sounds - Map of sound keys to URLs (e.g. GitHub raw content URLs)
 * @returns { play } - Call play(key) to trigger a sound
 *
 * @example
 * const { play } = useSound({ boom: "https://example.com/boom.mp3" })
 * play("boom")
 */
export function useSound(sounds: Record<string, string>) {
  const audioMap = useRef<Map<string, HTMLAudioElement>>(new Map())

  // Preload all audio on mount so first play has no network lag
  useEffect(() => {
    for (const [key, url] of Object.entries(sounds)) {
      if (!audioMap.current.has(key)) {
        const audio = new Audio(url)
        audio.preload = "auto"
        audioMap.current.set(key, audio)
      }
    }
  }, [sounds])

  const play = useCallback(
    (key: string, volume: number = 1) => {
      const audio = audioMap.current.get(key)
      if (!audio) return

      if (document.hidden) return

      audio.volume = Math.max(0, Math.min(1, volume))
      audio.currentTime = 0
      audio.play().catch(() => {
        // Browser autoplay policy blocks audio before user interaction — safe to ignore
      })
    },
    [],
  )

  return { play }
}
