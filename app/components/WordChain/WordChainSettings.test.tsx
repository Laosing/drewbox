import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import WordChainSettings from "./WordChainSettings"
import { GAME_CONFIG } from "../../../shared/config"

describe("WordChainSettings", () => {
  const defaultProps = {
    maxTimer: 10,
    startingLives: 2,
    hardModeStartRound: 5,
    chatEnabled: true,
    gameLogEnabled: true,
    onUpdate: vi.fn(),
  }

  it("renders all settings correctly", () => {
    render(<WordChainSettings {...defaultProps} />)

    expect(screen.getByRole("checkbox", { name: "Enable Chat" })).toBeDefined()
    expect(
      screen.getByRole("checkbox", { name: "Enable Game Log" }),
    ).toBeDefined()
    expect(
      screen.getByRole("spinbutton", { name: "Timer (seconds)" }),
    ).toBeDefined()
    expect(screen.getByRole("spinbutton", { name: "Lives" })).toBeDefined()
    expect(screen.getByRole("spinbutton", { name: "Hard Mode" })).toBeDefined()

    const chatToggle = screen.getByRole("checkbox", {
      name: "Enable Chat",
    }) as HTMLInputElement
    expect(chatToggle.checked).toBe(true)

    const timerInput = screen.getByRole("spinbutton", {
      name: "Timer (seconds)",
    }) as HTMLInputElement
    expect(timerInput.value).toBe("10")
  })

  it("calls onUpdate when toggles are clicked", () => {
    const onUpdate = vi.fn()
    render(<WordChainSettings {...defaultProps} onUpdate={onUpdate} />)

    const chatToggle = screen.getByRole("checkbox", { name: "Enable Chat" })
    fireEvent.click(chatToggle)
    expect(onUpdate).toHaveBeenCalledWith({ chatEnabled: false })

    const logToggle = screen.getByRole("checkbox", { name: "Enable Game Log" })
    fireEvent.click(logToggle)
    expect(onUpdate).toHaveBeenCalledWith({ gameLogEnabled: false })
  })

  it("uses default values when props are missing", () => {
    // @ts-ignore - testing missing props
    render(<WordChainSettings onUpdate={vi.fn()} />)

    const timerInput = screen.getByRole("spinbutton", {
      name: "Timer (seconds)",
    }) as HTMLInputElement
    expect(parseInt(timerInput.value)).toBe(
      GAME_CONFIG.WORD_CHAIN.TIMER.DEFAULT,
    )

    const livesInput = screen.getByRole("spinbutton", {
      name: "Lives",
    }) as HTMLInputElement
    expect(parseInt(livesInput.value)).toBe(
      GAME_CONFIG.WORD_CHAIN.LIVES.DEFAULT,
    )
  })

  it("updates correctly when props change", () => {
    const { rerender } = render(
      <WordChainSettings {...defaultProps} chatEnabled={true} />,
    )
    const chatToggle = screen.getByRole("checkbox", {
      name: "Enable Chat",
    }) as HTMLInputElement
    expect(chatToggle.checked).toBe(true)

    rerender(<WordChainSettings {...defaultProps} chatEnabled={false} />)
    expect(chatToggle.checked).toBe(false)
  })
})
