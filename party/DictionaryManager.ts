import { createLogger } from "../shared/logger"

const logger = createLogger("Dictionary")

// Shared memory across all room instances (Singleton Pattern)
// This saves ~40MB RAM per additional room on the same worker
let SHARED_WORDS: string[] = []
let SHARED_WORD_SET: Set<string> = new Set()
let LOADING_PROMISE: Promise<void> | null = null

export class DictionaryManager {
  public ready: Promise<void>

  constructor() {
    // If already loaded, we are ready immediately
    if (SHARED_WORDS.length > 0) {
      this.ready = Promise.resolve()
    } else if (LOADING_PROMISE) {
      this.ready = LOADING_PROMISE
    } else {
      // We'll initialize lazily in load(), but exposing a promise here is tricky without starting load.
      // Ideally, the server calls load() explicitly.
      this.ready = Promise.resolve()
    }
  }

  async load(origin: string): Promise<{ success: boolean; error?: string }> {
    if (SHARED_WORDS.length > 0) return { success: true }

    // If another room is already loading it, wait for that one
    if (LOADING_PROMISE) {
      await LOADING_PROMISE
      return { success: true }
    }

    logger.info("Loading Dictionary (compressed)...")

    // Start loading and cache the promise so others wait
    LOADING_PROMISE = (async () => {
      try {
        const dictUrl = new URL("/dictionary.txt.gz", origin).toString()
        const res = await fetch(dictUrl)
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)

        let text = ""
        if (res.body && typeof DecompressionStream !== "undefined") {
          const ds = new DecompressionStream("gzip")
          const decompressed = res.body.pipeThrough(ds)
          text = await new Response(decompressed).text()
        } else {
          text = await res.text()
        }

        SHARED_WORDS = text
          .split("\n")
          .map((w) => w.trim().toUpperCase())
          .filter((w) => w.length > 0)
        SHARED_WORD_SET = new Set(SHARED_WORDS)

        logger.info(`Dictionary loaded. ${SHARED_WORDS.length} words.`)
      } catch (e: any) {
        logger.error("Failed to load dictionary", e)
        LOADING_PROMISE = null // Reset so we can retry
        throw e
      }
    })()

    try {
      await LOADING_PROMISE
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  isValid(word: string, syllable: string): { valid: boolean; reason?: string } {
    if (SHARED_WORDS.length === 0)
      return { valid: false, reason: "Dictionary loading..." }

    const normalizedWord = word.trim().toUpperCase()
    const normalizedSyllable = syllable.trim().toUpperCase()

    if (!normalizedWord.includes(normalizedSyllable)) {
      return { valid: false, reason: "Missing the letters above" }
    }

    if (!SHARED_WORD_SET.has(normalizedWord)) {
      return { valid: false, reason: "Not in my dictionary" }
    }

    return { valid: true }
  }

  getRandomSyllable(minWords: number = 50): string {
    if (SHARED_WORDS.length === 0) throw new Error("Dictionary not loaded")

    let attempts = 0
    while (attempts < 50) {
      const word = SHARED_WORDS[Math.floor(Math.random() * SHARED_WORDS.length)]
      if (!word || word.length < 3) continue

      const len = Math.random() < 0.6 ? 2 : 3
      if (word.length < len) continue

      const start = Math.floor(Math.random() * (word.length - len + 1))
      const syllable = word.substring(start, start + len)

      let count = 0
      for (const w of SHARED_WORDS) {
        if (w.includes(syllable)) {
          count++
          if (count >= minWords) break
        }
      }

      if (count >= minWords) return syllable
      attempts++
    }

    return "ING"
  }

  getRandomWord(length: number = 5): string {
    if (SHARED_WORDS.length === 0) throw new Error("Dictionary not loaded")

    let attempts = 0
    while (attempts < 50) {
      const word = SHARED_WORDS[Math.floor(Math.random() * SHARED_WORDS.length)]
      if (word.length === length && /^[A-Z]+$/.test(word)) {
        return word
      }
      attempts++
    }

    const found = SHARED_WORDS.find(
      (w) => w.length === length && /^[A-Z]+$/.test(w),
    )
    if (found) return found

    throw new Error("Failed to find valid word")
  }

  isWordValid(word: string): boolean {
    if (SHARED_WORDS.length === 0) return false
    return SHARED_WORD_SET.has(word.trim().toUpperCase())
  }

  // Test Helper
  static _reset() {
    SHARED_WORDS = []
    SHARED_WORD_SET = new Set()
    LOADING_PROMISE = null
  }
}
