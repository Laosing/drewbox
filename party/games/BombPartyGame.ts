import { BaseGame } from "../core/BaseGame"
import {
  BombPartyClientMessageType,
  GameState,
  ServerMessageType,
} from "../../shared/types"
import { BombPartySettingsSchema, GAME_CONFIG } from "../../shared/config"
import type { BombPartyClientMessage } from "../../shared/types"
import type * as Party from "partykit/server"

export class BombPartyGame extends BaseGame {
  // ... (keep props)
  // Game State
  currentSyllable: string = ""
  usedWords: Set<string> = new Set()
  activePlayerId: string | null = null
  timer: number = 0
  maxTimer: number = GAME_CONFIG.BOMB_PARTY.TIMER.DEFAULT
  startingLives: number = GAME_CONFIG.BOMB_PARTY.LIVES.DEFAULT
  syllableChangeThreshold: number =
    GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.DEFAULT
  bonusLettersEnabled: boolean = true
  bonusWordLength: number = GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.DEFAULT
  hardModeEnabled: boolean = true
  hardModeStartRound: number = GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.DEFAULT
  syllableTurnCount: number = 0
  round: number = 0 // Track current round
  playersPlayedInRound: Set<string> = new Set()
  winnerId: string | null = null
  countdown: number | null = null

  turnStartTime: number = 0

  constructor(context: any) {
    super(context)
    // Initialize defaults
  }

  onStart(): void {
    if (this.players.size < 1) return
    if (!this.context.dictionaryReady) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Dictionary not loaded!",
      })
      return
    }

    // Enter countdown phase
    this.context.gameState = GameState.COUNTDOWN
    this.countdown = 5
    this.winnerId = null
    this.gameTimer.start()
    this.context.broadcastState()
  }

  private startGame(): void {
    this.context.gameState = GameState.PLAYING
    this.countdown = null
    this.usedWords.clear()
    this.context.initialAliveCount = this.players.size
    this.syllableTurnCount = 0
    this.round = 1
    this.playersPlayedInRound.clear()

    for (const p of this.players.values()) {
      p.lives = this.startingLives
      p.isAlive = true
      p.usedLetters = []
      p.lastTurn = undefined
    }

    this.nextTurn(true)

    this.logger.info("Game started", {
      initialPlayers: this.players.size,
      startingLives: this.startingLives,
      maxTimer: this.maxTimer,
    })

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: "Game Started!",
    })
  }

  onTick(): void {
    if (this.context.gameState === GameState.COUNTDOWN) {
      this.countdown! -= 1
      if (this.countdown! <= 0) {
        this.startGame()
      } else {
        this.context.broadcastState()
      }
      return
    }

    if (this.context.gameState !== GameState.PLAYING) return

    // Defensive check: If active player is gone, skip turn immediately
    if (this.activePlayerId && !this.players.has(this.activePlayerId)) {
      this.nextTurn(false, undefined, false)
      return
    }

    this.timer -= 1
    this.broadcast({ type: ServerMessageType.STATE_UPDATE, timer: this.timer })

    if (this.timer <= 0) {
      this.handleExplosion()
    }
  }

  onPlayerLeave(playerId: string): void {
    // If the active player left, immediately move to next turn
    if (
      this.context.gameState === GameState.PLAYING &&
      this.activePlayerId === playerId
    ) {
      // The player is already removed from this.players by the server
      this.broadcast({
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Active player left! Passing turn...",
      })
      this.checkWinCondition() // Check if game should end
      if (this.context.gameState === GameState.PLAYING) {
        this.nextTurn(false, undefined, false)
      }
    } else {
      // If a non-active player left, we still check win condition (e.g. if they were the only other survivor)
      this.checkWinCondition()
    }
  }

  handleExplosion() {
    if (!this.activePlayerId) return

    const p = this.players.get(this.activePlayerId)
    if (p) {
      p.lives -= 1
      p.lastTurn = undefined
      if (p.lives <= 0) {
        p.isAlive = false
      }
      this.logger.info("Player explosion", {
        playerId: this.activePlayerId,
        remainingLives: p.lives,
        isEliminated: !p.isAlive,
      })
      this.broadcast({
        type: ServerMessageType.EXPLOSION,
        playerId: this.activePlayerId,
      })
    }

    this.checkWinCondition()
    if (this.context.gameState === GameState.PLAYING) {
      this.nextTurn(false, undefined, false)
    }
  }

  nextTurn(
    isFirst: boolean = false,
    overridePlayerId?: string | null,
    incrementSyllableCount: boolean = true,
  ) {
    if (this.context.gameState !== GameState.PLAYING) return

    const playerIds = Array.from(this.players.values())
      .filter((p) => p.isAlive)
      .map((p) => p.id)
    if (playerIds.length === 0) {
      this.endGame()
      return
    }

    let nextIndex = 0

    if (overridePlayerId && playerIds.includes(overridePlayerId)) {
      this.activePlayerId = overridePlayerId
    } else if (!isFirst && this.activePlayerId) {
      const currentIndex = playerIds.indexOf(this.activePlayerId)
      nextIndex = (currentIndex + 1) % playerIds.length
      this.activePlayerId = playerIds[nextIndex]
    } else if (isFirst) {
      nextIndex = Math.floor(Math.random() * playerIds.length)
      this.activePlayerId = playerIds[nextIndex]
    } else {
      this.activePlayerId = playerIds[0]
    }

    let changeSyllable = isFirst

    if (incrementSyllableCount) {
      changeSyllable = true
    } else {
      this.syllableTurnCount++
      if (this.syllableTurnCount >= this.syllableChangeThreshold) {
        changeSyllable = true
      }
    }

    if (changeSyllable) {
      if (!this.context.dictionaryReady) {
        this.broadcast({
          type: ServerMessageType.ERROR,
          message: "Dictionary not loaded!",
        })
        this.endGame()
        return
      }
      this.currentSyllable = this.context.dictionary.getRandomSyllable()
      this.syllableTurnCount = 0
    }

    if (this.activePlayerId) {
      if (this.playersPlayedInRound.has(this.activePlayerId)) {
        this.round++
        this.playersPlayedInRound.clear()
      }
      this.playersPlayedInRound.add(this.activePlayerId)
    }

    this.timer = this.maxTimer

    // HARD MODE: After X rounds, timer is random and shorter!
    if (this.hardModeEnabled && this.round > this.hardModeStartRound) {
      // Random timer between Max/2 and Max
      const min = Math.floor(this.maxTimer / 2)
      // Range is the difference between max and min
      // +1 makes the MaxTimer inclusive
      this.timer = Math.floor(Math.random() * (this.maxTimer - min + 1)) + min
    }

    this.turnStartTime = Date.now()

    if (this.activePlayerId) {
      this.antiBot.clearTyping(this.activePlayerId)
    }

    this.context.broadcastState()
  }

  checkWinCondition() {
    const alive = Array.from(this.players.values()).filter((p) => p.isAlive)
    if (alive.length <= 1 && this.context.initialAliveCount > 1) {
      this.endGame(alive[0]?.id)
    } else if (alive.length === 0) {
      // Technically shouldn't happen if initial > 1, but handled
      if (this.players.size === 1) {
        this.endGame(this.players.keys().next().value)
      } else {
        this.endGame(null)
      }
    }
  }

  endGame(winnerId?: string | null) {
    this.context.gameState = GameState.ENDED
    this.winnerId = winnerId || null
    this.gameTimer.stop()
    this.broadcast({ type: ServerMessageType.GAME_OVER, winnerId })

    if (winnerId) {
      const winner = this.players.get(winnerId)
      if (winner) {
        winner.wins += 1
      }
    }

    this.logger.info("Game ended", {
      winnerId,
      totalRounds: this.round,
      usedWordsCount: this.usedWords.size,
    })

    this.context.broadcastState()
  }

  onMessage(message: string, sender: Party.Connection): void {
    try {
      const data = JSON.parse(message) as BombPartyClientMessage

      switch (data.type) {
        case BombPartyClientMessageType.START_GAME:
          this.requestStartGame(sender.id)
          break
        case BombPartyClientMessageType.RESET_GAME:
          this.requestResetGame(sender.id)
          break
        case BombPartyClientMessageType.STOP_GAME:
          this.requestStopGame(sender.id)
          break
        case BombPartyClientMessageType.SUBMIT_WORD:
          this.submitWord(sender.id, data.word)
          break
        case BombPartyClientMessageType.UPDATE_TYPING:
          this.updateTyping(sender.id, data.text)
          break
        case BombPartyClientMessageType.UPDATE_SETTINGS:
          this.updateSettings(sender.id, data)
          break
      }
    } catch (e) {
      console.error("Error in game message", e)
    }
  }

  // Public Action Methods
  public requestStartGame(playerId: string) {
    const player = this.players.get(playerId)
    if (!player?.isAdmin) return

    if (this.context.gameState === GameState.LOBBY && this.players.size > 0) {
      this.onStart()
    } else if (this.context.gameState === GameState.COUNTDOWN) {
      this.startGame()
    }
  }

  public requestResetGame(playerId: string) {
    const player = this.players.get(playerId)
    if (player?.isAdmin && this.context.gameState === GameState.ENDED) {
      this.context.gameState = GameState.LOBBY
      this.broadcast({
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Game reset to lobby!",
      })
      this.context.broadcastState()
    }
  }

  public requestStopGame(playerId: string) {
    const player = this.players.get(playerId)
    if (
      player?.isAdmin &&
      (this.context.gameState === GameState.PLAYING ||
        this.context.gameState === GameState.COUNTDOWN)
    ) {
      this.broadcast({
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Admin stopped the game!",
      })
      this.endGame(null)
    }
  }

  public submitWord(playerId: string, word: string) {
    if (
      this.context.gameState === GameState.PLAYING &&
      this.activePlayerId === playerId &&
      typeof word === "string"
    ) {
      this.handleWordSubmission(playerId, word.substring(0, 50))
    }
  }

  public updateTyping(playerId: string, text: string) {
    if (
      this.context.gameState === GameState.PLAYING &&
      this.activePlayerId === playerId &&
      typeof text === "string"
    ) {
      this.antiBot.trackTyping(playerId)
      this.broadcast({
        type: ServerMessageType.TYPING_UPDATE,
        text: text.substring(0, 50),
        playerId: playerId,
      })
    }
  }

  public updateSettings(playerId: string, settings: any) {
    const player = this.players.get(playerId)
    if (!player?.isAdmin) return

    const result = BombPartySettingsSchema.safeParse(settings)
    if (result.success) {
      const s = result.data
      if (s.startingLives !== undefined) this.startingLives = s.startingLives
      if (s.maxTimer !== undefined) this.maxTimer = s.maxTimer
      if (s.syllableChangeThreshold !== undefined)
        this.syllableChangeThreshold = s.syllableChangeThreshold
      if (s.bonusLettersEnabled !== undefined)
        this.bonusLettersEnabled = s.bonusLettersEnabled
      if (s.bonusWordLength !== undefined)
        this.bonusWordLength = s.bonusWordLength
      if (s.hardModeEnabled !== undefined) this.hardModeEnabled = s.hardModeEnabled
      if (s.hardModeStartRound !== undefined)
        this.hardModeStartRound = s.hardModeStartRound
      if (s.chatEnabled !== undefined) this.chatEnabled = s.chatEnabled
      if (s.gameLogEnabled !== undefined) this.gameLogEnabled = s.gameLogEnabled

      this.logger.info("Settings updated", { adminId: playerId, ...s })
      this.context.broadcastState()
    }
  }

  handleWordSubmission(playerId: string, rawWord: string) {
    const botCheck = this.antiBot.validateAction(playerId, this.turnStartTime)
    if (!botCheck.isValid) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: botCheck.reason || "Suspicious activity detected.",
      })
      return
    }

    const word = rawWord.trim()
    if (this.usedWords.has(word.toLowerCase())) {
      this.logger.info("Duplicate word submission blocked", { playerId, word })
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Word already used!",
      })
      return
    }

    const check = this.context.dictionary.isValid(word, this.currentSyllable)
    if (check.valid) {
      this.usedWords.add(word.toLowerCase())
      const p = this.players.get(playerId)
      if (p) {
        p.lastTurn = { word, syllable: this.currentSyllable }
        for (const char of word.toUpperCase()) {
          if (char >= "A" && char <= "Z" && !p.usedLetters.includes(char)) {
            p.usedLetters.push(char)
          }
        }

        // NEW: Bonus Letter Feature (Configurable Length)
        if (this.bonusLettersEnabled && word.length >= this.bonusWordLength && p.usedLetters.length < 26) {
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
          const missing = alphabet.filter((c) => !p.usedLetters.includes(c))
          if (missing.length > 0) {
            const bonus = missing[Math.floor(Math.random() * missing.length)]
            p.usedLetters.push(bonus)
            if (!p.bonusLetters) p.bonusLetters = []
            p.bonusLetters.push(bonus)
            this.broadcast({
              type: ServerMessageType.BONUS,
              message: `Long Word Bonus! ${p.name} gets '${bonus}'!`,
            })
          }
        }

        if (p.usedLetters.length === 26) {
          p.lives++
          p.usedLetters = []
          p.bonusLetters = []
          this.broadcast({
            type: ServerMessageType.BONUS,
            message: `Alphabet Complete! ${p.name} gains a life!`,
          })
        }
      }
      this.logger.info("Valid word submitted", {
        playerId,
        word,
        syllable: this.currentSyllable,
      })
      this.broadcast({
        type: ServerMessageType.VALID_WORD,
        message: `${p?.name || "Player"} submitted: ${word}`,
      })
      this.nextTurn()
    } else {
      this.logger.info("Invalid word submission", {
        playerId,
        word,
        syllable: this.currentSyllable,
        reason: check.reason,
      })
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: check.reason,
        hide: true,
      })
    }
  }

  getState(): Record<string, any> {
    return {
      currentSyllable: this.currentSyllable,
      activePlayerId: this.activePlayerId,
      timer: this.timer,
      maxTimer: this.maxTimer,
      startingLives: this.startingLives,
      syllableChangeThreshold: this.syllableChangeThreshold,
      bonusLettersEnabled: this.bonusLettersEnabled,
      bonusWordLength: this.bonusWordLength,
      hardModeEnabled: this.hardModeEnabled,
      hardModeStartRound: this.hardModeStartRound,
      dictionaryLoaded: this.context.dictionaryReady,
      chatEnabled: this.chatEnabled,
      gameLogEnabled: this.gameLogEnabled,
      round: this.round,
      winnerId: this.winnerId,
      countdown: this.countdown,
    }
  }
}
