import initSqlJs from "sql.js"
import sqlWasm from "./sql-wasm.wasm"
import { createLogger } from "../shared/logger"

const logger = createLogger("Dictionary")

export class DictionaryManager {
  private db: any = null
  public ready: Promise<void>
  private _resolveReady!: () => void
  private _isLoaded = false

  constructor() {
    this.ready = new Promise((resolve) => {
      this._resolveReady = resolve
    })
  }

  async load(origin: string): Promise<{ success: boolean; error?: string }> {
    if (this._isLoaded) return { success: true } // Already loaded (or attempted and succeeded)
    // If we failed before, maybe we allow retry? For now, simple.

    // Check if we already have db (in case this._isLoaded was confused)
    if (this.db) return { success: true }

    logger.info("Loading Dictionary from SQLite...")

    try {
      const dbUrl = new URL("/dictionary.bin", origin).toString()

      const dbRes = await fetch(dbUrl)
      if (!dbRes.ok) throw new Error(`Fetch failed: ${dbRes.status}`)

      const dbBinary = await dbRes.arrayBuffer()

      const SQL = await initSqlJs({
        instantiateWasm: (imports, successCallback) => {
          WebAssembly.instantiate(sqlWasm, imports)
            .then((result) => {
              // If result has 'instance' property, it was from buffer. If not, it's likely the Instance itself (from Module).
              // @ts-ignore
              const instance = result.instance || result
              successCallback(instance)
            })
            .catch((e) => logger.error("WASM instantiation failed:", e))
          return {}
        },
      })

      this.db = new SQL.Database(new Uint8Array(dbBinary))
      logger.info(
        "SQL DB Loaded. Tables:" +
          JSON.stringify(
            this.db.exec(
              "SELECT name FROM sqlite_master WHERE type='table'",
            )[0],
          ),
      )
      this._isLoaded = true
      this._resolveReady()
      return { success: true }
    } catch (e: any) {
      logger.error("Failed to load dictionary DB", e)
      return { success: false, error: e.message || String(e) }
    }
  }

  isValid(word: string, syllable: string): { valid: boolean; reason?: string } {
    if (!this.db) return { valid: false, reason: "Dictionary loading..." }

    const normalizedWord = word.toLowerCase().trim()
    const normalizedSyllable = syllable.toLowerCase().trim()

    if (!normalizedWord.includes(normalizedSyllable)) {
      return { valid: false, reason: "Missing the letters above" }
    }

    try {
      const stmt = this.db.prepare(
        "SELECT count(*) FROM English WHERE word = $word COLLATE NOCASE",
      )
      stmt.bind({ $word: normalizedWord })

      let valid = false
      if (stmt.step()) {
        const count = stmt.get()[0]
        if (count > 0) valid = true
      }
      stmt.free()

      if (!valid) return { valid: false, reason: "Not in my dictionary" }
      return { valid: true }
    } catch (e: any) {
      logger.error("SQL Error in isValid", e)
      // Try to list tables to debug
      try {
        const tables = this.db.exec(
          "SELECT name FROM sqlite_master WHERE type='table'",
        )
        logger.info("Current tables: " + JSON.stringify(tables))
      } catch (err) {
        logger.error("Failed to list tables during error handling", err)
      }
      return { valid: false, reason: `Database error: ${e.message || e}` }
    }
  }

  getRandomSyllable(minWords: number = 50): string {
    if (!this.db) throw new Error("Dictionary not loaded")

    let attempts = 0
    while (attempts < 20) {
      try {
        const stmt = this.db.prepare(
          "SELECT word FROM English ORDER BY RANDOM() LIMIT 1",
        )
        let word = ""
        if (stmt.step()) {
          word = stmt.get()[0] as string
        }
        stmt.free()

        if (!word || word.length < 3) continue

        const len = Math.random() < 0.6 ? 2 : 3
        if (word.length < len) continue

        const start = Math.floor(Math.random() * (word.length - len + 1))
        const syllable = word.substring(start, start + len)

        const countStmt = this.db.prepare(
          "SELECT count(*) FROM English WHERE word LIKE $pattern",
        )
        countStmt.bind({ $pattern: `%${syllable}%` })
        let count = 0
        if (countStmt.step()) {
          count = countStmt.get()[0] as number
        }
        countStmt.free()

        if (count >= minWords) return syllable.toUpperCase()
        attempts++
      } catch (err) {
        logger.error("Random syllable generation error", err)
        throw new Error("Failed to generate syllable from DB")
      }
    }

    throw new Error("Failed to generate valid syllable after 20 attempts")
  }
}
