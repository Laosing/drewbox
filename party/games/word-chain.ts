import { BaseGame } from "../game-engine"
import {
  WordChainClientMessageType,
  WordChainSettingsSchema,
  GAME_CONFIG,
  GameState,
  ServerMessageType,
} from "../../shared/types"
import type * as Party from "partykit/server"
import type { WordChainClientMessage } from "../../shared/types"

export class WordChainGame extends BaseGame {
  currentWord: string = ""
  usedWords: Set<string> = new Set()
  playersPlayedInRound: Set<string> = new Set()

  winnerId: string | null = null
  activePlayerId: string | null = null
  timer: number = 0
  maxTimer: number = GAME_CONFIG.WORD_CHAIN.TIMER.DEFAULT
  startingLives: number = GAME_CONFIG.WORD_CHAIN.LIVES.DEFAULT
  hardModeStartRound: number = GAME_CONFIG.WORD_CHAIN.HARD_MODE_START.DEFAULT
  round: number = 1
  minLength: number = 3

  private tickInterval: ReturnType<typeof setTimeout> | null = null
  private nextTickTime: number = 0

  constructor(server: any) {
    super(server)
  }

  onStart(): void {
    if (this.players.size < 1) {
      return // Need at least 1
    }

    if (!this.server.dictionaryReady) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Dictionary not loaded!",
      })
      return
    }

    this.server.gameState = GameState.PLAYING
    this.usedWords = new Set()
    this.round = 1
    this.minLength = 3
    this.playersPlayedInRound.clear()

    // Reset players
    for (const p of this.players.values()) {
      p.lives = this.startingLives
      p.isAlive = true
    }

    // Pick a random starting word to kick things off
    try {
      this.currentWord = this.server.dictionary.getRandomWord(4) // simple word
    } catch (e) {
      this.currentWord = "START"
    }
    this.usedWords.add(this.currentWord)

    this.startLoop()
    this.nextTurn(true)

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: `Word Chain Started! The first word is ${this.currentWord}.`,
    })
  }

  onMessage(message: string, sender: Party.Connection): void {
    try {
      const data = JSON.parse(message) as WordChainClientMessage
      switch (data.type) {
        case WordChainClientMessageType.START_GAME:
          this.requestStartGame(sender.id)
          break
        case WordChainClientMessageType.STOP_GAME:
          this.requestStopGame(sender.id)
          break
        case WordChainClientMessageType.SUBMIT_WORD:
          this.submitWord(sender.id, data.word)
          break
        case WordChainClientMessageType.UPDATE_TYPING:
          this.updateTyping(sender.id, data.text)
          break
        case WordChainClientMessageType.UPDATE_SETTINGS:
          this.updateSettings(sender.id, data)
          break
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Action Methods (Public for testing and internal use)

  public requestStartGame(playerId: string) {
    const player = this.players.get(playerId)
    if (
      player?.isAdmin &&
      (this.server.gameState === GameState.LOBBY ||
        this.server.gameState === GameState.ENDED)
    ) {
      this.onStart()
    }
  }

  public requestStopGame(playerId: string) {
    const player = this.players.get(playerId)
    if (player?.isAdmin && this.server.gameState === GameState.PLAYING) {
      this.endGame()
    }
  }

  public submitWord(playerId: string, word: string) {
    if (
      this.server.gameState !== GameState.PLAYING ||
      this.activePlayerId !== playerId
    ) {
      return
    }
    this.handleGuess(playerId, word)
  }

  public updateTyping(playerId: string, text: string) {
    if (
      this.server.gameState === GameState.PLAYING &&
      this.activePlayerId === playerId
    ) {
      this.trackTyping(playerId)
      this.broadcast({
        type: ServerMessageType.TYPING_UPDATE,
        text: text,
      })
    }
  }

  public updateSettings(playerId: string, settings: any) {
    const player = this.players.get(playerId)
    if (!player?.isAdmin) return

    const result = WordChainSettingsSchema.safeParse(settings)
    if (result.success) {
      const s = result.data
      if (s.maxTimer !== undefined) this.maxTimer = s.maxTimer
      if (s.startingLives !== undefined) {
        this.startingLives = s.startingLives
      }
      if (s.chatEnabled !== undefined) this.chatEnabled = s.chatEnabled
      if (s.gameLogEnabled !== undefined) this.gameLogEnabled = s.gameLogEnabled
      if (s.hardModeStartRound !== undefined)
        this.hardModeStartRound = s.hardModeStartRound

      this.server.broadcastState()
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
    if (now - this.nextTickTime > 1000) this.nextTickTime = now

    this.onTick()

    this.nextTickTime += 1000
    const delay = Math.max(0, this.nextTickTime - Date.now())
    this.tickInterval = setTimeout(() => this.loopStep(), delay)
  }

  handleTimeout() {
    this.broadcast({
      type: ServerMessageType.EXPLOSION,
      playerId: this.activePlayerId,
    }) // Re-use explosion for dramatic effect?

    const player = this.players.get(this.activePlayerId!)
    if (player) {
      player.lives -= 1
      if (player.lives <= 0) {
        player.isAlive = false
        this.broadcast({
          type: ServerMessageType.SYSTEM_MESSAGE,
          message: `${player.name} is out!`,
        })
      } else {
        this.broadcast({
          type: ServerMessageType.SYSTEM_MESSAGE,
          message: `${player.name} lost a life!`,
        })
      }
    }
    this.nextTurn()
  }

  nextTurn(isFirst: boolean = false) {
    if (this.server.gameState !== GameState.PLAYING) return

    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.isAlive,
    )

    // Win Condition
    if (alivePlayers.length === 0) {
      this.endGame(null)
      return
    }

    // Multiplayer Win: Last player standing
    if (this.players.size > 1 && alivePlayers.length === 1) {
      alivePlayers[0].wins++
      this.endGame(alivePlayers[0].id)
      return
    }

    // Solo play continues until death (alivePlayers < 1)

    if (isFirst) {
      const randomIndex = Math.floor(Math.random() * alivePlayers.length)
      this.activePlayerId = alivePlayers[randomIndex].id
    } else if (this.activePlayerId) {
      // Actually need to rotate through currently alive players
      const aliveIds = alivePlayers.map((p) => p.id)
      const currentIndex = aliveIds.indexOf(this.activePlayerId)
      let nextIndex = (currentIndex + 1) % aliveIds.length

      this.activePlayerId = aliveIds[nextIndex]
    } else {
      this.activePlayerId = alivePlayers[0].id
    }

    if (this.activePlayerId) {
      this.clearTyping(this.activePlayerId)
      if (this.playersPlayedInRound.has(this.activePlayerId)) {
        this.round++
        this.playersPlayedInRound.clear()

        // Update Hard Mode Min Length
        // Base is 3. Increase by 1 for every round past the start threshold
        if (this.round >= this.hardModeStartRound) {
          const increase = this.round - this.hardModeStartRound + 1
          this.minLength = 3 + increase

          this.broadcast({
            type: ServerMessageType.SYSTEM_MESSAGE,
            message: `HARD MODE! Minimum word length is now ${this.minLength}!`,
          })
        }
      }
      this.playersPlayedInRound.add(this.activePlayerId)
    }

    this.timer = this.maxTimer
    this.server.broadcastState()
  }

  handleGuess(playerId: string, word: string) {
    // Bot Check: Must have typed
    if (!this.validateTyping(playerId, 2)) {
      this.sendTo(playerId, {
        type: ServerMessageType.ERROR,
        message: "Suspicious activity detected. Please type your words.",
        hide: true,
      })
      return
    }

    const upper = word.toUpperCase().trim()
    const lastCharOfCurrent = this.currentWord.slice(-1).toUpperCase()

    if (!upper.startsWith(lastCharOfCurrent)) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: `Must start with '${lastCharOfCurrent}'!`,
        hide: true,
      })
      return
    }

    if (this.usedWords.has(upper)) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Word already used!",
        hide: true,
      })
      return
    }

    if (!this.server.dictionary.isWordValid(upper)) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: "Not in dictionary!",
        hide: true,
      })
      return
    }

    if (upper.length < this.minLength) {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: `Word must be at least ${this.minLength} letters!`,
        hide: true,
      })
      return
    }

    // Success
    this.usedWords.add(upper)
    this.currentWord = upper

    // Bonus for long words?

    const player = this.players.get(playerId)
    if (player) {
      // Track last turn for UI
      // For Word Chain, the "syllable" concept is basically the starting letter (the link)
      player.lastTurn = {
        word: upper,
        syllable: upper.charAt(0),
      }
    }

    this.broadcast({
      type: ServerMessageType.VALID_WORD,
      word: upper,
      playerId,
      message: `${player ? player.name : "Unknown"} played ${upper}`,
    })

    this.nextTurn()
  }

  endGame(winnerId?: string | null) {
    this.server.gameState = GameState.ENDED
    this.winnerId = winnerId || null
    if (this.tickInterval) clearTimeout(this.tickInterval)
    this.broadcast({
      type: ServerMessageType.GAME_OVER,
      winnerId,
      message: winnerId ? "We have a winner!" : "Game Over",
    })
    this.server.broadcastState()
  }

  getState(): Record<string, any> {
    return {
      currentWord: this.currentWord,
      activePlayerId: this.activePlayerId,
      timer: this.timer,
      maxTimer: this.maxTimer,
      startingLives: this.startingLives,
      chatEnabled: this.chatEnabled,
      gameLogEnabled: this.gameLogEnabled,
      usedWordsCount: this.usedWords.size,
      winnerId: this.winnerId,
      round: this.round,
      hardModeStartRound: this.hardModeStartRound,
      minLength: this.minLength,
    }
  }
}
