import { useState, useEffect, useRef } from "react"
import { useThrottledCallback } from "../../hooks/useThrottledCallback"
import PartySocket from "partysocket"
import {
  WordleClientMessageType,
  GameState,
  type Player,
  ServerMessageType,
  type Guess,
  type GuessResult,
  type WordleServerState,
} from "../../../shared/types"
import { GameHeader } from "../GameHeader"
import clsx from "clsx"
import { PlayerCard } from "../PlayerCard"
import { LobbyGameSettingsBadges } from "../LobbyGameSettingsBadges"

interface WordleViewProps {
  socket: PartySocket
  players: Player[]
  gameState: GameState
  isAdmin: boolean
  serverState: WordleServerState
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
    timer,
    maxTimer,
    maxAttempts,
    wordLength,
    dictionaryLoaded,
    revealedWord,
    hintsUsed = 0,
    hintLetterIndexes = [],
    hintLetters = [],
    freeHintLimit = 1,
    freeHintEnabled,
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

  const sendTypingUpdate = useThrottledCallback((text: string) => {
    socket.send(
      JSON.stringify({
        type: WordleClientMessageType.UPDATE_TYPING,
        text,
      }),
    )
  }, 100)

  const handleTyping = (val: string) => {
    // Only allow letters and max wordLength chars
    const cleaned = val
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, wordLength)
      .toUpperCase()
    setInput(cleaned)
    sendTypingUpdate(cleaned)
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
    <div className="flex flex-col gap-6 mx-auto w-full">
      {/* Header Card */}
      <GameHeader
        room={room}
        password={password}
        isAdmin={isAdmin}
        gameState={gameState}
        onOpenSettings={onOpenSettings}
      >
        {gameState === GameState.LOBBY && (
          <div className="flex flex-col gap-4 items-center py-6">
            <h2 className="text-2xl font-bold">Multiplayer Wordle</h2>
            <p className="opacity-70 max-w-md">
              Take turns guessing the {wordLength}-letter word. Green means
              correct spot, Yellow means wrong spot, Gray means not in word.
            </p>
            <LobbyGameSettingsBadges
              settings={[
                `Timer: ${maxTimer}s`,
                `Max Attempts: ${maxAttempts}`,
                `Word Length: ${wordLength}`,
                `Hints: ${freeHintEnabled ? freeHintLimit : "Disabled"}`,
              ]}
            />

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
                  <span className="badge badge-lg p-3">Game Over</span>
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
            <div className="flex flex-col gap-2 mb-4 relative">
              {/* Hint Row (Show all hints in one row at the top) */}
              {(gameState === GameState.PLAYING ||
                gameState === GameState.ENDED) &&
                hintsUsed > 0 &&
                hintLetterIndexes.length > 0 && (
                  <div className="flex gap-2 mb-2">
                    {Array.from({ length: wordLength }).map((_, i) => {
                      const hintIndex = hintLetterIndexes.indexOf(i)
                      const isHintPosition = hintIndex !== -1
                      const hintLetter = isHintPosition
                        ? hintLetters[hintIndex]
                        : ""
                      return (
                        <div
                          key={i}
                          className={clsx(
                            "w-10 h-10 md:w-12 md:h-12 flex items-center justify-center font-bold text-xl border-2 uppercase transition-all animate-in zoom-in duration-300",
                            isHintPosition
                              ? "bg-info text-info-content border-info"
                              : "border-transparent",
                          )}
                          style={
                            isHintPosition ? { animationDelay: "100ms" } : {}
                          }
                        >
                          {hintLetter}
                        </div>
                      )
                    })}
                    <div className="flex items-center ml-2 text-xs text-info font-bold">
                      {hintsUsed} Hint{hintsUsed > 1 ? "s" : ""}
                    </div>
                  </div>
                )}

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
                <>
                  <div className="flex gap-2">
                    {Array.from({ length: wordLength }).map((_, i) => {
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

                  <form
                    onSubmit={handleSubmit}
                    className="absolute inset-0 w-full h-full z-10"
                  >
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => isMyTurn && handleTyping(e.target.value)}
                      onClick={(e) => {
                        const target = e.target as HTMLInputElement
                        target.setSelectionRange(
                          target.value.length,
                          target.value.length,
                        )
                      }}
                      onFocus={(e) => {
                        const target = e.target as HTMLInputElement
                        setTimeout(() => {
                          target.setSelectionRange(
                            target.value.length,
                            target.value.length,
                          )
                        }, 10)
                      }}
                      autoFocus={isMyTurn}
                      maxLength={wordLength}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="w-full h-full opacity-0 cursor-default bg-transparent text-[16px]"
                      style={{
                        caretColor: "transparent",
                        color: "transparent",
                      }}
                    />
                    <button type="submit" className="hidden" />
                  </form>
                </>
              )}
            </div>

            <div className="text-error h-6 text-sm font-bold min-h-[1.5rem]">
              {tempError}
            </div>

            {/* Hint Button (Only when playing, hint enabled, and hints remaining) */}
            {gameState === GameState.PLAYING &&
              freeHintEnabled &&
              hintsUsed < freeHintLimit && (
                <button
                  onClick={() =>
                    socket.send(
                      JSON.stringify({
                        type: WordleClientMessageType.USE_HINT,
                      }),
                    )
                  }
                  className="btn btn-info btn-sm mb-2"
                >
                  Use Hint ({freeHintLimit - hintsUsed} remaining)
                </button>
              )}

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
                          if (isMyTurn && input.length < wordLength) {
                            handleTyping(input + key)
                            // inputRef.current?.focus() // Removed to prevent virtual keyboard popup on mobile
                          }
                        }}
                        onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on desktop
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
                          // inputRef.current?.focus()
                        }
                      }}
                      onMouseDown={(e) => e.preventDefault()}
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
                      onMouseDown={(e) => e.preventDefault()}
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
                className="btn btn-warning btn-small mt-4"
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

                {/* Reveal Word Button / Display */}
                <div className="mt-6">
                  {revealedWord ? (
                    <div className="text-center">
                      <p className="text-sm opacity-70 mb-2">The word was:</p>
                      <div className="inline-flex gap-2">
                        {revealedWord.split("").map((char, i) => (
                          <div
                            key={i}
                            className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center font-bold text-2xl border-2 bg-success text-success-content border-success uppercase animate-in zoom-in duration-300"
                            style={{ animationDelay: `${i * 50}ms` }}
                          >
                            {char}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        socket.send(
                          JSON.stringify({
                            type: WordleClientMessageType.REVEAL_WORD,
                          }),
                        )
                      }
                      className="btn btn-secondary"
                    >
                      Reveal Word
                    </button>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                    <button
                      onClick={() =>
                        socket.send(
                          JSON.stringify({
                            type: WordleClientMessageType.START_GAME,
                            reuseWord: true,
                          }),
                        )
                      }
                      className="btn btn-neutral btn-lg"
                    >
                      Retry Same Word
                    </button>
                    <button
                      onClick={() =>
                        socket.send(
                          JSON.stringify({
                            type: WordleClientMessageType.START_GAME,
                            reuseWord: false,
                          }),
                        )
                      }
                      className="btn btn-primary btn-lg"
                    >
                      New Word
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </GameHeader>

      {/* Players Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
            showLives={false}
          />
        ))}
      </div>
    </div>
  )
}
