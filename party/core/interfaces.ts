import type * as Party from "partykit/server"
import type { Player, GameMode } from "../../shared/types"

export interface IDictionaryRepository {
  ready: Promise<void>
  load(origin: string): Promise<{ success: boolean; error?: string }>
  isValid(word: string, syllable: string): { valid: boolean; reason?: string }
  getRandomSyllable(): string
  getRandomWord(length?: number): string
  isWordValid(word: string): boolean
}

/**
 * Represents the context exposed to a Game by the Server.
 * Using this interface allows Games to be tested without mocking the full Server.
 */
export interface IRoomContext {
  // Read-only state
  players: Map<string, Player>
  dictionaryReady: boolean
  gameMode: GameMode

  // Mutable State (Shared)
  gameState: any // Start loose, we can tighten later
  initialAliveCount: number

  // Services
  getDictionary(): IDictionaryRepository
  dictionary: IDictionaryRepository

  // Actions
  broadcast(data: any): void
  sendTo(connectionId: string, data: any): void
  broadcastState(): void
}

/**
 * Interface that all Games must implement.
 */
export interface IGame {
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
