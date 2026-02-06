export interface AntiBotConfig {
  minReactionTimeMs?: number
  minTypingEvents?: number
}

export interface ValidationResult {
  isValid: boolean
  reason?: string
}

export class AntiBotProtection {
  private typingStats: Map<string, { count: number; firstTypingTime: number }> =
    new Map()

  // Default configuration
  private config: Required<AntiBotConfig> = {
    minReactionTimeMs: 50,
    minTypingEvents: 2,
  }

  constructor(config?: AntiBotConfig) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  /**
   * Record that a player is typing
   */
  trackTyping(playerId: string) {
    const stats = this.typingStats.get(playerId) || {
      count: 0,
      firstTypingTime: Date.now(),
    }
    stats.count++
    this.typingStats.set(playerId, stats)
  }

  /**
   * Clear typing stats for a player (e.g. after a turn)
   */
  clearTyping(playerId: string) {
    this.typingStats.delete(playerId)
  }

  /**
   * Validate a player's action
   * @param playerId The player ID
   * @param turnStartTime (Optional) Timestamp when the turn started, for reaction time check
   */
  validateAction(playerId: string, turnStartTime?: number): ValidationResult {
    // 1. Reaction Time Check
    if (turnStartTime) {
      const reactionTime = Date.now() - turnStartTime
      if (reactionTime < this.config.minReactionTimeMs) {
        return {
          isValid: false,
          reason: "Too fast! Are you a bot?",
        }
      }
    }

    // 2. Typing Heuristic Check
    if (this.config.minTypingEvents > 0) {
      const stats = this.typingStats.get(playerId)
      if (!stats || stats.count < this.config.minTypingEvents) {
        return {
          isValid: false,
          reason: "Suspicious activity detected. Please type your words.",
        }
      }
    }

    return { isValid: true }
  }
}
