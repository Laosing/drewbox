import type * as Party from "partykit/server"
import { DictionaryManager } from "./dictionary"

type Player = {
  id: string
  name: string
  lives: number
  isAlive: boolean
  wins: number
  usedLetters: string[]
}

type GameState = "LOBBY" | "PLAYING" | "ENDED"

export default class Server implements Party.Server {
  options: Party.ServerOptions = {
    hibernate: true,
  }

  room: Party.Room
  dictionary: DictionaryManager

  players: Map<string, Player> = new Map()
  gameState: GameState = "LOBBY"

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

  // Inactivity tracking
  lastActivity: number = Date.now()
  keepAliveInterval: ReturnType<typeof setInterval> | null = null

  constructor(room: Party.Room) {
    this.room = room
    this.dictionary = new DictionaryManager()

    // Clear rate limits periodically
    setInterval(() => {
      this.messageCounts.clear()
      this.lastRateCheck = Date.now()
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
    console.log(`Connected: ${conn.id}`)
    this.lastActivity = Date.now()

    // Initialize dictionary if needed (lazy load)
    const url = new URL(ctx.request.url)
    const origin = url.origin
    const passwordParam = url.searchParams.get("password") || undefined

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

    this.dictionary.load(origin).then(() => {
      if (!this.dictionaryReady) {
        this.dictionaryReady = true
        this.broadcastState()
      }
    })

    const name = `Guest ${conn.id.substring(0, 4)}`
    this.players.set(conn.id, {
      id: conn.id,
      name,
      lives: 2,
      isAlive: true,
      wins: 0,
      usedLetters: [],
    })

    this.broadcastState()
    this.reportToLobby()
  }

  onClose(conn: Party.Connection) {
    console.log(`Disconnected: ${conn.id}`)
    this.players.delete(conn.id)
    this.messageCounts.delete(conn.id)
    this.rateLimits.delete(conn.id)

    if (this.players.size === 0) {
      if (this.tickInterval) clearInterval(this.tickInterval)
      // We don't verify keepAliveInterval logic here because hibernate=true
      // will implicitly kill everything when process exits.
      this.gameState = "LOBBY"
      this.usedWords.clear()
    } else {
      if (conn.id === this.activePlayerId) {
        this.nextTurn(false)
      }
    }

    this.broadcastState()
    this.reportToLobby()
  }

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
        }
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

      switch (data.type) {
        case "START_GAME":
          if (this.gameState === "LOBBY") {
            this.startGame()
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
      }
    } catch (e) {
      console.error("Error parsing message", e)
    }
  }

  startGame() {
    if (this.players.size < 1) return
    if (!this.dictionaryReady) return // Prevent starting without dictionary

    this.gameState = "PLAYING"
    this.usedWords.clear()

    for (const p of this.players.values()) {
      p.lives = 2
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

  nextTurn(success: boolean, isFirst: boolean = false) {
    if (this.gameState !== "PLAYING") return

    const playerIds = Array.from(this.players.values())
      .filter((p) => p.isAlive)
      .map((p) => p.id)
    if (playerIds.length === 0) {
      this.endGame()
      return
    }

    let nextIndex = 0
    if (!isFirst && this.activePlayerId) {
      const currentIndex = playerIds.indexOf(this.activePlayerId)
      nextIndex = (currentIndex + 1) % playerIds.length
    } else if (isFirst) {
      nextIndex = Math.floor(Math.random() * playerIds.length)
    }

    this.activePlayerId = playerIds[nextIndex]

    // Async generation?
    // getRandomSyllable is synchronous in interface but we might want to ensure loading?
    // For now, it returns "ING" if not loaded.
    this.currentSyllable = this.dictionary.getRandomSyllable(50)
    this.timer = this.maxTimer

    this.broadcastState()
  }

  handleWordSubmission(playerId: string, word: string) {
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
    if (alive.length <= 1 && this.players.size > 1) {
      this.endGame(alive[0]?.id)
    } else if (alive.length === 0) {
      this.endGame(null)
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
      })
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
