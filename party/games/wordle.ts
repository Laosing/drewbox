import { BaseGame } from "../game-engine"
import {
  WordleClientMessageType,
  WordleSettingsSchema,
  GAME_CONFIG,
  GameState,
  ServerMessageType,
} from "../../shared/types"
import type * as Party from "partykit/server"
import type {
  WordleClientMessage,
  Guess,
  GuessResult,
} from "../../shared/types" // Updated type import

export class WordleGame extends BaseGame {
  targetWord: string = ""
  guesses: Guess[] = []

  activePlayerId: string | null = null
  turnStartTime: number = 0
  timer: number = 0
  maxTimer: number = GAME_CONFIG.WORDLE.TIMER.DEFAULT
  maxAttempts: number = GAME_CONFIG.WORDLE.ATTEMPTS.DEFAULT

  private tickInterval: ReturnType<typeof setTimeout> | null = null
  private nextTickTime: number = 0

  constructor(server: any) {
    super(server)
  }

  onStart(): void {
    if (this.players.size < 1) return
    if (!this.server.dictionaryReady) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Dictionary not loaded!",
      })
      return
    }

    this.server.gameState = GameState.PLAYING
    this.guesses = []

    // Reset all players to alive
    for (const p of this.players.values()) {
      p.isAlive = true
    }

    // Pick target word
    try {
      this.targetWord = this.server.dictionary.getRandomWord(5)
    } catch (e) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Failed to pick word",
      })
      this.endGame()
      return
    }

    this.startLoop()
    this.nextTurn(true)

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: "Wordle Game Started! Guess the 5-letter word.",
    })
  }

  onMessage(message: string, sender: Party.Connection): void {
    try {
      const data = JSON.parse(message) as WordleClientMessage // Cast to specific type
      switch (data.type) {
        case WordleClientMessageType.START_GAME:
          if (
            this.players.get(sender.id)?.isAdmin &&
            (this.server.gameState === GameState.LOBBY ||
              this.server.gameState === GameState.ENDED)
          ) {
            this.onStart()
          }
          break
        case WordleClientMessageType.STOP_GAME:
          if (
            this.players.get(sender.id)?.isAdmin &&
            this.server.gameState === GameState.PLAYING
          ) {
            this.endGame()
          }
          break
        case WordleClientMessageType.SUBMIT_WORD:
          if (
            this.server.gameState === GameState.PLAYING &&
            this.activePlayerId === sender.id
          ) {
            this.handleGuess(sender.id, data.word)
          }
          break
        case WordleClientMessageType.UPDATE_TYPING:
          if (
            this.server.gameState === GameState.PLAYING &&
            this.activePlayerId === sender.id
          ) {
            this.broadcast({
              type: ServerMessageType.TYPING_UPDATE,
              text: data.text,
            })
          }
          break
        case WordleClientMessageType.UPDATE_SETTINGS:
          if (this.players.get(sender.id)?.isAdmin) {
            const result = WordleSettingsSchema.safeParse(data)
            if (result.success) {
              const settings = result.data
              if (settings.maxTimer !== undefined)
                this.maxTimer = settings.maxTimer
              if (settings.maxAttempts !== undefined)
                this.maxAttempts = settings.maxAttempts
              if (settings.chatEnabled !== undefined)
                this.chatEnabled = settings.chatEnabled
              if (settings.gameLogEnabled !== undefined)
                this.gameLogEnabled = settings.gameLogEnabled

              this.server.broadcastState()
            }
          }
          break
      }
    } catch (e) {
      console.error(e)
    }
  }

  onTick(): void {
    if (this.server.gameState !== GameState.PLAYING) return

    this.timer -= 1
    this.broadcast({ type: ServerMessageType.STATE_UPDATE, timer: this.timer })

    if (this.timer <= 0) {
      this.handleTimeout()
    }
  }

  startLoop() {
    if (this.tickInterval) clearTimeout(this.tickInterval)
    this.nextTickTime = Date.now() + 1000
    this.tickInterval = setTimeout(() => this.loopStep(), 1000)
  }

  loopStep() {
    if (this.server.gameState !== GameState.PLAYING) return

    const now = Date.now()
    const drift = now - this.nextTickTime
    if (drift > 1000) this.nextTickTime = now

    this.onTick()

    this.nextTickTime += 1000
    const delay = Math.max(0, this.nextTickTime - Date.now())
    this.tickInterval = setTimeout(() => this.loopStep(), delay)
  }

  handleTimeout() {
    // Record a failed attempt due to timeout
    const results: GuessResult[] = [
      "absent",
      "absent",
      "absent",
      "absent",
      "absent",
    ]
    this.guesses.push({
      playerId: this.activePlayerId || "server",
      word: "?????",
      results,
      timestamp: Date.now(),
    })

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: "Time's up! Attempt lost.",
    })

    if (this.guesses.length >= this.maxAttempts) {
      this.endGame(null)
    } else {
      this.nextTurn()
    }
  }

  onPlayerJoin(player: any) {
    // If game is playing, mark new player as not alive (spectator) for this round
    if (this.server.gameState === GameState.PLAYING) {
      player.isAlive = false
      this.sendTo(player.id, {
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Game in progress. You are spectating until the next round.",
      })
    } else {
      player.isAlive = true
    }
  }

  nextTurn(isFirst: boolean = false) {
    if (this.server.gameState !== GameState.PLAYING) return

    // Only include players who were present at start (isAlive)
    const playerIds = Array.from(this.players.values())
      .filter((p) => p.isAlive)
      .map((p) => p.id)

    if (playerIds.length === 0) {
      this.endGame()
      return
    }

    if (isFirst) {
      this.activePlayerId = playerIds[0]
    } else if (this.activePlayerId) {
      const currentIndex = playerIds.indexOf(this.activePlayerId)
      // Find next player, wrapping around
      const nextIndex = (currentIndex + 1) % playerIds.length
      this.activePlayerId = playerIds[nextIndex]
    } else {
      this.activePlayerId = playerIds[0]
    }

    this.timer = this.maxTimer
    this.turnStartTime = Date.now()
    this.server.broadcastState()
  }

  handleGuess(playerId: string, word: string) {
    const upperWord = word.toUpperCase().trim()

    if (upperWord.length !== 5) return

    if (!this.server.dictionary.isWordValid(upperWord)) {
      this.sendTo(playerId, {
        type: ServerMessageType.ERROR,
        message: "Not in dictionary!",
        hide: true,
      })
      return
    }

    // Check result
    const results: GuessResult[] = []
    const targetChars = this.targetWord.split("")
    const guessChars = upperWord.split("")

    // First pass: Correct
    for (let i = 0; i < 5; i++) {
      if (guessChars[i] === targetChars[i]) {
        results[i] = "correct"
        targetChars[i] = "_"
        guessChars[i] = "_"
      }
    }

    // Second pass: Present
    for (let i = 0; i < 5; i++) {
      if (guessChars[i] !== "_") {
        const index = targetChars.indexOf(guessChars[i])
        if (index !== -1) {
          results[i] = "present"
          targetChars[index] = "_"
        } else {
          results[i] = "absent"
        }
      } else if (!results[i]) {
        // Should be correct already
        // results[i] = "correct" // Already set
      }
    }

    this.guesses.push({
      playerId,
      word: upperWord,
      results,
      timestamp: Date.now(),
    })

    if (upperWord === this.targetWord) {
      // Win!
      const p = this.players.get(playerId)
      if (p) {
        p.wins++
      }
      this.endGame(playerId)
    } else if (this.guesses.length >= this.maxAttempts) {
      this.endGame(null)
    } else {
      this.nextTurn()
    }
  }

  endGame(winnerId?: string | null) {
    this.server.gameState = GameState.ENDED
    if (this.tickInterval) clearTimeout(this.tickInterval)
    this.broadcast({
      type: ServerMessageType.GAME_OVER,
      winnerId,
      message: `The word was ${this.targetWord}`,
    })
    this.server.broadcastState()
  }

  getState(): Record<string, any> {
    return {
      guesses: this.guesses,
      activePlayerId: this.activePlayerId,
      timer: this.timer,
      maxTimer: this.maxTimer,
      maxAttempts: this.maxAttempts,
      chatEnabled: this.chatEnabled,
      gameLogEnabled: this.gameLogEnabled,
    }
  }
}
