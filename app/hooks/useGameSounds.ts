import { useEffect, useRef } from "react"
import { GameState } from "../../shared/types"
import { useGameStore } from "../store/gameStore"
import { useSound } from "./useSound"

const BASE =
  "https://raw.githubusercontent.com/Laosing/bombparty-clone/main/client/src/audio"

export const GAME_SOUNDS: Record<string, string> = {
  error: `${BASE}/error.mp3`,
  explosion: `${BASE}/boom.mp3`,
  valid: `${BASE}/valid.mp3`,
  win: `${BASE}/winner.mp3`,
  bonus: `${BASE}/bonus-letter.mp3`,
  beep: `${BASE}/beep.mp3`,
  "beep-end": `${BASE}/beep-end.mp3`,
  "gained-heart": `${BASE}/gained-heart.wav`,
  joining: `${BASE}/joining.mp3`,
  leaving: `${BASE}/leaving.mp3`,
  "lobby-music": `${BASE}/lobby.m4a`,
  "lobby-music-2": `${BASE}/lobby-2.m4a`,
}

export function useGameSounds() {
  const { play } = useSound(GAME_SOUNDS)
  const pendingSounds = useGameStore((s) => s.pendingSounds)
  const clearSounds = useGameStore((s) => s.clearSounds)
  const players = useGameStore((s) => s.players)
  const serverState = useGameStore((s) => s.serverState)
  const gameState = useGameStore((s) => s.gameState)

  // Drain the sound queue
  useEffect(() => {
    if (pendingSounds.length === 0) return
    pendingSounds.forEach((key) => play(key))
    clearSounds()
  }, [pendingSounds, play, clearSounds])

  // Play joining/leaving sounds when player count changes
  const prevPlayerCount = useRef<number>(players.length)
  useEffect(() => {
    const prev = prevPlayerCount.current
    const curr = players.length
    if (curr > prev) play("joining")
    else if (curr < prev) play("leaving")
    prevPlayerCount.current = curr
  }, [players.length, play])

  // Play beep on each countdown tick
  const prevCountdown = useRef<number | null>(null)
  useEffect(() => {
    const countdown: number | null = serverState.countdown ?? null
    if (countdown !== null && countdown !== prevCountdown.current) {
      play("beep")
    }
    prevCountdown.current = countdown
  }, [serverState.countdown, play])

  // Play beep-end when the countdown phase ends (COUNTDOWN → PLAYING)
  const prevGameState = useRef<GameState>(gameState)
  useEffect(() => {
    if (
      prevGameState.current === GameState.COUNTDOWN &&
      gameState === GameState.PLAYING
    ) {
      play("beep-end")
    }
    prevGameState.current = gameState
  }, [gameState, play])
}
