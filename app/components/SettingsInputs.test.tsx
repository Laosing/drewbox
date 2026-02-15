import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ToggleInput } from "./SettingsInputs"

describe("ToggleInput", () => {
  it("renders with correct label and initial state", () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ToggleInput label="Test Toggle" checked={true} onChange={onChange} />,
    )

    const checkbox = screen.getByRole("checkbox", {
      name: "Test Toggle",
    }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(screen.getByText("Test Toggle")).toBeDefined()

    rerender(
      <ToggleInput label="Test Toggle" checked={false} onChange={onChange} />,
    )
    expect(checkbox.checked).toBe(false)
  })

  it("calls onChange when clicked", () => {
    const onChange = vi.fn()
    render(
      <ToggleInput label="Test Toggle" checked={false} onChange={onChange} />,
    )

    const checkbox = screen.getByRole("checkbox", { name: "Test Toggle" })
    fireEvent.click(checkbox)

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("updates when the checked prop changes (controlled component)", () => {
    const { rerender } = render(
      <ToggleInput label="Test Toggle" checked={false} onChange={() => {}} />,
    )
    const checkbox = screen.getByRole("checkbox", {
      name: "Test Toggle",
    }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    rerender(
      <ToggleInput label="Test Toggle" checked={true} onChange={() => {}} />,
    )
    expect(checkbox.checked).toBe(true)
  })
})
