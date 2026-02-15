import { BaseGame } from "../core/BaseGame"
import {
  WordleClientMessageType,
  GameState,
  ServerMessageType,
} from "../../shared/types"
import { WordleSettingsSchema, GAME_CONFIG } from "../../shared/config"
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
  winnerId: string | null | undefined = null
  turnStartTime: number = 0
  timer: number = 0
  maxTimer: number = GAME_CONFIG.WORDLE.TIMER.DEFAULT
  maxAttempts: number = GAME_CONFIG.WORDLE.ATTEMPTS.DEFAULT
  wordLength: number = GAME_CONFIG.WORDLE.LENGTH.DEFAULT

  constructor(context: any) {
    super(context)
  }

  onStart(reuseWord: boolean = false): void {
    if (this.players.size < 1) return
    if (!this.context.dictionaryReady) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Dictionary not loaded!",
      })
      return
    }

    this.context.gameState = GameState.PLAYING
    this.winnerId = null
    this.guesses = []

    // Reset all players to alive
    for (const p of this.players.values()) {
      p.isAlive = true
    }

    // Pick target word
    if (!reuseWord || !this.targetWord) {
      try {
        this.targetWord = this.context.dictionary.getRandomWord(this.wordLength)
      } catch (e) {
        this.broadcast({
          type: ServerMessageType.ERROR,
          message: "Failed to pick word",
        })
        this.endGame()
        return
      }
    }

    this.gameTimer.start()
    this.nextTurn(true)

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: `Wordle Game Started! Guess the ${this.wordLength}-letter word.`,
    })
  }

  onMessage(message: string, sender: Party.Connection): void {
    try {
      const data = JSON.parse(message) as WordleClientMessage // Cast to specific type
      switch (data.type) {
        case WordleClientMessageType.START_GAME:
          this.requestStartGame(sender.id, data.reuseWord)
          break
        case WordleClientMessageType.STOP_GAME:
          this.requestStopGame(sender.id)
          break
        case WordleClientMessageType.SUBMIT_WORD:
          this.submitWord(sender.id, data.word)
          break
        case WordleClientMessageType.UPDATE_TYPING:
          this.updateTyping(sender.id, data.text)
          break
        case WordleClientMessageType.UPDATE_SETTINGS:
          this.updateSettings(sender.id, data)
          break
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Public Action Methods
  public requestStartGame(playerId: string, reuseWord: boolean = false) {
    const player = this.players.get(playerId)
    if (
      player?.isAdmin &&
      (this.context.gameState === GameState.LOBBY ||
        this.context.gameState === GameState.ENDED)
    ) {
      this.onStart(reuseWord)
    }
  }

  public requestStopGame(playerId: string) {
    const player = this.players.get(playerId)
    if (player?.isAdmin && this.context.gameState === GameState.PLAYING) {
      this.endGame()
    }
  }

  public submitWord(playerId: string, word: string) {
    if (
      this.context.gameState === GameState.PLAYING &&
      this.activePlayerId === playerId
    ) {
      this.handleGuess(playerId, word)
    }
  }

  public updateTyping(playerId: string, text: string) {
    if (
      this.context.gameState === GameState.PLAYING &&
      this.activePlayerId === playerId
    ) {
      this.antiBot.trackTyping(playerId)
      this.broadcast({
        type: ServerMessageType.TYPING_UPDATE,
        text: text,
      })
    }
  }

  public updateSettings(playerId: string, settings: any) {
    const player = this.players.get(playerId)
    if (!player?.isAdmin) return

    const result = WordleSettingsSchema.safeParse(settings)
    if (result.success) {
      const s = result.data
      if (s.maxTimer !== undefined) this.maxTimer = s.maxTimer
      if (s.maxAttempts !== undefined) this.maxAttempts = s.maxAttempts
      if (s.wordLength !== undefined) this.wordLength = s.wordLength
      if (s.chatEnabled !== undefined) this.chatEnabled = s.chatEnabled
      if (s.gameLogEnabled !== undefined) this.gameLogEnabled = s.gameLogEnabled

      this.context.broadcastState()
    }
  }

  onTick(): void {
    if (this.context.gameState !== GameState.PLAYING) return

    this.timer -= 1
    this.broadcast({ type: ServerMessageType.STATE_UPDATE, timer: this.timer })

    if (this.timer <= 0) {
      this.handleTimeout()
    }
  }

  handleTimeout() {
    // Record a failed attempt due to timeout
    const currentLen = this.targetWord.length || this.wordLength
    const results: GuessResult[] = Array(currentLen).fill("absent")
    this.guesses.push({
      playerId: this.activePlayerId || "server",
      word: "?".repeat(currentLen),
      results,
      timestamp: Date.now(),
    })

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: "Time's up! Attempt lost.",
    })

    if (this.guesses.length >= this.maxAttempts) {
      this.broadcast({
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Max attempts reached! Game Over.",
      })
      this.endGame(null)
    } else {
      this.nextTurn()
    }
  }

  onPlayerJoin(player: any) {
    // If game is playing, mark new player as not alive (spectator) for this round
    if (this.context.gameState === GameState.PLAYING) {
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
    if (this.context.gameState !== GameState.PLAYING) return

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

    if (this.activePlayerId) {
      this.antiBot.clearTyping(this.activePlayerId)
    }

    this.timer = this.maxTimer
    this.turnStartTime = Date.now()
    this.context.broadcastState()
  }

  handleGuess(playerId: string, word: string) {
    const upperWord = word.toUpperCase().trim()
    const targetLen = this.targetWord.length

    // Bot Check
    const botCheck = this.antiBot.validateAction(playerId, this.turnStartTime)
    if (!botCheck.isValid) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: botCheck.reason || "Suspicious activity detected.",
      })
      return
    }

    if (upperWord.length !== targetLen) return

    if (!this.context.dictionary.isWordValid(upperWord)) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Not in my dictionary!",
      })
      return
    }

    // Check result
    const results: GuessResult[] = []
    const targetChars = this.targetWord.split("")
    const guessChars = upperWord.split("")

    // First pass: Correct
    for (let i = 0; i < targetLen; i++) {
      if (guessChars[i] === targetChars[i]) {
        results[i] = "correct"
        targetChars[i] = "_"
        guessChars[i] = "_"
      }
    }

    // Second pass: Present
    for (let i = 0; i < targetLen; i++) {
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
      this.broadcast({
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Max attempts reached! Game Over.",
      })
      this.endGame(null)
    } else {
      this.nextTurn()
    }
  }

  endGame(winnerId?: string | null) {
    this.context.gameState = GameState.ENDED
    this.winnerId = winnerId // Save winner for state sync
    this.gameTimer.stop()
    this.broadcast({
      type: ServerMessageType.GAME_OVER,
      winnerId,
      message: `The word was ${this.targetWord}`,
    })
    this.context.broadcastState()
  }

  getState(): Record<string, any> {
    return {
      guesses: this.guesses,
      activePlayerId: this.activePlayerId,
      winnerId: this.winnerId, // Send valid winner ID
      timer: this.timer,
      maxTimer: this.maxTimer,
      maxAttempts: this.maxAttempts,
      wordLength:
        this.context.gameState === GameState.PLAYING && this.targetWord
          ? this.targetWord.length
          : this.wordLength,
      chatEnabled: this.chatEnabled,
      gameLogEnabled: this.gameLogEnabled,
    }
  }
}
