type LogLevel = "debug" | "info" | "warn" | "error"

/**
 * OpenTelemetry Severity Numbers
 * https://opentelemetry.io/docs/specs/otel/logs/data-model/#severity-fields
 */
const SeverityMap: Record<LogLevel, { text: string; number: number }> = {
  debug: { text: "DEBUG", number: 5 },
  info: { text: "INFO", number: 9 },
  warn: { text: "WARN", number: 13 },
  error: { text: "ERROR", number: 17 },
}

export class Logger {
  private namespace: string
  private roomId?: string
  private static remoteUrl?: string
  private static remoteToken?: string
  private static serviceName: string = "drewbox"

  constructor(namespace: string, roomId?: string) {
    this.namespace = namespace
    this.roomId = roomId
  }

  /**
   * Configures global remote logging (e.g., Axiom, Better Stack, OpenTelemetry Collector)
   */
  static configure(config: {
    url?: string
    token?: string
    serviceName?: string
  }) {
    Logger.remoteUrl = config.url
    Logger.remoteToken = config.token
    if (config.serviceName) Logger.serviceName = config.serviceName
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]) {
    const log = {
      time: new Date().toISOString(),
      level: level.toUpperCase(),
      ns: this.namespace,
      roomId: this.roomId,
      msg: message,
      data: args.length > 0 ? (args.length === 1 ? args[0] : args) : undefined,
    }
    return JSON.stringify(log)
  }

  private async ship(level: LogLevel, message: string, ...args: any[]) {
    if (!Logger.remoteUrl) return

    const { text, number } = SeverityMap[level]

    /**
     * OpenTelemetry Standard Log Record Format
     * Uses flat attributes for easier parsing by OTel-native ingestors
     */
    const logRecord = {
      timestamp: Date.now() * 1000000, // Unix Nano (Standard for OTel)
      severity_text: text,
      severity_number: number,
      body: message,
      resource: {
        "service.name": Logger.serviceName,
      },
      attributes: {
        namespace: this.namespace,
        roomId: this.roomId,
        // If args exist, attempt to merge them or put them in a data key
        ...(args.length === 1 && typeof args[0] === "object"
          ? args[0]
          : { data: args.length > 0 ? args : undefined }),
      },
    }

    try {
      fetch(Logger.remoteUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Logger.remoteToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([logRecord]),
      }).catch(() => {})
    } catch {
      // ignore
    }
  }

  debug(message: string, ...args: any[]) {
    console.debug(this.formatMessage("debug", message, ...args))
    this.ship("debug", message, ...args)
  }

  info(message: string, ...args: any[]) {
    console.log(this.formatMessage("info", message, ...args))
    this.ship("info", message, ...args)
  }

  warn(message: string, ...args: any[]) {
    console.warn(this.formatMessage("warn", message, ...args))
    this.ship("warn", message, ...args)
  }

  error(message: string, ...args: any[]) {
    console.error(this.formatMessage("error", message, ...args))
    this.ship("error", message, ...args)
  }
}

export const createLogger = (namespace: string, roomId?: string) =>
  new Logger(namespace, roomId)
