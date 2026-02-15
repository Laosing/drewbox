import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ModerationService } from "./ModerationService"

describe("ModerationService", () => {
  let moderationService: ModerationService

  beforeEach(() => {
    vi.useFakeTimers()
    moderationService = new ModerationService("test-room")
  })

  afterEach(() => {
    moderationService.dispose()
    vi.useRealTimers()
  })

  it("should rate limit connection attempts from same IP", () => {
    const ip = "1.2.3.4"
    expect(moderationService.checkRateLimit(ip)).toBe(true)
    expect(moderationService.checkRateLimit(ip)).toBe(false)

    vi.advanceTimersByTime(2100)
    expect(moderationService.checkRateLimit(ip)).toBe(true)
  })

  it("should allow local IPs without rate limiting", () => {
    expect(moderationService.checkRateLimit("127.0.0.1")).toBe(true)
    expect(moderationService.checkRateLimit("127.0.0.1")).toBe(true)
  })

  it("should detect banned IPs/ClientIds", () => {
    moderationService.blockedIPs.add("banned-ip")
    expect(moderationService.isBanned("conn1", "banned-ip")).toBe(true)
    expect(moderationService.isBanned("conn1", "clean-ip")).toBe(false)
  })

  it("should handle password failures and ban after 3 attempts", () => {
    const ip = "5.6.7.8"

    expect(moderationService.handlePasswordFailure(ip)).toEqual({
      failures: 1,
      banned: false,
    })
    expect(moderationService.handlePasswordFailure(ip)).toEqual({
      failures: 2,
      banned: false,
    })
    expect(moderationService.handlePasswordFailure(ip)).toEqual({
      failures: 3,
      banned: true,
    })

    expect(moderationService.blockedIPs.has(ip)).toBe(true)
    expect(moderationService.isBanned("conn1", ip)).toBe(true)
  })

  it("should reset password failures on success", () => {
    const ip = "5.6.7.8"
    moderationService.handlePasswordFailure(ip)
    moderationService.handlePasswordSuccess(ip)

    expect(moderationService.handlePasswordFailure(ip)).toEqual({
      failures: 1,
      banned: false,
    })
  })

  it("should ban player and associated identifiers", () => {
    moderationService.trackConnection("conn1", "ip1", "client1")
    moderationService.banPlayer("conn1")

    expect(moderationService.blockedIPs.has("conn1")).toBe(true)
    expect(moderationService.blockedIPs.has("ip1")).toBe(true)
    expect(moderationService.blockedIPs.has("client1")).toBe(true)
  })

  it("should cleanup stale connection attempts", () => {
    const ip = "9.9.9.9"
    moderationService.checkRateLimit(ip)
    expect(moderationService.checkRateLimit(ip)).toBe(false)

    vi.advanceTimersByTime(11000) // Trigger cleanup interval (10s)
    vi.runOnlyPendingTimers()

    expect(moderationService.checkRateLimit(ip)).toBe(true)
  })
})
