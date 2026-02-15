import type * as Party from "partykit/server"
import { createLogger, Logger } from "../shared/logger"
import { DictionaryService } from "./services/DictionaryService"
import { ServerMessageType, GameMode, GameState } from "../shared/types"
import type { Player } from "../shared/types"
import type { IRoomContext } from "./core/interfaces"
import { GameRegistry } from "./core/GameRegistry"
import { RoomService } from "./services/RoomService"
import { ChatService } from "./services/ChatService"
import { ModerationService } from "./services/ModerationService"

// Register Games
import { BombPartyGame } from "./games/BombPartyGame"
import { WordleGame } from "./games/WordleGame"
import { WordChainGame } from "./games/WordChainGame"

GameRegistry.register(GameMode.BOMB_PARTY, (ctx) => new BombPartyGame(ctx))
GameRegistry.register(GameMode.WORDLE, (ctx) => new WordleGame(ctx))
GameRegistry.register(GameMode.WORD_CHAIN, (ctx) => new WordChainGame(ctx))

export default class Server implements Party.Server, IRoomContext {
  options: Party.ServerOptions = {
    hibernate: true,
  }

  // Infrastructure
  room: Party.Room
  logger: Logger
  dictionary: DictionaryService

  // Application
  roomService: RoomService

  // Shared State (exposed via IRoomContext)
  players: Map<string, Player> = new Map()
  dictionaryReady: boolean = false

  // GameState and GameMode are managed by RoomService,
  // but IRoomContext interface requires them.
  // We can expose accessors or duplicate the state for read-performance?
  // Let's proxy to roomService for mutable state logic, but IRoomContext defines them as properties.
  // So Server will hold the truth, and RoomService manipulates it.

  // State Delegation
  get gameMode(): GameMode {
    return this.roomService.gameMode
  }
  set gameMode(mode: GameMode) {
    this.roomService.gameMode = mode
  }

  get gameState(): GameState {
    return this.roomService.gameState
  }
  set gameState(state: GameState) {
    this.roomService.gameState = state
  }

  get roomId(): string {
    return this.room.id
  }

  initialAliveCount: number = 0

  constructor(room: Party.Room) {
    this.room = room

    // Initialize observability if configured in environment
    if (room.env.LOG_URL) {
      Logger.configure({
        url: room.env.LOG_URL as string,
        token: room.env.LOG_TOKEN as string,
      })
    }

    this.logger = createLogger(`Server [${room.id}]`, room.id)
    this.dictionary = new DictionaryService()

    // Instantiate Services (DI)
    const chatService = new ChatService(room.id, this)
    const moderationService = new ModerationService(room.id)

    // Instantiate core service
    // RoomService manipulates 'this.players' (passed by reference)
    // and reads/writes 'this.gameMode/gameState' via setters in RoomService?
    // RoomService constructor takes 'playersMap'.
    // We need RoomService to be able to set gameState on Server.
    // Actually, Server *is* the Context.

    this.roomService = new RoomService(
      room,
      this,
      this.players,
      GameMode.BOMB_PARTY,
      chatService,
      moderationService,
    )

    // Heartbeat for Lobby Reporting
    setInterval(() => {
      this.roomService.handleDisconnect("inactive-check-internal") // Only for cleanup check?
      // Actually RoomService doesn't have loop specific logic yet, but Server had keepAlive.
      // Let's keep keepAlive minimal here or move to RoomService.
      this.reportToLobby()
    }, 10000)
  }

  // --- IRoomContext Implementation ---

  getDictionary() {
    return this.dictionary
  }

  broadcast(data: any): void {
    // Log suppression logic
    if (data.type === ServerMessageType.GAME_OVER) {
      // logic from old server
    }
    this.room.broadcast(JSON.stringify(data))
  }

  sendTo(connectionId: string, data: any): void {
    const conn = this.room.getConnection(connectionId)
    if (conn) {
      conn.send(JSON.stringify(data))
    }
  }

  broadcastState(): void {
    const gameSpecificState = this.roomService.activeGame?.getState() || {}
    this.room.broadcast(
      JSON.stringify({
        type: ServerMessageType.STATE_UPDATE,
        gameState: this.gameState,
        players: Array.from(this.players.values()),
        dictionaryLoaded: this.dictionaryReady,
        gameMode: this.gameMode,
        ...gameSpecificState,
      }),
    )
  }

  // --- PartyKit Server Implementation ---

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Dictionary Init (Lazy)
    const url = new URL(ctx.request.url)
    if (!this.dictionaryReady) {
      this.dictionary.load(url.origin).then((res) => {
        if (res.success) {
          this.dictionaryReady = true
          this.broadcastState()
        }
      })
    }

    await this.roomService.handleConnect(conn, ctx)
    this.reportToLobby()
  }

  async onClose(conn: Party.Connection) {
    await this.roomService.handleDisconnect(conn.id)
    await this.reportToLobby()
  }

  async onMessage(message: string, sender: Party.Connection) {
    this.roomService.handleMessage(message, sender)
  }

  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      // Basic Info Endpoint
      const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0]
      if (this.roomService.moderation.blockedIPs.has(ip)) {
        return new Response("Banned", { status: 403 })
      }

      return new Response(
        JSON.stringify({
          isPrivate: !!this.roomService.password,
          players: this.players.size,
          mode: this.gameMode,
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
          isPrivate: !!this.roomService.password,
          mode: this.gameMode,
        }),
      })
    } catch {
      // ignore
    }
  }
}
