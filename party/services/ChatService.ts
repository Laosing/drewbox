import { createLogger, Logger } from "../../shared/logger"
import { ServerMessageType } from "../../shared/types"
import type { IRoomContext } from "../core/interfaces"

export class ChatService {
  private logger: Logger
  private context: IRoomContext

  // Rate limits: ConnectionID -> { lastChat, lastNameChange }
  private rateLimits: Map<
    string,
    { lastChat: number; lastNameChange: number }
  > = new Map()

  constructor(roomId: string, context: IRoomContext) {
    this.logger = createLogger(`Chat [${roomId}]`)
    this.context = context
  }

  cleanup(connectionId: string) {
    this.rateLimits.delete(connectionId)
  }

  canSendMessage(connectionId: string): boolean {
    const limits = this.rateLimits.get(connectionId) || {
      lastChat: 0,
      lastNameChange: 0,
    }
    const now = Date.now()
    if (now - limits.lastChat < 1000) {
      return false
    }
    limits.lastChat = now
    this.rateLimits.set(connectionId, limits)
    return true
  }

  canChangeName(connectionId: string): boolean {
    const limits = this.rateLimits.get(connectionId) || {
      lastChat: 0,
      lastNameChange: 0,
    }
    const now = Date.now()
    if (now - limits.lastNameChange < 5000) {
      return false
    }
    limits.lastNameChange = now
    this.rateLimits.set(connectionId, limits)
    return true
  }

  broadcastMessage(senderId: string, senderName: string, text: string) {
    const cleanText = text.trim().substring(0, 200)
    if (cleanText.length === 0) return

    this.context.broadcast({
      type: ServerMessageType.CHAT_MESSAGE,
      senderId,
      senderName,
      text: cleanText,
    })
  }

  broadcastSystem(message: string) {
    this.context.broadcast({
      type: ServerMessageType.SYSTEM_MESSAGE,
      message,
    })
  }
}
