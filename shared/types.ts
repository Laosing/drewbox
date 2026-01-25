import { z } from "zod"

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
}

// Game Configuration Constants
export const GAME_CONFIG = {
  BOMB_PARTY: {
    LIVES: { MIN: 1, MAX: 10, DEFAULT: 2 },
    TIMER: { MIN: 5, MAX: 60, DEFAULT: 10 },
    SYLLABLE_CHANGE: { MIN: 1, MAX: 10, DEFAULT: 2 },
    BONUS_LENGTH: { MIN: 5, MAX: 20, DEFAULT: 11 },
    HARD_MODE_START: { MIN: 3, MAX: 10, DEFAULT: 5 },
  },
  WORDLE: {
    TIMER: { MIN: 5, MAX: 120, DEFAULT: 60 },
    ATTEMPTS: { MIN: 5, MAX: 15, DEFAULT: 5 },
    LENGTH: { MIN: 3, MAX: 15, DEFAULT: 5 },
  },
  WORD_CHAIN: {
    TIMER: { MIN: 5, MAX: 60, DEFAULT: 10 },
    LIVES: { MIN: 1, MAX: 5, DEFAULT: 2 },
  },
}

// Zod Schemas for Settings
export const BombPartySettingsSchema = z.object({
  startingLives: z
    .number()
    .min(GAME_CONFIG.BOMB_PARTY.LIVES.MIN)
    .max(GAME_CONFIG.BOMB_PARTY.LIVES.MAX)
    .optional(),
  maxTimer: z
    .number()
    .min(GAME_CONFIG.BOMB_PARTY.TIMER.MIN)
    .max(GAME_CONFIG.BOMB_PARTY.TIMER.MAX)
    .optional(),
  syllableChangeThreshold: z
    .number()
    .min(GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MIN)
    .max(GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MAX)
    .optional(),
  bonusWordLength: z
    .number()
    .min(GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.MIN)
    .max(GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.MAX)
    .optional(),
  hardModeStartRound: z
    .number()
    .min(GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.MIN)
    .max(GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.MAX)
    .optional(),
  chatEnabled: z.boolean().optional(),
  gameLogEnabled: z.boolean().optional(),
})

export const WordleSettingsSchema = z.object({
  maxTimer: z
    .number()
    .min(GAME_CONFIG.WORDLE.TIMER.MIN)
    .max(GAME_CONFIG.WORDLE.TIMER.MAX)
    .optional(),
  maxAttempts: z
    .number()
    .min(GAME_CONFIG.WORDLE.ATTEMPTS.MIN)
    .max(GAME_CONFIG.WORDLE.ATTEMPTS.MAX)
    .optional(),
  wordLength: z
    .number()
    .min(GAME_CONFIG.WORDLE.LENGTH.MIN)
    .max(GAME_CONFIG.WORDLE.LENGTH.MAX)
    .optional(),
  chatEnabled: z.boolean().optional(),
  gameLogEnabled: z.boolean().optional(),
})

export const WordChainSettingsSchema = z.object({
  maxTimer: z
    .number()
    .min(GAME_CONFIG.WORD_CHAIN.TIMER.MIN)
    .max(GAME_CONFIG.WORD_CHAIN.TIMER.MAX)
    .optional(),
  startingLives: z
    .number()
    .min(GAME_CONFIG.WORD_CHAIN.LIVES.MIN)
    .max(GAME_CONFIG.WORD_CHAIN.LIVES.MAX)
    .optional(),
  chatEnabled: z.boolean().optional(),
  gameLogEnabled: z.boolean().optional(),
})

export type BombPartySettings = z.infer<typeof BombPartySettingsSchema>
export type WordleSettings = z.infer<typeof WordleSettingsSchema>
export type WordChainSettings = z.infer<typeof WordChainSettingsSchema>

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
}

export enum GameState {
  LOBBY = "LOBBY",
  PLAYING = "PLAYING",
  ENDED = "ENDED",
}

export enum GlobalClientMessageType {
  SET_NAME = "SET_NAME",
  CHAT_MESSAGE = "CHAT_MESSAGE",
  KICK_PLAYER = "KICK_PLAYER",
  UPDATE_SETTINGS = "UPDATE_SETTINGS", // Global settings (chat, log)
}

export enum WordleClientMessageType {
  START_GAME = "WORDLE_START_GAME",
  STOP_GAME = "WORDLE_STOP_GAME",
  SUBMIT_WORD = "WORDLE_SUBMIT_WORD",
  UPDATE_TYPING = "WORDLE_UPDATE_TYPING",
  UPDATE_SETTINGS = "WORDLE_UPDATE_SETTINGS",
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

export type GlobalClientMessage =
  | { type: GlobalClientMessageType.SET_NAME; name: string }
  | { type: GlobalClientMessageType.CHAT_MESSAGE; text: string }
  | { type: GlobalClientMessageType.KICK_PLAYER; playerId: string }
  | {
      type: GlobalClientMessageType.UPDATE_SETTINGS
      // Removed global chat/log
    }

export type WordleClientMessage =
  | { type: WordleClientMessageType.START_GAME; reuseWord?: boolean }
  | { type: WordleClientMessageType.STOP_GAME }
  | { type: WordleClientMessageType.SUBMIT_WORD; word: string }
  | { type: WordleClientMessageType.UPDATE_TYPING; text: string }
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

export type ClientMessage =
  | GlobalClientMessage
  | WordleClientMessage
  | BombPartyClientMessage
  | WordChainClientMessage

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
  bonusWordLength: number
  hardModeStartRound: number
  round: number
  winnerId: string | null
}

export interface WordleServerState extends BaseServerState {
  guesses: Guess[]
  activePlayerId: string | null
  winnerId: string | null
  timer: number
  maxTimer: number
  maxAttempts: number
  wordLength: number
}

export interface WordChainServerState extends BaseServerState {
  currentWord: string
  activePlayerId: string | null
  timer: number
  maxTimer: number
  startingLives: number
  usedWordsCount: number
  winnerId: string | null
}
