import { useState, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import {
  WordleClientMessageType,
  GameState,
  type Player,
  ServerMessageType,
  type Guess,
  type GuessResult,
} from "../../../shared/types"
import { CustomAvatar, Logo } from "../Logo"
import { CopyIcon, EditIcon, SettingsIcon } from "../Icons"
import clsx from "clsx"

interface WordleViewProps {
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

const KEYS = [
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  "ZXCVBNM".split(""),
]

export default function WordleView({
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
}: WordleViewProps) {
  const [input, setInput] = useState("")
  const [activePlayerInput, setActivePlayerInput] = useState("")
  const [tempError, setTempError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const {
    guesses = [] as Guess[],
    activePlayerId,
    timer = 10,
    maxTimer = 60,
    maxAttempts = 5,
    dictionaryLoaded,
  } = serverState

  // Handling typing updates from other players
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
      if (data.type === ServerMessageType.ERROR && !data.hide) {
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
        type: WordleClientMessageType.SUBMIT_WORD,
        word: input,
      }),
    )
    setInput("")
  }

  const handleTyping = (val: string) => {
    // Only allow letters and max 5 chars
    const cleaned = val
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 5)
      .toUpperCase()
    setInput(cleaned)
    socket.send(
      JSON.stringify({
        type: WordleClientMessageType.UPDATE_TYPING,
        text: cleaned,
      }),
    )
  }

  const isMyTurn = socket.id === activePlayerId
  const activePlayer = players.find((p) => p.id === activePlayerId)

  // Calculate keyboard state
  const keyStates: Record<string, GuessResult> = {}
  guesses.forEach((g: Guess) => {
    g.word.split("").forEach((char, i) => {
      const current = keyStates[char]
      const result = g.results[i]

      if (current === "correct") return // Already correct, don't downgrade
      if (result === "correct") {
        keyStates[char] = "correct"
      } else if (result === "present") {
        keyStates[char] = "present"
      } else if (result === "absent" && !current) {
        keyStates[char] = "absent"
      }
    })
  })

  // Determine rows to show
  // We show up to the max configured attempts, plus the current input row
  const visibleGuesses = guesses.slice(-1 * Math.max(5, maxAttempts))

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      {/* Header Card */}
      <div className="card bg-base-100 shadow-xl p-4 md:p-6 text-center border border-base-300">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => (window.location.href = "/")}
            className="btn btn-ghost btn-sm"
          >
            ← Lobby
          </button>
          <Logo name={room} />
          <div className="w-16 flex justify-end">
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

        {gameState === GameState.LOBBY && (
          <div className="flex flex-col gap-4 items-center py-6">
            <h2 className="text-2xl font-bold">Multiplayer Wordle</h2>
            <p className="opacity-70 max-w-md">
              Take turns guessing the 5-letter word. Green means correct spot,
              Yellow means wrong spot, Gray means not in word.
            </p>

            {isAdmin ? (
              <button
                onClick={() =>
                  socket.send(
                    JSON.stringify({
                      type: WordleClientMessageType.START_GAME,
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
                Waiting for host to start...
              </div>
            )}
          </div>
        )}

        {(gameState === GameState.PLAYING || gameState === GameState.ENDED) && (
          <div className="flex flex-col items-center gap-6">
            {/* Timer Bar (Only show when playing) */}
            {gameState === GameState.PLAYING && (
              <div className="w-full h-2 bg-base-300 rounded-full overflow-hidden relative">
                <div
                  className={clsx(
                    "h-full transition-all ease-linear",
                    timer < 3 ? "bg-error" : "bg-primary",
                  )}
                  style={{ width: `${(timer / maxTimer) * 100}%` }}
                ></div>
              </div>
            )}

            {/* Turn Indicator */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                {gameState === GameState.ENDED ? (
                  <span className="badge badge-neutral badge-lg p-3">
                    Game Over
                  </span>
                ) : isMyTurn ? (
                  <span className="badge badge-primary badge-lg p-3">
                    Your Turn!
                  </span>
                ) : (
                  <span className="opacity-70 flex items-center gap-2">
                    Watching{" "}
                    <span className="font-bold">{activePlayer?.name}</span>{" "}
                    guess...
                  </span>
                )}
              </div>
              <div className="text-xs opacity-50 font-mono">
                Attempts: {guesses.length}/{maxAttempts}
              </div>
            </div>

            {/* Game Grid */}
            <div
              className="flex flex-col gap-2 mb-4 cursor-text"
              onClick={() => {
                if (isMyTurn && gameState === GameState.PLAYING)
                  inputRef.current?.focus()
              }}
            >
              {/* Previous Guesses */}
              {visibleGuesses.map((g: Guess, i: number) => (
                <div key={i} className="flex gap-2">
                  {g.word.split("").map((char, charIdx) => (
                    <div
                      key={charIdx}
                      className={clsx(
                        "w-10 h-10 md:w-12 md:h-12 flex items-center justify-center font-bold text-xl border-2 uppercase",
                        g.results[charIdx] === "correct" &&
                          "bg-success text-success-content border-success",
                        g.results[charIdx] === "present" &&
                          "bg-warning text-warning-content border-warning",
                        g.results[charIdx] === "absent" &&
                          "bg-base-300 text-base-content/50 border-base-300",
                      )}
                    >
                      {char}
                    </div>
                  ))}
                  <div className="flex items-center ml-2 text-xs opacity-50 w-20 truncate">
                    {players.find((p) => p.id === g.playerId)?.name ||
                      "Unknown"}
                  </div>
                </div>
              ))}

              {/* Current Input Row (Only when playing) */}
              {gameState === GameState.PLAYING && (
                <div className="flex gap-2">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const char = (isMyTurn ? input : activePlayerInput)[i]
                    return (
                      <div
                        key={i}
                        className={clsx(
                          "w-10 h-10 md:w-12 md:h-12 flex items-center justify-center font-bold text-xl border-2 bg-base-100 uppercase transition-colors",
                          char ? "border-base-content/50" : "border-base-200",
                          isMyTurn ? "border-primary/50" : "",
                        )}
                      >
                        {char}
                      </div>
                    )
                  })}
                  <div className="flex items-center ml-2 text-xs opacity-50 w-20">
                    {activePlayer?.name || "..."}
                  </div>
                </div>
              )}
            </div>

            {/* Hidden Input */}
            {gameState === GameState.PLAYING && (
              <form
                onSubmit={handleSubmit}
                className="absolute opacity-0 w-0 h-0 overflow-hidden"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => isMyTurn && handleTyping(e.target.value)}
                  autoFocus={isMyTurn}
                  maxLength={5}
                />
                <button type="submit">Submit</button>
              </form>
            )}

            <div className="text-error h-6 text-sm font-bold min-h-[1.5rem]">
              {tempError}
            </div>

            {/* Keyboard (Disabled when ended) */}
            <div
              className={clsx(
                "flex flex-col gap-1.5 select-none w-full items-center",
                gameState === GameState.ENDED &&
                  "opacity-50 pointer-events-none",
              )}
            >
              {KEYS.map((row, i) => (
                <div key={i} className="flex gap-1.5">
                  {row.map((key) => {
                    const status = keyStates[key]
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          if (isMyTurn && input.length < 5) {
                            handleTyping(input + key)
                            inputRef.current?.focus()
                          }
                        }}
                        className={clsx(
                          "btn btn-xs md:btn-sm w-8 md:w-10 font-bold",
                          status === "correct" && "btn-success",
                          status === "present" && "btn-warning",
                          status === "absent" && "btn-disabled opacity-40",
                          !status && "btn-outline opacity-80",
                        )}
                      >
                        {key}
                      </button>
                    )
                  })}
                  {i === 2 && (
                    <button
                      onClick={() => {
                        if (isMyTurn) {
                          handleTyping(input.slice(0, -1))
                          inputRef.current?.focus()
                        }
                      }}
                      className="btn btn-xs md:btn-sm px-2 md:px-4"
                    >
                      ⌫
                    </button>
                  )}
                  {i === 2 && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        if (isMyTurn) handleSubmit(e as any)
                      }}
                      className="btn btn-xs md:btn-sm btn-primary px-2 md:px-4"
                    >
                      Enter
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isAdmin && gameState === GameState.PLAYING && (
              <button
                onClick={() =>
                  socket.send(
                    JSON.stringify({ type: WordleClientMessageType.STOP_GAME }),
                  )
                }
                className="btn btn-ghost btn-xs text-error mt-4"
              >
                Stop Game
              </button>
            )}

            {gameState === GameState.ENDED && (
              <div className="py-6 animate-in fade-in zoom-in duration-500 text-center">
                <h2 className="text-4xl font-black mb-4 text-primary">
                  GAME OVER
                </h2>
                {serverState.winnerId ? (
                  <div className="text-xl">
                    Winner:{" "}
                    <span className="font-bold">
                      {players.find((p) => p.id === serverState.winnerId)?.name}
                    </span>
                  </div>
                ) : (
                  <div className="text-xl">No winner this time!</div>
                )}
                {isAdmin && (
                  <button
                    onClick={() =>
                      socket.send(
                        JSON.stringify({
                          type: WordleClientMessageType.START_GAME,
                        }),
                      )
                    }
                    className="btn btn-primary btn-lg mt-6"
                  >
                    Play Again
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {players.map((p) => (
          <div
            key={p.id}
            className={clsx(
              "card p-4 transition-all duration-300 border-2 relative group",
              p.id === activePlayerId
                ? "border-primary bg-primary/10 scale-105 z-10 shadow-lg"
                : "border-transparent bg-base-100 placeholder-opacity-50",
            )}
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

                <div className="text-xs opacity-60 mt-1">
                  Wins: {p.wins || 0}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
