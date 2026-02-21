import { Suspense, lazy } from "react"
import { GameMode } from "../../shared/types"
import { GAME_CONFIG } from "../../shared/config"

// Lazy load game settings forms
const BombPartySettings = lazy(() => import("./BombParty/BombPartySettings"))
const WordleSettings = lazy(() => import("./Wordle/WordleSettings"))
const WordChainSettings = lazy(() => import("./WordChain/WordChainSettings"))

interface GameSettingsFormProps {
  gameMode: GameMode
  serverState: any
  pendingSettings: any
  chatEnabled: boolean
  gameLogEnabled: boolean
  onUpdate: (updates: any) => void
}

export function GameSettingsForm({
  gameMode,
  serverState,
  pendingSettings,
  chatEnabled,
  gameLogEnabled,
  onUpdate,
}: GameSettingsFormProps) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-8">
          <span className="loading loading-spinner"></span>
        </div>
      }
    >
      {gameMode === GameMode.BOMB_PARTY && (
        <BombPartySettings
          startingLives={
            pendingSettings.startingLives ??
            serverState.startingLives ??
            GAME_CONFIG.BOMB_PARTY.LIVES.DEFAULT
          }
          maxTimer={
            pendingSettings.maxTimer ??
            serverState.maxTimer ??
            GAME_CONFIG.BOMB_PARTY.TIMER.DEFAULT
          }
          syllableChangeThreshold={
            pendingSettings.syllableChangeThreshold ??
            serverState.syllableChangeThreshold ??
            GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.DEFAULT
          }
          bonusLettersEnabled={
            pendingSettings.bonusLettersEnabled ??
            serverState.bonusLettersEnabled ??
            true
          }
          bonusWordLength={
            pendingSettings.bonusWordLength ??
            serverState.bonusWordLength ??
            GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.DEFAULT
          }
          hardModeEnabled={
            pendingSettings.hardModeEnabled ??
            serverState.hardModeEnabled ??
            true
          }
          hardModeStartRound={
            pendingSettings.hardModeStartRound ??
            serverState.hardModeStartRound ??
            GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.DEFAULT
          }
          chatEnabled={pendingSettings.chatEnabled ?? chatEnabled}
          gameLogEnabled={pendingSettings.gameLogEnabled ?? gameLogEnabled}
          onUpdate={onUpdate}
        />
      )}
      {gameMode === GameMode.WORDLE && (
        <WordleSettings
          maxTimer={
            pendingSettings.maxTimer ??
            serverState.maxTimer ??
            GAME_CONFIG.WORDLE.TIMER.DEFAULT
          }
          maxAttempts={
            pendingSettings.maxAttempts ??
            serverState.maxAttempts ??
            GAME_CONFIG.WORDLE.ATTEMPTS.DEFAULT
          }
          wordLength={
            pendingSettings.wordLength ??
            serverState.wordLength ??
            GAME_CONFIG.WORDLE.LENGTH.DEFAULT
          }
          freeHintLimit={
            pendingSettings.freeHintLimit ??
            serverState.freeHintLimit ??
            GAME_CONFIG.WORDLE.FREE_HINTS.DEFAULT
          }
          freeHintEnabled={
            pendingSettings.freeHintEnabled ??
            serverState.freeHintEnabled ??
            true
          }
          chatEnabled={pendingSettings.chatEnabled ?? chatEnabled}
          gameLogEnabled={pendingSettings.gameLogEnabled ?? gameLogEnabled}
          onUpdate={onUpdate}
        />
      )}
      {gameMode === GameMode.WORD_CHAIN && (
        <WordChainSettings
          maxTimer={
            pendingSettings.maxTimer ??
            serverState.maxTimer ??
            GAME_CONFIG.WORD_CHAIN.TIMER.DEFAULT
          }
          startingLives={
            pendingSettings.startingLives ??
            serverState.startingLives ??
            GAME_CONFIG.WORD_CHAIN.LIVES.DEFAULT
          }
          hardModeStartRound={
            pendingSettings.hardModeStartRound ??
            serverState.hardModeStartRound ??
            GAME_CONFIG.WORD_CHAIN.HARD_MODE_START.DEFAULT
          }
          chatEnabled={pendingSettings.chatEnabled ?? chatEnabled}
          gameLogEnabled={pendingSettings.gameLogEnabled ?? gameLogEnabled}
          onUpdate={onUpdate}
        />
      )}
    </Suspense>
  )
}
