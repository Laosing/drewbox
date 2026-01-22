import { useState, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import {
  BombPartyClientMessageType,
  GameState,
  type Player,
  ServerMessageType,
} from "../../../shared/types"
import { CustomAvatar } from "../Logo"
import { GameHeader } from "../GameHeader"
import { EditIcon } from "../Icons"
import { WordHighlight } from "../WordHighlight"

const ALPHABET = "abcdefghijklmnopqrstuvwxyz"

interface BombPartyViewProps {
  socket: PartySocket
  players: Player[]
  gameState: GameState
  myId: string
  isAdmin: boolean
  serverState: any // Contains game specific state like currentSyllable, timer
  onKick: (playerId: string) => void
  onEditName: () => void
  onOpenSettings: () => void
  room: string
  password?: string | null
}

export default function BombPartyView({
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
}: BombPartyViewProps) {
  const [input, setInput] = useState("")
  const [activePlayerInput, setActivePlayerInput] = useState("")
  const [tempError, setTempError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const {
    currentSyllable,
    activePlayerId,
    timer = 10,
    maxTimer = 10,
    startingLives = 2,
    syllableChangeThreshold = 2,
    dictionaryLoaded,
  } = serverState

  // Sync active player input from server events (passed via specialized prop or handled here?)
  // In GameCanvas, handleMessage updated activePlayerInput.
  // We need to listen to TYPING_UPDATE here or receive it.
  // The socket listener is in parent. Parent should pass typing updates?
  // Or we add our own listener? adding listener is risky (multiple listeners).
  // Let's assume parent passes `activePlayerInput`?
  // No, parent sees TYPING_UPDATE and sets state `activePlayerInput`.
  // Wait, `activePlayerInput` is game specific (typing).
  // So parent should pass `serverState` which might not include `activePlayerInput` (that's ephemeral).
  // I should add a listener for TYPING_UPDATE here.

  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      const data = JSON.parse(evt.data)
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
        setTimeout(() => setTempError(null), 1000)
      }
    }
    socket.addEventListener("message", onMessage)
    return () => socket.removeEventListener("message", onMessage)
  }, [socket])

  // Focus management
  useEffect(() => {
    if (socket.id === activePlayerId && gameState === GameState.PLAYING) {
      inputRef.current?.focus()
      setInput("")
    } else {
      setActivePlayerInput("")
    }
  }, [activePlayerId, gameState, socket.id])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input) return
    socket.send(
      JSON.stringify({
        type: BombPartyClientMessageType.SUBMIT_WORD,
        word: input,
      }),
    )
    setInput("")
  }

  const handleTyping = (val: string) => {
    setInput(val)
    socket.send(
      JSON.stringify({
        type: BombPartyClientMessageType.UPDATE_TYPING,
        text: val,
      }),
    )
  }

  const isMyTurn = socket.id === activePlayerId

  return (
    <>
      <GameHeader
        room={room}
        password={password}
        isAdmin={isAdmin}
        gameState={gameState}
        onOpenSettings={onOpenSettings}
      >
        {gameState === GameState.LOBBY && (
          <div className="flex flex-col gap-4 items-center">
            <h2 className="text-2xl font-bold">Bombparty</h2>
            <p className="opacity-70 max-w-md">
              Welcome to booombparty! Type a word containing the letters before
              time runs out!
            </p>
            <div className="flex flex-col sm:flex-row gap-2 items-center w-full justify-center">
              <div className="badge badge-lg badge-neutral gap-2">
                Lives: {startingLives}
              </div>
              <div className="badge badge-lg badge-neutral gap-2">
                Timer: {maxTimer}s
              </div>
              <div className="badge badge-lg badge-neutral gap-2">
                Change syllable: {syllableChangeThreshold} tries
              </div>
            </div>

            {isAdmin ? (
              <button
                onClick={() =>
                  socket.send(
                    JSON.stringify({
                      type: BombPartyClientMessageType.START_GAME,
                    }),
                  )
                }
                disabled={players.length < 1 || !dictionaryLoaded}
                className="btn btn-primary btn-lg mt-4"
              >
                {dictionaryLoaded ? "Start Game" : "Loading Dictionary..."}
              </button>
            ) : (
              <div className="mt-4 opacity-70 animate-pulse">
                Waiting for the admin to start...
              </div>
            )}
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div>
            <div className="my-1 flex w-full justify-center gap-0.5 flex-wrap px-2">
              {[...ALPHABET].map((letter) => {
                const isUsed = players
                  .find((p) => p.id === socket.id)
                  ?.usedLetters.includes(letter.toLocaleUpperCase())
                return (
                  <div
                    className={`kbd ${
                      isUsed ? "kbd-primary opacity-100" : "opacity-30"
                    }`}
                    key={letter}
                  >
                    {letter.toUpperCase()}
                  </div>
                )
              })}
            </div>
            <div className="text-6xl font-black text-secondary uppercase my-6 animate-pulse tracking-widest">
              {currentSyllable}
            </div>

            <div className="w-full h-8 bg-base-300 rounded-full overflow-hidden relative mb-6">
              <div
                className="h-full bg-secondary transition-all ease-linear"
                style={{ width: `${(timer / maxTimer) * 100}%` }}
              ></div>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-base-content">
                {timer}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mb-4 indicator">
              {tempError && (
                <span className="indicator-item indicator-center badge badge-error">
                  {tempError}
                </span>
              )}

              <input
                ref={inputRef}
                value={isMyTurn ? input : activePlayerInput}
                onChange={(e) => isMyTurn && handleTyping(e.target.value)}
                placeholder={
                  isMyTurn
                    ? "Type a word!"
                    : `${
                        players.find((p) => p.id === activePlayerId)?.name
                      } is typing...`
                }
                disabled={!isMyTurn}
                autoFocus={isMyTurn}
                className={`input input-bordered w-full max-w-md text-center text-xl ${
                  isMyTurn ? "input-primary ring-2 ring-primary/50" : ""
                }`}
                autoComplete="off"
              />
            </form>
            {isAdmin && (
              <button
                onClick={() =>
                  socket.send(
                    JSON.stringify({
                      type: BombPartyClientMessageType.STOP_GAME,
                    }),
                  )
                }
                className="btn btn-warning btn-sm block m-auto"
              >
                Stop Game
              </button>
            )}
          </div>
        )}

        {gameState === GameState.ENDED && (
          <div className="py-8">
            <h2 className="text-4xl font-bold mb-4">Game Over!</h2>
            <p>Returning to lobby...</p>
          </div>
        )}
      </GameHeader>

      {/* Players Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {players.map((p) => (
          <div
            key={p.id}
            className={`card p-4 transition-all duration-300 border-2 relative group ${
              p.id === activePlayerId
                ? "border-primary bg-primary/10 scale-105 z-10 shadow-lg"
                : "border-transparent bg-base-100 placeholder-opacity-50"
            } ${!p.isAlive ? "opacity-50 grayscale" : ""}`}
          >
            {isAdmin && p.id !== socket.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onKick(p.id)
                }}
                className="absolute top-2 right-2 btn btn-xs btn-error btn-square opacity-0 group-hover:opacity-100 transition-opacity z-20"
                title="Kick Player"
              >
                ✕
              </button>
            )}

            <div className="flex flex-col items-center gap-2">
              <div className="avatar indicator">
                {p.isAdmin && (
                  <span className="indicator-item indicator-center badge badge-warning badge-sm">
                    Admin
                  </span>
                )}
                <CustomAvatar name={p.name} />
              </div>
              <div className="text-center">
                <h3 className="font-bold flex items-center gap-1 justify-center">
                  {p.name}{" "}
                  {p.id === socket.id && (
                    <>
                      <span className="badge badge-xs badge-primary">You</span>
                      <button
                        onClick={onEditName}
                        className="btn btn-ghost btn-sm btn-circle"
                        title="Edit Name"
                      >
                        <EditIcon />
                      </button>
                    </>
                  )}
                </h3>
                <div className="flex gap-1 justify-center text-error mt-1 text-sm">
                  {"❤".repeat(Math.max(0, p.lives))}
                </div>
                <div className="text-xs opacity-60 mt-1">
                  Wins: {p.wins || 0}
                </div>
                {p.lastTurn && (
                  <div className="text-xs opacity-60 mt-1">
                    <span className="text-base-content/80 font-medium">
                      <WordHighlight
                        word={p.lastTurn.word}
                        highlight={p.lastTurn.syllable}
                      />
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
