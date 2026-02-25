import { Suspense, lazy } from "react"
import { GameMode } from "../../shared/types"
import { useGameStore } from "../store/gameStore"

// Lazy load game views
const BombPartyView = lazy(() => import("./BombParty/BombPartyView"))
const WordleView = lazy(() => import("./Wordle/WordleView"))
const WordChainView = lazy(() => import("./WordChain/WordChainView"))

const BlackjackView = lazy(() =>
  import("./Blackjack/BlackjackView").then((m) => ({
    default: m.BlackjackView,
  })),
)

interface ActiveGameViewProps {
  room: string
  password?: string | null
  onEditName: () => void
  onOpenSettings: () => void
}

export function ActiveGameView({
  room,
  password,
  onEditName,
  onOpenSettings,
}: ActiveGameViewProps) {
  const gameMode = useGameStore((state) => state.gameMode)
  const socket = useGameStore((state) => state.socket)
  const players = useGameStore((state) => state.players)
  const gameState = useGameStore((state) => state.gameState)
  const serverState = useGameStore((state) => state.serverState)
  const kickPlayer = useGameStore((state) => state.kickPlayer)

  if (!socket) return null

  const isAdmin = players.find((p) => p.id === socket.id)?.isAdmin ?? false

  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center py-20">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    >
      {gameMode === GameMode.WORDLE && (
        <WordleView
          socket={socket}
          players={players}
          gameState={gameState}
          isAdmin={isAdmin}
          serverState={serverState}
          onKick={kickPlayer}
          onEditName={onEditName}
          onOpenSettings={onOpenSettings}
          room={room}
          password={password}
        />
      )}
      {gameMode === GameMode.BOMB_PARTY && (
        <BombPartyView
          socket={socket}
          players={players}
          gameState={gameState}
          myId={socket.id}
          isAdmin={isAdmin}
          serverState={serverState}
          onKick={kickPlayer}
          onEditName={onEditName}
          onOpenSettings={onOpenSettings}
          password={password}
          room={room}
        />
      )}
      {gameMode === GameMode.WORD_CHAIN && (
        <WordChainView
          socket={socket}
          players={players}
          gameState={gameState}
          isAdmin={isAdmin}
          serverState={serverState}
          onKick={kickPlayer}
          onEditName={onEditName}
          onOpenSettings={onOpenSettings}
          room={room}
          password={password}
        />
      )}
      {gameMode === GameMode.BLACKJACK && (
        <BlackjackView
          state={serverState as any}
          players={players}
          selfId={socket.id}
          gameState={gameState}
          isAdmin={isAdmin}
          room={room}
          password={password}
          onOpenSettings={onOpenSettings}
          onKick={kickPlayer}
          onEditName={onEditName}
        />
      )}
    </Suspense>
  )
}
