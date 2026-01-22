import { useEffect, useState } from "react"

import {
  WordChainClientMessageType,
  GameState,
  type Player,
  ServerMessageType,
} from "../../../shared/types"
import { CustomAvatar } from "../Logo"
import { EditIcon } from "../Icons"
import clsx from "clsx"
import { GameHeader } from "../GameHeader"

interface WordChainViewProps {
  socket: PartySocket
  players: Player[]
  gameState: GameState
  isAdmin: boolean
  serverState: any
  onKick: (playerId: string) => void
  onEditName: () => void
  onOpenSettings: () => void
  room: string
  password?: string | null
}
import PartySocket from "partysocket"

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
    if (activePlayerId === socket.id) {
      // my turn, clear my input? Or keep it? Usually clear on turn start?
      // Actually view clears input on submit.
      // But if I become active, I should ensure input is focused and clean?
      // BombParty clears it.
      setInput("")
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
        additionalRightControls={
          <button
            className="btn btn-ghost btn-circle btn-sm"
            onClick={onEditName}
            title="Edit Name"
          >
            <EditIcon />
          </button>
        }
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
              <div className="text-3xl md:text-5xl font-black mb-4 flex items-center gap-2">
                <span className="opacity-50">{currentWord.slice(0, -1)}</span>
                <span className="text-primary scale-110 inline-block border-b-4 border-primary">
                  {lastChar}
                </span>
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
            <div
              key={p.id}
              className={clsx(
                "flex items-center gap-2 p-2 rounded-lg border-2 transition-colors",
                {
                  "border-primary bg-primary/10": p.id === activePlayerId,
                  "border-transparent bg-base-200": p.id !== activePlayerId,
                  "opacity-50 grayscale": !p.isAlive,
                },
              )}
            >
              <div className="relative">
                <CustomAvatar
                  name={p.name}
                  color={
                    p.isAlive
                      ? "bg-primary text-primary-content"
                      : "bg-neutral text-neutral-content"
                  }
                />
                {/* Heart count / Lives */}
                {p.isAlive && (
                  <div className="absolute -top-1 -right-1 bg-error text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                    {p.lives}
                  </div>
                )}
              </div>

              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm truncate">{p.name}</span>
                <span className="text-[10px] opacity-70 truncate">
                  {p.isAlive
                    ? p.id === activePlayerId
                      ? "Thinking..."
                      : "Waiting"
                    : "Out"}
                </span>
              </div>

              {isAdmin && p.id !== socket.id && (
                <button
                  onClick={() => onKick(p.id)}
                  className="ml-auto btn btn-ghost btn-xs btn-circle text-error"
                  title="Kick"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
