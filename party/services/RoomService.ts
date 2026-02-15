import type * as Party from "partykit/server"
import { createLogger, Logger } from "../../shared/logger"
import {
  GameState,
  GameMode,
  type Player,
  ServerMessageType,
  GlobalClientMessageType,
} from "../../shared/types"
import type { ClientMessage } from "../../shared/types"
import type { IGame, IRoomContext } from "../core/interfaces"
import { GameRegistry } from "../core/GameRegistry"
import { ModerationService } from "./ModerationService"
import { ChatService } from "./ChatService"

export class RoomService {
  private logger: Logger
  private room: Party.Room
  private context: IRoomContext

  public moderation: ModerationService
  public chat: ChatService

  // Active Game
  public activeGame: IGame | null = null

  // Internal State (Reflected in Server/Context)
  public players: Map<string, Player>
  public gameState: GameState = GameState.LOBBY
  public gameMode: GameMode = GameMode.BOMB_PARTY
  public password?: string

  constructor(
    room: Party.Room,
    context: IRoomContext,
    playersMap: Map<string, Player>,
    initialGameMode: GameMode,
    chatService: ChatService,
    moderationService: ModerationService,
  ) {
    this.room = room
    this.context = context
    this.players = playersMap
    this.gameMode = initialGameMode

    this.logger = createLogger(`RoomService [${room.id}]`)

    // Injected Dependencies
    this.moderation = moderationService
    this.chat = chatService
  }

  // --- Connection Lifecycle ---

  public async handleConnect(
    conn: Party.Connection,
    ctx: Party.ConnectionContext,
  ) {
    const url = new URL(ctx.request.url)
    const ip = (ctx.request.headers.get("x-forwarded-for") || "unknown")
      .split(",")[0]
      .trim()
    const clientId = url.searchParams.get("clientId") || undefined

    // 1. Moderation Checks
    if (this.moderation.isBanned(conn.id, ip, clientId)) {
      conn.close(4003, "Banned")
      return
    }

    this.moderation.trackConnection(conn.id, ip, clientId)

    // 2. Password Check
    const passwordParam = url.searchParams.get("password") || undefined
    if (this.players.size === 0) {
      this.password = passwordParam // First player sets password
    } else if (this.password && this.password !== passwordParam) {
      const { failures, banned } = this.moderation.handlePasswordFailure(ip)
      if (banned && clientId) this.moderation.banPlayer(clientId) // Ban client ID too if we have it?

      if (banned) {
        conn.close(4003, "Banned: Too many failed password attempts.")
      } else {
        conn.close(4000, "Invalid Password")
      }
      return
    }

    if (this.password && this.password === passwordParam) {
      this.moderation.handlePasswordSuccess(ip)
    }

    // 3. Game Mode Initialization
    if (!this.activeGame) {
      let mode = this.gameMode
      if (this.players.size === 0) {
        // If room is empty, check storage or param
        const storedMode = (await this.room.storage.get("gameMode")) as GameMode
        const paramMode = url.searchParams.get("mode") as GameMode

        if (storedMode) {
          mode = storedMode
        } else {
          const validParam =
            paramMode && Object.values(GameMode).includes(paramMode)
          mode = validParam ? paramMode : GameMode.BOMB_PARTY
          // Persist the decision
          await this.room.storage.put("gameMode", mode)
        }
      }
      this.gameMode = mode
      this.initializeGame(this.gameMode)
    }

    // 4. Create Player
    const nameParam = url.searchParams.get("name")
    const rawName = nameParam || `Guest ${conn.id.substring(0, 4)}`
    const name = this.getUniqueName(rawName, conn.id)
    const isAdmin = this.players.size === 0

    const newPlayer: Player = {
      id: conn.id,
      name,
      lives: 2,
      isAlive:
        this.gameState !== GameState.PLAYING &&
        this.gameState !== GameState.COUNTDOWN,
      wins: 0,
      usedLetters: [],
      isAdmin,
      clientId,
    }

    this.players.set(conn.id, newPlayer)

    this.context.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: `${name} joined the game!`,
    })

    // 5. Notify Game
    this.activeGame?.onPlayerJoin(newPlayer)
    this.context.broadcastState()
  }

  public async handleDisconnect(connectionId: string) {
    const p = this.players.get(connectionId)
    if (!p) return

    this.moderation.removeConnection(connectionId)
    this.chat.cleanup(connectionId)
    this.players.delete(connectionId)

    try {
      this.activeGame?.onPlayerLeave(connectionId)
    } catch (e) {
      this.logger.error("Error in onPlayerLeave", e)
    }

    // Reassign Admin
    if (p.isAdmin && this.players.size > 0) {
      const newAdmin = this.players.values().next().value
      if (newAdmin) newAdmin.isAdmin = true
    }

    // Handled Empty Room
    if (this.players.size === 0) {
      this.activeGame?.dispose()
      this.activeGame = null
      this.gameState = GameState.LOBBY
      this.password = undefined
      await this.room.storage.deleteAll()
    }

    this.context.broadcastState()
  }

  public handleMessage(message: string, sender: Party.Connection) {
    // 1. Rate Limiting (Simple)
    // Could move to ModerationService but simple count is fine here or in Server

    try {
      const data = JSON.parse(message) as ClientMessage
      const senderPlayer = this.players.get(sender.id)

      switch (data.type) {
        case GlobalClientMessageType.CHAT_MESSAGE:
          if (this.chat.canSendMessage(sender.id)) {
            // Check game setting
            if (this.activeGame && !this.activeGame.chatEnabled) return
            this.chat.broadcastMessage(
              sender.id,
              senderPlayer?.name || "Unknown",
              data.text,
            )
          }
          break

        case GlobalClientMessageType.SET_NAME:
          if (
            this.chat.canChangeName(sender.id) &&
            senderPlayer &&
            typeof data.name === "string"
          ) {
            const cleanName = this.getUniqueName(data.name, sender.id)
            if (cleanName) {
              senderPlayer.name = cleanName
              this.context.broadcastState()
            }
          }
          break

        case GlobalClientMessageType.KICK_PLAYER:
          if (senderPlayer?.isAdmin && typeof data.playerId === "string") {
            this.kickPlayer(data.playerId, sender.id)
          }
          break

        default:
          // Delegate to Game
          this.activeGame?.onMessage(message, sender)
      }
    } catch (e) {
      this.logger.error("Error handling message", e)
    }
  }

  private kickPlayer(targetId: string, _adminId: string) {
    if (targetId === _adminId) return // Can't kick self

    const targetPlayer = this.players.get(targetId)
    if (!targetPlayer) return

    this.context.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: `${targetPlayer.name} was kicked by the host.`,
    })

    this.moderation.banPlayer(targetId)

    // Close connection
    const conn = this.room.getConnection(targetId)
    if (conn) conn.close(4002, "Kicked by Admin")

    // Remove from state immediately (important for tests where close() is not immediate)
    this.handleDisconnect(targetId)
  }

  public setGameMode(mode: GameMode) {
    if (this.gameMode === mode && this.activeGame) return

    this.activeGame?.dispose()
    this.gameMode = mode
    this.initializeGame(mode)
    this.context.broadcastState()
  }

  private initializeGame(mode: GameMode) {
    try {
      this.activeGame = GameRegistry.create(mode, this.context)
      this.logger.info(`Initialized game: ${mode}`)
    } catch (e) {
      this.logger.error(`Failed to create game ${mode}`, e)
      // Fallback?
    }
  }

  private getUniqueName(desiredName: string, excludePlayerId?: string): string {
    let baseName = desiredName.trim()
    if (baseName.length > 16) baseName = baseName.substring(0, 16)
    if (baseName.length === 0) return ""

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
    return baseName
  }
}
