import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { DictionaryManager } from "./DictionaryManager"

// We need to reset the module to clear SHARED_WORDS singleton between tests
// However, since it's a top-level variable in the module, standard vi.resetModules() might be needed.

describe("DictionaryManager", () => {
  beforeEach(() => {
    DictionaryManager._reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should fail validation if not loaded", () => {
    const dict = new DictionaryManager()
    const result = dict.isValid("TEST", "TE")
    expect(result.valid).toBe(false)
    expect(result.reason).toBe("Dictionary loading...")
  })

  it("should load dictionary successfully", async () => {
    // Mock fetch
    const mockText = "APPLE\nBANANA\nCHERRY\nDATE\nELDERBERRY\nTEST\nTESTING"
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => mockText,
      body: null, // force fallback to text() path
    } as Response)

    const dict = new DictionaryManager()
    const result = await dict.load("http://localhost")

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost/dictionary.txt.gz")

    // Verify Content
    expect(dict.isWordValid("APPLE")).toBe(true)
    expect(dict.isWordValid("zzzz")).toBe(false)
  })

  it("should validate words and syllables correctly", async () => {
    const dict = new DictionaryManager()

    const mockText = "TEST\nTESTING\nTOAST"
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => mockText,
      body: null,
    } as Response)

    await dict.load("http://host")

    // 1. Missing Syllable
    let res = dict.isValid("TESTING", "ABC")
    expect(res.valid).toBe(false)
    expect(res.reason).toBe("Missing the letters above")

    // 2. Missing Syllable (Word valid or not irrelevant here if syllable missing check is first)
    res = dict.isValid("FAKEWORD", "XYZ")
    expect(res.valid).toBe(false)
    expect(res.reason).toBe("Missing the letters above")

    res = dict.isValid("FAKEWORD", "FA") // Syllable match, but word invalid
    expect(res.valid).toBe(false)
    expect(res.reason).toBe("Not in my dictionary")

    // 3. Valid
    res = dict.isValid("TESTING", "TEST")
    expect(res.valid).toBe(true)
  })

  it("should generate random syllables", async () => {
    const dict = new DictionaryManager()

    // Create enough words to ensure we find a syllable
    const mockWords = [
      "ACTION",
      "ACTOR",
      "REACT",
      "FACT",
      "PACT",
      "TACTIC",
    ].join("\n")

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => mockWords,
      body: null,
    } as Response)

    await dict.load("http://host")

    // Reduce minWords so we can find a match in our small set
    const syl = dict.getRandomSyllable(2)
    expect(syl.length).toBeGreaterThanOrEqual(2)
  })

  it("should generate random word of specific length", async () => {
    const dict = new DictionaryManager()

    const mockWords = ["CAT", "DOG", "BIRD", "FISH"].join("\n")
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => mockWords,
      body: null,
    } as Response)

    await dict.load("http://host")

    const w3 = dict.getRandomWord(3)
    expect(w3).toMatch(/^(CAT|DOG)$/)

    const w4 = dict.getRandomWord(4)
    expect(w4).toMatch(/^(BIRD|FISH)$/)

    expect(() => dict.getRandomWord(5)).toThrow("Failed to find valid word")
  })
})
