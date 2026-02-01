import { describe, it, expect, beforeEach, vi } from "vitest"
import Server from "../../party/server"
import {
  MockRoom,
  MockConnection,
  createMockConnectionContext,
} from "../mocks/party"
import {
  GameState,
  GameMode,
  ServerMessageType,
  GAME_CONFIG,
} from "../../shared/types"
import { WordleGame } from "../../party/games/wordle"

// Mock DictionaryManager
vi.mock("../../party/dictionary", () => ({
  DictionaryManager: class {
    load = vi.fn().mockResolvedValue({ success: true })
    // Simple mock dictionary
    isWordValid = vi.fn().mockImplementation((word: string) => {
      return ["APPLE", "ALERT", "ADAPT", "ABUSE", "ARGUE", "BANANA"].includes(
        word.toUpperCase(),
      )
    })
    getRandomWord = vi.fn().mockImplementation((len: number) => {
      if (len === 6) return "BANANA"
      return "APPLE"
    })
  },
}))

describe("Wordle Game Logic", () => {
  let room: MockRoom
  let server: Server

  beforeEach(() => {
    room = new MockRoom("test")
    room.storage.put("gameMode", GameMode.WORDLE)
    server = new Server(room as any)
    server.gameMode = GameMode.WORDLE

    server.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any
  })

  const joinPlayer = async (id: string) => {
    const conn = new MockConnection(id)
    room.connections.set(id, conn as any)
    await server.onConnect(conn as any, createMockConnectionContext())
    return conn
  }

  it("should start game and pick target word", async () => {
    await joinPlayer("host")

    const game = new WordleGame(server)
    server.activeGame = game
    game.requestStartGame("host")

    expect(server.gameState).toBe(GameState.PLAYING)
    expect(game.targetWord).toBe("APPLE")
  })

  it("should initialize with default game settings", async () => {
    const game = new WordleGame(server)

    expect(game.maxTimer).toBe(GAME_CONFIG.WORDLE.TIMER.DEFAULT)
    expect(game.maxAttempts).toBe(GAME_CONFIG.WORDLE.ATTEMPTS.DEFAULT)
    expect(game.wordLength).toBe(GAME_CONFIG.WORDLE.LENGTH.DEFAULT)
  })

  it("should handle valid guesses and updates state", async () => {
    await joinPlayer("host")
    const game = new WordleGame(server)
    server.activeGame = game
    game.requestStartGame("host")

    // "ALERT" vs "APPLE"
    // A (correct), L (present), E (present), R (absent), T (absent)
    // Wait: A P P L E
    //       A L E R T
    // A: match
    // L: in APPLE (pos 3), guess (pos 1). Present.
    // E: in APPLE (pos 4), guess (pos 2). Present.

    game.submitWord("host", "ALERT")

    expect(game.guesses.length).toBe(1)
    const guess = game.guesses[0]
    expect(guess.word).toBe("ALERT")
    expect(guess.results[0]).toBe("correct") // A
    expect(guess.results[1]).toBe("present") // L
    expect(guess.results[3]).toBe("absent") // R
  })

  it("should reject invalid dictionary words", async () => {
    const host = await joinPlayer("host")
    const game = new WordleGame(server)
    server.activeGame = game
    game.requestStartGame("host")

    game.submitWord("host", "ZZZZZ")

    expect(game.guesses.length).toBe(0)
    expect(host.send).toHaveBeenCalledWith(
      expect.stringContaining(ServerMessageType.ERROR),
    )
  })

  it("should detect win condition", async () => {
    await joinPlayer("host")
    const game = new WordleGame(server)
    server.activeGame = game
    game.requestStartGame("host")

    game.submitWord("host", "APPLE")

    expect(server.gameState).toBe(GameState.ENDED)
    expect(game.winnerId).toBe("host")
  })

  it("should end game on max attempts", async () => {
    await joinPlayer("host")
    const game = new WordleGame(server)
    server.activeGame = game
    game.requestStartGame("host")

    // Consume all attempts (default 5, defined in GAME_CONFIG)
    // We'll update settings to be safe or just loop 5 times
    game.maxAttempts = 2 // Shorten for test

    game.submitWord("host", "ABUSE") // 1
    expect(server.gameState).toBe(GameState.PLAYING)

    game.submitWord("host", "ADAPT") // 2

    expect(server.gameState).toBe(GameState.ENDED)
    expect(game.winnerId).toBeNull()
  })

  it("should update settings when admin requests", async () => {
    const host = await joinPlayer("host")
    server.activeGame = new WordleGame(server)
    const game = server.activeGame as WordleGame

    const newSettings = {
      maxTimer: 120,
      maxAttempts: 10,
      wordLength: 4,
    }

    game.updateSettings("host", newSettings)

    expect(game.maxTimer).toBe(120)
    expect(game.maxAttempts).toBe(10)
    expect(game.wordLength).toBe(4)
  })

  it("should ignore settings update from non-admin", async () => {
    await joinPlayer("host")
    await joinPlayer("p2")
    server.activeGame = new WordleGame(server)
    const game = server.activeGame as WordleGame

    // Ensure p2 is not admin
    expect(server.players.get("p2")?.isAdmin).toBe(false)

    const originalMaxTimer = game.maxTimer

    game.updateSettings("p2", { maxTimer: 999 })

    expect(game.maxTimer).toBe(originalMaxTimer)
  })

  it("should show new word length setting in getState when game is ended", async () => {
    await joinPlayer("host")
    const game = new WordleGame(server)
    server.activeGame = game
    server.gameState = GameState.ENDED
    game.winnerId = "host"
    game.targetWord = "APPLE" // Previous game was 5 letters
    game.wordLength = 5

    // Initial check: Should return 5 because targetWord is 5 (and setting matches)
    expect(game.getState().wordLength).toBe(5)

    // Update settings to 6
    game.updateSettings("host", { wordLength: 6 })

    // Verify setting is updated
    expect(game.wordLength).toBe(6)

    // Verify getState returns 6 (Configured Length) even though targetWord is 5
    // This was the bug: it used to return 5
    expect(game.getState().wordLength).toBe(6)

    // Start new game
    game.requestStartGame("host", false) // reuseWord = false

    // Should pick 6 letter word
    expect(game.targetWord).toBe("BANANA")
    expect(game.getState().wordLength).toBe(6)
    expect(game.getState().wordLength).toBe(6)
  })

  it("should clear guesses when starting a new game (regression check)", async () => {
    await joinPlayer("host")
    const game = new WordleGame(server)
    server.activeGame = game
    server.gameState = GameState.ENDED
    game.maxAttempts = 5

    // Simulate a previous game with many guesses
    game.guesses = [
      {
        playerId: "host",
        word: "GUESS",
        results: [],
        timestamp: Date.now(),
      },
      {
        playerId: "host",
        word: "GUESS",
        results: [],
        timestamp: Date.now(),
      },
      {
        playerId: "host",
        word: "GUESS",
        results: [],
        timestamp: Date.now(),
      },
      {
        playerId: "host",
        word: "GUESS",
        results: [],
        timestamp: Date.now(),
      },
      {
        playerId: "host",
        word: "GUESS",
        results: [],
        timestamp: Date.now(),
      },
    ]

    // Start New Game
    game.requestStartGame("host", false)

    expect(game.guesses.length).toBe(0)
    expect(server.gameState).toBe(GameState.PLAYING)

    // Make 1 wrong guess
    game.submitWord("host", "ABUSE") // Wrong word
    expect(game.guesses.length).toBe(1)

    // Should STILL be playing (maxAttempts is 5, we have 1)
    expect(server.gameState).toBe(GameState.PLAYING)
  })
})
