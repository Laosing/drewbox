import type {
  BombPartySettings,
  WordleSettings,
  WordChainSettings,
  BlackjackSettings,
} from "./config"

export enum ServerMessageType {
  STATE_UPDATE = "STATE_UPDATE",
  ERROR = "ERROR",
  BONUS = "BONUS",
  EXPLOSION = "EXPLOSION",
  GAME_OVER = "GAME_OVER",
  CHAT_MESSAGE = "CHAT_MESSAGE",
  TYPING_UPDATE = "TYPING_UPDATE",
  ROOM_LIST = "ROOM_LIST",
  SYSTEM_MESSAGE = "SYSTEM_MESSAGE",
  VALID_WORD = "VALID_WORD",
  KICK = "KICK",
}

export type GuessResult = "correct" | "present" | "absent"

export interface Guess {
  playerId: string
  word: string
  results: GuessResult[]
  timestamp: number
}

export type Player = {
  id: string
  name: string
  lives: number
  isAlive: boolean
  wins: number
  usedLetters: string[]
  isAdmin: boolean
  clientId?: string
  lastTurn?: { word: string; syllable: string }
  bonusLetters?: string[]
}

export enum GameMode {
  BOMB_PARTY = "BOMB_PARTY",
  WORDLE = "WORDLE",
  WORD_CHAIN = "WORD_CHAIN",
  BLACKJACK = "BLACKJACK",
}

export enum GameState {
  LOBBY = "LOBBY",
  COUNTDOWN = "COUNTDOWN",
  PLAYING = "PLAYING",
  ENDED = "ENDED",
}

export enum GlobalClientMessageType {
  SET_NAME = "SET_NAME",
  CHAT_MESSAGE = "CHAT_MESSAGE",
  KICK_PLAYER = "KICK_PLAYER",
  UPDATE_SETTINGS = "UPDATE_SETTINGS", // Global settings (chat, log)
  CHANGE_GAME_MODE = "CHANGE_GAME_MODE",
}

export enum WordleClientMessageType {
  START_GAME = "WORDLE_START_GAME",
  STOP_GAME = "WORDLE_STOP_GAME",
  SUBMIT_WORD = "WORDLE_SUBMIT_WORD",
  UPDATE_TYPING = "WORDLE_UPDATE_TYPING",
  UPDATE_SETTINGS = "WORDLE_UPDATE_SETTINGS",
  REVEAL_WORD = "WORDLE_REVEAL_WORD",
  USE_HINT = "WORDLE_USE_HINT",
}

export enum BombPartyClientMessageType {
  START_GAME = "BP_START_GAME",
  STOP_GAME = "BP_STOP_GAME",
  RESET_GAME = "BP_RESET_GAME",
  SUBMIT_WORD = "BP_SUBMIT_WORD",
  UPDATE_TYPING = "BP_UPDATE_TYPING",
  UPDATE_SETTINGS = "BP_UPDATE_SETTINGS",
}

export enum WordChainClientMessageType {
  START_GAME = "WC_START_GAME",
  STOP_GAME = "WC_STOP_GAME",
  SUBMIT_WORD = "WC_SUBMIT_WORD",
  UPDATE_TYPING = "WC_UPDATE_TYPING",
  UPDATE_SETTINGS = "WC_UPDATE_SETTINGS",
}

export enum BlackjackClientMessageType {
  START_GAME = "BJ_START_GAME",
  STOP_GAME = "BJ_STOP_GAME",
  RESET_GAME = "BJ_RESET_GAME",
  HIT = "BJ_HIT",
  STAND = "BJ_STAND",
  DOUBLE = "BJ_DOUBLE",
  SPLIT = "BJ_SPLIT",
  PLACE_BET = "BJ_PLACE_BET",
  UPDATE_SETTINGS = "BJ_UPDATE_SETTINGS",
}

export type GlobalClientMessage =
  | { type: GlobalClientMessageType.SET_NAME; name: string }
  | { type: GlobalClientMessageType.CHAT_MESSAGE; text: string }
  | { type: GlobalClientMessageType.KICK_PLAYER; playerId: string }
  | {
      type: GlobalClientMessageType.UPDATE_SETTINGS
      // Removed global chat/log
    }
  | { type: GlobalClientMessageType.CHANGE_GAME_MODE; mode: GameMode }

export type WordleClientMessage =
  | { type: WordleClientMessageType.START_GAME; reuseWord?: boolean }
  | { type: WordleClientMessageType.STOP_GAME }
  | { type: WordleClientMessageType.SUBMIT_WORD; word: string }
  | { type: WordleClientMessageType.UPDATE_TYPING; text: string }
  | { type: WordleClientMessageType.REVEAL_WORD }
  | { type: WordleClientMessageType.USE_HINT }
  | (WordleSettings & { type: WordleClientMessageType.UPDATE_SETTINGS })

export type BombPartyClientMessage =
  | { type: BombPartyClientMessageType.START_GAME }
  | { type: BombPartyClientMessageType.STOP_GAME }
  | { type: BombPartyClientMessageType.RESET_GAME }
  | { type: BombPartyClientMessageType.SUBMIT_WORD; word: string }
  | { type: BombPartyClientMessageType.UPDATE_TYPING; text: string }
  | (BombPartySettings & { type: BombPartyClientMessageType.UPDATE_SETTINGS })

export type WordChainClientMessage =
  | { type: WordChainClientMessageType.START_GAME }
  | { type: WordChainClientMessageType.STOP_GAME }
  | { type: WordChainClientMessageType.SUBMIT_WORD; word: string }
  | { type: WordChainClientMessageType.UPDATE_TYPING; text: string }
  | (WordChainSettings & { type: WordChainClientMessageType.UPDATE_SETTINGS })

export type BlackjackClientMessage =
  | { type: BlackjackClientMessageType.START_GAME }
  | { type: BlackjackClientMessageType.STOP_GAME }
  | { type: BlackjackClientMessageType.RESET_GAME }
  | { type: BlackjackClientMessageType.HIT }
  | { type: BlackjackClientMessageType.STAND }
  | { type: BlackjackClientMessageType.DOUBLE }
  | { type: BlackjackClientMessageType.SPLIT }
  | { type: BlackjackClientMessageType.PLACE_BET; amount: number }
  | (BlackjackSettings & { type: BlackjackClientMessageType.UPDATE_SETTINGS })

export type ClientMessage =
  | GlobalClientMessage
  | WordleClientMessage
  | BombPartyClientMessage
  | WordChainClientMessage
  | BlackjackClientMessage

export interface BaseServerState {
  dictionaryLoaded: boolean
  chatEnabled: boolean
  gameLogEnabled: boolean
}

export interface BombPartyServerState extends BaseServerState {
  currentSyllable: string
  activePlayerId: string | null
  timer: number
  maxTimer: number
  startingLives: number
  syllableChangeThreshold: number
  bonusLettersEnabled: boolean
  bonusWordLength: number
  hardModeEnabled: boolean
  hardModeStartRound: number
  round: number
  winnerId: string | null
  countdown: number | null
}

export interface WordleServerState extends BaseServerState {
  guesses: Guess[]
  activePlayerId: string | null
  winnerId: string | null
  countdown: number | null
  timer: number
  maxTimer: number
  maxAttempts: number
  wordLength: number
  revealedWord?: string
  hintsUsed: number
  hintLetterIndexes: number[]
  hintLetters: string[]
  freeHintLimit: number
  freeHintEnabled: boolean
}

export interface WordChainServerState extends BaseServerState {
  currentWord: string
  activePlayerId: string | null
  countdown: number | null
  timer: number
  maxTimer: number
  startingLives: number
  usedWordsCount: number
  winnerId: string | null
  round: number
  hardModeStartRound: number
  minLength: number
}

export type Suit = "hearts" | "diamonds" | "clubs" | "spades"
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"

export interface Card {
  suit: Suit
  rank: Rank
}

export interface Hand {
  cards: Card[]
  score: number
  isBusted: boolean
  isBlackjack: boolean
  isStood: boolean
  bet: number
  status?:
    | "playing"
    | "stood"
    | "busted"
    | "blackjack"
    | "won"
    | "lost"
    | "push"
}

export interface BlackjackPlayerState {
  hands: Hand[]
  activeHandIndex: number
  bankroll: number
}

export interface BlackjackServerState extends BaseServerState {
  playersState: Record<string, BlackjackPlayerState>
  dealerHand: Hand
  activePlayerId: string | null
  roundStatus:
    | "betting"
    | "dealing"
    | "players_turn"
    | "dealer_turn"
    | "round_results"
  countdown: number | null
  deckCount: number
  maxTimer: number
  timer: number
  bettingTimer: number | null
  dealerHitsSoft17: boolean
  winningScore: number
  winnerIds: string[]
  deckRemaining: number
}
