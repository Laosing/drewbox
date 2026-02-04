import type * as Party from "partykit/server"
import type { Player } from "../shared/types"
import type Server from "./server"
import { AntiBotProtection } from "./anti-bot"
import { GameTimer } from "./game-timer"

export interface GameEngine {
  // Lifecycle
  onStart(): void
  onTick(): void
  onPlayerJoin(player: Player): void
  onPlayerLeave(playerId: string): void
  onMessage(message: string, sender: Party.Connection): void
  dispose(): void

  // Properties tracked by game
  chatEnabled: boolean
  gameLogEnabled: boolean

  // State for broadcast
  getState(): Record<string, any>
}

export abstract class BaseGame implements GameEngine {
  protected server: Server
  public chatEnabled: boolean = true
  public gameLogEnabled: boolean = true
  public gameTimer: GameTimer

  constructor(server: Server) {
    this.server = server
    this.gameTimer = new GameTimer(() => this.onTick())
  }

  abstract onStart(): void
  abstract onTick(): void

  onPlayerJoin(_player: Player): void {
    // Default implementation: nothing
  }

  onPlayerLeave(_playerId: string): void {
    // Default implementation: nothing
  }

  abstract onMessage(message: string, sender: Party.Connection): void

  dispose(): void {
    // Default cleanup
  }

  abstract getState(): Record<string, any>

  protected get players(): Map<string, Player> {
    return this.server.players
  }

  protected broadcast(data: any): void {
    this.server.broadcast(data)
  }

  protected sendTo(connectionId: string, data: any): void {
    this.server.sendTo(connectionId, data)
  }

  // Bot Protection
  public antiBot: AntiBotProtection = new AntiBotProtection()
}
