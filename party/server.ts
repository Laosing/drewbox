import type * as Party from "partykit/server"
import { DictionaryManager } from "./dictionary"

type Player = {
  id: string
  name: string
  lives: number
  isAlive: boolean
  wins: number
  usedLetters: string[]
  isAdmin: boolean
}

type GameState = "LOBBY" | "PLAYING" | "ENDED"

export default class Server implements Party.Server {
  // ... (options, room, dictionary, players, gameState, etc definitions constant)
  options: Party.ServerOptions = {
    hibernate: true,
  }

  room: Party.Room
  dictionary: DictionaryManager

  players: Map<string, Player> = new Map()
  gameState: GameState = "LOBBY"

  // ... (rest of properties)
  currentSyllable: string = ""
  usedWords: Set<string> = new Set()
  activePlayerId: string | null = null
  timer: number = 0
  maxTimer: number = 10

  tickInterval: ReturnType<typeof setInterval> | null = null

  dictionaryReady: boolean = false

  // Rate limiting (simple window)
  messageCounts: Map<string, number> = new Map()
  rateLimits: Map<string, { lastChat: number; lastNameChange: number }> =
    new Map()
  lastRateCheck: number = Date.now()
  password?: string

  // Blocking logic
  blockedIPs: Set<string> = new Set()
  connectionIPs: Map<string, string> = new Map()

  // Inactivity tracking
  lastActivity: number = Date.now()
  keepAliveInterval: ReturnType<typeof setInterval> | null = null

  // Bot Protection
  turnStartTime: number = 0
  lastConnectionAttempts: Map<string, number> = new Map()

  constructor(room: Party.Room) {
    this.room = room
    this.dictionary = new DictionaryManager()

    // Clear rate limits periodically
    setInterval(() => {
      this.messageCounts.clear()
      this.lastRateCheck = Date.now()

      // Also clean up old connection attempts (10s window)
      const now = Date.now()
      for (const [ip, time] of this.lastConnectionAttempts) {
        if (now - time > 10000) this.lastConnectionAttempts.delete(ip)
      }
    }, 1000)

    // Heartbeat & Inactivity Check
    this.keepAliveInterval = setInterval(() => {
      this.checkInactivity()
      this.reportToLobby()
    }, 10000)
  }

  checkInactivity() {
    if (this.players.size === 0) return

    // 2 minutes timeout
    const TIMEOUT = 2 * 60 * 1000
    if (Date.now() - this.lastActivity > TIMEOUT) {
      for (const conn of this.room.getConnections()) {
        conn.close(4001, "Inactivity")
      }
    }
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // 0. Validate Room ID (Security)
    if (!/^[a-z]{4}$/.test(this.room.id)) {
      conn.close(4000, "Invalid Room ID. Must be 4 lowercase letters.")
      return
    }

    // 1. Get IP
    const ip = (
      ctx.request.headers.get("x-forwarded-for") ||
      ctx.request.headers.get("cf-connecting-ip") ||
      "unknown"
    )
      .split(",")[0]
      .trim()

    // 2. Anti-Bot: Connection Throttling
    // Allow 1 connection every 2 seconds per IP
    const lastAttempt = this.lastConnectionAttempts.get(ip)
    if (lastAttempt && Date.now() - lastAttempt < 2000) {
      console.log(`Rejected fast reconnect from IP: ${ip}`)
      conn.close(4003, "Connection rate limited. Please wait.")
      return
    }
    this.lastConnectionAttempts.set(ip, Date.now())

    // 2. Check if blocked
    if (this.blockedIPs.has(ip)) {
      console.log(`Rejected blocked IP: ${ip}`)
      conn.close(4003, "You are banned from this room.")
      return
    }

    this.connectionIPs.set(conn.id, ip)

    console.log(`Connected: ${conn.id}`)
    this.lastActivity = Date.now()

    // Initialize dictionary if needed (lazy load)
    const url = new URL(ctx.request.url)
    // NOTE: In production (PartyKit), the origin might be the partykit.dev URL.
    // However, static assets are served from the same domain by PartyKit if configured correctly.
    // If client is separate (Vite deploy), we might need the client origin.
    // But since we deploy with 'partykit deploy', it serves 'dist' folder assets.
    // So 'origin' should be correct.
    const origin = url.origin

    // ... existing password and name logic
    const passwordParam = url.searchParams.get("password") || undefined
    const nameParam = url.searchParams.get("name")

    // First player sets the password (if any)
    if (this.players.size === 0) {
      this.password = passwordParam
    } else {
      // Subsequent players must match if password is set
      if (this.password && this.password !== passwordParam) {
        console.log(`Connection rejected: incorrect password for ${conn.id}`)
        conn.close(4000, "Invalid Password")
        return
      }
    }

    this.dictionary.load(origin).then((result) => {
      if (result.success) {
        if (!this.dictionaryReady) {
          this.dictionaryReady = true
          this.broadcastState()
        }
      } else {
        console.error("Dictionary failed to load:", result.error)
        this.broadcast({
          type: "ERROR",
          message: `Failed to load dictionary: ${
            result.error || "Unknown error"
          }. Please refresh.`,
        })
      }
    })

    // Use the name from query or default to Guest
    const name = nameParam
      ? nameParam.substring(0, 12)
      : `Guest ${conn.id.substring(0, 4)}`

    // First player is admin
    const isAdmin = this.players.size === 0

    this.players.set(conn.id, {
      id: conn.id,
      name,
      lives: 2,
      isAlive: this.gameState !== "PLAYING",
      wins: 0,
      usedLetters: [],
      isAdmin,
    })

    this.broadcastState()
    this.reportToLobby()
  }

  onClose(conn: Party.Connection) {
    console.log(`Disconnected: ${conn.id}`)

    this.connectionIPs.delete(conn.id)

    const wasAdmin = this.players.get(conn.id)?.isAdmin

    // Determine next player if active player is leaving
    let forceNextId: string | undefined
    if (this.gameState === "PLAYING" && conn.id === this.activePlayerId) {
      const playerIds = Array.from(this.players.values())
        .filter((p) => p.isAlive)
        .map((p) => p.id)
      const idx = playerIds.indexOf(conn.id)
      if (idx !== -1) {
        // Pick next in ring
        const nextIdx = (idx + 1) % playerIds.length
        if (playerIds[nextIdx] !== conn.id) {
          forceNextId = playerIds[nextIdx]
        }
      }
    }

    this.players.delete(conn.id)
    this.messageCounts.delete(conn.id)
    this.rateLimits.delete(conn.id)

    // Reassign admin if necessary
    if (wasAdmin && this.players.size > 0) {
      // Assign to the first available player (who has been there longest usually)
      const newAdmin = this.players.values().next().value
      if (newAdmin) {
        newAdmin.isAdmin = true
      }
    }

    this.checkWinCondition() // Check if game should end due to lack of players

    if (this.gameState === "PLAYING") {
      if (conn.id === this.activePlayerId) {
        // If the active player left, immediately pass turn to next
        this.nextTurn(false, false, forceNextId)
      }
    } else if (this.players.size === 0) {
      // Cleanup if empty
      if (this.tickInterval) clearInterval(this.tickInterval)
      this.gameState = "LOBBY"
      this.usedWords.clear()
    }

    this.broadcastState()
    this.reportToLobby()
  }

  // ... (onRequest, reportToLobby remain same)

  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          isPrivate: !!this.password,
          players: this.players.size,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      )
    }
    return new Response("Not found", { status: 404 })
  }

  async reportToLobby() {
    try {
      // We assume the lobby is on the same host
      await this.room.context.parties.lobby.get("global").fetch({
        method: "POST",
        body: JSON.stringify({
          id: this.room.id,
          players: this.players.size,
          isPrivate: !!this.password,
        }),
      })
    } catch (e) {
      // ignore lobby reporting errors
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    this.lastActivity = Date.now()

    // 1. Rate Limiting
    const count = (this.messageCounts.get(sender.id) || 0) + 1
    this.messageCounts.set(sender.id, count)
    if (count > 10) {
      // Too many messages, ignore to prevent spam
      return
    }

    try {
      const data = JSON.parse(message)
      const senderPlayer = this.players.get(sender.id)

      switch (data.type) {
        case "START_GAME":
          if (
            senderPlayer?.isAdmin &&
            this.gameState === "LOBBY" &&
            this.players.size > 0
          ) {
            this.startGame()
          }
          break

        case "STOP_GAME":
          if (senderPlayer?.isAdmin && this.gameState === "PLAYING") {
            // If strictly one player, treat them as winner to avoid "None"
            if (this.players.size === 1) {
              this.endGame(this.players.keys().next().value)
            } else {
              this.endGame(null)
            }
          }
          break

        case "SUBMIT_WORD":
          if (
            this.gameState === "PLAYING" &&
            this.activePlayerId === sender.id &&
            typeof data.word === "string"
          ) {
            this.handleWordSubmission(sender.id, data.word)
          }
          break

        case "UPDATE_TYPING":
          if (
            this.gameState === "PLAYING" &&
            this.activePlayerId === sender.id &&
            typeof data.text === "string"
          ) {
            this.broadcast({
              type: "TYPING_UPDATE",
              text: data.text,
              playerId: sender.id,
            })
          }
          break

        case "SET_NAME":
          {
            const limits = this.rateLimits.get(sender.id) || {
              lastChat: 0,
              lastNameChange: 0,
            }
            const now = Date.now()
            if (now - limits.lastNameChange < 5000) {
              // Rate limited
              return
            }

            const p = this.players.get(sender.id)
            if (p && typeof data.name === "string") {
              const cleanName = data.name.trim().substring(0, 12)
              if (cleanName.length > 0) {
                p.name = cleanName
                limits.lastNameChange = now
                this.rateLimits.set(sender.id, limits)
                this.broadcastState()
              }
            }
          }
          break

        case "CHAT_MESSAGE":
          if (typeof data.text === "string") {
            const limits = this.rateLimits.get(sender.id) || {
              lastChat: 0,
              lastNameChange: 0,
            }
            const now = Date.now()
            if (now - limits.lastChat < 1000) {
              // Rate limited
              return
            }

            const text = data.text.trim().substring(0, 200)
            if (text.length > 0) {
              limits.lastChat = now
              this.rateLimits.set(sender.id, limits)

              const senderPlayer = this.players.get(sender.id)
              this.broadcast({
                type: "CHAT_MESSAGE",
                senderId: sender.id,
                senderName: senderPlayer ? senderPlayer.name : "Unknown",
                text,
              })
            }
          }
          break

        case "UPDATE_SETTINGS":
          if (senderPlayer?.isAdmin && typeof data.startingLives === "number") {
            // Basic validation
            let lives = Math.floor(data.startingLives)
            if (lives < 1) lives = 1
            if (lives > 10) lives = 10
            this.startingLives = lives
            this.broadcastState()
          }
          break

        case "KICK_PLAYER":
          if (senderPlayer?.isAdmin && typeof data.playerId === "string") {
            // Cannot kick self
            if (data.playerId === sender.id) return

            const targetConn = this.room.getConnection(data.playerId)
            if (targetConn) {
              // BLOCK THE ID
              const ip = this.connectionIPs.get(data.playerId)
              if (ip && ip !== "unknown") {
                this.blockedIPs.add(ip)
                console.log(`Blocked IP ${ip} for player ${data.playerId}`)
              }
              targetConn.close(4002, "Kicked by Admin")
            }
          }
          break
      }
    } catch (e) {
      console.error("Error parsing message", e)
    }
  }

  initialAliveCount: number = 0
  startingLives: number = 2

  startGame() {
    if (this.players.size < 1) return
    if (!this.dictionaryReady) return // Prevent starting without dictionary

    this.gameState = "PLAYING"
    this.usedWords.clear()
    this.initialAliveCount = this.players.size

    for (const p of this.players.values()) {
      p.lives = this.startingLives
      p.isAlive = true
      p.usedLetters = []
    }

    this.startLoop()
    this.nextTurn(true, true)
  }

  startLoop() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.tickInterval = setInterval(() => {
      this.tick()
    }, 1000)
  }

  tick() {
    if (this.gameState !== "PLAYING") return

    this.timer -= 1
    // Broadcast timer every tick (optimized to only send timer field if possible,
    // but our handleMessage handles partial updates)
    this.broadcast({ type: "STATE_UPDATE", timer: this.timer })

    if (this.timer <= 0) {
      this.handleExplosion()
    }
  }

  handleExplosion() {
    if (!this.activePlayerId) return

    const p = this.players.get(this.activePlayerId)
    if (p) {
      p.lives -= 1
      if (p.lives <= 0) {
        p.isAlive = false
      }
      this.broadcast({ type: "EXPLOSION", playerId: this.activePlayerId })
    }

    this.checkWinCondition()
    if (this.gameState === "PLAYING") {
      this.nextTurn(false)
    }
  }

  nextTurn(
    success: boolean,
    isFirst: boolean = false,
    overridePlayerId?: string,
  ) {
    if (this.gameState !== "PLAYING") return

    const playerIds = Array.from(this.players.values())
      .filter((p) => p.isAlive)
      .map((p) => p.id)
    if (playerIds.length === 0) {
      this.endGame()
      return
    }

    let nextIndex = 0

    if (overridePlayerId && playerIds.includes(overridePlayerId)) {
      this.activePlayerId = overridePlayerId
    } else if (!isFirst && this.activePlayerId) {
      const currentIndex = playerIds.indexOf(this.activePlayerId)
      nextIndex = (currentIndex + 1) % playerIds.length
      this.activePlayerId = playerIds[nextIndex]
    } else if (isFirst) {
      nextIndex = Math.floor(Math.random() * playerIds.length)
      this.activePlayerId = playerIds[nextIndex]
    } else {
      this.activePlayerId = playerIds[0]
    }

    // Async generation?
    // getRandomSyllable is synchronous in interface but we might want to ensure loading?
    // For now, it returns "ING" if not loaded.
    this.currentSyllable = this.dictionary.getRandomSyllable(50)
    this.timer = this.maxTimer
    this.turnStartTime = Date.now()

    this.broadcastState()
  }

  handleWordSubmission(playerId: string, rawWord: string) {
    // Anti-Bot: Reaction Time Check
    // If the submission is impossibly fast (< 300ms) after turn start, ignore or reject.
    const reactionTime = Date.now() - this.turnStartTime
    if (reactionTime < 300) {
      console.log(
        `Rejected implausible reaction time: ${reactionTime}ms by ${playerId}`,
      )
      // Silent ignore or error
      this.sendTo(playerId, {
        type: "ERROR",
        message: "Too fast! Are you a bot?",
      })
      return
    }

    const word = rawWord.trim()
    if (this.usedWords.has(word.toLowerCase())) {
      this.sendTo(playerId, { type: "ERROR", message: "Word already used!" })
      return
    }

    const check = this.dictionary.isValid(word, this.currentSyllable)
    if (check.valid) {
      this.usedWords.add(word.toLowerCase())

      const p = this.players.get(playerId)
      if (p) {
        for (const char of word.toUpperCase()) {
          if (char >= "A" && char <= "Z" && !p.usedLetters.includes(char)) {
            p.usedLetters.push(char)
          }
        }
        if (p.usedLetters.length === 26) {
          p.lives++
          p.usedLetters = []
          this.sendTo(playerId, {
            type: "BONUS",
            message: "Alphabet Complete! +1 Life",
          })
        }
      }

      this.nextTurn(true)
    } else {
      this.sendTo(playerId, { type: "ERROR", message: check.reason })
    }
  }

  checkWinCondition() {
    const alive = Array.from(this.players.values()).filter((p) => p.isAlive)
    if (alive.length <= 1 && this.initialAliveCount > 1) {
      this.endGame(alive[0]?.id)
    } else if (alive.length === 0) {
      if (this.players.size === 1) {
        this.endGame(this.players.keys().next().value)
      } else {
        this.endGame(null)
      }
    }
  }

  endGame(winnerId?: string | null) {
    this.gameState = "ENDED"
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.broadcast({ type: "GAME_OVER", winnerId })

    if (winnerId) {
      const winner = this.players.get(winnerId)
      if (winner) {
        winner.wins += 1
      }
    }

    this.gameState = "LOBBY"
    this.broadcastState()
  }

  broadcastState() {
    this.room.broadcast(
      JSON.stringify({
        type: "STATE_UPDATE",
        gameState: this.gameState,
        players: Array.from(this.players.values()),
        currentSyllable: this.currentSyllable,
        activePlayerId: this.activePlayerId,
        timer: this.timer,
        dictionaryLoaded: this.dictionaryReady,
        startingLives: this.startingLives,
      }),
    )
  }

  broadcast(msg: any) {
    this.room.broadcast(JSON.stringify(msg))
  }

  sendTo(connectionId: string, msg: any) {
    const conn = this.room.getConnection(connectionId)
    if (conn) conn.send(JSON.stringify(msg))
  }
}
