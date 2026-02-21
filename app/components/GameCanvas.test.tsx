import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import GameCanvas from "./GameCanvas"
import { GameMode } from "../../shared/types"
import * as useGameSessionModule from "../hooks/useGameSession"
import * as useMultiTabPreventionModule from "../hooks/useMultiTabPrevention"

// Mock dependencies
vi.mock("../hooks/useMultiTabPrevention", () => ({
  useMultiTabPrevention: vi.fn(() => false),
}))

vi.mock("../hooks/useGameSession", () => ({
  useGameSession: vi.fn(() => null),
}))

vi.mock("./ActiveGameView", () => ({
  ActiveGameView: vi.fn(() => <div>Active Game View Mock</div>),
}))

vi.mock("./ChatBox", () => ({
  ChatBox: vi.fn(() => <div>Chat Box Mock</div>),
}))

vi.mock("./GameModals", () => ({
  registerGameModals: vi.fn(),
}))

vi.mock("../services/ModalFactory", () => ({
  ModalFactory: {
    Container: vi.fn(() => null),
  },
  useModalStore: vi.fn(() => ({
    openModal: vi.fn(),
  })),
}))

describe("GameCanvas - Game Mode Priority", () => {
  const mockRoom = "test"

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.location.search
    delete (window as any).location
    ;(window as any).location = { search: "" }
  })

  it("should prioritize URL mode parameter over initialRoomInfo mode", () => {
    const useGameSessionSpy = vi.mocked(useGameSessionModule.useGameSession)

    // Simulate URL with mode=WORDLE
    ;(window as any).location.search = "?mode=WORDLE"

    // Simulate server returning stored mode as BOMB_PARTY
    const initialRoomInfo = {
      isPrivate: false,
      mode: GameMode.BOMB_PARTY,
    }

    render(<GameCanvas room={mockRoom} initialRoomInfo={initialRoomInfo} />)

    // Verify useGameSession was called with the URL mode (WORDLE), not the stored mode (BOMB_PARTY)
    expect(useGameSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        room: mockRoom,
        initialMode: GameMode.WORDLE, // URL mode takes priority
      }),
    )
  })

  it("should use initialRoomInfo mode when URL mode is not provided", () => {
    const useGameSessionSpy = vi.mocked(useGameSessionModule.useGameSession)

    // No URL mode parameter
    ;(window as any).location.search = ""

    // Server returns stored mode
    const initialRoomInfo = {
      isPrivate: false,
      mode: GameMode.WORD_CHAIN,
    }

    render(<GameCanvas room={mockRoom} initialRoomInfo={initialRoomInfo} />)

    // Verify useGameSession was called with the server's mode
    expect(useGameSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        room: mockRoom,
        initialMode: GameMode.WORD_CHAIN,
      }),
    )
  })

  it("should use URL mode when creating a new room (no initialRoomInfo)", () => {
    const useGameSessionSpy = vi.mocked(useGameSessionModule.useGameSession)

    // URL with mode parameter for new room
    ;(window as any).location.search = "?mode=WORD_CHAIN"

    // No initialRoomInfo (new room)
    render(<GameCanvas room={mockRoom} initialRoomInfo={null} />)

    // Verify useGameSession was called with the URL mode
    expect(useGameSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        room: mockRoom,
        initialMode: GameMode.WORD_CHAIN,
      }),
    )
  })

  it("should show error when no mode is available", () => {
    // No URL mode and no initialRoomInfo
    ;(window as any).location.search = ""

    render(<GameCanvas room={mockRoom} initialRoomInfo={null} />)

    // Should show "Game Mode Required" error
    expect(screen.getByText("Game Mode Required")).toBeDefined()
    expect(
      screen.getByText(
        "You are trying to create a new room without specifying a game mode.",
      ),
    ).toBeDefined()
  })

  it("should handle URL mode with password parameter", () => {
    const useGameSessionSpy = vi.mocked(useGameSessionModule.useGameSession)

    // URL with both mode and password
    ;(window as any).location.search = "?mode=WORDLE&password=secret123"

    const initialRoomInfo = {
      isPrivate: true,
      mode: GameMode.BOMB_PARTY, // Different from URL mode
    }

    render(<GameCanvas room={mockRoom} initialRoomInfo={initialRoomInfo} />)

    // Verify both password and mode from URL are used
    expect(useGameSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        room: mockRoom,
        password: "secret123",
        initialMode: GameMode.WORDLE, // URL mode, not server mode
      }),
    )
  })
})
