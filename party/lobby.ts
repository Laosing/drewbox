import type * as Party from "partykit/server"
import { ServerMessageType } from "../shared/types"

type RoomInfo = {
  id: string
  players: number
  isPrivate: boolean
  lastUpdated: number
}

export default class LobbyServer implements Party.Server {
  options: Party.ServerOptions = {
    hibernate: true,
  }

  constructor(readonly lobby: Party.Party) {}

  async onStart() {
    // Check for stale rooms on startup or periodically
    await this.cleanupStaleRooms()
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Send current room list to new connector
    const rooms = await this.getRooms()
    conn.send(JSON.stringify({ type: ServerMessageType.ROOM_LIST, rooms }))
  }

  async onRequest(req: Party.Request) {
    if (req.method === "POST") {
      const body = (await req.json()) as {
        id: string
        players: number
        isPrivate: boolean
      }

      // Update storage
      if (body.players === 0) {
        await this.lobby.storage.delete(`room:${body.id}`)
      } else {
        const room: RoomInfo = {
          id: body.id,
          players: body.players,
          isPrivate: body.isPrivate || false,
          lastUpdated: Date.now(),
        }
        await this.lobby.storage.put(`room:${body.id}`, room)
      }

      // Schedule cleanup in 15 seconds
      // We set alarm for 15s from now. If one exists, it updates it.
      // Actually, we want to run cleanup periodically.
      // Let's ensure an alarm is set for the near future if not already.
      const currentAlarm = await this.lobby.storage.getAlarm()
      if (!currentAlarm) {
        await this.lobby.storage.setAlarm(Date.now() + 15000)
      }

      await this.broadcastRooms()
      return new Response("OK", { status: 200 })
    }

    if (req.method === "GET") {
      const rooms = await this.getRooms()
      return new Response(JSON.stringify(rooms), {
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response("Method not allowed", { status: 405 })
  }

  async onAlarm() {
    await this.cleanupStaleRooms()
  }

  async getRooms(): Promise<RoomInfo[]> {
    const map = await this.lobby.storage.list<RoomInfo>()
    return Array.from(map.values())
  }

  async cleanupStaleRooms() {
    const now = Date.now()
    const map = await this.lobby.storage.list<RoomInfo>()
    let changed = false
    let nextExpiration = Infinity

    for (const [key, info] of map) {
      if (now - info.lastUpdated > 15000) {
        await this.lobby.storage.delete(key)
        changed = true
      } else {
        // Track when the next room will expire
        const expiresAt = info.lastUpdated + 15000
        if (expiresAt < nextExpiration) {
          nextExpiration = expiresAt
        }
      }
    }

    if (changed) {
      await this.broadcastRooms()
    }

    // Schedule next cleanup if there are stil rooms
    if (nextExpiration !== Infinity) {
      await this.lobby.storage.setAlarm(nextExpiration)
    }
  }

  async broadcastRooms() {
    const rooms = await this.getRooms()
    this.lobby.broadcast(
      JSON.stringify({ type: ServerMessageType.ROOM_LIST, rooms }),
    )
  }
}
