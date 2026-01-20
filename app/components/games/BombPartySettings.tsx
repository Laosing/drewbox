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
          min="1"
          max="10"
          value={startingLives}
          onChange={(e) =>
            onUpdate({ startingLives: parseInt(e.target.value) || 2 })
          }
          className="input input-bordered w-full max-w-xs"
        />
        <label className="label">
          <span className="label-text-alt opacity-70">
            Value between 1 and 10
          </span>
        </label>
      </div>
      <div className="form-control w-full max-w-xs mb-6">
        <label className="label">
          <span className="label-text">Timer (Seconds)</span>
        </label>
        <input
          type="number"
          min="5"
          max="20"
          value={maxTimer}
          onChange={(e) =>
            onUpdate({ maxTimer: parseInt(e.target.value) || 10 })
          }
          className="input input-bordered w-full max-w-xs"
        />
        <label className="label">
          <span className="label-text-alt opacity-70">
            Value between 5 and 20
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
          min="1"
          max="5"
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
            Value between 1 and 5
          </span>
        </label>
      </div>
    </>
  )
}
