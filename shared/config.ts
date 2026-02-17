import { z } from "zod"
import type { ZodObject } from "zod"
import {
  GameMode,
  BombPartyClientMessageType,
  WordleClientMessageType,
  WordChainClientMessageType,
} from "./types"

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
    HARD_MODE_START: { MIN: 2, MAX: 20, DEFAULT: 5 },
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
  bonusLettersEnabled: z.boolean().optional(),
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
  hardModeStartRound: z
    .number()
    .min(GAME_CONFIG.WORD_CHAIN.HARD_MODE_START.MIN)
    .max(GAME_CONFIG.WORD_CHAIN.HARD_MODE_START.MAX)
    .optional(),
  chatEnabled: z.boolean().optional(),
  gameLogEnabled: z.boolean().optional(),
})

export type BombPartySettings = z.infer<typeof BombPartySettingsSchema>
export type WordleSettings = z.infer<typeof WordleSettingsSchema>
export type WordChainSettings = z.infer<typeof WordChainSettingsSchema>

// Settings registry for the game store
export const SETTINGS_CONFIG: Record<
  string,
  { schema: ZodObject<any>; messageType: string }
> = {
  [GameMode.WORDLE]: {
    schema: WordleSettingsSchema,
    messageType: WordleClientMessageType.UPDATE_SETTINGS,
  },
  [GameMode.BOMB_PARTY]: {
    schema: BombPartySettingsSchema,
    messageType: BombPartyClientMessageType.UPDATE_SETTINGS,
  },
  [GameMode.WORD_CHAIN]: {
    schema: WordChainSettingsSchema,
    messageType: WordChainClientMessageType.UPDATE_SETTINGS,
  },
}
