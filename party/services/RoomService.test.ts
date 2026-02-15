import { describe, it, expect, vi, beforeEach } from "vitest"
import { RoomService } from "./RoomService"
import { ChatService } from "./ChatService"
import { ModerationService } from "./ModerationService"
import {
  MockRoom,
  MockConnection,
  createMockConnectionContext,
} from "../../test/mocks/party"
import { GameMode, ServerMessageType, type Player } from "../../shared/types"
import type { IRoomContext } from "../core/interfaces"
import { GameRegistry } from "../core/GameRegistry"

describe("RoomService", () => {
  let room: MockRoom
  let context: IRoomContext
  let players: Map<string, Player>
  let roomService: RoomService
  let chatService: ChatService
  let moderationService: ModerationService

  beforeEach(() => {
    room = new MockRoom("test-room")
    players = new Map()

    // Minimal mock context
    context = {
      broadcast: vi.fn(),
      broadcastState: vi.fn(),
    } as unknown as IRoomContext

    chatService = new ChatService(room.id, context)
    moderationService = new ModerationService(room.id)

    // Register a mock game to avoid factory errors
    GameRegistry.register(GameMode.BOMB_PARTY, () => ({
      onStart: vi.fn(),
      onTick: vi.fn(),
      onPlayerJoin: vi.fn(),
      onPlayerLeave: vi.fn(),
      onMessage: vi.fn(),
      dispose: vi.fn(),
      getState: () => ({}),
      chatEnabled: true,
      gameLogEnabled: true,
    }))

    roomService = new RoomService(
      room as any,
      context,
      players,
      GameMode.BOMB_PARTY,
      chatService,
      moderationService,
    )

    // Mock Dictionary logic if needed, but RoomService mostly just checks if it's there
  })

  it("should handle first connection properly (Admin, Password set)", async () => {
    const conn = new MockConnection("admin-id")
    const ctx = createMockConnectionContext(
      "1.1.1.1",
      "http://localhost/party/room?name=Admin&password=secret",
    )

    await roomService.handleConnect(conn as any, ctx)

    const admin = players.get("admin-id")
    expect(admin).toBeDefined()
    expect(admin?.name).toBe("Admin")
    expect(admin?.isAdmin).toBe(true)
    expect(roomService.password).toBe("secret")
    expect(context.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ServerMessageType.SYSTEM_MESSAGE,
      }),
    )
  })

  it("should enforce passwords for subsequent players", async () => {
    // 1. Admin joins and sets password
    const adminConn = new MockConnection("admin-id")
    await roomService.handleConnect(
      adminConn as any,
      createMockConnectionContext(
        "1.1.1.1",
        "http://localhost/party/room?password=secret",
      ),
    )

    // 2. Second player joins with WRONG password
    const p2Conn = new MockConnection("p2-id")
    const p2CtxWrong = createMockConnectionContext(
      "2.2.2.2",
      "http://localhost/party/room?password=wrong",
    )
    await roomService.handleConnect(p2Conn as any, p2CtxWrong)

    expect(p2Conn.close).toHaveBeenCalledWith(4000, "Invalid Password")
    expect(players.has("p2-id")).toBe(false)

    // 3. Second player joins with CORRECT password
    const p3Conn = new MockConnection("p3-id")
    const p3CtxCorrect = createMockConnectionContext(
      "3.3.3.3",
      "http://localhost/party/room?password=secret",
    )
    await roomService.handleConnect(p3Conn as any, p3CtxCorrect)

    expect(players.has("p3-id")).toBe(true)
    expect(players.get("p3-id")?.isAdmin).toBe(false)
  })

  it("should reject banned players", async () => {
    moderationService.blockedIPs.add("banned-ip")

    const conn = new MockConnection("banned-user")
    const ctx = createMockConnectionContext("banned-ip")

    await roomService.handleConnect(conn as any, ctx)

    expect(conn.close).toHaveBeenCalledWith(4003, "Banned")
    expect(players.has("banned-user")).toBe(false)
  })

  it("should handle disconnects and reassign admin", async () => {
    // 1. Admin and p2 join
    const adminConn = new MockConnection("admin-id")
    await roomService.handleConnect(
      adminConn as any,
      createMockConnectionContext(),
    )
    const p2Conn = new MockConnection("p2-id")
    await roomService.handleConnect(
      p2Conn as any,
      createMockConnectionContext(),
    )

    expect(players.get("admin-id")?.isAdmin).toBe(true)
    expect(players.get("p2-id")?.isAdmin).toBe(false)

    // 2. Admin leaves
    await roomService.handleDisconnect("admin-id")

    expect(players.has("admin-id")).toBe(false)
    expect(players.get("p2-id")?.isAdmin).toBe(true)
  })

  it("should handle unique name generation", async () => {
    await roomService.handleConnect(
      new MockConnection("c1") as any,
      createMockConnectionContext("1.1.1.1", "http://localhost/?name=Bob"),
    )
    await roomService.handleConnect(
      new MockConnection("c2") as any,
      createMockConnectionContext("2.2.2.2", "http://localhost/?name=Bob"),
    )

    expect(players.get("c1")?.name).toBe("Bob")
    expect(players.get("c2")?.name).toBe("Bob (2)")
  })

  it("should allow admin to kick players", async () => {
    // 1. Setup Admin and Target
    await roomService.handleConnect(
      new MockConnection("admin-id") as any,
      createMockConnectionContext(),
    )
    await roomService.handleConnect(
      new MockConnection("target-id") as any,
      createMockConnectionContext(),
    )
    const targetConn = new MockConnection("target-id")
    room.connections.set("target-id", targetConn as any)

    // 2. Admin sends kick message
    const msg = JSON.stringify({ type: "KICK_PLAYER", playerId: "target-id" })
    roomService.handleMessage(msg, { id: "admin-id" } as any)

    expect(players.has("target-id")).toBe(false)
    expect(targetConn.close).toHaveBeenCalledWith(4002, "Kicked by Admin")
    expect(moderationService.blockedIPs.has("target-id")).toBe(true)
  })
})
