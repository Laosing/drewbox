import { BaseGame } from "../game-engine"
import {
  BombPartyClientMessageType,
  GameState,
  ServerMessageType,
} from "../../shared/types"
import type { BombPartyClientMessage } from "../../shared/types"
import type * as Party from "partykit/server"

export class BombPartyGame extends BaseGame {
  // ... (keep props)
  // Game State
  currentSyllable: string = ""
  usedWords: Set<string> = new Set()
  activePlayerId: string | null = null
  timer: number = 0
  maxTimer: number = 10
  startingLives: number = 2
  syllableChangeThreshold: number = 2
  syllableTurnCount: number = 0

  turnStartTime: number = 0

  private tickInterval: ReturnType<typeof setTimeout> | null = null
  private nextTickTime: number = 0

  constructor(server: any) {
    super(server)
    // Initialize defaults
  }

  onStart(): void {
    if (this.players.size < 1) return
    // We assume dictionary is ready or checked before start, but let's check
    if (!this.server.dictionaryReady) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Dictionary not loaded!",
      })
      return
    }

    this.server.gameState = GameState.PLAYING
    this.usedWords.clear()
    this.server.initialAliveCount = this.players.size
    this.syllableTurnCount = 0

    for (const p of this.players.values()) {
      p.lives = this.startingLives
      p.isAlive = true
      p.usedLetters = []
      p.lastTurn = undefined
    }

    this.startLoop()
    this.nextTurn(true)

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: "Game Started!",
    })
  }

  onTick(): void {
    if (this.server.gameState !== GameState.PLAYING) return

    this.timer -= 1
    this.broadcast({ type: ServerMessageType.STATE_UPDATE, timer: this.timer })

    if (this.timer <= 0) {
      this.handleExplosion()
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
    if (drift > 1000) {
      this.nextTickTime = now
    }

    this.onTick()

    this.nextTickTime += 1000
    const delay = Math.max(0, this.nextTickTime - Date.now())
    this.tickInterval = setTimeout(() => this.loopStep(), delay)
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
      this.broadcast({
        type: ServerMessageType.EXPLOSION,
        playerId: this.activePlayerId,
      })
    }

    this.checkWinCondition()
    if (this.server.gameState === GameState.PLAYING) {
      this.nextTurn(false, undefined, false)
    }
  }

  nextTurn(
    isFirst: boolean = false,
    overridePlayerId?: string | null,
    incrementSyllableCount: boolean = true,
  ) {
    if (this.server.gameState !== GameState.PLAYING) return

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
      if (!this.server.dictionaryReady) {
        this.broadcast({
          type: ServerMessageType.ERROR,
          message: "Dictionary not loaded!",
        })
        this.endGame()
        return
      }
      this.currentSyllable = this.server.dictionary.getRandomSyllable(50)
      this.syllableTurnCount = 0
    }

    this.timer = this.maxTimer
    this.turnStartTime = Date.now()

    this.server.broadcastState()
  }

  checkWinCondition() {
    const alive = Array.from(this.players.values()).filter((p) => p.isAlive)
    if (alive.length <= 1 && this.server.initialAliveCount > 1) {
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
    this.server.gameState = GameState.ENDED
    if (this.tickInterval) clearTimeout(this.tickInterval)
    this.broadcast({ type: ServerMessageType.GAME_OVER, winnerId })

    if (winnerId) {
      const winner = this.players.get(winnerId)
      if (winner) {
        winner.wins += 1
      }
    }

    this.server.gameState = GameState.LOBBY
    this.server.broadcastState()
  }

  onMessage(message: string, sender: Party.Connection): void {
    try {
      const data = JSON.parse(message) as BombPartyClientMessage
      const senderPlayer = this.players.get(sender.id)

      switch (data.type) {
        case BombPartyClientMessageType.START_GAME:
          if (
            senderPlayer?.isAdmin &&
            this.server.gameState === GameState.LOBBY &&
            this.players.size > 0
          ) {
            this.onStart()
          }
          break
        case BombPartyClientMessageType.STOP_GAME:
          if (
            senderPlayer?.isAdmin &&
            this.server.gameState === GameState.PLAYING
          ) {
            this.broadcast({
              type: ServerMessageType.SYSTEM_MESSAGE,
              message: "Admin stopped the game!",
            })
            this.endGame(null)
          }
          break
        case BombPartyClientMessageType.SUBMIT_WORD:
          if (
            this.server.gameState === GameState.PLAYING &&
            this.activePlayerId === sender.id &&
            typeof data.word === "string"
          ) {
            this.handleWordSubmission(sender.id, data.word)
          }
          break
        case BombPartyClientMessageType.UPDATE_TYPING:
          if (
            this.server.gameState === GameState.PLAYING &&
            this.activePlayerId === sender.id &&
            typeof data.text === "string"
          ) {
            this.broadcast({
              type: ServerMessageType.TYPING_UPDATE,
              text: data.text,
              playerId: sender.id,
            })
          }
          break
        case BombPartyClientMessageType.UPDATE_SETTINGS:
          if (senderPlayer?.isAdmin) {
            // Global settings are handled by Server now.

            if (typeof data.startingLives === "number") {
              let lives = Math.floor(data.startingLives)
              if (lives < 1) lives = 1
              if (lives > 10) lives = 10
              this.startingLives = lives
            }
            if (typeof data.maxTimer === "number") {
              let timer = Math.floor(data.maxTimer)
              if (timer < 5) timer = 5
              if (timer > 20) timer = 20
              this.maxTimer = timer
            }
            if (
              data.syllableChangeThreshold !== undefined &&
              typeof data.syllableChangeThreshold === "number"
            ) {
              this.syllableChangeThreshold = Math.max(
                1,
                Math.min(10, data.syllableChangeThreshold),
              )
            }
            if (data.chatEnabled !== undefined) {
              this.chatEnabled = data.chatEnabled
            }
            if (data.gameLogEnabled !== undefined) {
              this.gameLogEnabled = data.gameLogEnabled
            }
            this.server.broadcastState()
          }
          break
      }
    } catch (e) {
      console.error("Error in game message", e)
    }
  }

  handleWordSubmission(playerId: string, rawWord: string) {
    const reactionTime = Date.now() - this.turnStartTime
    if (reactionTime < 50) {
      const p = this.players.get(playerId)
      this.sendTo(playerId, {
        type: ServerMessageType.ERROR,
        message: `Too fast, ${p?.name || "Player"}! Are you a bot?`,
      })
      return
    }

    const word = rawWord.trim()
    if (this.usedWords.has(word.toLowerCase())) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Word already used!",
        hide: true,
      })
      return
    }

    const check = this.server.dictionary.isValid(word, this.currentSyllable)
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
        if (p.usedLetters.length === 26) {
          p.lives++
          p.usedLetters = []
          this.sendTo(playerId, {
            type: ServerMessageType.BONUS,
            message: `Alphabet Complete! ${p.name} gains a life!`,
          })
        }
      }
      this.broadcast({
        type: ServerMessageType.VALID_WORD,
        message: `${p?.name || "Player"} submitted: ${word}`,
      })
      this.nextTurn()
    } else {
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
      dictionaryLoaded: this.server.dictionaryReady,
      chatEnabled: this.chatEnabled,
      gameLogEnabled: this.gameLogEnabled,
    }
  }
}
