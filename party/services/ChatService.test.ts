import { describe, it, expect, vi, beforeEach } from "vitest"
import { ChatService } from "./ChatService"
import { ServerMessageType } from "../../shared/types"
import type { IRoomContext } from "../core/interfaces"

describe("ChatService", () => {
  let chatService: ChatService
  let mockContext: IRoomContext

  beforeEach(() => {
    mockContext = {
      broadcast: vi.fn(),
    } as unknown as IRoomContext

    chatService = new ChatService("test-room", mockContext)
    vi.useFakeTimers()
  })

  it("should rate limit chat messages", () => {
    expect(chatService.canSendMessage("user1")).toBe(true)
    expect(chatService.canSendMessage("user1")).toBe(false)

    vi.advanceTimersByTime(1100)
    expect(chatService.canSendMessage("user1")).toBe(true)
  })

  it("should rate limit name changes", () => {
    expect(chatService.canChangeName("user1")).toBe(true)
    expect(chatService.canChangeName("user1")).toBe(false)

    vi.advanceTimersByTime(5100)
    expect(chatService.canChangeName("user1")).toBe(true)
  })

  it("should broadcast chat messages", () => {
    chatService.broadcastMessage("user1", "Alice", "Hello world")

    expect(mockContext.broadcast).toHaveBeenCalledWith({
      type: ServerMessageType.CHAT_MESSAGE,
      senderId: "user1",
      senderName: "Alice",
      text: "Hello world",
    })
  })

  it("should trim and truncate chat messages", () => {
    const longText = "a".repeat(300)
    chatService.broadcastMessage("user1", "Alice", "  " + longText + "  ")

    expect(mockContext.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "a".repeat(200),
      }),
    )
  })

  it("should broadcast system messages", () => {
    chatService.broadcastSystem("System message")

    expect(mockContext.broadcast).toHaveBeenCalledWith({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message: "System message",
    })
  })

  it("should cleanup rate limits on disconnect", () => {
    chatService.canSendMessage("user1")
    expect(chatService.canSendMessage("user1")).toBe(false)

    chatService.cleanup("user1")
    expect(chatService.canSendMessage("user1")).toBe(true)
  })
})
