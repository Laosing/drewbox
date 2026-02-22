import { CopyIcon, LeftIcon, LockIcon, SettingsIcon, VolumeIcon } from "./Icons"
import { Logo } from "./Logo"
import { GameState } from "../../shared/types"
import React from "react"
import { ThemeController } from "./ThemeController"
import { useModalStore } from "../services/ModalFactory"

interface GameHeaderProps {
  room: string
  password?: string | null
  isAdmin: boolean
  gameState: GameState
  onOpenSettings: () => void
  children: React.ReactNode
  additionalRightControls?: React.ReactNode
}

export function GameHeader({
  room,
  password,
  isAdmin,
  gameState,
  onOpenSettings,
  children,
  additionalRightControls,
}: GameHeaderProps) {
  return (
    <div className="card bg-base-100 shadow-xl p-4 md:p-6 text-center border border-base-300 relative z-30">
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => (window.location.href = "/")}
          className="btn btn-ghost btn-sm"
        >
          <LeftIcon /> Lobby
        </button>

        <Logo name={room} />

        <div className="flex gap-2 justify-end w-auto min-w-[64px]">
          {/* Settings is usually here if Admin */}
          {(gameState === GameState.LOBBY || gameState === GameState.ENDED) &&
            isAdmin && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={onOpenSettings}
                title="Settings"
              >
                <SettingsIcon />
                Settings
              </button>
            )}
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => useModalStore.getState().openModal("sound-settings")}
            title="Sound Settings"
          >
            <VolumeIcon />
            Sound
          </button>
          {additionalRightControls}
          <ThemeController />
        </div>
      </div>

      <div className="text-sm opacity-70 mb-4">
        <button
          className="btn btn-sm badge badge-neutral hover:badge-primary transition-colors"
          onClick={() => navigator.clipboard.writeText(window.location.href)}
          title="Copy room link"
        >
          <CopyIcon />
          Room: <span className="tracking-widest">{room.toUpperCase()}</span>
          {password && <LockIcon />}
        </button>
      </div>

      {children}
    </div>
  )
}
