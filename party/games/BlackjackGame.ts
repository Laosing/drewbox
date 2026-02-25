import { BaseGame } from "../core/BaseGame"
import {
  BlackjackClientMessageType,
  GameState,
  ServerMessageType,
  type Card,
  type Hand,
  type Suit,
  type Rank,
  type BlackjackPlayerState,
  type BlackjackClientMessage,
} from "../../shared/types"
import { BlackjackSettingsSchema, GAME_CONFIG } from "../../shared/config"
import type * as Party from "partykit/server"

export class BlackjackGame extends BaseGame {
  playersState: Map<string, BlackjackPlayerState> = new Map()
  dealerHand: Hand = this.createEmptyHand()
  deck: Card[] = []
  deckCount: number = GAME_CONFIG.BLACKJACK.DECKS.DEFAULT
  maxTimer: number = GAME_CONFIG.BLACKJACK.TIMER.DEFAULT
  timer: number = GAME_CONFIG.BLACKJACK.TIMER.DEFAULT
  dealerHitsSoft17: boolean = true
  activePlayerId: string | null = null
  roundStatus:
    | "betting"
    | "dealing"
    | "players_turn"
    | "dealer_turn"
    | "round_results" = "betting"
  countdown: number | null = null
  bettingTimer: number | null = null
  private playersWhoBet: Set<string> = new Set()
  winningScore: number = GAME_CONFIG.BLACKJACK.WINNING_SCORE.DEFAULT
  winnerIds: string[] = []

  constructor(context: any) {
    super(context)
  }

  onStart(): void {
    if (this.players.size < 1) return

    if (this.context.gameState === GameState.LOBBY) {
      this.context.gameState = GameState.COUNTDOWN
      this.countdown = 5
      this.gameTimer.start()
      this.context.broadcastState()
      return
    }

    // Skip countdown if already in countdown phase
    if (this.context.gameState === GameState.COUNTDOWN) {
      this.startBettingPhase()
      return
    }
  }

  private startRound(): void {
    this.context.gameState = GameState.PLAYING
    this.countdown = null
    this.roundStatus = "dealing"
    this.deck = this.createShuffledDeck(this.deckCount)

    // Initialize players
    for (const player of this.players.values()) {
      if (!this.playersState.has(player.id)) {
        this.playersState.set(player.id, {
          hands: [],
          activeHandIndex: 0,
          bankroll: GAME_CONFIG.BLACKJACK.INITIAL_BANKROLL.DEFAULT,
        })
      }
      const state = this.playersState.get(player.id)!
      state.activeHandIndex = 0
    }

    this.dealerHand = this.createEmptyHand()

    // Deal initial cards
    this.dealInitialCards()
  }

  private dealInitialCards() {
    // Two cards to each player, one at a time
    for (let i = 0; i < 2; i++) {
      for (const state of this.playersState.values()) {
        if (state.hands.length > 0) {
          state.hands[0].cards.push(this.drawCard())
        }
      }
      this.dealerHand.cards.push(this.drawCard())
    }

    // Update scores
    for (const state of this.playersState.values()) {
      if (state.hands.length > 0) {
        state.hands[0].score = this.calculateScore(state.hands[0].cards)
        state.hands[0].isBlackjack = state.hands[0].score === 21
      }
    }
    this.dealerHand.score = this.calculateScore(this.dealerHand.cards)
    this.dealerHand.isBlackjack = this.dealerHand.score === 21

    this.roundStatus = "players_turn"
    this.moveToNextActivePlayer()
    this.context.broadcastState()
  }

  private moveToNextActivePlayer() {
    const playerIds = Array.from(this.players.keys())
    const currentIndex = this.activePlayerId
      ? playerIds.indexOf(this.activePlayerId)
      : -1

    // First check if the CURRENT active player has another unplayed split hand
    if (currentIndex !== -1) {
      const currentState = this.playersState.get(this.activePlayerId!)
      if (
        currentState &&
        currentState.activeHandIndex + 1 < currentState.hands.length
      ) {
        currentState.activeHandIndex++
        this.timer = this.maxTimer
        return
      }
    }

    for (let i = 1; i <= playerIds.length; i++) {
      const nextIndex = (currentIndex + i) % playerIds.length
      const nextId = playerIds[nextIndex]
      const state = this.playersState.get(nextId)

      // Skip players with no active hands (e.g. bankrupt or late joiners)
      if (!state || state.hands.length === 0) continue

      if (
        state.hands.some((h) => !h.isStood && !h.isBusted && !h.isBlackjack)
      ) {
        this.activePlayerId = nextId
        state.activeHandIndex = state.hands.findIndex(
          (h) => !h.isStood && !h.isBusted && !h.isBlackjack,
        )
        if (state.activeHandIndex === -1) state.activeHandIndex = 0
        this.timer = this.maxTimer
        return
      }
    }

    // No more players to move to
    this.activePlayerId = null
    this.roundStatus = "dealer_turn"
    this.playDealerTurn()
  }

  private playDealerTurn() {
    this.dealerHand.isStood = false

    const play = () => {
      const score = this.calculateScore(this.dealerHand.cards)
      this.dealerHand.score = score

      const shouldHit =
        score < 17 ||
        (this.dealerHitsSoft17 && this.isSoft17(this.dealerHand.cards))

      if (shouldHit) {
        this.dealerHand.cards.push(this.drawCard())
        this.dealerHand.score = this.calculateScore(this.dealerHand.cards)
        if (this.dealerHand.score > 21) {
          this.dealerHand.isBusted = true
          this.endRound()
        } else {
          setTimeout(play, 1000)
          this.context.broadcastState()
        }
      } else {
        this.dealerHand.isStood = true
        this.endRound()
      }
    }

    setTimeout(play, 1000)
  }

  private endRound() {
    this.roundStatus = "round_results"

    const dealerScore = this.dealerHand.score
    const dealerBusted = this.dealerHand.isBusted
    const dealerBlackjack = this.dealerHand.isBlackjack

    for (const [_, state] of this.playersState.entries()) {
      for (const hand of state.hands) {
        if (hand.isBusted) {
          hand.status = "lost"
        } else if (dealerBusted) {
          hand.status = "won"
          state.bankroll += hand.bet * 2
        } else if (hand.isBlackjack && !dealerBlackjack) {
          hand.status = "blackjack"
          state.bankroll += hand.bet * 2.5 // 3:2 payout
        } else if (hand.score > dealerScore) {
          hand.status = "won"
          state.bankroll += hand.bet * 2
        } else if (hand.score < dealerScore) {
          hand.status = "lost"
        } else {
          hand.status = "push"
          state.bankroll += hand.bet
        }
      }
    }

    this.context.broadcastState()

    // Check for win condition
    let maxBankroll = -1
    let tempWinnerIds: string[] = []

    for (const player of this.players.values()) {
      const pState = this.playersState.get(player.id)
      if (pState && pState.bankroll >= this.winningScore) {
        if (pState.bankroll > maxBankroll) {
          maxBankroll = pState.bankroll
          tempWinnerIds = [player.id]
        } else if (pState.bankroll === maxBankroll) {
          tempWinnerIds.push(player.id)
        }
      }
    }

    if (tempWinnerIds.length > 0) {
      this.winnerIds = tempWinnerIds
      this.context.gameState = GameState.ENDED
      this.roundStatus = "round_results"

      let winnerNames = ""
      if (tempWinnerIds.length === 1) {
        winnerNames = this.players.get(tempWinnerIds[0])?.name || "A player"
      } else {
        const names = tempWinnerIds.map(
          (id) => this.players.get(id)?.name || "A player",
        )
        winnerNames =
          names.slice(0, -1).join(", ") + " and " + names[names.length - 1]
      }

      const verb = tempWinnerIds.length > 1 ? "win" : "wins"

      this.broadcast({
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: `Game Over! ${winnerNames} ${verb} with $${maxBankroll}!`,
      })
      this.context.broadcastState()
      return
    }

    // Check for bankruptcy if no one won
    setTimeout(() => {
      if (this.checkAllPlayersBankrupt()) {
        this.endGameBankrupt()
      } else {
        this.startBettingPhase()
      }
    }, 5000)
  }

  private checkAllPlayersBankrupt(): boolean {
    const minBet = GAME_CONFIG.BLACKJACK.MIN_BET.DEFAULT
    for (const state of this.playersState.values()) {
      if (state.bankroll >= minBet) return false
    }
    return true
  }

  private endGameBankrupt() {
    this.context.gameState = GameState.ENDED
    this.roundStatus = "round_results" // Show final results
    this.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: "Game Over! All players are bankrupt.",
    })
    this.context.broadcastState()
  }

  private startBettingPhase() {
    this.context.gameState = GameState.PLAYING
    this.countdown = null
    this.roundStatus = "betting"
    this.bettingTimer = 30
    this.playersWhoBet.clear()

    // Clear hands from previous round
    for (const state of this.playersState.values()) {
      state.hands = []
    }
    this.dealerHand = this.createEmptyHand()

    this.context.broadcastState()
  }

  onTick(): void {
    if (
      this.context.gameState === GameState.PLAYING &&
      this.roundStatus === "betting"
    ) {
      if (this.bettingTimer !== null) {
        this.bettingTimer -= 1
        if (this.bettingTimer <= 0) {
          this.endBettingPhase()
        } else {
          this.context.broadcastState()
        }
      }
    }

    if (this.context.gameState === GameState.COUNTDOWN) {
      if (this.countdown !== null) {
        this.countdown -= 1
        if (this.countdown <= 0) {
          this.startBettingPhase()
        } else {
          this.context.broadcastState()
        }
      }
    }

    if (
      this.context.gameState === GameState.PLAYING &&
      this.roundStatus === "players_turn" &&
      this.activePlayerId
    ) {
      this.timer -= 1
      if (this.timer <= 0) {
        this.handleStand(this.activePlayerId)
      } else {
        this.context.broadcastState()
      }
    }
  }

  onMessage(message: string, sender: Party.Connection): void {
    try {
      const data = JSON.parse(message) as BlackjackClientMessage
      const player = this.players.get(sender.id)
      if (!player) return

      switch (data.type) {
        case BlackjackClientMessageType.START_GAME:
          if (player.isAdmin) this.onStart()
          break
        case BlackjackClientMessageType.HIT:
          this.handleHit(sender.id)
          break
        case BlackjackClientMessageType.STAND:
          this.handleStand(sender.id)
          break
        case BlackjackClientMessageType.DOUBLE:
          this.handleDouble(sender.id)
          break
        case BlackjackClientMessageType.SPLIT:
          this.handleSplit(sender.id)
          break
        case BlackjackClientMessageType.UPDATE_SETTINGS:
          if (player.isAdmin) this.updateSettings(sender.id, data)
          break
        case BlackjackClientMessageType.PLACE_BET:
          this.handlePlaceBet(sender.id, data.amount)
          break
        case BlackjackClientMessageType.STOP_GAME:
          if (player.isAdmin) this.requestStopGame(sender.id)
          break
        case BlackjackClientMessageType.RESET_GAME:
          if (player.isAdmin) this.requestResetGame(sender.id)
          break
      }
    } catch (e) {
      this.logger.error("Blackjack message error", e)
    }
  }

  private handleHit(playerId: string) {
    if (this.roundStatus !== "players_turn" || this.activePlayerId !== playerId)
      return
    const state = this.playersState.get(playerId)
    if (!state) return

    const hand = state.hands[state.activeHandIndex]
    hand.cards.push(this.drawCard())
    hand.score = this.calculateScore(hand.cards)
    this.timer = this.maxTimer

    if (hand.score > 21) {
      hand.isBusted = true
      this.moveToNextActivePlayer()
    } else if (hand.score === 21) {
      hand.isStood = true
      this.moveToNextActivePlayer()
    }

    this.context.broadcastState()
  }

  private handleStand(playerId: string) {
    if (this.roundStatus !== "players_turn" || this.activePlayerId !== playerId)
      return
    const state = this.playersState.get(playerId)
    if (!state) return

    const hand = state.hands[state.activeHandIndex]
    hand.isStood = true
    this.moveToNextActivePlayer()
    this.context.broadcastState()
  }

  private handleDouble(playerId: string) {
    if (this.roundStatus !== "players_turn" || this.activePlayerId !== playerId)
      return
    const state = this.playersState.get(playerId)
    if (!state) return

    const hand = state.hands[state.activeHandIndex]
    if (hand.cards.length !== 2 || state.bankroll < hand.bet) return

    state.bankroll -= hand.bet
    hand.bet *= 2
    hand.cards.push(this.drawCard())
    hand.score = this.calculateScore(hand.cards)
    hand.isStood = true
    this.timer = this.maxTimer

    if (hand.score > 21) {
      hand.isBusted = true
    }

    this.moveToNextActivePlayer()
    this.context.broadcastState()
  }

  private handleSplit(playerId: string) {
    if (this.roundStatus !== "players_turn" || this.activePlayerId !== playerId)
      return
    const state = this.playersState.get(playerId)
    if (!state) return

    const hand = state.hands[state.activeHandIndex]

    // Only allow splitting if hand has exactly 2 cards that share the same rank
    if (hand.cards.length !== 2) return
    if (hand.cards[0].rank !== hand.cards[1].rank) return

    // Player needs enough money to duplicate the bet
    if (state.bankroll < hand.bet) return

    state.bankroll -= hand.bet

    // Create new hand with the second card
    const splitCard = hand.cards.pop()!
    const newHand = this.createEmptyHand(hand.bet)
    newHand.cards.push(splitCard)

    // Re-draw one card for each hand
    hand.cards.push(this.drawCard())
    newHand.cards.push(this.drawCard())

    // Recalculate scores
    hand.score = this.calculateScore(hand.cards)
    newHand.score = this.calculateScore(newHand.cards)

    // Add new hand to player's array
    state.hands.splice(state.activeHandIndex + 1, 0, newHand)

    // Check for auto-resolves on the original hand (now holding new cards)
    if (hand.score > 21) {
      hand.isBusted = true
      this.moveToNextActivePlayer()
    } else if (hand.score === 21) {
      hand.isStood = true
      this.moveToNextActivePlayer()
    }

    this.timer = this.maxTimer
    this.context.broadcastState()
  }

  private createEmptyHand(bet: number = 0): Hand {
    return {
      cards: [],
      score: 0,
      isBusted: false,
      isBlackjack: false,
      isStood: false,
      bet,
    }
  }

  private createShuffledDeck(count: number): Card[] {
    const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"]
    const ranks: Rank[] = [
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
    ]
    const deck: Card[] = []

    for (let i = 0; i < count; i++) {
      for (const suit of suits) {
        for (const rank of ranks) {
          deck.push({ suit, rank })
        }
      }
    }

    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }

    return deck
  }

  private drawCard(): Card {
    if (this.deck.length === 0) {
      this.deck = this.createShuffledDeck(this.deckCount)
    }
    return this.deck.pop()!
  }

  private calculateScore(cards: Card[]): number {
    let score = 0
    let aces = 0

    for (const card of cards) {
      if (card.rank === "A") {
        aces++
        score += 11
      } else if (["J", "Q", "K"].includes(card.rank)) {
        score += 10
      } else {
        score += parseInt(card.rank)
      }
    }

    while (score > 21 && aces > 0) {
      score -= 10
      aces--
    }

    return score
  }

  private isSoft17(cards: Card[]): boolean {
    let score = 0
    let hasAce = false
    for (const card of cards) {
      if (card.rank === "A") {
        hasAce = true
        score += 11
      } else if (["J", "Q", "K"].includes(card.rank)) {
        score += 10
      } else {
        score += parseInt(card.rank)
      }
    }
    return score === 17 && hasAce
  }

  public requestStopGame(playerId: string) {
    const player = this.players.get(playerId)
    if (
      player?.isAdmin &&
      (this.context.gameState === GameState.PLAYING ||
        this.context.gameState === GameState.COUNTDOWN)
    ) {
      this.context.gameState = GameState.ENDED
      this.activePlayerId = null
      this.countdown = null
      this.gameTimer.stop()
      this.winnerIds = []
      this.broadcast({
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Admin stopped the game!",
      })
      this.context.broadcastState()
    }
  }

  public requestResetGame(playerId: string) {
    const player = this.players.get(playerId)
    if (player?.isAdmin && this.context.gameState === GameState.ENDED) {
      this.context.gameState = GameState.LOBBY
      this.roundStatus = "betting"
      this.playersState.clear()
      this.dealerHand = this.createEmptyHand()
      this.broadcast({
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Game reset to lobby!",
      })
      this.context.broadcastState()
    }
  }

  private updateSettings(playerId: string, settings: any) {
    const player = this.players.get(playerId)
    if (!player?.isAdmin) return

    const result = BlackjackSettingsSchema.safeParse(settings)
    if (result.success) {
      const s = result.data
      if (s.deckCount !== undefined) this.deckCount = s.deckCount
      if (s.dealerHitsSoft17 !== undefined)
        this.dealerHitsSoft17 = s.dealerHitsSoft17
      if (s.maxTimer !== undefined) this.maxTimer = s.maxTimer
      if (s.winningScore !== undefined) this.winningScore = s.winningScore
      if (s.chatEnabled !== undefined) this.chatEnabled = s.chatEnabled
      if (s.gameLogEnabled !== undefined) this.gameLogEnabled = s.gameLogEnabled

      this.logger.info("Settings updated", { adminId: playerId, ...s })
      this.context.broadcastState()
    } else {
      this.logger.error("Blackjack settings update failed validation", {
        errors: result.error.issues,
        settings,
      })
    }
  }

  private handlePlaceBet(playerId: string, amount: number) {
    if (this.roundStatus !== "betting") return

    // Initialize state if not exists
    if (!this.playersState.has(playerId)) {
      this.playersState.set(playerId, {
        hands: [],
        activeHandIndex: 0,
        bankroll: GAME_CONFIG.BLACKJACK.INITIAL_BANKROLL.DEFAULT,
      })
    }

    const state = this.playersState.get(playerId)!
    const minBet = GAME_CONFIG.BLACKJACK.MIN_BET.DEFAULT

    if (state.bankroll < minBet) {
      this.sendTo(playerId, {
        type: ServerMessageType.ERROR,
        message: "You don't have enough money to place the minimum bet!",
      })
      return
    }

    const actualAmount = Math.max(minBet, Math.min(amount, state.bankroll))

    state.hands = [this.createEmptyHand(actualAmount)]
    state.bankroll -= actualAmount

    this.playersWhoBet.add(playerId)
    this.context.broadcastState()

    // If all players who can bet have bet, end phase early
    let playersWhoCanBetCount = 0
    for (const player of this.players.values()) {
      if (this.playersWhoBet.has(player.id)) {
        playersWhoCanBetCount++
        continue
      }
      const pState = this.playersState.get(player.id)
      const bankroll = pState
        ? pState.bankroll
        : GAME_CONFIG.BLACKJACK.INITIAL_BANKROLL.DEFAULT
      if (bankroll >= minBet) {
        playersWhoCanBetCount++
      }
    }

    if (this.playersWhoBet.size >= playersWhoCanBetCount) {
      this.endBettingPhase()
    }
  }

  private endBettingPhase() {
    this.bettingTimer = null

    const minBet = GAME_CONFIG.BLACKJACK.MIN_BET.DEFAULT

    // Ensure everyone who can bet has a bet; if they are bankrupt, they get empty hands array
    for (const player of this.players.values()) {
      if (!this.playersWhoBet.has(player.id)) {
        if (!this.playersState.has(player.id)) {
          this.playersState.set(player.id, {
            hands: [],
            activeHandIndex: 0,
            bankroll: GAME_CONFIG.BLACKJACK.INITIAL_BANKROLL.DEFAULT,
          })
        }
        const state = this.playersState.get(player.id)!

        if (state.bankroll >= minBet) {
          const betAmount = minBet // Force min bet if they forgot
          state.hands = [this.createEmptyHand(betAmount)]
          state.bankroll -= betAmount
        } else {
          // Bankrupt: explicit empty hands array
          state.hands = []
        }
      }
    }

    this.context.gameState = GameState.PLAYING
    this.startRound()
    this.context.broadcastState()
  }

  getState(): Record<string, any> {
    const playersStateObj: Record<string, BlackjackPlayerState> = {}

    // Ensure all current players have at least a default state for the UI
    for (const player of this.players.values()) {
      if (!this.playersState.has(player.id)) {
        this.playersState.set(player.id, {
          hands: [],
          activeHandIndex: 0,
          bankroll: GAME_CONFIG.BLACKJACK.INITIAL_BANKROLL.DEFAULT,
        })
      }
      playersStateObj[player.id] = this.playersState.get(player.id)!
    }

    return {
      playersState: playersStateObj,
      dealerHand: this.dealerHand,
      activePlayerId: this.activePlayerId,
      roundStatus: this.roundStatus,
      countdown: this.countdown,
      bettingTimer: this.bettingTimer,
      deckCount: this.deckCount,
      maxTimer: this.maxTimer,
      timer: this.timer,
      dealerHitsSoft17: this.dealerHitsSoft17,
      chatEnabled: this.chatEnabled,
      gameLogEnabled: this.gameLogEnabled,
      winningScore: this.winningScore,
      winnerIds: this.winnerIds,
    }
  }

  onPlayerJoin(player: any) {
    // If game is playing, mark new player as bankrupt for this round so they spectate
    if (this.context.gameState === GameState.PLAYING) {
      if (!this.playersState.has(player.id)) {
        this.playersState.set(player.id, {
          hands: [],
          activeHandIndex: 0,
          bankroll: 0, // 0 bankroll == disabled/spectator
        })
      } else {
        this.playersState.get(player.id)!.bankroll = 0
      }
      this.sendTo(player.id, {
        type: ServerMessageType.SYSTEM_MESSAGE,
        message: "Game in progress. You are spectating until the next round.",
      })
    }
  }
}
