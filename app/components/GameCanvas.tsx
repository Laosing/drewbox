import { useState, useEffect, useRef } from "react"
import usePartySocket from "partysocket/react"
import { generateAvatar } from "../utils/avatar"
import styles from "./GameCanvas.module.css"

type Player = {
  id: string
  name: string
  lives: number
  isAlive: boolean
  wins: number
  usedLetters: string[]
}

type GameState = "LOBBY" | "PLAYING" | "ENDED"

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
}

function GameCanvasInner({
  room,
  password,
}: {
  room: string
  password?: string | null
}) {
  const [gameState, setGameState] = useState<GameState>("LOBBY")
  const [players, setPlayers] = useState<Player[]>([])
  const [currentSyllable, setCurrentSyllable] = useState("")
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null)
  const [timer, setTimer] = useState(10)
  const [logs, setLogs] = useState<string[]>([])
  const [input, setInput] = useState("")
  const [activePlayerInput, setActivePlayerInput] = useState("")
  const [myName, setMyName] = useState("")
  const [dictionaryLoaded, setDictionaryLoaded] = useState(false)

  const [chatMessages, setChatMessages] = useState<
    { senderName: string; text: string }[]
  >([])
  const [chatInput, setChatInput] = useState("")

  const inputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  const socket = usePartySocket({
    room: room,
    query: password ? { password } : undefined,
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
    },
  })

  const handleMessage = (
    data: ServerMessage & { senderName?: string; text?: string }
  ) => {
    if (data.type === "STATE_UPDATE") {
      if (data.gameState) setGameState(data.gameState)
      if (data.players) setPlayers(data.players)
      if (data.currentSyllable) setCurrentSyllable(data.currentSyllable)
      if (data.activePlayerId !== undefined)
        setActivePlayerId(data.activePlayerId)
      if (data.timer !== undefined) setTimer(data.timer)
      if (data.dictionaryLoaded !== undefined)
        setDictionaryLoaded(data.dictionaryLoaded)
    } else if (data.type === "ERROR") {
      addLog(`Error: ${data.message}`)
    } else if (data.type === "BONUS") {
      addLog(`Bonus: ${data.message}`)
    } else if (data.type === "EXPLOSION") {
      addLog(`BOOM! Player exploded!`)
    } else if (data.type === "GAME_OVER") {
      addLog(`Game Over! Winner: ${data.winnerId || "None"}`)
      setChatMessages((prev) =>
        [...prev, { senderName: data.senderName!, text: data.text! }].slice(-50)
      )
    } else if (data.type === "CHAT_MESSAGE" && data.senderName && data.text) {
      setChatMessages((prev) =>
        [...prev, { senderName: data.senderName!, text: data.text! }].slice(-50)
      )
    } else if (data.type === "TYPING_UPDATE" && data.text !== undefined) {
      if (data.playerId !== socket.id) {
        setActivePlayerInput(data.text)
      }
    }
  }

  const addLog = (msg: string) => {
    setLogs((prev) => [msg, ...prev].slice(0, 5))
  }

  const handleStart = () => {
    socket.send(JSON.stringify({ type: "START_GAME" }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input) return
    socket.send(JSON.stringify({ type: "SUBMIT_WORD", word: input }))
    setInput("")
  }

  const [isNameDisabled, setIsNameDisabled] = useState(false)
  const [isChatDisabled, setIsChatDisabled] = useState(false)

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    socket.send(JSON.stringify({ type: "CHAT_MESSAGE", text: chatInput }))
    setChatInput("")

    setIsChatDisabled(true)
    setTimeout(() => setIsChatDisabled(false), 1000)
  }

  const handleNameChange = () => {
    socket.send(JSON.stringify({ type: "SET_NAME", name: myName }))

    setIsNameDisabled(true)
    setTimeout(() => setIsNameDisabled(false), 5000)
  }

  useEffect(() => {
    if (socket.id === activePlayerId && gameState === "PLAYING") {
      inputRef.current?.focus()
      setInput("") // Clear input when turn starts
    } else {
      setActivePlayerInput("") // Clear remote input when turn changes
    }
  }, [activePlayerId, gameState, socket.id])

  const isMyTurn = socket.id === activePlayerId

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <button
            onClick={() => (window.location.href = "/")}
            className={styles.lobbyButton}
          >
            ← Lobby
          </button>
          <h1 className={styles.title}>💣 BlitzParty</h1>
          <div className={styles.spacer}></div>
        </div>

        <div className={styles.roomInfo}>
          Room: <strong>{room}</strong>
          {password && "🔒"}
        </div>

        {gameState === "LOBBY" && (
          <div>
            <p>Welcome! Waiting for players...</p>
            <div className={styles.nameForm}>
              <input
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                placeholder="Enter your name"
                className={styles.nameInput}
              />
              <button onClick={handleNameChange} disabled={isNameDisabled}>
                {isNameDisabled ? "Wait..." : "Set Name"}
              </button>
            </div>

            <button
              onClick={handleStart}
              disabled={players.length < 1 || !dictionaryLoaded}
            >
              {dictionaryLoaded ? "Start Game" : "Loading Dictionary..."}
            </button>
          </div>
        )}

        {gameState === "PLAYING" && (
          <div>
            <div className={styles.syllableBox}>{currentSyllable}</div>
            <div className={styles.timerBar}>
              <div
                className={styles.timerFill}
                style={{ width: `${(timer / 10) * 100}%` }}
              ></div>
              <span className={styles.timerText}>{timer.toFixed(1)}s</span>
            </div>

            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                value={isMyTurn ? input : activePlayerInput}
                onChange={(e) => {
                  if (isMyTurn) {
                    const val = e.target.value
                    setInput(val)
                    socket.send(
                      JSON.stringify({ type: "UPDATE_TYPING", text: val })
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
              />
            </form>
          </div>
        )}

        {gameState === "ENDED" && (
          <div>
            <h2>Game Over!</h2>
            <p>Returning to lobby...</p>
          </div>
        )}
      </div>

      <div className={styles.playerGrid}>
        {players.map((p) => (
          <div
            key={p.id}
            className={`${styles.playerCard} ${
              p.id === activePlayerId ? styles.active : ""
            } ${!p.isAlive ? styles.dead : ""}`}
          >
            <div className={styles.playerInfo}>
              <img
                src={`data:image/svg+xml;base64,${btoa(
                  generateAvatar(p.name)
                )}`}
                alt="Avatar"
                className={styles.avatar}
              />
              <h3>
                {p.name} {p.id === socket.id ? "(You)" : ""}
              </h3>
            </div>
            <div className={styles.lives}>
              {"❤".repeat(Math.max(0, p.lives))}
            </div>
            <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>
              Wins: {p.wins || 0}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.messageLog}>
        {logs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>

      {/* Chat Box */}
      <div className={styles.chatBox}>
        <div className={styles.chatMessages}>
          {chatMessages.map((msg, i) => (
            <div key={i} className={styles.chatEntry}>
              <span className={styles.senderName}>{msg.senderName}:</span>{" "}
              <span className={styles.messageText}>{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleChatSubmit} className={styles.chatForm}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Say something..."
            className={styles.chatInput}
          />
          <button
            type="submit"
            className={styles.chatButton}
            disabled={isChatDisabled}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default function GameCanvas({ room }: { room: string }) {
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [connectionPassword, setConnectionPassword] = useState<string | null>(
    null
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

  if (checkingStatus) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>Loading room info...</div>
      </div>
    )
  }

  if (needsPassword) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2>Private Room</h2>
          <p>This room requires a password.</p>
          <form onSubmit={handlePasswordSubmit} className={styles.nameForm}>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter Password"
              className={styles.nameInput}
            />
            <button type="submit">Join</button>
          </form>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              marginTop: "1rem",
              background: "transparent",
              border: "1px solid #444",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return <GameCanvasInner room={room} password={connectionPassword} />
}
