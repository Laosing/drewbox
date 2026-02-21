import { GAME_CONFIG } from "../../../shared/config"

import { NumberInput, ToggleInput } from "../SettingsInputs"

interface WordleSettingsProps {
  maxTimer: number | string
  maxAttempts: number | string
  wordLength: number | string
  freeHintLimit: number | string
  freeHintEnabled?: boolean
  chatEnabled?: boolean
  gameLogEnabled?: boolean
  onUpdate: (settings: any) => void
}

export default function WordleSettings({
  maxTimer,
  maxAttempts,
  wordLength,
  freeHintLimit,
  freeHintEnabled,
  chatEnabled,
  gameLogEnabled,
  onUpdate,
}: WordleSettingsProps) {
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
        min={GAME_CONFIG.WORDLE.TIMER.MIN}
        max={GAME_CONFIG.WORDLE.TIMER.MAX}
        onChange={(val) => onUpdate({ maxTimer: val })}
        helperText={`Value between ${GAME_CONFIG.WORDLE.TIMER.MIN} and ${GAME_CONFIG.WORDLE.TIMER.MAX}`}
      />

      <NumberInput
        label="Max Attempts"
        value={maxAttempts}
        min={GAME_CONFIG.WORDLE.ATTEMPTS.MIN}
        max={GAME_CONFIG.WORDLE.ATTEMPTS.MAX}
        onChange={(val) => onUpdate({ maxAttempts: val })}
        helperText={`Value between ${GAME_CONFIG.WORDLE.ATTEMPTS.MIN} and ${GAME_CONFIG.WORDLE.ATTEMPTS.MAX}`}
      />

      <NumberInput
        label="Word Length"
        value={wordLength}
        min={GAME_CONFIG.WORDLE.LENGTH.MIN}
        max={GAME_CONFIG.WORDLE.LENGTH.MAX}
        onChange={(val) => onUpdate({ wordLength: val })}
        helperText={`Value between ${GAME_CONFIG.WORDLE.LENGTH.MIN} and ${GAME_CONFIG.WORDLE.LENGTH.MAX}`}
      />

      <ToggleInput
        label="Enable Free Hint"
        checked={freeHintEnabled !== false}
        onChange={(checked) => onUpdate({ freeHintEnabled: checked })}
      />

      {freeHintEnabled && (
        <NumberInput
          label="Free Hints Limit"
          value={freeHintLimit}
          min={GAME_CONFIG.WORDLE.FREE_HINTS.MIN}
          max={GAME_CONFIG.WORDLE.FREE_HINTS.MAX}
          onChange={(val) => onUpdate({ freeHintLimit: val })}
          helperText={`Value between ${GAME_CONFIG.WORDLE.FREE_HINTS.MIN} and ${GAME_CONFIG.WORDLE.FREE_HINTS.MAX}`}
        />
      )}
    </>
  )
}
