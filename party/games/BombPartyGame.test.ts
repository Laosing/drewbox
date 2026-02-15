import { describe, it, expect, beforeEach, vi } from "vitest"
import Server from "../server"
import {
  MockRoom,
  MockConnection,
  createMockConnectionContext,
} from "../../test/mocks/party"
import { GameState, GameMode, ServerMessageType } from "../../shared/types"
import { GAME_CONFIG } from "../../shared/config"
import { BombPartyGame } from "./BombPartyGame"

// Mock DictionaryService
// Mock DictionaryService
vi.mock("../services/DictionaryService", () => ({
  DictionaryService: class {
    load = vi.fn().mockResolvedValue({ success: true })
    // isValid returns true if word contains syllable 'SYL'
    isValid = vi.fn().mockImplementation((word: string, syllable: string) => {
      if (!word.toLowerCase().includes(syllable.toLowerCase())) {
        return { valid: false, reason: "Missing syllable" }
      }
      return { valid: true }
    })
    getRandomSyllable = vi.fn().mockReturnValue("TEST")
    isWordValid = vi.fn().mockImplementation(() => true)
  },
}))

describe("Bomb Party Game Logic", () => {
  let room: MockRoom
  let server: Server
  let game: BombPartyGame

  beforeEach(() => {
    room = new MockRoom("test")
    // Ensure GameMode is BOMB_PARTY
    room.storage.put("gameMode", GameMode.BOMB_PARTY)
    server = new Server(room as any)
    server.gameMode = GameMode.BOMB_PARTY

    // Silence logger
    server.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any

    // Server usually instantiates game on first connect if not present,
    // but we can manually instantiate it for unit testing logic if we carefully mock the context
    // However, simplest way is to simulate a connection which triggers instantiation
  })

  // Helper to simulate player join
  const joinPlayer = async (id: string) => {
    const conn = new MockConnection(id)
    room.connections.set(id, conn as any)
    await server.onConnect(conn as any, createMockConnectionContext())
    return conn
  }

  // Helper to fast-forward through countdown phase
  const skipCountdown = (game: BombPartyGame) => {
    while (server.gameState === GameState.COUNTDOWN) {
      game.onTick()
    }
  }

  it("should start game when admin requests", async () => {
    const host = await joinPlayer("host")
    const p2 = await joinPlayer("p2")

    expect(server.gameState).toBe(GameState.LOBBY)

    // Manual start
    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame
    game.requestStartGame("host")

    // Should enter countdown first
    expect(server.gameState).toBe(GameState.COUNTDOWN)
    expect(game.countdown).toBe(5)

    // Fast-forward through countdown
    skipCountdown(game)

    expect(server.gameState).toBe(GameState.PLAYING)
    expect(game.activePlayerId).toBeDefined()
    expect(game.round).toBe(1)
    // Should have started timer
    expect(game.timer).toBeGreaterThan(0)
  })

  it("should initialize with default game settings", async () => {
    const game = new BombPartyGame(server)

    expect(game.startingLives).toBe(GAME_CONFIG.BOMB_PARTY.LIVES.DEFAULT)
    expect(game.maxTimer).toBe(GAME_CONFIG.BOMB_PARTY.TIMER.DEFAULT)
    expect(game.syllableChangeThreshold).toBe(
      GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.DEFAULT,
    )
    expect(game.bonusWordLength).toBe(
      GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.DEFAULT,
    )
    expect(game.hardModeStartRound).toBe(
      GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.DEFAULT,
    )
  })

  it("should handle valid word submission", async () => {
    vi.useFakeTimers()
    // 1. Setup Game
    const host = await joinPlayer("host")
    await joinPlayer("p2")

    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame
    game.requestStartGame("host")
    skipCountdown(game)

    const activeId = game.activePlayerId!
    expect(activeId).toBeDefined()

    // Mock syllable to be "TEST" (from our mock above)
    game.currentSyllable = "TEST"

    const activeConn = room.connections.get(activeId)

    // Advance time to pass "too fast" check (250ms)
    vi.advanceTimersByTime(300)

    // Simulate Typing (Bot protection)
    game.updateTyping(activeId, "T")
    game.updateTyping(activeId, "TE")
    game.updateTyping(activeId, "TES")

    // 2. Submit Valid Word containing "TEST"
    game.submitWord(activeId, "TESTING")

    // 3. Verify success
    // Should have moved to next player
    expect(game.activePlayerId).not.toBe(activeId)
    // Word should be added to used words
    expect(game.usedWords.has("testing")).toBe(true)
    // Valid word message broadcast?
    expect(activeConn?.send).toHaveBeenCalledWith(
      expect.stringContaining(ServerMessageType.VALID_WORD),
    )

    vi.useRealTimers()
  })

  it("should reject invalid word (missing syllable)", async () => {
    const host = await joinPlayer("host")

    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame
    game.requestStartGame("host")
    skipCountdown(game)

    const activeId = game.activePlayerId!
    const activeConn = room.connections.get(activeId)!

    game.currentSyllable = "ABC" // Syllable

    // Simulate Typing
    game.updateTyping(activeId, "X")
    game.updateTyping(activeId, "XY")

    game.submitWord(activeId, "XYZ") // Does not contain ABC

    // Should not change turn
    expect(game.activePlayerId).toBe(activeId)
    // Should send Error
    expect(activeConn.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    )
  })

  it("should handle explosion (timer expiry)", async () => {
    const host = await joinPlayer("host")
    await joinPlayer("p2") // Add second player so turn can rotate

    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame
    game.requestStartGame("host")
    skipCountdown(game)
    const activeId = game.activePlayerId!
    const player = server.players.get(activeId)!
    const initialLives = player.lives

    // Manually trigger explosion logic (simulating tick)
    game.handleExplosion()

    expect(player.lives).toBe(initialLives - 1)
    // Should move to next turn
    expect(game.activePlayerId).not.toBe(activeId)
  })

  it("should end game when only 1 player remains", async () => {
    const host = await joinPlayer("host")
    await joinPlayer("p2")

    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame
    game.requestStartGame("host")
    skipCountdown(game)

    // Kill p2
    const p2 = server.players.get("p2")!
    p2.lives = 0
    p2.isAlive = false

    // Trigger check condition
    game.checkWinCondition()

    expect(server.gameState).toBe(GameState.ENDED)
    expect(game.winnerId).toBe("host")
  })

  it("should award bonus letter for long words", async () => {
    vi.useFakeTimers()
    const host = await joinPlayer("host")
    await joinPlayer("p2")

    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame
    game.requestStartGame("host")
    skipCountdown(game)
    const activeId = game.activePlayerId!
    const activeConn = room.connections.get(activeId)
    const player = server.players.get(activeId)!

    // Setup: ensure bonus length is reachable
    game.bonusWordLength = 5
    game.currentSyllable = "TEST"

    // Advance time for bot check
    vi.advanceTimersByTime(300)

    // Simulate Typing
    game.updateTyping(activeId, "T")
    game.updateTyping(activeId, "TE")

    // Submit "TESTING" (Length 7 > 5)
    game.submitWord(activeId, "TESTING")

    // Verify Player got a bonus letter
    expect(player.usedLetters.length).toBeGreaterThan(0)
    // Should have broadcast BONUS
    expect(server.room.broadcast).toHaveBeenCalledWith(
      expect.stringContaining(ServerMessageType.BONUS),
    )

    vi.useRealTimers()
  })

  it("should activate hard mode after X rounds", async () => {
    const host = await joinPlayer("host")
    await joinPlayer("p2")

    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame
    game.requestStartGame("host")
    skipCountdown(game)

    // Setup Hard Mode start
    game.hardModeStartRound = 3
    game.maxTimer = 20

    // Advance to round 4
    game.round = 4

    // Trigger new turn to reset timer
    game.nextTurn(false)

    // In hard mode, timer should be random between 10 (max/2) and 20 (max)
    expect(game.timer).toBeGreaterThanOrEqual(10)
    expect(game.timer).toBeLessThanOrEqual(20)

    // Run it multiple times to ensure randomness if possible, but one check validates logic path
  })

  it("should update settings when admin requests", async () => {
    const host = await joinPlayer("host")
    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame

    const newSettings = {
      maxTimer: 45,
      startingLives: 1,
      hardModeStartRound: 5,
      syllableChangeThreshold: 10,
    }

    game.updateSettings("host", newSettings)

    expect(game.maxTimer).toBe(45)
    expect(game.startingLives).toBe(1)
    expect(game.hardModeStartRound).toBe(5)
    expect(game.syllableChangeThreshold).toBe(10)
  })

  it("should ignore settings update from non-admin", async () => {
    await joinPlayer("host")
    await joinPlayer("p2")
    server.roomService.activeGame = new BombPartyGame(server)
    const game = server.roomService.activeGame as BombPartyGame

    // Ensure p2 is not admin
    expect(server.players.get("p2")?.isAdmin).toBe(false)

    const originalMaxTimer = game.maxTimer

    game.updateSettings("p2", { maxTimer: 99 })

    expect(game.maxTimer).toBe(originalMaxTimer)
  })
})
