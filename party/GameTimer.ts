export class GameTimer {
  private interval: number
  private callback: () => void
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private nextTickTime: number = 0
  private isRunning: boolean = false

  constructor(callback: () => void, interval: number = 1000) {
    this.callback = callback
    this.interval = interval
  }

  start() {
    // If already running, restart or ignore?
    // Existing logic clears timeout then starts.
    this.stop()
    this.isRunning = true
    this.nextTickTime = Date.now() + this.interval
    this.timeoutId = setTimeout(() => this.step(), this.interval)
  }

  stop() {
    this.isRunning = false
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  private step() {
    if (!this.isRunning) return

    const now = Date.now()
    const drift = now - this.nextTickTime

    // Drift correction: if we missed a beat by too much, reset sync
    if (drift > this.interval) {
      this.nextTickTime = now
    }

    try {
      this.callback()
    } catch (error) {
      console.error("GameTimer callback error:", error)
    }

    if (!this.isRunning) return

    this.nextTickTime += this.interval
    const delay = Math.max(0, this.nextTickTime - Date.now())
    this.timeoutId = setTimeout(() => this.step(), delay)
  }
}
