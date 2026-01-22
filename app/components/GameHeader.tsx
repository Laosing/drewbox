import { CopyIcon, SettingsIcon } from "./Icons"
import { Logo } from "./Logo"
import { GameState } from "../../shared/types"
import React from "react"

interface GameHeaderProps {
  room: string
  password?: string | null
  isAdmin: boolean
  gameState: GameState
  onOpenSettings: () => void
  children: React.ReactNode
  customTitle?: React.ReactNode
  additionalRightControls?: React.ReactNode
}

export function GameHeader({
  room,
  password,
  isAdmin,
  gameState,
  onOpenSettings,
  children,
  customTitle,
  additionalRightControls,
}: GameHeaderProps) {
  return (
    <div className="card bg-base-100 shadow-xl p-4 md:p-6 text-center border border-base-300 relative z-30">
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => (window.location.href = "/")}
          className="btn btn-ghost btn-sm"
        >
          ← Lobby
        </button>

        <Logo name={room} />

        <div className="flex gap-2 justify-end w-auto min-w-[64px]">
          {/* Settings is usually here if Admin */}
          {(gameState === GameState.LOBBY || gameState === GameState.ENDED) &&
            isAdmin && (
              <button
                className="btn btn-ghost btn-sm btn-circle"
                onClick={onOpenSettings}
                title="Settings"
              >
                <SettingsIcon />
              </button>
            )}
          {additionalRightControls}
        </div>
      </div>

      <div className="text-sm opacity-70 mb-4">
        Room:{" "}
        <button
          className="font-mono text-lg badge badge-neutral tracking-widest hover:badge-primary transition-colors cursor-pointer gap-2 font-bold"
          onClick={() => navigator.clipboard.writeText(window.location.href)}
          title="Copy room link"
        >
          {room.toUpperCase()}
          <CopyIcon />
          {password && " 🔒"}
        </button>
      </div>

      {children}
    </div>
  )
}
