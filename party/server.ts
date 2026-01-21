import type * as Party from "partykit/server"
import { createLogger, Logger } from "../shared/logger"
import { DictionaryManager } from "./dictionary"
import {
  GlobalClientMessageType,
  GameState,
  ServerMessageType,
  GameMode,
} from "../shared/types"
import type { ClientMessage, Player } from "../shared/types"
import type { GameEngine } from "./game-engine"
import { BombPartyGame } from "./games/bomb-party"
import { WordleGame } from "./games/wordle"

export default class Server implements Party.Server {
  options: Party.ServerOptions = {
    hibernate: true,
  }

  room: Party.Room
  logger: Logger
  dictionary: DictionaryManager

  players: Map<string, Player> = new Map()
  gameState: GameState = GameState.LOBBY

  // Active Game Engine
  activeGame: GameEngine | null = null
  gameMode: GameMode = GameMode.BOMB_PARTY

  // Fallback global settings (games manage their own now)
  chatEnabled: boolean = true
  gameLogEnabled: boolean = true

  // Dictionary State
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
  lastConnectionAttempts: Map<string, number> = new Map()
  initialAliveCount: number = 0

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
      this.reportToLobby()
    }, 10000)
  }

  checkInactivity() {
    if (this.players.size === 0) return

    // 3 minutes timeout
    const TIMEOUT = 3 * 60 * 1000
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
      const candidate = `${baseName} (${counter})`
      if (!existingNames.has(candidate.toLowerCase())) return candidate
      counter++
    }
    return baseName // Fallback
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
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

    // Initialize Game Mode
    if (!this.activeGame) {
      const storedMode = (await this.room.storage.get("gameMode")) as GameMode
      const paramMode = url.searchParams.get("mode") as GameMode

      this.logger.info(
        `Checking GameMode. Stored: ${storedMode}, Param: ${paramMode}`,
      )

      if (storedMode) {
        this.gameMode = storedMode
      } else {
        // Fallback to param or default
        const validParam =
          paramMode && Object.values(GameMode).includes(paramMode)
        this.gameMode = validParam ? paramMode : GameMode.BOMB_PARTY

        // Persist the decision so this room is forever marked with this mode
        await this.room.storage.put("gameMode", this.gameMode)
        this.logger.info(`Initialized and Saved GameMode: ${this.gameMode}`)
      }

      this.logger.info(`Active GameMode: ${this.gameMode}`)

      // Instantiate correct game
      switch (this.gameMode) {
        case GameMode.WORDLE:
          this.activeGame = new WordleGame(this)
          break
        case GameMode.BOMB_PARTY:
        default:
          this.activeGame = new BombPartyGame(this)
          break
      }
    }

    const origin = url.origin

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

    let rawName = nameParam || `Guest ${conn.id.substring(0, 4)}`
    const name = this.getUniqueName(rawName, conn.id)

    const isAdmin = this.players.size === 0

    const newPlayer: Player = {
      id: conn.id,
      name,
      lives: 2, // Default, Game might update this
      isAlive: this.gameState !== GameState.PLAYING,
      wins: 0,
      usedLetters: [],
      isAdmin,
      clientId,
    }

    this.players.set(conn.id, newPlayer)

    this.logger.info(
      `Player Connected: ${name} (${conn.id}) [IP: ${isLocal ? "Localhost" : ip}]`,
    )

    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: `${name} joined the game!`,
    })

    // Notify Game Engine
    this.activeGame?.onPlayerJoin(newPlayer)

    this.broadcastState()
    this.reportToLobby()
  }

  async onClose(conn: Party.Connection) {
    await this.removePlayer(conn.id)
  }

  async removePlayer(connectionId: string) {
    const p = this.players.get(connectionId)
    if (!p) return

    this.logger.info(`Player Disconnected: ${p.name} (${connectionId})`)
    this.connectionIPs.delete(connectionId)

    const wasAdmin = p.isAdmin

    this.players.delete(connectionId)
    this.messageCounts.delete(connectionId)
    this.rateLimits.delete(connectionId)

    // Notify Game Engine first (it might handle turn passing etc)
    this.activeGame?.onPlayerLeave(connectionId)

    // Reassign admin if necessary
    if (wasAdmin && this.players.size > 0) {
      const newAdmin = this.players.values().next().value
      if (newAdmin) {
        newAdmin.isAdmin = true
      }
    }

    if (this.players.size === 0) {
      this.activeGame?.dispose()
      this.activeGame = null
      this.password = undefined // Reset password
      await this.room.storage.deleteAll()
      this.logger.info("Room empty. Storage and state cleared.")
    }

    this.broadcastState()
    await this.reportToLobby()
  }

  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      // Security Check: Ban list
      const ip = (
        req.headers.get("x-forwarded-for") ||
        req.headers.get("cf-connecting-ip") ||
        "unknown"
      )
        .split(",")[0]
        .trim()

      if (this.blockedIPs.has(ip)) {
        return new Response("Banned", { status: 403 })
      }

      let mode = this.gameMode
      if (this.players.size === 0) {
        // If room is empty, check storage to see if mode was ever set
        mode = (await this.room.storage.get("gameMode")) as GameMode
      }

      return new Response(
        JSON.stringify({
          isPrivate: !!this.password,
          players: this.players.size,
          mode,
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
      await this.room.context.parties.lobby.get("global").fetch({
        method: "POST",
        body: JSON.stringify({
          id: this.room.id,
          players: this.players.size,
          isPrivate: !!this.password,
          mode: this.gameMode,
        }),
      })
    } catch (e) {
      // ignore lobby reporting errors
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    this.lastActivity = Date.now()

    // 1. Rate Limiting
    const count = (this.messageCounts.get(sender.id) || 0) + 1
    this.messageCounts.set(sender.id, count)
    if (count > 20) {
      // Slight bump to allow fast typing
      return
    }

    try {
      const data = JSON.parse(message) as ClientMessage
      const senderPlayer = this.players.get(sender.id)

      // GLOBAL HANDLERS
      switch (data.type) {
        case GlobalClientMessageType.KICK_PLAYER:
          if (senderPlayer?.isAdmin && typeof data.playerId === "string") {
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

              await this.removePlayer(data.playerId)
              targetConn.close(4002, "Kicked by Admin")
            }
          }
          return

        case GlobalClientMessageType.SET_NAME:
          {
            const limits = this.rateLimits.get(sender.id) || {
              lastChat: 0,
              lastNameChange: 0,
            }
            const now = Date.now()
            if (now - limits.lastNameChange < 5000) {
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
          return

        case GlobalClientMessageType.CHAT_MESSAGE:
          if (typeof data.text === "string") {
            // Check Game Setting instead
            if (this.activeGame && !this.activeGame.chatEnabled) return

            const limits = this.rateLimits.get(sender.id) || {
              lastChat: 0,
              lastNameChange: 0,
            }
            const now = Date.now()
            if (now - limits.lastChat < 1000) {
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
          return

        case GlobalClientMessageType.UPDATE_SETTINGS:
          // Global settings removed for now, ignored
          return
      }

      // If not global, delegate to game
      this.activeGame?.onMessage(message, sender)
    } catch (e) {
      this.logger.error("Error parsing message", e)
    }
  }

  // Helpers exposed for GameEngine
  broadcast(data: any) {
    if (data.type === ServerMessageType.GAME_OVER) {
      if (this.activeGame && !this.activeGame.gameLogEnabled) {
        // suppress
        // (Currently allows message but client might filter)
      }
    }
    this.room.broadcast(JSON.stringify(data))
  }

  sendTo(connectionId: string, data: any) {
    const conn = this.room.getConnection(connectionId)
    if (conn) {
      conn.send(JSON.stringify(data))
    }
  }

  broadcastState() {
    this.room.broadcast(
      JSON.stringify({
        type: ServerMessageType.STATE_UPDATE,
        gameState: this.gameState,
        players: Array.from(this.players.values()),
        dictionaryLoaded: this.dictionaryReady,
        gameMode: this.gameMode,
        ...this.activeGame?.getState(),
      }),
    )
  }
}
