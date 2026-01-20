import { useState, useEffect, useRef } from "react"
import usePartySocket from "partysocket/react"
import { useMultiTabPrevention } from "../hooks/useMultiTabPrevention"
import { CopyIcon, SettingsIcon, EditIcon } from "./Icons"
import { CustomAvatar, Logo } from "./Logo"
import { Modal } from "./Modal"
import {
  ClientMessageType,
  ServerMessageType,
  GameState,
} from "../../shared/types"

type Player = {
  id: string
  name: string
  lives: number
  isAlive: boolean
  wins: number
  usedLetters: string[]
  isAdmin?: boolean
  lastTurn?: { word: string; syllable: string }
}

type ServerMessage = {
  type: string
  gameState?: GameState
  players?: Player[]
  currentSyllable?: string
  activePlayerId?: string
  timer?: number
  message?: string
  winnerId?: string
  playerId?: string
  dictionaryLoaded?: boolean
  startingLives?: number
  maxTimer?: number
  chatEnabled?: boolean
  hide?: boolean
  syllableChangeThreshold?: number
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz"

function WordHighlight({
  word,
  highlight,
}: {
  word: string
  highlight: string
}) {
  const index = word.toLowerCase().indexOf(highlight.toLowerCase())
  if (index === -1) return <>{word}</>

  return (
    <>
      {word.slice(0, index)}
      <span className="text-primary font-bold">
        {word.slice(index, index + highlight.length)}
      </span>
      {word.slice(index + highlight.length)}
    </>
  )
}

function GameCanvasInner({
  room,
  password,
}: {
  room: string
  password?: string | null
}) {
  const [gameState, setGameState] = useState<GameState>(GameState.LOBBY)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentSyllable, setCurrentSyllable] = useState("")
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null)
  const [timer, setTimer] = useState(10)
  const [maxTimer, setMaxTimer] = useState(10)
  const [startingLives, setStartingLives] = useState(2)
  const [syllableChangeThreshold, setSyllableChangeThreshold] = useState(2)
  const [logs, setLogs] = useState<{ message: string; timestamp: number }[]>([])
  const [input, setInput] = useState("")
  const [activePlayerInput, setActivePlayerInput] = useState("")

  // Persistent name state (committed)
  const [myName, setMyName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("booombparty_username") || ""
    }
    return ""
  })

  // Input field state
  const [nameInput, setNameInput] = useState(myName)

  // Sync input with localstorage name on mount/update
  useEffect(() => {
    setNameInput(myName)
  }, [myName])

  const [dictionaryLoaded, setDictionaryLoaded] = useState(false)

  // Use stable initial name to prevent socket reconnection on name change
  const [initialName] = useState(myName)

  // Persistent Client ID
  const [clientId] = useState(() => {
    if (typeof window === "undefined") return "server"
    let id = localStorage.getItem("booombparty_client_id")
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem("booombparty_client_id", id)
    }
    return id
  })

  const socket = usePartySocket({
    room: room,
    // Add name to query
    query: {
      ...(password ? { password } : {}),
      name: initialName,
      clientId,
    },
    onMessage(evt) {
      const data = JSON.parse(evt.data) as ServerMessage & {
        senderName?: string
        text?: string
      }
      handleMessage(data)
    },
    onClose(evt) {
      if (evt.code === 4000) {
        window.location.href = "/?error=password"
      }
      if (evt.code === 4001) {
        window.location.href = "/?error=inactivity"
      }
      if (evt.code === 4002) {
        window.location.href = "/?error=kicked"
      }
      if (evt.code === 4003) {
        window.location.href = "/?error=banned"
      }
    },
  })

  const [chatMessages, setChatMessages] = useState<
    { senderName: string; text: string; timestamp: number }[]
  >([])
  const [chatInput, setChatInput] = useState("")
  const [chatEnabled, setChatEnabled] = useState(true)

  const [tempError, setTempError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatEndRef.current?.parentElement) {
      chatEndRef.current.parentElement.scrollTop =
        chatEndRef.current.parentElement.scrollHeight
    }
  }, [chatMessages])

  const handleMessage = (
    data: ServerMessage & { senderName?: string; text?: string },
  ) => {
    if (data.type === ServerMessageType.STATE_UPDATE) {
      if (data.gameState) setGameState(data.gameState)
      if (data.players) setPlayers(data.players)
      if (data.currentSyllable) setCurrentSyllable(data.currentSyllable)
      if (data.activePlayerId !== undefined)
        setActivePlayerId(data.activePlayerId)
      if (data.timer !== undefined) setTimer(data.timer)
      if (data.dictionaryLoaded !== undefined)
        setDictionaryLoaded(data.dictionaryLoaded)
      if (data.startingLives !== undefined) setStartingLives(data.startingLives)
      if (data.maxTimer !== undefined) setMaxTimer(data.maxTimer)
      if (data.chatEnabled !== undefined) setChatEnabled(data.chatEnabled)
      if (data.syllableChangeThreshold !== undefined)
        setSyllableChangeThreshold(data.syllableChangeThreshold)
    } else if (data.type === ServerMessageType.ERROR) {
      if (!data.hide) {
        addLog(`Error: ${data.message}`)
      }
      setTempError(data.message || "Error")
      setTimeout(() => setTempError(null), 500)
    } else if (data.type === ServerMessageType.BONUS) {
      addLog(`Bonus: ${data.message}`)
    } else if (data.type === ServerMessageType.EXPLOSION) {
      const pName =
        players.find((p) => p.id === data.playerId)?.name || "Unknown"
      addLog(`BOOM! Player: ${pName} lost a life!`)
    } else if (data.type === ServerMessageType.SYSTEM_MESSAGE) {
      addLog(`${data.message}`)
    } else if (data.type === ServerMessageType.VALID_WORD) {
      addLog(`${data.message}`)
    } else if (data.type === ServerMessageType.GAME_OVER) {
      if (data.winnerId) {
        const winnerName =
          players.find((p) => p.id === data.winnerId)?.name || data.winnerId
        addLog(`Game Over! Winner: ${winnerName}`)
      } else {
        addLog("Game Over!")
      }
    } else if (
      data.type === ServerMessageType.CHAT_MESSAGE &&
      data.senderName &&
      data.text
    ) {
      setChatMessages((prev) =>
        [
          ...prev,
          {
            senderName: data.senderName!,
            text: data.text!,
            timestamp: Date.now(),
          },
        ].slice(-100),
      )
    } else if (
      data.type === ServerMessageType.TYPING_UPDATE &&
      data.text !== undefined
    ) {
      if (data.playerId !== socket.id) {
        setActivePlayerInput(data.text)
      }
    }
  }

  const addLog = (msg: string) => {
    setLogs((prev) =>
      [{ message: msg, timestamp: Date.now() }, ...prev].slice(0, 50),
    )
  }

  const handleStart = () => {
    socket.send(JSON.stringify({ type: ClientMessageType.START_GAME }))
  }

  const handleStop = () => {
    socket.send(JSON.stringify({ type: ClientMessageType.STOP_GAME }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input) return
    socket.send(
      JSON.stringify({ type: ClientMessageType.SUBMIT_WORD, word: input }),
    )
    setInput("")
  }

  const handleSettingsSave = () => {
    socket.send(
      JSON.stringify({
        type: ClientMessageType.UPDATE_SETTINGS,
        startingLives,
        maxTimer,
        chatEnabled,
        syllableChangeThreshold,
      }),
    )
    ;(document.getElementById("settings_modal") as HTMLDialogElement)?.close()
  }

  const handleKick = (playerId: string) => {
    if (!confirm("Are you sure you want to kick this player?")) return
    socket.send(
      JSON.stringify({ type: ClientMessageType.KICK_PLAYER, playerId }),
    )
  }

  const [isNameDisabled, setIsNameDisabled] = useState(false)
  const [isChatDisabled, setIsChatDisabled] = useState(false)

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    socket.send(
      JSON.stringify({ type: ClientMessageType.CHAT_MESSAGE, text: chatInput }),
    )
    setChatInput("")

    setIsChatDisabled(true)
    setTimeout(() => setIsChatDisabled(false), 1000)
  }

  const handleNameChange = () => {
    const trimmedName = nameInput.trim()
    if (!trimmedName) return
    setMyName(trimmedName) // Commit the new name
    localStorage.setItem("booombparty_username", trimmedName)
    socket.send(
      JSON.stringify({ type: ClientMessageType.SET_NAME, name: trimmedName }),
    )
    setIsNameDisabled(true)
    setTimeout(() => setIsNameDisabled(false), 5000)
  }

  useEffect(() => {
    if (socket.id === activePlayerId && gameState === GameState.PLAYING) {
      inputRef.current?.focus()
      setInput("") // Clear input when turn starts
    } else {
      setActivePlayerInput("") // Clear remote input when turn changes
    }
  }, [activePlayerId, gameState, socket.id])

  const isMyTurn = socket.id === activePlayerId
  const isAmAdmin = players.find((p) => p.id === socket.id)?.isAdmin

  return (
    <div className="container mx-auto p-4 flex flex-col gap-6 max-w-4xl">
      {/* Name Modal */}
      <Modal
        id="name_modal"
        title="Change Name"
        actions={
          <>
            <form method="dialog">
              <button className="btn btn-ghost">Cancel</button>
            </form>
            <button
              onClick={() => {
                handleNameChange()
                ;(
                  document.getElementById("name_modal") as HTMLDialogElement
                )?.close()
              }}
              disabled={isNameDisabled || !nameInput.trim()}
              className="btn btn-primary"
            >
              Save
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Enter your name"
            className="input input-bordered w-full text-center"
            maxLength={16}
          />
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal
        id="settings_modal"
        title="Game Settings"
        actions={
          <>
            <form method="dialog">
              <button className="btn btn-ghost">Cancel</button>
            </form>
            <button className="btn btn-primary" onClick={handleSettingsSave}>
              Save & Apply
            </button>
          </>
        }
      >
        <div className="form-control w-full max-w-xs mb-6">
          <label className="label">
            <span className="label-text">Starting Lives</span>
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={startingLives}
            onChange={(e) => setStartingLives(parseInt(e.target.value) || 2)}
            className="input input-bordered w-full max-w-xs"
          />
          <label className="label">
            <span className="label-text-alt opacity-70">
              Value between 1 and 10
            </span>
          </label>
        </div>
        <div className="form-control w-full max-w-xs mb-6">
          <label className="label">
            <span className="label-text">Timer (Seconds)</span>
          </label>
          <input
            type="number"
            min="5"
            max="20"
            value={maxTimer}
            onChange={(e) => setMaxTimer(parseInt(e.target.value) || 10)}
            className="input input-bordered w-full max-w-xs"
          />
          <label className="label">
            <span className="label-text-alt opacity-70">
              Value between 5 and 20
            </span>
          </label>
        </div>
        <div className="form-control w-full max-w-xs mb-6">
          <label className="label">
            <span className="label-text">
              Change syllable after number of tries
            </span>
          </label>
          <input
            type="number"
            min="1"
            max="5"
            value={syllableChangeThreshold}
            onChange={(e) =>
              setSyllableChangeThreshold(parseInt(e.target.value) || 1)
            }
            className="input input-bordered w-full max-w-xs"
          />
          <label className="label">
            <span className="label-text-alt opacity-70">
              Value between 1 and 5
            </span>
          </label>
        </div>

        <div className="form-control w-full max-w-xs mb-6 px-1">
          <label className="label cursor-pointer justify-start gap-4">
            <span className="label-text font-bold">Enable Chat</span>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={chatEnabled}
              onChange={(e) => setChatEnabled(e.target.checked)}
            />
          </label>
        </div>
      </Modal>

      <div className="card bg-base-100 shadow-xl p-6 text-center border border-base-300">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => (window.location.href = "/")}
            className="btn btn-ghost btn-sm"
          >
            ← Lobby
          </button>
          <Logo name={room} />
          <div className="w-16 flex justify-end">
            {gameState === GameState.LOBBY && isAmAdmin && (
              <button
                className="btn btn-ghost btn-sm btn-circle"
                onClick={() =>
                  (
                    document.getElementById(
                      "settings_modal",
                    ) as HTMLDialogElement
                  )?.showModal()
                }
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
          <div className="flex flex-col gap-4 items-center">
            <p className="text-lg">
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
                Change syllable after: {syllableChangeThreshold} tries
              </div>
            </div>

            {isAmAdmin ? (
              <button
                onClick={handleStart}
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
                onChange={(e) => {
                  if (isMyTurn) {
                    const val = e.target.value
                    setInput(val)
                    socket.send(
                      JSON.stringify({
                        type: ClientMessageType.UPDATE_TYPING,
                        text: val,
                      }),
                    )
                  }
                }}
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
            {isAmAdmin && (
              <button
                onClick={handleStop}
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
      </div>

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
            {isAmAdmin && p.id !== socket.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleKick(p.id)
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
                        onClick={() =>
                          (
                            document.getElementById(
                              "name_modal",
                            ) as HTMLDialogElement
                          )?.showModal()
                        }
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

      {/* Logs & Chat */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card bg-base-100 p-4 h-48 shadow-lg">
          <h3 className="text-sm font-bold opacity-50 mb-2 uppercase tracking-wide">
            Game Log
          </h3>
          <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1">
            {logs.map((l, i) => (
              <div key={i} className="border-l-2 border-primary/20 pl-2">
                <span className="opacity-50 mr-2">
                  {new Date(l.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                {l.message}
              </div>
            ))}
          </div>
        </div>

        <div className="card bg-base-100 p-4 h-48 shadow-lg flex flex-col">
          <h3 className="text-sm font-bold opacity-50 mb-2 uppercase tracking-wide">
            Chat
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 mb-2">
            {chatMessages.map((msg, i) => (
              <div key={i} className="text-sm">
                <span className="opacity-50 text-xs mr-2 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="font-bold opacity-70">{msg.senderName}:</span>{" "}
                <span className="opacity-90">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={chatEnabled ? "Message..." : "Chat Disabled"}
              className="input input-sm input-bordered flex-1"
              maxLength={100}
              disabled={!chatEnabled}
            />
            <button
              type="submit"
              className="btn btn-sm btn-ghost"
              disabled={isChatDisabled || !chatEnabled}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function GameCanvas({ room }: { room: string }) {
  const isBlocked = useMultiTabPrevention()
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [connectionPassword, setConnectionPassword] = useState<string | null>(
    null,
  )
  const [passwordInput, setPasswordInput] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return

    // Check URL first
    const urlPwd = new URLSearchParams(window.location.search).get("password")
    if (urlPwd) {
      setConnectionPassword(urlPwd)
      setCheckingStatus(false)
      return
    }

    // Check room status
    fetch(`/parties/main/${room}`)
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error("Room not found")
      })
      .then((data: any) => {
        if (data.isPrivate) {
          setNeedsPassword(true)
        } else {
          // Public room, just connect
          setConnectionPassword("")
        }
        setCheckingStatus(false)
      })
      .catch(() => {
        // If error (e.g. 404), maybe it's a new room? Just allow connection to try creating it
        setConnectionPassword("")
        setCheckingStatus(false)
      })
  }, [room])

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setConnectionPassword(passwordInput)
    setNeedsPassword(false) // Trigger connection
  }

  if (isBlocked) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <div className="card bg-base-100 shadow-xl p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Multiple Tabs Detected</h2>
          <p className="mb-6">You are already active in another game tab.</p>
          <p className="mb-6 opacity-70">
            Please close this tab or the other one to continue.
          </p>
          <button
            onClick={() => (window.location.href = "/")}
            className="btn btn-primary"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    )
  }

  if (checkingStatus) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    )
  }

  if (needsPassword) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <div className="card bg-base-100 shadow-xl p-8 text-center max-w-sm w-full">
          <h2 className="text-2xl font-bold mb-2">Private Room</h2>
          <p className="mb-6 opacity-70">This room requires a password.</p>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter Password"
              className="input input-bordered w-full"
            />
            <button type="submit" className="btn btn-primary w-full">
              Join
            </button>
          </form>
          <button
            onClick={() => (window.location.href = "/")}
            className="btn btn-ghost w-full mt-2"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return <GameCanvasInner room={room} password={connectionPassword} />
}
