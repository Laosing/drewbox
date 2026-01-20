import { useEffect } from "react"

const themes = [
  "light",
  "dark",
  "cupcake",
  "bumblebee",
  "emerald",
  "corporate",
  "synthwave",
  "retro",
  "cyberpunk",
  "valentine",
  "halloween",
  "garden",
  "forest",
  "aqua",
  "lofi",
  "pastel",
  "fantasy",
  "wireframe",
  "black",
  "luxury",
  "dracula",
  "cmyk",
  "autumn",
  "business",
  "acid",
  "lemonade",
  "night",
  "coffee",
  "winter",
]

export default function ThemeController({
  theme,
  setTheme,
}: {
  theme: string
  setTheme: (t: string) => void
}) {
  useEffect(() => {
    // Load saved theme on mount
    const saved = localStorage.getItem("booombparty_theme")
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute("data-theme", saved)
    } else {
      document.documentElement.setAttribute("data-theme", "dark")
      setTheme("dark")
    }
  }, [setTheme])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setTheme(val)
    localStorage.setItem("booombparty_theme", val)
    document.documentElement.setAttribute("data-theme", val)
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <select
        className="select select-bordered select-sm w-full max-w-xs capitalize"
        value={theme}
        onChange={handleChange}
      >
        <option disabled>Pick a theme</option>
        {themes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  )
}
