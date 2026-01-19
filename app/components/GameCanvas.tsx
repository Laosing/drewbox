import { useState, useEffect, useRef } from "react"
import usePartySocket from "partysocket/react"
import { useMultiTabPrevention } from "../hooks/useMultiTabPrevention"
import { CopyIcon, SettingsIcon, EditIcon } from "./Icons"
import { CustomAvatar, Logo } from "./Logo"
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
  const [logs, setLogs] = useState<string[]>([])
  const [input, setInput] = useState("")
  const [activePlayerInput, setActivePlayerInput] = useState("")

  // Persistent name state (committed)
  const [myName, setMyName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("blitzparty_username") || ""
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

  const socket = usePartySocket({
    room: room,
    // Add name to query
    query: {
      ...(password ? { password } : {}),
      name: initialName,
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
    },
  })

  const [chatMessages, setChatMessages] = useState<
    { senderName: string; text: string; timestamp: number }[]
  >([])
  const [chatInput, setChatInput] = useState("")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isNameModalOpen, setIsNameModalOpen] = useState(false)

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
    } else if (data.type === ServerMessageType.ERROR) {
      addLog(`Error: ${data.message}`)
    } else if (data.type === ServerMessageType.BONUS) {
      addLog(`Bonus: ${data.message}`)
    } else if (data.type === ServerMessageType.EXPLOSION) {
      const pName =
        players.find((p) => p.id === data.playerId)?.name || "Unknown"
      addLog(`BOOM! Player: ${pName} exploded!`)
    } else if (data.type === ServerMessageType.GAME_OVER) {
      const winnerName =
        players.find((p) => p.id === data.winnerId)?.name ||
        data.winnerId ||
        "None"
      addLog(`Game Over! Winner: ${winnerName}`)
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
    setLogs((prev) => [msg, ...prev].slice(0, 5))
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
        startingLives: startingLives,
        maxTimer: maxTimer,
      }),
    )
    setIsSettingsOpen(false)
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
    setMyName(nameInput) // Commit the new name
    localStorage.setItem("blitzparty_username", nameInput)
    socket.send(
      JSON.stringify({ type: ClientMessageType.SET_NAME, name: nameInput }),
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
      {isNameModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="card bg-base-100 w-96 shadow-xl p-6">
            <h3 className="text-xl font-bold mb-4">Change Name</h3>
            <div className="flex flex-col gap-4">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter your name"
                className="input input-bordered w-full text-center"
                maxLength={16}
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="btn btn-ghost"
                  onClick={() => setIsNameModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleNameChange()
                    setIsNameModalOpen(false)
                  }}
                  disabled={isNameDisabled}
                  className="btn btn-primary"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="card bg-base-100 w-96 shadow-xl p-6">
            <h3 className="text-xl font-bold mb-4">Game Settings</h3>
            <div className="form-control w-full max-w-xs mb-6">
              <label className="label">
                <span className="label-text">Starting Lives</span>
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={startingLives}
                onChange={(e) =>
                  setStartingLives(parseInt(e.target.value) || 2)
                }
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
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                onClick={() => setIsSettingsOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSettingsSave}>
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}

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
                onClick={() => setIsSettingsOpen(true)}
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
              Welcome to BlitzParty! Type a word containing the letters before
              time runs out!
            </p>
            <div className="flex flex-col sm:flex-row gap-2 items-center w-full justify-center">
              <div className="badge badge-lg badge-neutral gap-2">
                Lives: {startingLives}
              </div>
              <div className="badge badge-lg badge-neutral gap-2">
                Timer: {maxTimer}s
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
            <div className="text-6xl font-black text-secondary uppercase my-6 animate-pulse tracking-widest">
              {currentSyllable}
            </div>

            <div className="w-full h-8 bg-base-300 rounded-full overflow-hidden relative mb-6">
              <div
                className="h-full bg-secondary transition-all ease-linear"
                style={{ width: `${(timer / 10) * 100}%` }}
              ></div>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-base-content mix-blend-difference">
                {timer.toFixed(1)}s
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mb-4">
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
                className="btn btn-ghost btn-xs opacity-50 hover:opacity-100"
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
                        onClick={() => setIsNameModalOpen(true)}
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
                {l}
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
                    hour: "2-digit",
                    minute: "2-digit",
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
              placeholder="Message..."
              className="input input-sm input-bordered flex-1"
              maxLength={100}
            />
            <button
              type="submit"
              className="btn btn-sm btn-ghost"
              disabled={isChatDisabled}
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
