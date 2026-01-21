import { GAME_CONFIG } from "../../../shared/types"

interface BombPartySettingsProps {
  startingLives: number
  maxTimer: number
  syllableChangeThreshold: number
  chatEnabled?: boolean
  gameLogEnabled?: boolean
  onUpdate: (settings: any) => void
}

export default function BombPartySettings({
  startingLives,
  maxTimer,
  syllableChangeThreshold,
  chatEnabled,
  gameLogEnabled,
  onUpdate,
}: BombPartySettingsProps) {
  return (
    <>
      <div className="form-control w-full max-w-xs mb-6 px-1">
        <label className="label cursor-pointer justify-start gap-4">
          <span className="label-text font-bold">Enable Chat</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={!!chatEnabled}
            onChange={(e) => onUpdate({ chatEnabled: e.target.checked })}
          />
        </label>
      </div>

      <div className="form-control w-full max-w-xs mb-6 px-1">
        <label className="label cursor-pointer justify-start gap-4">
          <span className="label-text font-bold">Enable Game Log</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={!!gameLogEnabled}
            onChange={(e) => onUpdate({ gameLogEnabled: e.target.checked })}
          />
        </label>
      </div>

      <div className="form-control w-full max-w-xs mb-6">
        <label className="label">
          <span className="label-text">Starting Lives</span>
        </label>
        <input
          type="number"
          min={GAME_CONFIG.BOMB_PARTY.LIVES.MIN}
          max={GAME_CONFIG.BOMB_PARTY.LIVES.MAX}
          value={startingLives}
          onChange={(e) =>
            onUpdate({ startingLives: parseInt(e.target.value) || 2 })
          }
          className="input input-bordered w-full max-w-xs"
        />
        <label className="label">
          <span className="label-text-alt opacity-70">
            Value between {GAME_CONFIG.BOMB_PARTY.LIVES.MIN} and{" "}
            {GAME_CONFIG.BOMB_PARTY.LIVES.MAX}
          </span>
        </label>
      </div>
      <div className="form-control w-full max-w-xs mb-6">
        <label className="label">
          <span className="label-text">Timer (Seconds)</span>
        </label>
        <input
          type="number"
          min={GAME_CONFIG.BOMB_PARTY.TIMER.MIN}
          max={GAME_CONFIG.BOMB_PARTY.TIMER.MAX}
          value={maxTimer}
          onChange={(e) =>
            onUpdate({ maxTimer: parseInt(e.target.value) || 10 })
          }
          className="input input-bordered w-full max-w-xs"
        />
        <label className="label">
          <span className="label-text-alt opacity-70">
            Value between {GAME_CONFIG.BOMB_PARTY.TIMER.MIN} and{" "}
            {GAME_CONFIG.BOMB_PARTY.TIMER.MAX}
          </span>
        </label>
      </div>
      <div className="form-control w-full max-w-xs mb-6">
        <label className="label">
          <span className="label-text">
            Change syllable after number of tries
          </span>
        </label>
        <input
          type="number"
          min={GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MIN}
          max={GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MAX}
          value={syllableChangeThreshold}
          onChange={(e) =>
            onUpdate({
              syllableChangeThreshold: parseInt(e.target.value) || 1,
            })
          }
          className="input input-bordered w-full max-w-xs"
        />
        <label className="label">
          <span className="label-text-alt opacity-70">
            Value between {GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MIN} and{" "}
            {GAME_CONFIG.BOMB_PARTY.SYLLABLE_CHANGE.MAX}
          </span>
        </label>
      </div>
    </>
  )
}
