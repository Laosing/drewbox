import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GameTimer } from "./GameTimer"

describe("GameTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("should invoke callback periodically when started", () => {
    const callback = vi.fn()
    const timer = new GameTimer(callback, 100) // 100ms interval

    timer.start()

    // Initially not called
    expect(callback).not.toHaveBeenCalled()

    // Advance 100ms
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)

    // Advance another 200ms
    vi.advanceTimersByTime(200)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it("should stop invoking callback when stopped", () => {
    const callback = vi.fn()
    const timer = new GameTimer(callback, 100)

    timer.start()
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)

    timer.stop()
    vi.advanceTimersByTime(500)
    // Should stay at 1
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("should continue running if callback throws an error", () => {
    const callback = vi.fn()

    // Make it throw on first call, work on subsequent
    callback.mockImplementationOnce(() => {
      throw new Error("Boom")
    })

    const timer = new GameTimer(callback, 100)
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    timer.start()

    // First tick (throws)
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalled() // Should log error

    // Second tick (should still run)
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it("should restart correctly if start is called again", () => {
    const callback = vi.fn()
    const timer = new GameTimer(callback, 100)

    timer.start()
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)

    // Restarting essentially resets the timer
    timer.start()

    // The previous timeout should have been cleared, so we wait another full interval
    vi.advanceTimersByTime(50)
    expect(callback).toHaveBeenCalledTimes(1) // Not yet

    vi.advanceTimersByTime(50)
    expect(callback).toHaveBeenCalledTimes(2)
  })
})
