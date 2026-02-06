import type { IGame, IRoomContext } from "./interfaces"
import { GameMode } from "../../shared/types"

type GameFactory = (context: IRoomContext) => IGame

export class GameRegistry {
  private static factories = new Map<GameMode, GameFactory>()

  static register(mode: GameMode, factory: GameFactory) {
    this.factories.set(mode, factory)
  }

  static create(mode: GameMode, context: IRoomContext): IGame {
    const factory = this.factories.get(mode)
    if (!factory) {
      throw new Error(`No game registered for mode: ${mode}`)
    }
    return factory(context)
  }

  static has(mode: GameMode): boolean {
    return this.factories.has(mode)
  }
}
