import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { BlackjackGame } from "./BlackjackGame"
import {
  GameMode,
  GameState,
  BlackjackClientMessageType,
} from "../../shared/types"

describe("BlackjackGame", () => {
  let game: BlackjackGame
  let mockContext: any
  let mockSocket: any

  beforeEach(() => {
    mockSocket = {
      id: "player1",
      send: vi.fn(),
    }

    mockContext = {
      players: new Map([
        [
          "player1",
          { id: "player1", name: "Player 1", isAdmin: true, isAlive: true },
        ],
        [
          "player2",
          { id: "player2", name: "Player 2", isAdmin: false, isAlive: true },
        ],
      ]),
      gameState: GameState.LOBBY,
      roomId: "test-room",
      isPrivate: false,
      broadcast: vi.fn(),
      broadcastState: vi.fn(),
      sendTo: vi.fn(),
    }

    game = new BlackjackGame(mockContext)
  })

  it("should initialize with correct default state", () => {
    const state = game.getState()
    expect(state.roundStatus).toBe("betting")
    expect(state.deckCount).toBe(4)
    expect(state.dealerHitsSoft17).toBe(true)
  })

  it("should start the game when admin requests", () => {
    game.onMessage(
      JSON.stringify({ type: BlackjackClientMessageType.START_GAME }),
      mockSocket,
    )
    expect(mockContext.gameState).toBe(GameState.COUNTDOWN)
    expect(game.getState().countdown).toBe(5)
  })

  describe("Game Flow", () => {
    beforeEach(() => {
      // Start the game and skip countdown
      game.onStart()
      // @ts-ignore - access private for test
      game.endBettingPhase()
    })

    it("should deal initial cards correctly", () => {
      const state = game.getState()
      expect(state.roundStatus).toBe("players_turn")
      expect(state.dealerHand.cards.length).toBe(2)
      expect(state.playersState["player1"].hands[0].cards.length).toBe(2)
      expect(state.playersState["player2"].hands[0].cards.length).toBe(2)
    })

    it("should allow a player to HIT", () => {
      const activeId = game.getState().activePlayerId!
      const playerSocket = { id: activeId, send: vi.fn() }
      const initialCardCount =
        game.getState().playersState[activeId].hands[0].cards.length

      game.onMessage(
        JSON.stringify({ type: BlackjackClientMessageType.HIT }),
        playerSocket as any,
      )

      expect(game.getState().playersState[activeId].hands[0].cards.length).toBe(
        initialCardCount + 1,
      )
    })

    it("should allow a player to STAND and move to the next player", () => {
      const firstId = game.getState().activePlayerId!
      const playerSocket = { id: firstId, send: vi.fn() }

      game.onMessage(
        JSON.stringify({ type: BlackjackClientMessageType.STAND }),
        playerSocket as any,
      )

      const nextId = game.getState().activePlayerId
      expect(nextId).not.toBe(firstId)
      expect(game.getState().playersState[firstId].hands[0].isStood).toBe(true)
    })

    it("should calculate score correctly (Aces)", () => {
      // @ts-ignore - access private for test
      const score1 = game.calculateScore([
        { rank: "A", suit: "hearts" },
        { rank: "K", suit: "spades" },
      ])
      expect(score1).toBe(21)

      // @ts-ignore
      const score2 = game.calculateScore([
        { rank: "A", suit: "hearts" },
        { rank: "A", suit: "spades" },
        { rank: "9", suit: "clubs" },
      ])
      expect(score2).toBe(21) // 11 + 1 + 9 = 21

      // @ts-ignore
      const score3 = game.calculateScore([
        { rank: "10", suit: "hearts" },
        { rank: "7", suit: "spades" },
        { rank: "5", suit: "clubs" },
      ])
      expect(score3).toBe(22)
    })
  })

  describe("Split Functionality", () => {
    beforeEach(() => {
      game.onStart()
      // @ts-ignore
      game.endBettingPhase()
    })

    it("should allow a player to split if they have 2 cards of same rank and enough bankroll", () => {
      const state = game["playersState"].get("player1")!
      state.bankroll = 100 // Enough to split a $25 bet
      state.hands = [
        {
          bet: 25,
          cards: [
            { rank: "8", suit: "hearts" },
            { rank: "8", suit: "spades" },
          ],
          score: 16,
          isBusted: false,
          isBlackjack: false,
          isStood: false,
        },
      ]

      game["activePlayerId"] = "player1"

      // Mock deck so we know what cards come next
      game["deck"] = [
        { rank: "3", suit: "clubs" },
        { rank: "2", suit: "diamonds" },
      ]

      // @ts-ignore
      game.handleSplit("player1")

      // Should have deducted $25 more
      expect(state.bankroll).toBe(75)

      // Should now have two active hands
      expect(state.hands.length).toBe(2)
      expect(state.hands[0].bet).toBe(25)
      expect(state.hands[1].bet).toBe(25)

      // First hand should have original 8 and new 2
      expect(state.hands[0].cards).toEqual([
        { rank: "8", suit: "hearts" },
        { rank: "2", suit: "diamonds" },
      ])

      // Second hand should have second 8 and new 3
      expect(state.hands[1].cards).toEqual([
        { rank: "8", suit: "spades" },
        { rank: "3", suit: "clubs" },
      ])

      // Active hand index should remain 0 (playing first hand)
      expect(state.activeHandIndex).toBe(0)
    })

    it("should prevent splitting if cards are different ranks", () => {
      const state = game["playersState"].get("player1")!
      state.bankroll = 100
      state.hands = [
        {
          bet: 25,
          cards: [
            { rank: "8", suit: "hearts" },
            { rank: "7", suit: "spades" },
          ],
          score: 15,
          isBusted: false,
          isBlackjack: false,
          isStood: false,
        },
      ]

      game["activePlayerId"] = "player1"

      // @ts-ignore
      game.handleSplit("player1")

      // Should have done nothing
      expect(state.bankroll).toBe(100)
      expect(state.hands.length).toBe(1)
    })

    it("should prevent splitting if player doesn't have enough bankroll", () => {
      const state = game["playersState"].get("player1")!
      state.bankroll = 10 // Not enough to match $25 bet
      state.hands = [
        {
          bet: 25,
          cards: [
            { rank: "8", suit: "hearts" },
            { rank: "8", suit: "spades" },
          ],
          score: 16,
          isBusted: false,
          isBlackjack: false,
          isStood: false,
        },
      ]

      game["activePlayerId"] = "player1"

      // @ts-ignore
      game.handleSplit("player1")

      // Should have done nothing
      expect(state.bankroll).toBe(10)
      expect(state.hands.length).toBe(1)
    })

    it("should allow a player to play their first split hand before the second", () => {
      const state = game["playersState"].get("player1")!
      state.bankroll = 100
      state.hands = [
        {
          bet: 25,
          cards: [
            { rank: "8", suit: "hearts" },
            { rank: "8", suit: "spades" },
          ],
          score: 16,
          isBusted: false,
          isBlackjack: false,
          isStood: false,
        },
      ]

      game["activePlayerId"] = "player1"
      game["deck"] = [
        { rank: "3", suit: "clubs" },
        { rank: "2", suit: "diamonds" },
        { rank: "10", suit: "hearts" },
      ]

      // Split the pair
      // @ts-ignore
      game.handleSplit("player1")

      // Active player should still be player1, active hand should be 0
      expect(game["activePlayerId"]).toBe("player1")
      expect(state.activeHandIndex).toBe(0)

      // Player stands on first hand
      // @ts-ignore
      game.handleStand("player1")

      // First hand is stood. Should advance to hand 1, active player is still player 1
      expect(state.hands[0].isStood).toBe(true)
      expect(game["activePlayerId"]).toBe("player1")
      expect(state.activeHandIndex).toBe(1)

      // Player stands on second hand
      // @ts-ignore
      game.handleStand("player1")

      // Second hand is stood. Active player should advance to player 2
      expect(state.hands[1].isStood).toBe(true)
      expect(game["activePlayerId"]).toBe("player2")
    })
  })

  describe("Winning Condition", () => {
    beforeEach(() => {
      vi.useFakeTimers()
      game.onStart()
      // @ts-ignore
      game.endBettingPhase()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("should end the game and declare a winner when goal is reached", () => {
      // Force player1 to win by giving them a winning score + hand
      const state = game["playersState"].get("player1")!
      state.bankroll = game.winningScore + 100
      state.hands = [
        {
          bet: 10,
          cards: [],
          score: 20,
          isBusted: false,
          isBlackjack: false,
          isStood: true,
        },
      ]

      // Simulate dealer busting so player1's win triggers
      game["dealerHand"].score = 25
      game["dealerHand"].isBusted = true
      game["dealerHand"].isStood = true

      // @ts-ignore
      game.endRound()

      // Fast forward the game loop timers
      vi.advanceTimersByTime(100)

      const finalState = game.getState()
      expect(mockContext.gameState).toBe(GameState.ENDED)
      expect(finalState.roundStatus).toBe("round_results")
      expect(finalState.winnerIds).toEqual(["player1"])
    })

    it("should declare the player with the highest bankroll as the winner if multiple players cross the winning score", () => {
      const state1 = game["playersState"].get("player1")!
      state1.bankroll = game.winningScore + 100
      state1.hands = [
        {
          bet: 10,
          cards: [],
          score: 20,
          isBusted: false,
          isBlackjack: false,
          isStood: true,
        },
      ]

      const state2 = game["playersState"].get("player2")!
      state2.bankroll = game.winningScore + 50
      state2.hands = [
        {
          bet: 10,
          cards: [],
          score: 20,
          isBusted: false,
          isBlackjack: false,
          isStood: true,
        },
      ]

      game["dealerHand"].score = 25
      game["dealerHand"].isBusted = true
      game["dealerHand"].isStood = true

      // @ts-ignore
      game.endRound()
      vi.advanceTimersByTime(100)

      const finalState = game.getState()
      expect(mockContext.gameState).toBe(GameState.ENDED)
      expect(finalState.winnerIds).toEqual(["player1"])
    })

    it("should declare multiple winners if they tie for the highest bankroll above the winning score", () => {
      const state1 = game["playersState"].get("player1")!
      state1.bankroll = game.winningScore + 100
      state1.hands = [
        {
          bet: 10,
          cards: [],
          score: 20,
          isBusted: false,
          isBlackjack: false,
          isStood: true,
        },
      ]

      const state2 = game["playersState"].get("player2")!
      state2.bankroll = game.winningScore + 100
      state2.hands = [
        {
          bet: 10,
          cards: [],
          score: 20,
          isBusted: false,
          isBlackjack: false,
          isStood: true,
        },
      ]

      game["dealerHand"].score = 25
      game["dealerHand"].isBusted = true
      game["dealerHand"].isStood = true

      // @ts-ignore
      game.endRound()
      vi.advanceTimersByTime(100)

      const finalState = game.getState()
      expect(mockContext.gameState).toBe(GameState.ENDED)
      expect(finalState.winnerIds).toContain("player1")
      expect(finalState.winnerIds).toContain("player2")
      expect(finalState.winnerIds.length).toBe(2)
    })
  })
})
