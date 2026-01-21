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
  },
  WORDLE: {
    TIMER: { MIN: 5, MAX: 300, DEFAULT: 60 },
    ATTEMPTS: { MIN: 5, MAX: 15, DEFAULT: 5 },
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
  chatEnabled: z.boolean().optional(),
  gameLogEnabled: z.boolean().optional(),
})

export type BombPartySettings = z.infer<typeof BombPartySettingsSchema>
export type WordleSettings = z.infer<typeof WordleSettingsSchema>

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
}

export enum GameMode {
  BOMB_PARTY = "BOMB_PARTY",
  WORDLE = "WORDLE",
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
  SUBMIT_WORD = "BP_SUBMIT_WORD",
  UPDATE_TYPING = "BP_UPDATE_TYPING",
  UPDATE_SETTINGS = "BP_UPDATE_SETTINGS",
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
  | { type: WordleClientMessageType.START_GAME }
  | { type: WordleClientMessageType.STOP_GAME }
  | { type: WordleClientMessageType.SUBMIT_WORD; word: string }
  | { type: WordleClientMessageType.UPDATE_TYPING; text: string }
  | (WordleSettings & { type: WordleClientMessageType.UPDATE_SETTINGS })

export type BombPartyClientMessage =
  | { type: BombPartyClientMessageType.START_GAME }
  | { type: BombPartyClientMessageType.STOP_GAME }
  | { type: BombPartyClientMessageType.SUBMIT_WORD; word: string }
  | { type: BombPartyClientMessageType.UPDATE_TYPING; text: string }
  | (BombPartySettings & { type: BombPartyClientMessageType.UPDATE_SETTINGS })

export type ClientMessage =
  | GlobalClientMessage
  | WordleClientMessage
  | BombPartyClientMessage
