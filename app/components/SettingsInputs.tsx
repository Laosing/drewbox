import React, { useId } from "react"

interface NumberInputProps {
  label: string
  value: number | string
  onChange: (value: number | string) => void
  min?: number
  max?: number
  helperText?: React.ReactNode
  required?: boolean
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  helperText,
}: NumberInputProps) {
  const id = useId()
  return (
    <fieldset className="fieldset">
      <label htmlFor={id} className="fieldset-legend">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const val = e.target.value
          if (val === "") {
            onChange("")
          } else {
            onChange(parseInt(val))
          }
        }}
        className="input input-bordered w-full"
      />
      <p className="label">{helperText}</p>
    </fieldset>
  )
}

interface ToggleInputProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  helperText?: React.ReactNode
}

export function ToggleInput({
  label,
  checked,
  onChange,
  helperText,
}: ToggleInputProps) {
  const id = useId()
  return (
    <fieldset className="fieldset">
      <label htmlFor={id} className="label text-sm cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          className="toggle toggle-sm mr-2"
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
      {helperText && <p className="label">{helperText}</p>}
    </fieldset>
  )
}
