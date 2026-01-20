import type * as Party from "partykit/server"
import { DictionaryManager } from "./dictionary"
import { createLogger, Logger } from "../shared/logger"

type Player = {
  id: string
  name: string
  lives: number
  isAlive: boolean
  wins: number
  usedLetters: string[]
  isAdmin: boolean
  clientId?: string
  lastTurn?: { word: string; syllable: string }
}

import {
  ClientMessageType,
  ServerMessageType,
  GameState,
  type ClientMessage,
} from "../shared/types"

export default class Server implements Party.Server {
  // ... (options, room, dictionary, players, gameState, etc definitions constant)
  options: Party.ServerOptions = {
    hibernate: true,
  }

  room: Party.Room
  logger: Logger
  dictionary: DictionaryManager

  players: Map<string, Player> = new Map()
  gameState: GameState = GameState.LOBBY

  // ... (rest of properties)
  currentSyllable: string = ""
  usedWords: Set<string> = new Set()
  activePlayerId: string | null = null
  timer: number = 0
  maxTimer: number = 10
  startingLives: number = 2
  chatEnabled: boolean = true
  syllableChangeThreshold: number = 2
  syllableTurnCount: number = 0

  tickInterval: ReturnType<typeof setTimeout> | null = null
  nextTickTime: number = 0

  dictionaryReady: boolean = false

  // Rate limiting (simple window)
  messageCounts: Map<string, number> = new Map()
  rateLimits: Map<string, { lastChat: number; lastNameChange: number }> =
    new Map()
  lastRateCheck: number = Date.now()
  password?: string

  // Blocking logic
  blockedIPs: Set<string> = new Set()
  connectionIPs: Map<string, string> = new Map()
  connectionClientIds: Map<string, string> = new Map()

  // Inactivity tracking
  lastActivity: number = Date.now()
  keepAliveInterval: ReturnType<typeof setInterval> | null = null

  // Bot Protection
  turnStartTime: number = 0
  lastConnectionAttempts: Map<string, number> = new Map()

  constructor(room: Party.Room) {
    this.room = room
    this.logger = createLogger(`Server [${room.id}]`)
    this.dictionary = new DictionaryManager()

    // Clear rate limits periodically
    setInterval(() => {
      this.messageCounts.clear()
      this.lastRateCheck = Date.now()

      // Also clean up old connection attempts (10s window)
      const now = Date.now()
      for (const [ip, time] of this.lastConnectionAttempts) {
        if (now - time > 10000) this.lastConnectionAttempts.delete(ip)
      }
    }, 1000)

    // Heartbeat & Inactivity Check
    this.keepAliveInterval = setInterval(() => {
      this.checkInactivity()
    }, 10000)
  }

  checkInactivity() {
    if (this.players.size === 0) return

    // 5 minutes timeout
    const TIMEOUT = 5 * 60 * 1000
    if (Date.now() - this.lastActivity > TIMEOUT) {
      for (const conn of this.room.getConnections()) {
        conn.close(4001, "Inactivity")
      }
    }
  }

  getUniqueName(desiredName: string, excludePlayerId?: string): string {
    let baseName = desiredName.trim()
    if (baseName.length > 16) baseName = baseName.substring(0, 16)

    // Normalize existing names for case-insensitive check
    const existingNames = new Set<string>()
    for (const p of this.players.values()) {
      if (p.id !== excludePlayerId) {
        existingNames.add(p.name.toLowerCase())
      }
    }

    if (!existingNames.has(baseName.toLowerCase())) return baseName

    let counter = 2
    while (counter < 100) {
      // Try appending number. Ensure total length doesn't exceed too much,
      // but usually we prioritize uniqueness.
      // "Name (2)" might exceed 16, but that's acceptable for differentiation.
      const candidate = `${baseName} (${counter})`
      if (!existingNames.has(candidate.toLowerCase())) return candidate
      counter++
    }
    return baseName // Fallback
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // 0. Validate Room ID (Security)
    if (!/^[a-z]{4}$/.test(this.room.id)) {
      conn.close(4000, "Invalid Room ID. Must be 4 lowercase letters.")
      return
    }

    // 1. Get IP
    const ip = (
      ctx.request.headers.get("x-forwarded-for") ||
      ctx.request.headers.get("cf-connecting-ip") ||
      "unknown"
    )
      .split(",")[0]
      .trim()

    // 2. Anti-Bot: Connection Throttling
    // Allow 1 connection every 2 seconds per IP
    // EXEMPT LOCALHOST/UNKNOWN (for dev environment)
    const isLocal =
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "localhost" ||
      ip === "unknown"

    if (!isLocal) {
      const lastAttempt = this.lastConnectionAttempts.get(ip)
      if (lastAttempt && Date.now() - lastAttempt < 2000) {
        this.logger.warn(`Rejected fast reconnect from IP: ${ip}`)
        conn.close(4003, "Connection rate limited. Please wait.")
        return
      }
    }
    this.lastConnectionAttempts.set(ip, Date.now())

    const url = new URL(ctx.request.url)
    const clientId = url.searchParams.get("clientId") || undefined
    if (clientId) this.connectionClientIds.set(conn.id, clientId)

    // 2. Check if blocked
    if (
      this.blockedIPs.has(ip) ||
      this.blockedIPs.has(conn.id) ||
      (clientId && this.blockedIPs.has(clientId))
    ) {
      this.logger.warn(
        `Rejected blocked Client: ${ip} / ${conn.id} / ${clientId}`,
      )
      conn.close(4003, "You are banned from this room.")
      return
    }

    this.connectionIPs.set(conn.id, ip)

    this.lastActivity = Date.now()

    // Initialize dictionary if needed (lazy load)
    // const url = new URL(ctx.request.url) // Removed duplicate declaration
    // NOTE: In production (PartyKit), the origin might be the partykit.dev URL.
    // However, static assets are served from the same domain by PartyKit if configured correctly.
    // If client is separate (Vite deploy), we might need the client origin.
    // But since we deploy with 'partykit deploy', it serves 'dist' folder assets.
    // So 'origin' should be correct.
    const origin = url.origin

    // ... existing password and name logic
    const passwordParam = url.searchParams.get("password") || undefined
    const nameParam = url.searchParams.get("name")

    // First player sets the password (if any)
    if (this.players.size === 0) {
      this.password = passwordParam
    } else {
      // Subsequent players must match if password is set
      if (this.password && this.password !== passwordParam) {
        this.logger.warn(
          `Connection rejected: incorrect password for ${conn.id}`,
        )
        conn.close(4000, "Invalid Password")
        return
      }
    }

    this.dictionary.load(origin).then((result) => {
      if (result.success) {
        if (!this.dictionaryReady) {
          this.dictionaryReady = true
          this.broadcastState()
        }
      } else {
        this.logger.error("Dictionary failed to load:", result.error)
        this.broadcast({
          type: ServerMessageType.ERROR,
          message: `Failed to load dictionary: ${
            result.error || "Unknown error"
          }. Please refresh.`,
        })
      }
    })

    // Use the name from query or default to Guest
    let rawName = nameParam || `Guest ${conn.id.substring(0, 4)}`
    const name = this.getUniqueName(rawName, conn.id)

    // First player is admin
    const isAdmin = this.players.size === 0

    this.players.set(conn.id, {
      id: conn.id,
      name,
      lives: 2,
      isAlive: this.gameState !== GameState.PLAYING,
      wins: 0,
      usedLetters: [],
      isAdmin,
      clientId,
    })

    this.logger.info(
      `Player Connected: ${name} (${conn.id}) [IP: ${isLocal ? "Localhost" : ip}]`,
    )

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: `${name} joined the game!`,
    })

    this.broadcastState()
    this.reportToLobby()
  }

  onClose(conn: Party.Connection) {
    this.removePlayer(conn.id)
  }

  removePlayer(connectionId: string) {
    const p = this.players.get(connectionId)
    if (!p) return

    this.logger.info(`Player Disconnected: ${p.name} (${connectionId})`)

    this.connectionIPs.delete(connectionId)

    const wasAdmin = p.isAdmin

    // Determine next player if active player is leaving
    let forceNextId: string | undefined
    if (
      this.gameState === GameState.PLAYING &&
      connectionId === this.activePlayerId
    ) {
      const playerIds = Array.from(this.players.values())
        .filter((p) => p.isAlive)
        .map((p) => p.id)
      const idx = playerIds.indexOf(connectionId)
      if (idx !== -1) {
        // Pick next in ring
        const nextIdx = (idx + 1) % playerIds.length
        if (playerIds[nextIdx] !== connectionId) {
          forceNextId = playerIds[nextIdx]
        }
      }
    }

    this.players.delete(connectionId)
    this.messageCounts.delete(connectionId)
    this.rateLimits.delete(connectionId)

    // Reassign admin if necessary
    if (wasAdmin && this.players.size > 0) {
      // Assign to the first available player (who has been there longest usually)
      const newAdmin = this.players.values().next().value
      if (newAdmin) {
        newAdmin.isAdmin = true
      }
    }

    this.checkWinCondition() // Check if game should end due to lack of players

    if (this.gameState === GameState.PLAYING) {
      if (connectionId === this.activePlayerId) {
        // If the active player left, immediately pass turn to next
        this.nextTurn(false, forceNextId, false)
      }
    } else if (this.players.size === 0) {
      // Cleanup if empty
      if (this.tickInterval) clearInterval(this.tickInterval)
      this.gameState = GameState.LOBBY
      this.usedWords.clear()
    }

    this.broadcastState()
    this.reportToLobby()
  }

  // ... (onRequest, reportToLobby remain same)

  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          isPrivate: !!this.password,
          players: this.players.size,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      )
    }
    return new Response("Not found", { status: 404 })
  }

  async reportToLobby() {
    try {
      // We assume the lobby is on the same host
      await this.room.context.parties.lobby.get("global").fetch({
        method: "POST",
        body: JSON.stringify({
          id: this.room.id,
          players: this.players.size,
          isPrivate: !!this.password,
        }),
      })
    } catch (e) {
      // ignore lobby reporting errors
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    this.lastActivity = Date.now()

    // 1. Rate Limiting
    const count = (this.messageCounts.get(sender.id) || 0) + 1
    this.messageCounts.set(sender.id, count)
    if (count > 10) {
      // Too many messages, ignore to prevent spam
      return
    }

    try {
      const data = JSON.parse(message) as ClientMessage
      const senderPlayer = this.players.get(sender.id)

      switch (data.type) {
        case ClientMessageType.START_GAME:
          if (
            senderPlayer?.isAdmin &&
            this.gameState === GameState.LOBBY &&
            this.players.size > 0
          ) {
            this.startGame()
          }
          break

        case ClientMessageType.STOP_GAME:
          if (senderPlayer?.isAdmin && this.gameState === GameState.PLAYING) {
            this.broadcast({
              type: ServerMessageType.SYSTEM_MESSAGE,
              message: "Admin stopped the game!",
            })
            // If strictly one player, treat them as winner to avoid "None"
            if (this.players.size === 1) {
              this.endGame(this.players.keys().next().value)
            } else {
              this.endGame(null)
            }
          }
          break

        case ClientMessageType.SUBMIT_WORD:
          if (
            this.gameState === GameState.PLAYING &&
            this.activePlayerId === sender.id &&
            typeof data.word === "string"
          ) {
            this.handleWordSubmission(sender.id, data.word)
          }
          break

        case ClientMessageType.UPDATE_TYPING:
          if (
            this.gameState === GameState.PLAYING &&
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

        case ClientMessageType.SET_NAME:
          {
            const limits = this.rateLimits.get(sender.id) || {
              lastChat: 0,
              lastNameChange: 0,
            }
            const now = Date.now()
            if (now - limits.lastNameChange < 5000) {
              // Rate limited
              return
            }

            const p = this.players.get(sender.id)
            if (p && typeof data.name === "string") {
              const cleanName = this.getUniqueName(data.name, sender.id)
              if (cleanName.length > 0) {
                p.name = cleanName
                limits.lastNameChange = now
                this.rateLimits.set(sender.id, limits)
                this.broadcastState()
              }
            }
          }
          break

        case ClientMessageType.CHAT_MESSAGE:
          if (typeof data.text === "string") {
            if (!this.chatEnabled) return

            const limits = this.rateLimits.get(sender.id) || {
              lastChat: 0,
              lastNameChange: 0,
            }
            const now = Date.now()
            if (now - limits.lastChat < 1000) {
              // Rate limited
              return
            }

            const text = data.text.trim().substring(0, 200)
            if (text.length > 0) {
              limits.lastChat = now
              this.rateLimits.set(sender.id, limits)

              const senderPlayer = this.players.get(sender.id)
              this.broadcast({
                type: ServerMessageType.CHAT_MESSAGE,
                senderId: sender.id,
                senderName: senderPlayer ? senderPlayer.name : "Unknown",
                text,
              })
            }
          }
          break

        case ClientMessageType.UPDATE_SETTINGS:
          if (senderPlayer?.isAdmin) {
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
            if (typeof data.chatEnabled === "boolean") {
              this.chatEnabled = data.chatEnabled
              this.broadcast({
                type: ServerMessageType.SYSTEM_MESSAGE,
                message: this.chatEnabled ? "Chat enabled" : "Chat disabled",
              })
            }
            if (typeof data.syllableChangeThreshold === "number") {
              // Clamp between 1 and 5
              this.syllableChangeThreshold = Math.max(
                1,
                Math.min(5, data.syllableChangeThreshold),
              )
            }
            this.broadcastState()
          }
          break

        case ClientMessageType.KICK_PLAYER:
          if (senderPlayer?.isAdmin && typeof data.playerId === "string") {
            // Cannot kick self
            if (data.playerId === sender.id) return

            const targetConn = this.room.getConnection(data.playerId)
            if (targetConn) {
              const targetPlayer = this.players.get(data.playerId)
              const targetName = targetPlayer ? targetPlayer.name : "Unknown"

              this.broadcast({
                type: ServerMessageType.SYSTEM_MESSAGE,
                message: `${targetName} was kicked by the host.`,
              })

              // BLOCK THE ID
              this.blockedIPs.add(data.playerId)
              const ip = this.connectionIPs.get(data.playerId)
              if (ip) {
                this.blockedIPs.add(ip)
              }
              const clientId = this.connectionClientIds.get(data.playerId)
              if (clientId) {
                this.blockedIPs.add(clientId)
              }
              this.logger.warn(
                `Blocked Player: ${data.playerId} (IP: ${ip}, ClientID: ${clientId})`,
              )

              // Remove player immediately from state so UI updates instantly
              this.removePlayer(data.playerId)
              targetConn.close(4002, "Kicked by Admin")
            }
          }
          break
      }
    } catch (e) {
      this.logger.error("Error parsing message", e)
    }
  }

  initialAliveCount: number = 0

  startGame() {
    if (this.players.size < 1) return
    if (!this.dictionaryReady) return // Prevent starting without dictionary

    this.gameState = GameState.PLAYING
    this.usedWords.clear()
    this.initialAliveCount = this.players.size
    this.syllableTurnCount = 0

    for (const p of this.players.values()) {
      p.lives = this.startingLives
      p.isAlive = true
      p.usedLetters = []
    }

    this.startLoop()
    this.nextTurn(true)

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: "Game Started!",
    })
  }

  startLoop() {
    if (this.tickInterval) clearTimeout(this.tickInterval)
    this.nextTickTime = Date.now() + 1000
    this.tickInterval = setTimeout(() => this.loopStep(), 1000)
  }

  loopStep() {
    if (this.gameState !== GameState.PLAYING) return

    const now = Date.now()
    // Calculate drift (if we are late, this is positive)
    const drift = now - this.nextTickTime

    // If massive drift (e.g. suspended), reset
    if (drift > 1000) {
      this.nextTickTime = now
    }

    this.tick()

    // Schedule next tick
    this.nextTickTime += 1000
    const delay = Math.max(0, this.nextTickTime - Date.now())
    this.tickInterval = setTimeout(() => this.loopStep(), delay)
  }

  tick() {
    if (this.gameState !== GameState.PLAYING) return

    this.timer -= 1
    // Broadcast timer every tick (optimized to only send timer field if possible,
    // but our handleMessage handles partial updates)
    this.broadcast({ type: ServerMessageType.STATE_UPDATE, timer: this.timer })

    if (this.timer <= 0) {
      this.handleExplosion()
    }
  }

  handleExplosion() {
    if (!this.activePlayerId) return

    const p = this.players.get(this.activePlayerId)
    if (p) {
      p.lives -= 1
      p.lastTurn = undefined // Clear last turn on failure
      if (p.lives <= 0) {
        p.isAlive = false
      }
      this.broadcast({
        type: ServerMessageType.EXPLOSION,
        playerId: this.activePlayerId,
      })
    }

    this.checkWinCondition()
    if (this.gameState === GameState.PLAYING) {
      this.nextTurn(false, undefined, false)
    }
  }

  nextTurn(
    isFirst: boolean = false,
    overridePlayerId?: string | null,
    incrementSyllableCount: boolean = true,
  ) {
    if (this.gameState !== GameState.PLAYING) return

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
      // Valid word submitted -> Always change syllable and reset fail count
      changeSyllable = true
    } else {
      // Failed turn (Timer/Explosion) -> Increment fail count
      this.syllableTurnCount++
      if (this.syllableTurnCount >= this.syllableChangeThreshold) {
        changeSyllable = true
      }
    }

    if (changeSyllable) {
      if (!this.dictionaryReady) {
        this.broadcast({
          type: ServerMessageType.ERROR,
          message: "Dictionary not loaded!",
        })
        this.endGame()
        return
      }
      this.currentSyllable = this.dictionary.getRandomSyllable(50)
      this.syllableTurnCount = 0
    }

    this.timer = this.maxTimer
    this.turnStartTime = Date.now()

    this.broadcastState()
  }

  handleWordSubmission(playerId: string, rawWord: string) {
    // Anti-Bot: Reaction Time Check
    // If the submission is impossibly fast (< 50ms) after turn start, ignore or reject.
    const reactionTime = Date.now() - this.turnStartTime
    if (reactionTime < 50) {
      this.logger.warn(
        `Rejected implausible reaction time: ${reactionTime}ms by ${playerId}`,
      )
      // Silent ignore or error
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

    const check = this.dictionary.isValid(word, this.currentSyllable)
    if (check.valid) {
      this.usedWords.add(word.toLowerCase())

      const p = this.players.get(playerId)
      if (p) {
        p.lastTurn = { word, syllable: this.currentSyllable } // Store last turn
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
            message: "Alphabet Complete! +1 Life",
          })
        }
      }

      this.nextTurn()
    } else {
      this.broadcast({
        type: ServerMessageType.ERROR,
        message: check.reason,
        hide: true,
      })
    }
  }

  checkWinCondition() {
    const alive = Array.from(this.players.values()).filter((p) => p.isAlive)
    if (alive.length <= 1 && this.initialAliveCount > 1) {
      this.endGame(alive[0]?.id)
    } else if (alive.length === 0) {
      if (this.players.size === 1) {
        this.endGame(this.players.keys().next().value)
      } else {
        this.endGame(null)
      }
    }
  }

  endGame(winnerId?: string | null) {
    this.gameState = GameState.ENDED
    if (this.tickInterval) clearTimeout(this.tickInterval)
    this.broadcast({ type: ServerMessageType.GAME_OVER, winnerId })

    if (winnerId) {
      const winner = this.players.get(winnerId)
      if (winner) {
        winner.wins += 1
      }
    }

    this.gameState = GameState.LOBBY
    this.broadcastState()
  }

  broadcastState() {
    this.room.broadcast(
      JSON.stringify({
        type: ServerMessageType.STATE_UPDATE,
        gameState: this.gameState,
        players: Array.from(this.players.values()),
        currentSyllable: this.currentSyllable,
        activePlayerId: this.activePlayerId,
        timer: this.timer,
        dictionaryLoaded: this.dictionaryReady,
        startingLives: this.startingLives,
        maxTimer: this.maxTimer,
        chatEnabled: this.chatEnabled,
      }),
    )
  }

  broadcast(msg: any) {
    this.room.broadcast(JSON.stringify(msg))
  }

  sendTo(connectionId: string, msg: any) {
    const conn = this.room.getConnection(connectionId)
    if (conn) conn.send(JSON.stringify(msg))
  }
}
