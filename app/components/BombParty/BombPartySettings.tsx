import { GAME_CONFIG } from "../../../shared/config"
import { NumberInput, ToggleInput } from "../SettingsInputs"

interface BombPartySettingsProps {
  startingLives: number
  maxTimer: number
  syllableChangeThreshold: number
  bonusLettersEnabled?: boolean
  bonusWordLength: number
  hardModeStartRound: number
  chatEnabled?: boolean
  gameLogEnabled?: boolean
  onUpdate: (settings: any) => void
}

export default function BombPartySettings({
  startingLives,
  maxTimer,
  syllableChangeThreshold,
  bonusLettersEnabled = true,
  bonusWordLength,
  hardModeStartRound,
  chatEnabled,
  gameLogEnabled,
  onUpdate,
}: BombPartySettingsProps) {
  return (
    <>
      <ToggleInput
        label="Enable Chat"
        checked={!!chatEnabled}
        onChange={(checked) => onUpdate({ chatEnabled: checked })}
      />

      <ToggleInput
        label="Enable Game Log"
        checked={!!gameLogEnabled}
        onChange={(checked) => onUpdate({ gameLogEnabled: checked })}
      />

      <NumberInput
        label="Timer (Seconds)"
        value={maxTimer}
        min={GAME_CONFIG.BOMB_PARTY.TIMER.MIN}
        max={GAME_CONFIG.BOMB_PARTY.TIMER.MAX}
        onChange={(val) =>
          onUpdate({ maxTimer: val || GAME_CONFIG.BOMB_PARTY.TIMER.DEFAULT })
        }
        helperText={`Value between ${GAME_CONFIG.BOMB_PARTY.TIMER.MIN} and ${GAME_CONFIG.BOMB_PARTY.TIMER.MAX}`}
      />

      <NumberInput
        label="Starting Lives"
        value={startingLives}
        min={GAME_CONFIG.BOMB_PARTY.LIVES.MIN}
        max={GAME_CONFIG.BOMB_PARTY.LIVES.MAX}
        onChange={(val) =>
          onUpdate({
            startingLives: val || GAME_CONFIG.BOMB_PARTY.LIVES.DEFAULT,
          })
        }
        helperText={`Value between ${GAME_CONFIG.BOMB_PARTY.LIVES.MIN} and ${GAME_CONFIG.BOMB_PARTY.LIVES.MAX}`}
      />

      <NumberInput
        label="Change syllable after number of failed attempts"
        value={syllableChangeThreshold}
        min={GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MIN}
        max={GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MAX}
        onChange={(val) =>
          onUpdate({
            syllableChangeThreshold:
              val || GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.DEFAULT,
          })
        }
        helperText={`Value between ${GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MIN} and ${GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MAX}`}
      />

      <ToggleInput
        label="Enable Bonus Letters"
        checked={bonusLettersEnabled}
        onChange={(checked) => onUpdate({ bonusLettersEnabled: checked })}
        helperText="Award a random missing letter when a long word is submitted."
      />

      {bonusLettersEnabled && (
        <NumberInput
          label="Bonus letter word length"
          value={bonusWordLength}
          min={GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.MIN}
          max={GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.MAX}
          onChange={(val) =>
            onUpdate({
              bonusWordLength:
                val || GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.DEFAULT,
            })
          }
          helperText={`Length between ${GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.MIN} and ${GAME_CONFIG.BOMB_PARTY.BONUS_LENGTH.MAX}. Determines word length required to earn a free letter.`}
        />
      )}

      <NumberInput
        label="Hard mode after number of rounds"
        value={hardModeStartRound}
        min={GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.MIN}
        max={GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.MAX}
        onChange={(val) =>
          onUpdate({
            hardModeStartRound:
              val || GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.DEFAULT,
          })
        }
        helperText={`Value between ${GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.MIN} and ${GAME_CONFIG.BOMB_PARTY.HARD_MODE_START.MAX}. The timer will be randomized after this round.`}
      />
    </>
  )
}
