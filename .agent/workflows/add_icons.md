---
description: Add new icons using Phosphor Icons (phosphor-icons/react)
---

Always use the `@phosphor-icons/react` package when adding new icons. Do not hand-code SVG paths.

## Package

`@phosphor-icons/react` — install if not already present:

```bash
pnpm add @phosphor-icons/react
```

Verify it's in `package.json` dependencies before assuming it's available.

## Usage

Import named icon components directly from the package:

```tsx
import { House, Lock, Copy, Gear } from "@phosphor-icons/react"

// Usage
<House size={16} />
<Lock size={16} weight="fill" />
```

Icon names use PascalCase and match the Phosphor icon names (e.g. `GearSix`, `ArrowLeft`, `SpeakerHigh`).

Browse available icons at https://phosphoricons.com

## Props

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `size` | `number \| string` | `1em` | Width and height |
| `weight` | `"thin" \| "light" \| "regular" \| "bold" \| "fill" \| "duotone"` | `"regular"` | Icon style |
| `color` | `string` | `"currentColor"` | Fill color |
| `mirrored` | `boolean` | `false` | Flip horizontally |

Use `className` for Tailwind sizing (e.g. `className="size-4"`) or the `size` prop — not both.

## Existing icons

The project has hand-coded SVG wrappers in [app/components/Icons.tsx](../../app/components/Icons.tsx). These are legacy. Do not add new icons there — use `@phosphor-icons/react` imports directly at the callsite instead.

## Rules

1. Never hand-code SVG paths for new icons.
2. Always import from `@phosphor-icons/react` — not from CDN or other icon libraries.
3. Use `weight="fill"` for solid/filled variants (matches the existing filled-style icons in the codebase).
4. Use `size={16}` or `className="size-4"` to match the existing `size-4` convention in the codebase.
5. Do not create wrapper components around Phosphor icons unless the same icon+props combination is reused in 3+ places.
