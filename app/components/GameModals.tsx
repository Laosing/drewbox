import { useEffect, useState } from "react"
import { GameState } from "../../shared/types"
import { useGameStore } from "../store/gameStore"
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

  const gameMode = useGameStore((s) => s.gameMode)
  const serverState = useGameStore((s) => s.serverState)
  const chatEnabled = useGameStore((s) => s.chatEnabled)
  const gameLogEnabled = useGameStore((s) => s.gameLogEnabled)

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
  const myName = useGameStore((s) => s.myName)
  const updateName = useGameStore((s) => s.updateName)
  const gameState = useGameStore((s) => s.gameState)

  const [nameInput, setNameInput] = useState(myName)
  const [isNameDisabled, setIsNameDisabled] = useState(false)

  useEffect(() => {
    setNameInput(myName)
  }, [myName])

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
            gameState === GameState.PLAYING ||
            gameState === GameState.COUNTDOWN
          }
        />
      </div>
    </Modal>
  )
}

// Register Modals
export function registerGameModals() {
  ModalFactory.register("settings", SettingsModal)
  ModalFactory.register("name", NameModal)
}
