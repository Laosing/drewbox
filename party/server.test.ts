import { describe, it, expect, beforeEach, vi } from "vitest"
import Server from "./server"
import {
  MockRoom,
  MockConnection,
  createMockConnectionContext,
  MockStorage,
} from "../test/mocks/party"
import { GameState, GameMode } from "../shared/types"

// Mock DictionaryRepository to avoid loading real dictionary files
vi.mock("./services/DictionaryService", () => ({
  DictionaryService: class {
    load = vi.fn().mockResolvedValue({ success: true })
    validate = vi.fn().mockReturnValue(true)
  },
}))

describe("PartyKit Server Smoke Tests", () => {
  let room: MockRoom
  let server: Server

  beforeEach(() => {
    room = new MockRoom("test")
    server = new Server(room as any)
    // Silence logger during tests
    server.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any
    // Spy on reportToLobby (it's a method on Server now)
    vi.spyOn(server, "reportToLobby").mockResolvedValue()
  })

  it("should instantiate correctly", () => {
    expect(server).toBeInstanceOf(Server)
    expect(server.gameState).toBe(GameState.LOBBY)
  })

  it("should handle new connection", async () => {
    const conn = new MockConnection("user1")
    const ctx = createMockConnectionContext()

    await server.onConnect(conn as any, ctx)

    expect(server.players.has("user1")).toBe(true)
    expect(server.players.size).toBe(1)

    // First player should be admin
    expect(server.players.get("user1")?.isAdmin).toBe(true)
    // Should have reported to lobby
    expect(server.reportToLobby).toHaveBeenCalled()
  })

  it("should remove player on disconnect", async () => {
    const conn = new MockConnection("user1")
    const ctx = createMockConnectionContext()
    await server.onConnect(conn as any, ctx)

    expect(server.players.size).toBe(1)

    // Clear spy history from connect call
    vi.mocked(server.reportToLobby).mockClear()

    await server.onClose(conn as any)
    expect(server.players.size).toBe(0)
    // Should have reported to lobby upon closing
    expect(server.reportToLobby).toHaveBeenCalled()
  })

  it("should persist game mode on first connect", async () => {
    const conn = new MockConnection("user1")
    const ctx = createMockConnectionContext(
      "127.0.0.1",
      "http://localhost/party/room?mode=WORDLE",
    )

    await server.onConnect(conn as any, ctx)

    expect(server.gameMode).toBe(GameMode.WORDLE)
    expect(room.storage.data.get("gameMode")).toBe(GameMode.WORDLE)
  })

  it("should handle password protection", async () => {
    // 1. First user joins with password
    const host = new MockConnection("host")
    const hostCtx = createMockConnectionContext(
      "127.0.0.1",
      "http://localhost/party/room?password=secret",
    )
    await server.onConnect(host as any, hostCtx)
    expect(server.players.has("host")).toBe(true)
    expect(server.players.has("host")).toBe(true)
    expect(server.roomService.password).toBe("secret")

    // 2. User joins with WRONG password
    const hacker = new MockConnection("hacker")
    const hackerCtx = createMockConnectionContext(
      "127.0.0.2",
      "http://localhost/party/room?password=wrong",
    )
    await server.onConnect(hacker as any, hackerCtx)
    // Should be closed with specific code 4000 (Invalid Password) or 4003 (Ban) if failed too many times
    expect(hacker.close).toHaveBeenCalledWith(4000, "Invalid Password")
    expect(server.players.has("hacker")).toBe(false)

    // 3. User joins with CORRECT password
    const guest = new MockConnection("guest")
    const guestCtx = createMockConnectionContext(
      "127.0.0.3",
      "http://localhost/party/room?password=secret",
    )
    await server.onConnect(guest as any, guestCtx)
    expect(server.players.has("guest")).toBe(true)
  })

  it("should allow admin to kick players", async () => {
    // Host joins
    const host = new MockConnection("host")
    room.connections.set("host", host as any) // Register with room
    await server.onConnect(host as any, createMockConnectionContext("1.1.1.1"))

    // Guest joins
    const guest = new MockConnection("guest")
    room.connections.set("guest", guest as any) // Register with room
    await server.onConnect(guest as any, createMockConnectionContext("2.2.2.2"))

    expect(server.players.size).toBe(2)

    // Host kicks guest
    const kickMsg = JSON.stringify({
      type: "KICK_PLAYER",
      playerId: "guest",
    })

    await server.onMessage(kickMsg, host as any)

    expect(server.players.has("guest")).toBe(false)
    expect(server.players.has("guest")).toBe(false)
    expect(server.roomService.moderation.blockedIPs.has("guest")).toBe(true) // Should block ID
    expect(server.roomService.moderation.blockedIPs.has("2.2.2.2")).toBe(true) // Should block IP
  })

  it("should ignore kick requests from non-admins", async () => {
    // Host joins
    const host = new MockConnection("host")
    await server.onConnect(host as any, createMockConnectionContext())

    // Guest joins
    const guest = new MockConnection("guest")
    await server.onConnect(guest as any, createMockConnectionContext())

    // Guest tries to kick host
    const kickMsg = JSON.stringify({
      type: "KICK_PLAYER",
      playerId: "host",
    })

    await server.onMessage(kickMsg, guest as any)

    expect(server.players.has("host")).toBe(true)
  })
})
