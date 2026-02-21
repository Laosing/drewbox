import { useEffect, useState } from "react"
import { useMultiTabPrevention } from "../hooks/useMultiTabPrevention"
import { useGameSession } from "../hooks/useGameSession"
import { Logo } from "./Logo"
import StatusCard from "./StatusCard"
import { ActiveGameView } from "./ActiveGameView"
import { ChatBox } from "./ChatBox"
import { registerGameModals } from "./GameModals"
import { ErrorBoundary } from "./ErrorBoundary"
import { ModalFactory, useModalStore } from "../services/ModalFactory"
import { ErrorCard } from "./ErrorCard"

// Register modals once
registerGameModals()

function GameCanvasInner({
  room,
  password,
  initialMode,
}: {
  room: string
  password?: string | null
  initialMode?: string | null
}) {
  // Init connection
  useGameSession({ room, password, initialMode })

  return (
    <div className="container mx-auto p-4 flex flex-col gap-6 max-w-4xl">
      <ErrorBoundary name="Modals">
        <ModalFactory.Container />
      </ErrorBoundary>

      {/* Game View - Connected to Store Internally */}
      <ErrorBoundary name="GameView">
        <ActiveGameView
          room={room}
          password={password}
          onEditName={() => useModalStore.getState().openModal("name")}
          onOpenSettings={() => useModalStore.getState().openModal("settings")}
        />
      </ErrorBoundary>

      {/* Logs & Chat - Isolated Component */}
      <ErrorBoundary name="ChatBox">
        <ChatBox />
      </ErrorBoundary>
    </div>
  )
}

export default function GameCanvas({
  room,
  initialRoomInfo,
}: {
  room: string
  initialRoomInfo?: { isPrivate: boolean; mode?: string } | null
}) {
  const isBlockedMultiTab = useMultiTabPrevention()

  // Parse URL params once
  const urlParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null
  const urlPwd = urlParams?.get("password")
  const urlMode = urlParams?.get("mode")

  // Sync URL password to state if present
  const [connectionPassword, setConnectionPassword] = useState<string | null>(
    urlPwd || null,
  )
  const [passwordInput, setPasswordInput] = useState("")

  useEffect(() => {
    if (urlPwd) setConnectionPassword(urlPwd)
  }, [urlPwd])

  const needsPassword = initialRoomInfo?.isPrivate
  // Prioritize URL mode for new room creation, fall back to existing room mode
  const initialMode = urlMode || initialRoomInfo?.mode

  if (isBlockedMultiTab) {
    return (
      <ErrorCard
        title="Multiple Tabs Detected"
        message="You already have this game open in another tab. Please use that tab to play."
        additionalMessage="Error Code: MULTIPLE_TABS"
      />
    )
  }

  if (needsPassword && !connectionPassword) {
    return (
      <StatusCard
        icon={<Logo name={room} random={false} />}
        title="This room is private."
        actions={
          <a href="/" className="btn btn-ghost btn-sm mt-4">
            Back to Lobby
          </a>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (passwordInput) setConnectionPassword(passwordInput)
          }}
          className="flex flex-col gap-2"
        >
          <input
            type="password"
            placeholder="Enter password"
            className="input input-bordered w-full text-center"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary w-full">
            Join Room
          </button>
        </form>
      </StatusCard>
    )
  }

  if (!/^[a-z]{4}$/.test(room)) {
    return (
      <StatusCard
        icon="🚫"
        title="Invalid Room ID"
        actions={
          <a href="/" className="btn btn-primary">
            Back to Lobby
          </a>
        }
      >
        <p>Room codes must be exactly 4 letters (a-z).</p>
      </StatusCard>
    )
  }

  if (!initialMode) {
    return (
      <StatusCard
        icon="❓"
        title="Game Mode Required"
        actions={
          <a href="/" className="btn btn-primary">
            Back to Lobby
          </a>
        }
      >
        <p>
          You are trying to create a new room without specifying a game mode.
        </p>
      </StatusCard>
    )
  }

  return (
    <GameCanvasInner
      room={room}
      password={connectionPassword}
      initialMode={initialMode}
    />
  )
}
