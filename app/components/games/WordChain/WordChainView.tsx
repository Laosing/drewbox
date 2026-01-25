import { useEffect, useState, useRef } from "react"

import {
  WordChainClientMessageType,
  GameState,
  type Player,
  ServerMessageType,
  type WordChainServerState,
} from "../../../../shared/types"
import clsx from "clsx"
import { GameHeader } from "../../GameHeader"
import PartySocket from "partysocket"
import { PlayerCard } from "../../PlayerCard"

interface WordChainViewProps {
  socket: PartySocket
  players: Player[]
  gameState: GameState
  isAdmin: boolean
  serverState: WordChainServerState
  onKick: (playerId: string) => void
  onEditName: () => void
  onOpenSettings: () => void
  room: string
  password?: string | null
}

export default function WordChainView({
  socket,
  players,
  gameState,
  isAdmin,
  serverState,
  onKick,
  onEditName,
  onOpenSettings,
  room,
  password,
}: WordChainViewProps) {
  const [input, setInput] = useState("")
  const [activePlayerInput, setActivePlayerInput] = useState("")
  const [tempError, setTempError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { currentWord = "", activePlayerId, timer, maxTimer } = serverState

  const isMyTurn = activePlayerId === socket.id

  const lastChar = currentWord ? currentWord.slice(-1).toUpperCase() : ""

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data)

      if (
        data.type === ServerMessageType.TYPING_UPDATE &&
        data.text !== undefined
      ) {
        if (data.playerId !== socket.id) {
          setActivePlayerInput(data.text)
        }
      }

      if (data.type === ServerMessageType.ERROR) {
        setTempError(data.message)
        const t = setTimeout(() => setTempError(null), 2000)
        return () => clearTimeout(t)
      }
    }
    socket.addEventListener("message", onMessage)
    return () => socket.removeEventListener("message", onMessage)
  }, [socket])

  // Clear active input on turn change or game state change
  useEffect(() => {
    setActivePlayerInput("")
    if (activePlayerId === socket.id && gameState === GameState.PLAYING) {
      setInput("")
      // Small timeout to allow render to complete/enable input before focusing
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [activePlayerId, gameState, socket.id])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !isMyTurn) return

    // Optimistic checking
    if (lastChar && !input.toUpperCase().startsWith(lastChar)) {
      setTempError(`Must start with ${lastChar}`)
      setTimeout(() => setTempError(null), 2000)
      return
    }

    socket.send(
      JSON.stringify({
        type: WordChainClientMessageType.SUBMIT_WORD,
        word: input.trim(),
      }),
    )
    setInput("")
    // Refocus after submit (though next turn change handles it if we are still active, but usually turn passes)
  }

  // Handle typing to show status?
  useEffect(() => {
    socket.send(
      JSON.stringify({
        type: WordChainClientMessageType.UPDATE_TYPING,
        text: input,
      }),
    )
  }, [input, socket])

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      {/* Header */}
      <GameHeader
        room={room}
        password={password}
        isAdmin={isAdmin}
        gameState={gameState}
        onOpenSettings={onOpenSettings}
      >
        {/* Game Area wrapper end tag will need to change if structure changes */}

        {/* Game Area */}
        <div className="flex flex-col items-center justify-center min-h-[200px] mb-4">
          {gameState === GameState.LOBBY && (
            <div className="flex flex-col items-center gap-4">
              <h2 className="text-2xl font-bold">Word Chain</h2>
              <p className="opacity-70 max-w-md">
                Take turns guessing a word that starts with the last letter of
                the previous word.
              </p>
              {isAdmin && players.length > 0 && (
                <button
                  className="btn btn-primary btn-lg mt-4"
                  onClick={() =>
                    socket.send(
                      JSON.stringify({
                        type: WordChainClientMessageType.START_GAME,
                      }),
                    )
                  }
                >
                  Start Game
                </button>
              )}
            </div>
          )}

          {gameState === GameState.PLAYING && (
            <div className="flex flex-col items-center gap-6 w-full">
              <div className="text-3xl md:text-5xl font-black mb-4">
                <span className="opacity-50">{currentWord.slice(0, -1)}</span>
                <span className="text-primary">{lastChar}</span>
              </div>

              <div className="w-full max-w-sm">
                <div className="flex justify-between text-sm font-bold mb-1">
                  <span>Time</span>
                  <span>{timer}s</span>
                </div>
                <progress
                  className={clsx("progress w-full h-3", {
                    "progress-success": timer > 5,
                    "progress-error": timer <= 5,
                  })}
                  value={timer}
                  max={maxTimer}
                />
              </div>

              <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm relative"
              >
                <input
                  ref={inputRef}
                  autoFocus={isMyTurn}
                  disabled={!isMyTurn}
                  type="text"
                  className={clsx(
                    "input input-bordered w-full text-center text-xl font-bold uppercase",
                    isMyTurn ? "input-primary ring-2 ring-primary/50" : "",
                  )}
                  placeholder={
                    isMyTurn
                      ? `Start with ${lastChar}...`
                      : `${
                          players.find((p) => p.id === activePlayerId)?.name
                        } is typing...`
                  }
                  value={isMyTurn ? input : activePlayerInput}
                  onChange={(e) => setInput(e.target.value)}
                />
                {tempError && (
                  <div className="absolute -bottom-8 left-0 right-0 text-center text-error font-bold animate-bounce">
                    {tempError}
                  </div>
                )}
              </form>
              {isAdmin && (
                <button
                  onClick={() =>
                    socket.send(
                      JSON.stringify({
                        type: WordChainClientMessageType.STOP_GAME,
                      }),
                    )
                  }
                  className="btn btn-ghost btn-xs text-error mt-4"
                >
                  Stop Game
                </button>
              )}
            </div>
          )}

          {gameState === GameState.ENDED && (
            <div>
              <h2 className="text-3xl font-black mb-4">Game Over</h2>
              {serverState.winnerId ? (
                <p className="text-xl">
                  Winner:{" "}
                  {players.find((p) => p.id === serverState.winnerId)?.name}
                </p>
              ) : (
                <p>No Winner!</p>
              )}
              {isAdmin && (
                <button
                  className="btn btn-primary mt-4"
                  onClick={() =>
                    socket.send(
                      JSON.stringify({
                        type: WordChainClientMessageType.START_GAME,
                      }),
                    )
                  }
                >
                  Play Again
                </button>
              )}
            </div>
          )}
        </div>
      </GameHeader>

      {/* Player List */}
      <div className="card bg-base-100 shadow-xl p-4 md:p-6 border border-base-300">
        <h3 className="font-bold text-center mb-4 opacity-70">
          PLAYERS ({players.length})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {players.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              isMe={p.id === socket.id}
              isAdmin={isAdmin}
              isActive={
                gameState === GameState.PLAYING && p.id === activePlayerId
              }
              onKick={onKick}
              onEditName={onEditName}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
