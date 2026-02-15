import { createLogger, Logger } from "../../shared/logger"

/**
 * Handles IP blocking, connection throttling, and bans.
 */
export class ModerationService {
  private logger: Logger

  // Blocking State
  public blockedIPs: Set<string> = new Set()
  // Maps Connection ID -> IP
  public connectionIPs: Map<string, string> = new Map()
  // Maps Connection ID -> Client ID
  public connectionClientIds: Map<string, string> = new Map()

  // Rate Limiting State
  private lastConnectionAttempts: Map<string, number> = new Map()
  public failedPasswordAttempts: Map<string, number> = new Map()

  private cleanupInterval: ReturnType<typeof setInterval>

  constructor(roomId: string) {
    this.logger = createLogger(`Moderation [${roomId}]`, roomId)

    // Periodic cleanup of stale rate limiting data
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [ip, time] of this.lastConnectionAttempts) {
        if (now - time > 10000) this.lastConnectionAttempts.delete(ip)
      }
      // Clean up stale password attempts after 5 minutes
      for (const [ip] of this.failedPasswordAttempts) {
        if (!this.blockedIPs.has(ip)) {
          this.failedPasswordAttempts.delete(ip)
        }
      }
    }, 10000)
  }

  dispose() {
    clearInterval(this.cleanupInterval)
  }

  /**
   * Checks if a connection should be accepted based on IP rate limits.
   */
  checkRateLimit(ip: string): boolean {
    const isLocal =
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "localhost" ||
      ip === "unknown"

    if (!isLocal) {
      const lastAttempt = this.lastConnectionAttempts.get(ip)
      if (lastAttempt && Date.now() - lastAttempt < 2000) {
        this.logger.warn(`Rejected fast reconnect from IP: ${ip}`)
        return false // Rate limited
      }
    }
    this.lastConnectionAttempts.set(ip, Date.now())
    return true
  }

  /**
   * Checks if a connection/IP/Client is banned.
   */
  isBanned(connectionId: string, ip: string, clientId?: string): boolean {
    if (
      this.blockedIPs.has(ip) ||
      this.blockedIPs.has(connectionId) ||
      (clientId && this.blockedIPs.has(clientId))
    ) {
      this.logger.warn(
        `Rejected blocked Client: ${ip} / ${connectionId} / ${clientId}`,
      )
      return true
    }
    return false
  }

  trackConnection(connectionId: string, ip: string, clientId?: string) {
    this.connectionIPs.set(connectionId, ip)
    if (clientId) this.connectionClientIds.set(connectionId, clientId)
  }

  removeConnection(connectionId: string) {
    this.connectionIPs.delete(connectionId)
    this.connectionClientIds.delete(connectionId)
  }

  handlePasswordFailure(ip: string): { failures: number; banned: boolean } {
    const failures = (this.failedPasswordAttempts.get(ip) || 0) + 1
    this.failedPasswordAttempts.set(ip, failures)

    let banned = false
    if (failures >= 3) {
      this.blockedIPs.add(ip)
      this.logger.warn(`Banning IP ${ip} due to excessive password failures`)
      banned = true
    }

    return { failures, banned }
  }

  handlePasswordSuccess(ip: string) {
    this.failedPasswordAttempts.delete(ip)
  }

  /**
   * Ban a player by ID (and their IP/Client).
   */
  banPlayer(connectionId: string) {
    this.blockedIPs.add(connectionId)
    const ip = this.connectionIPs.get(connectionId)
    if (ip) this.blockedIPs.add(ip)

    const clientId = this.connectionClientIds.get(connectionId)
    if (clientId) this.blockedIPs.add(clientId)
  }
}
