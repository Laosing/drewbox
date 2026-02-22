import { useEffect, useRef } from "react"
import { GameState } from "../../shared/types"
import { useGameStore } from "../store/gameStore"
import { useSoundStore } from "../store/soundStore"
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

  const { sfxEnabled, sfxVolume, musicEnabled, musicVolume } = useSoundStore()

  // Drain the sound queue
  useEffect(() => {
    if (pendingSounds.length === 0) return
    if (sfxEnabled) {
      pendingSounds.forEach((key) => play(key, sfxVolume))
    }
    clearSounds()
  }, [pendingSounds, play, clearSounds, sfxEnabled, sfxVolume])

  // Play joining/leaving sounds when player count changes
  const prevPlayerCount = useRef<number>(players.length)
  useEffect(() => {
    const prev = prevPlayerCount.current
    const curr = players.length
    if (sfxEnabled) {
      if (curr > prev) play("joining", sfxVolume)
      else if (curr < prev) play("leaving", sfxVolume)
    }
    prevPlayerCount.current = curr
  }, [players.length, play, sfxEnabled, sfxVolume])

  // Play beep on each countdown tick
  const prevCountdown = useRef<number | null>(null)
  useEffect(() => {
    const countdown: number | null = serverState.countdown ?? null
    if (countdown !== null && countdown !== prevCountdown.current) {
      if (sfxEnabled) play("beep", sfxVolume)
    }
    prevCountdown.current = countdown
  }, [serverState.countdown, play, sfxEnabled, sfxVolume])

  // Play beep-end when the countdown phase ends (COUNTDOWN → PLAYING)
  const prevGameState = useRef<GameState>(gameState)
  useEffect(() => {
    if (
      prevGameState.current === GameState.COUNTDOWN &&
      gameState === GameState.PLAYING
    ) {
      if (sfxEnabled) play("beep-end", sfxVolume)
    }
    prevGameState.current = gameState
  }, [gameState, play, sfxEnabled, sfxVolume])

  // Lobby music — loops while in LOBBY/ENDED state, stops during gameplay
  const lobbyMusic = useRef<HTMLAudioElement | null>(null)
  const shouldPlayMusic =
    musicEnabled && (gameState === GameState.LOBBY || gameState === GameState.ENDED)

  useEffect(() => {
    if (!lobbyMusic.current) {
      lobbyMusic.current = new Audio(GAME_SOUNDS["lobby-music"])
      lobbyMusic.current.loop = true
    }
    const music = lobbyMusic.current
    music.volume = musicVolume
    if (shouldPlayMusic && !document.hidden) {
      music.play().catch(() => {})
    } else {
      music.pause()
      if (!musicEnabled) music.currentTime = 0
    }
    return () => {
      music.pause()
    }
  }, [gameState, musicEnabled, musicVolume, shouldPlayMusic])

  // Pause/resume lobby music when the tab visibility changes
  useEffect(() => {
    const music = lobbyMusic.current
    if (!music) return

    const handleVisibility = () => {
      if (document.hidden) {
        music.pause()
      } else if (shouldPlayMusic) {
        music.play().catch(() => {})
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [shouldPlayMusic])
}
