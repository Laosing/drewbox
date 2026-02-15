import type { IGame, IRoomContext } from "./interfaces"
import type * as Party from "partykit/server"
import { GameTimer } from "../GameTimer"
import { AntiBotProtection } from "../AntiBotProtection"
import { createLogger, Logger } from "../../shared/logger"
import type { Player } from "../../shared/types"

export abstract class BaseGame implements IGame {
  protected context: IRoomContext

  // Public properties from IGame
  public chatEnabled: boolean = true
  public gameLogEnabled: boolean = true

  // Utilities
  public gameTimer: GameTimer
  public antiBot: AntiBotProtection = new AntiBotProtection()
  protected logger: Logger

  constructor(context: IRoomContext) {
    this.context = context
    this.gameTimer = new GameTimer(() => this.onTick())
    this.logger = createLogger(this.constructor.name, context.roomId)
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
    this.gameTimer.stop()
  }

  abstract getState(): Record<string, any>

  protected get players(): Map<string, Player> {
    return this.context.players
  }

  protected broadcast(data: any): void {
    this.context.broadcast(data)
  }

  protected sendTo(connectionId: string, data: any): void {
    this.context.sendTo(connectionId, data)
  }
}
