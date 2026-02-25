import { GAME_CONFIG } from "../../../shared/config"
import { NumberInput, ToggleInput } from "../SettingsInputs"

interface BlackjackSettingsProps {
  deckCount: number
  maxTimer: number
  dealerHitsSoft17: boolean
  winningScore: number
  chatEnabled: boolean
  gameLogEnabled: boolean
  onUpdate: (updates: any) => void
}

export default function BlackjackSettings({
  deckCount,
  maxTimer,
  dealerHitsSoft17,
  winningScore,
  chatEnabled,
  gameLogEnabled,
  onUpdate,
}: BlackjackSettingsProps) {
  return (
    <div className="space-y-4 pt-2">
      <NumberInput
        label="Number of Decks"
        value={deckCount}
        min={GAME_CONFIG.BLACKJACK.DECKS.MIN}
        max={GAME_CONFIG.BLACKJACK.DECKS.MAX}
        onChange={(val) => onUpdate({ deckCount: val })}
      />

      <NumberInput
        label="Turn Timer (Seconds)"
        value={maxTimer}
        min={GAME_CONFIG.BLACKJACK.TIMER.MIN}
        max={GAME_CONFIG.BLACKJACK.TIMER.MAX}
        onChange={(val) => onUpdate({ maxTimer: val })}
        helperText={`Value between ${GAME_CONFIG.BLACKJACK.TIMER.MIN} and ${GAME_CONFIG.BLACKJACK.TIMER.MAX}. Time allowed for each player decision.`}
      />

      <ToggleInput
        label="Dealer Hits Soft 17"
        checked={dealerHitsSoft17}
        onChange={(val) => onUpdate({ dealerHitsSoft17: val })}
        helperText="If enabled, dealer will hit on a hand containing an Ace valued as 11 that totals 17."
      />

      <NumberInput
        label="Winning Goal ($)"
        value={winningScore}
        min={GAME_CONFIG.BLACKJACK.WINNING_SCORE.MIN}
        max={GAME_CONFIG.BLACKJACK.WINNING_SCORE.MAX}
        step={25}
        onChange={(val) => onUpdate({ winningScore: val })}
        helperText={`First player to reach $${winningScore} wins the game.`}
      />

      <div className="divider">Global</div>

      <ToggleInput
        label="Enable Chat"
        checked={chatEnabled}
        onChange={(val) => onUpdate({ chatEnabled: val })}
      />
      <ToggleInput
        label="Enable Game Log"
        checked={gameLogEnabled}
        onChange={(val) => onUpdate({ gameLogEnabled: val })}
      />
    </div>
  )
}
