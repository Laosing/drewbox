import { useEffect, useState } from "react"
import { GameMode, GameState } from "../../shared/types"
import { useGameStore } from "../store/gameStore"
import { useSoundStore } from "../store/soundStore"
import { Modal } from "./Modal"
import { GameSettingsForm } from "./GameSettingsForm"
import { ModalFactory } from "../services/ModalFactory"

// Settings Modal Component
function SettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const updateSettings = useGameStore((s) => s.updateSettings)
  const changeGameMode = useGameStore((s) => s.changeGameMode)

  const gameMode = useGameStore((s) => s.gameMode)
  const serverState = useGameStore((s) => s.serverState)
  const chatEnabled = useGameStore((s) => s.chatEnabled)
  const gameLogEnabled = useGameStore((s) => s.gameLogEnabled)
  const players = useGameStore((s) => s.players)
  const socket = useGameStore((s) => s.socket)

  const isAdmin = players.find((p) => p.id === socket?.id)?.isAdmin ?? false

  const [pendingSettings, setPendingSettings] = useState<any>({})

  // Initialize pending settings when opening
  useEffect(() => {
    if (isOpen) {
      setPendingSettings({
        chatEnabled,
        gameLogEnabled,
        ...serverState,
      })
    }
  }, [isOpen, chatEnabled, gameLogEnabled, serverState])

  const handleSave = () => {
    updateSettings(pendingSettings)
    setPendingSettings({})
    onClose()
  }

  return (
    <Modal
      title="Game Settings"
      onActionClick={handleSave}
      onActionText="Save"
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="mb-6">
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Game Mode</legend>
          <select
            className="select select-bordered w-full"
            value={gameMode}
            disabled={!isAdmin}
            onChange={(e) => {
              changeGameMode(e.target.value as GameMode)
              setPendingSettings({})
            }}
          >
            <option value={GameMode.BOMB_PARTY}>Bombparty</option>
            <option value={GameMode.WORDLE}>Wordle</option>
            <option value={GameMode.WORD_CHAIN}>Word Chain</option>
          </select>
        </fieldset>
      </div>
      {gameMode && (
        <GameSettingsForm
          gameMode={gameMode}
          serverState={serverState}
          pendingSettings={pendingSettings}
          chatEnabled={chatEnabled}
          gameLogEnabled={gameLogEnabled}
          onUpdate={(updates) =>
            setPendingSettings((prev: any) => ({ ...prev, ...updates }))
          }
        />
      )}
    </Modal>
  )
}

// Name Modal Component
function NameModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const playerName = useGameStore(
    (s) => s.players.find((p) => p.id === s.socket?.id)?.name ?? "",
  )
  const updateName = useGameStore((s) => s.updateName)
  const gameState = useGameStore((s) => s.gameState)

  const [nameInput, setNameInput] = useState(playerName)
  const [isNameDisabled, setIsNameDisabled] = useState(false)

  useEffect(() => {
    setNameInput(playerName)
  }, [playerName])

  const handleSubmit = () => {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    updateName(trimmed)
    setIsNameDisabled(true)
    setTimeout(() => setIsNameDisabled(false), 5000)
    onClose()
  }

  return (
    <Modal
      title="Change Name"
      onActionClick={handleSubmit}
      actionDisabled={
        isNameDisabled ||
        gameState === GameState.PLAYING ||
        gameState === GameState.COUNTDOWN
      }
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {(gameState === GameState.PLAYING ||
          gameState === GameState.COUNTDOWN) && (
          <div className="text-warning text-sm text-center">
            Name changes are disabled during active gameplay.
          </div>
        )}
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Enter your name"
          className="input input-bordered w-full text-center"
          maxLength={16}
          disabled={
            gameState === GameState.PLAYING || gameState === GameState.COUNTDOWN
          }
        />
      </div>
    </Modal>
  )
}

// Sound Settings Modal Component
function SoundSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const sfxEnabled = useSoundStore((s) => s.sfxEnabled)
  const sfxVolume = useSoundStore((s) => s.sfxVolume)
  const musicEnabled = useSoundStore((s) => s.musicEnabled)
  const musicVolume = useSoundStore((s) => s.musicVolume)
  const setSfxEnabled = useSoundStore((s) => s.setSfxEnabled)
  const setSfxVolume = useSoundStore((s) => s.setSfxVolume)
  const setMusicEnabled = useSoundStore((s) => s.setMusicEnabled)
  const setMusicVolume = useSoundStore((s) => s.setMusicVolume)

  // Local state for sliders so dragging doesn't hammer the Zustand store
  // (store subscribers like useGameSounds re-run effects on every update).
  // Commit to the store only when the drag ends.
  const [localMusicVolume, setLocalMusicVolume] = useState(musicVolume)
  const [localSfxVolume, setLocalSfxVolume] = useState(sfxVolume)

  // Re-sync local state whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalMusicVolume(musicVolume)
      setLocalSfxVolume(sfxVolume)
    }
  }, [isOpen])

  return (
    <Modal
      title="Sound Settings"
      isOpen={isOpen}
      onClose={onClose}
      onActionClick={onClose}
    >
      <div className="flex flex-col gap-6">
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Music</legend>
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="label-text">Enable Music</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={musicEnabled}
                onChange={(e) => setMusicEnabled(e.target.checked)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-text text-sm opacity-70">
                Volume: {Math.round(localMusicVolume * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                className="range range-primary range-sm"
                value={localMusicVolume}
                disabled={!musicEnabled}
                onChange={(e) => setLocalMusicVolume(Number(e.target.value))}
                onPointerUp={(e) =>
                  setMusicVolume(Number((e.target as HTMLInputElement).value))
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Sound Effects</legend>
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="label-text">Enable SFX</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={sfxEnabled}
                onChange={(e) => setSfxEnabled(e.target.checked)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-text text-sm opacity-70">
                Volume: {Math.round(localSfxVolume * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                className="range range-primary range-sm"
                value={localSfxVolume}
                disabled={!sfxEnabled}
                onChange={(e) => setLocalSfxVolume(Number(e.target.value))}
                onPointerUp={(e) =>
                  setSfxVolume(Number((e.target as HTMLInputElement).value))
                }
              />
            </label>
          </div>
        </fieldset>
      </div>
    </Modal>
  )
}

// Register Modals
export function registerGameModals() {
  ModalFactory.register("settings", SettingsModal)
  ModalFactory.register("name", NameModal)
  ModalFactory.register("sound-settings", SoundSettingsModal)
}
