import React from "react"

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
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">{label}</legend>
      <input
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
  return (
    <fieldset className="fieldset">
      <label className="label text-sm">
        <input
          type="checkbox"
          defaultChecked={checked}
          className="toggle toggle-sm"
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
      {helperText && <p className="label">{helperText}</p>}
    </fieldset>
  )
}
