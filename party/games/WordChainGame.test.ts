import { describe, it, expect, beforeEach, vi } from "vitest"
import Server from "../server"
import {
  MockRoom,
  MockConnection,
  createMockConnectionContext,
} from "../../test/mocks/party"
import {
  GameState,
  GameMode,
  ServerMessageType,
  GAME_CONFIG,
} from "../../shared/types"
import { WordChainGame } from "./WordChainGame"

// Mock DictionaryService
vi.mock("../services/DictionaryService", () => ({
  DictionaryService: class {
    load = vi.fn().mockResolvedValue({ success: true })
    isWordValid = vi.fn().mockReturnValue(true)
    getRandomWord = vi.fn().mockReturnValue("START")
  },
}))

describe("Word Chain Game Logic", () => {
  let room: MockRoom
  let server: Server

  beforeEach(() => {
    room = new MockRoom("test")
    room.storage.put("gameMode", GameMode.WORD_CHAIN)
    server = new Server(room as any)
    server.gameMode = GameMode.WORD_CHAIN

    server.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any
  })

  // Helper to simulate player join
  const joinPlayer = async (id: string) => {
    const conn = new MockConnection(id)
    room.connections.set(id, conn as any)
    await server.onConnect(conn as any, createMockConnectionContext())
    return conn
  }

  it("should start game with initial word", async () => {
    await joinPlayer("host")

    // Direct instantiation and method calling for simpler testing
    const game = new WordChainGame(server)
    server.roomService.activeGame = game

    // Action
    game.requestStartGame("host")

    expect(server.gameState).toBe(GameState.PLAYING)
    expect(game.currentWord).toBe("START")
  })

  it("should accept valid chain word", async () => {
    const host = await joinPlayer("host")
    await joinPlayer("p2")
    const game = new WordChainGame(server)
    server.roomService.activeGame = game
    game.requestStartGame("host")

    game.currentWord = "TEST"

    // Action
    game.updateTyping(game.activePlayerId!, "T")
    game.updateTyping(game.activePlayerId!, "TI")
    game.submitWord(game.activePlayerId!, "TIGER")

    expect(game.currentWord).toBe("TIGER")
    expect(game.usedWords.has("TIGER")).toBe(true)
  })

  it("should initialize with default game settings", async () => {
    const game = new WordChainGame(server)
    expect(game.maxTimer).toBe(GAME_CONFIG.WORD_CHAIN.TIMER.DEFAULT)
    expect(game.startingLives).toBe(GAME_CONFIG.WORD_CHAIN.LIVES.DEFAULT)
    expect(game.hardModeStartRound).toBe(
      GAME_CONFIG.WORD_CHAIN.HARD_MODE_START.DEFAULT,
    )
  })

  it("should reject invalid start letter", async () => {
    await joinPlayer("host")
    const game = new WordChainGame(server)
    server.roomService.activeGame = game
    game.requestStartGame("host")

    game.currentWord = "TEST"
    const activeConn = room.connections.get(game.activePlayerId!)

    // Action: Starts with A, expected T
    game.updateTyping(game.activePlayerId!, "A")
    game.updateTyping(game.activePlayerId!, "AP")
    game.submitWord(game.activePlayerId!, "APPLE")

    expect(game.currentWord).toBe("TEST") // Should not change
    expect(activeConn?.send).toHaveBeenCalledWith(
      expect.stringContaining(ServerMessageType.ERROR),
    )
  })

  it("should reject repeated word", async () => {
    await joinPlayer("host")
    const game = new WordChainGame(server)
    server.roomService.activeGame = game
    game.requestStartGame("host")

    game.currentWord = "TEST"
    game.usedWords.add("TIGER")

    const activeConn = room.connections.get(game.activePlayerId!)

    // Action
    game.updateTyping(game.activePlayerId!, "T")
    game.updateTyping(game.activePlayerId!, "TI")
    game.submitWord(game.activePlayerId!, "TIGER")

    expect(game.currentWord).toBe("TEST")
    expect(activeConn?.send).toHaveBeenCalledWith(
      expect.stringContaining("Word already used"),
    )
  })

  it("should update settings when admin requests", async () => {
    const host = await joinPlayer("host")
    const game = new WordChainGame(server)
    server.roomService.activeGame = game

    const newSettings = {
      maxTimer: 45,
      startingLives: 5,
      hardModeStartRound: 10,
    }

    game.updateSettings("host", newSettings)

    expect(game.maxTimer).toBe(45)
    expect(game.startingLives).toBe(5)
    expect(game.hardModeStartRound).toBe(10)
  })

  it("should ignore settings update from non-admin", async () => {
    await joinPlayer("host")
    const p2 = await joinPlayer("p2")
    const game = new WordChainGame(server)
    server.roomService.activeGame = game

    // Ensure p2 is not admin
    expect(server.players.get("p2")?.isAdmin).toBe(false)

    const originalMaxTimer = game.maxTimer

    game.updateSettings("p2", { maxTimer: 99 })

    expect(game.maxTimer).toBe(originalMaxTimer)
  })

  // Hard Mode Tests
  describe("Hard Mode", () => {
    it("should initialize with default hard mode settings", async () => {
      await joinPlayer("host")
      const game = new WordChainGame(server)
      server.roomService.activeGame = game

      game.requestStartGame("host")

      expect(game.round).toBe(1)
      expect(game.minLength).toBe(3)
      expect(game.hardModeStartRound).toBe(
        GAME_CONFIG.WORD_CHAIN.HARD_MODE_START.DEFAULT,
      )
    })

    it("should reject words shorter than minLength", async () => {
      await joinPlayer("host")
      const game = new WordChainGame(server)
      server.roomService.activeGame = game
      game.requestStartGame("host")

      game.minLength = 5
      game.currentWord = "TEST"

      const activeConn = room.connections.get(game.activePlayerId!)

      // Action: Valid start letter, valid dictionary word, but too short
      game.updateTyping(game.activePlayerId!, "T")
      game.updateTyping(game.activePlayerId!, "TI")
      game.submitWord(game.activePlayerId!, "TINY")

      expect(game.currentWord).toBe("TEST")
      expect(activeConn?.send).toHaveBeenCalledWith(
        expect.stringContaining("at least 5 letters"),
      )
    })

    it("should increment round after all players have played", async () => {
      const p1 = await joinPlayer("p1")
      const p2 = await joinPlayer("p2")

      const game = new WordChainGame(server)
      server.roomService.activeGame = game
      game.requestStartGame("p1")

      game.currentWord = "START"
      expect(game.round).toBe(1)
      expect(game.playersPlayedInRound.size).toBe(1) // Initial player logic adds active player

      // Determine active player order
      const firstPlayerId = game.activePlayerId!
      const secondPlayerId = firstPlayerId === "p1" ? "p2" : "p1"

      // Player 1 plays
      game.updateTyping(firstPlayerId, "T")
      game.updateTyping(firstPlayerId, "TI")
      game.submitWord(firstPlayerId, "TIGER")

      expect(game.playersPlayedInRound.has(firstPlayerId)).toBe(true)
      expect(game.round).toBe(1) // Round shouldn't increment yet

      // Player 2 plays
      expect(game.activePlayerId).toBe(secondPlayerId)

      game.updateTyping(secondPlayerId, "R")
      game.updateTyping(secondPlayerId, "RO")
      game.submitWord(secondPlayerId, "ROBOT")

      expect(game.activePlayerId).toBe(firstPlayerId)
      expect(game.round).toBe(2)
      expect(game.playersPlayedInRound.size).toBe(1)
    })

    it("should increase minLength when hard mode threshold is reached", async () => {
      const p1 = await joinPlayer("p1")
      const game = new WordChainGame(server)
      server.roomService.activeGame = game
      game.requestStartGame("p1")

      game.hardModeStartRound = 2
      game.round = 1
      game.playersPlayedInRound.add(p1.id)

      // Force next turn to verify round increment logic directly
      game.activePlayerId = p1.id
      game.nextTurn()

      expect(game.round).toBe(2)
      expect(game.minLength).toBe(4)
    })
  })

  it("should broadcast invalid word reason to all players", async () => {
    const p1 = await joinPlayer("p1")
    const p2 = await joinPlayer("p2")
    const game = new WordChainGame(server)
    server.roomService.activeGame = game
    game.requestStartGame("p1")
    game.activePlayerId = "p1" // Force p1 to be active for test stability
    game.currentWord = "TEST" // Last char T

    // P1 (active) sends invalid word (Wrong Start Letter)
    // Should be T... but sends APPLE
    game.updateTyping("p1", "A")
    game.updateTyping("p1", "AP")
    game.submitWord("p1", "APPLE")

    // P2 should receive the error
    expect(p2.send).toHaveBeenCalledWith(
      expect.stringContaining("Must start with 'T'!"),
    )
    // P1 should also receive it
    expect(p1.send).toHaveBeenCalledWith(
      expect.stringContaining("Must start with 'T'!"),
    )
  })

  it("should track last turn word for players", async () => {
    const p1 = await joinPlayer("p1")
    const game = new WordChainGame(server)
    server.roomService.activeGame = game
    game.requestStartGame("p1")
    game.activePlayerId = "p1"
    game.currentWord = "TEST"

    // P1 plays TIGER
    game.updateTyping("p1", "T")
    game.updateTyping("p1", "TI")
    game.submitWord("p1", "TIGER")

    const player = server.players.get("p1")
    expect(player?.lastTurn).toEqual({
      word: "TIGER",
      syllable: "T",
    })
  })

  it("should select a valid starting player from participants", async () => {
    await joinPlayer("p1")
    await joinPlayer("p2")
    await joinPlayer("p3")

    const game = new WordChainGame(server)
    server.roomService.activeGame = game
    game.requestStartGame("p1")

    expect(["p1", "p2", "p3"]).toContain(game.activePlayerId)
  })
})
