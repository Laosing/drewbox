import { createRoot } from "react-dom/client"
import GameCanvas from "./components/GameCanvas"
import LobbyView from "./components/LobbyView"
import ThemeController from "./components/ThemeController"
import "./styles.css"

import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"

import { StrictMode, useState } from "react"

const getThemeGradient = (theme: string) => {
  switch (theme) {
    case "light":
      return "linear-gradient(120deg, #fdfbfb 0%, #ebedee 100%)"
    case "dark":
      return "linear-gradient(to top, #1e293b 0%, #0f172a 100%)" // Subtle dark
    case "cupcake":
      return "linear-gradient(120deg, #fdf2f8 0%, #fce7f3 100%)" // Very light pink
    case "bumblebee":
      return "linear-gradient(120deg, #fffbeb 0%, #fff7ed 100%)" // Very light yellow/orange
    case "emerald":
      return "linear-gradient(to right, #ecfdf5 0%, #d1fae5 100%)" // Very light green
    case "corporate":
      return "linear-gradient(to right, #f8fafc 0%, #e2e8f0 100%)" // Very light blue-grey
    case "synthwave":
      return "linear-gradient(to top, #2e1065 0%, #4c1d95 100%)" // Deep but smooth purple
    case "retro":
      return "linear-gradient(120deg, #fefce8 0%, #fef9c3 100%)" // Vintage yellow
    case "cyberpunk":
      return "linear-gradient(120deg, #fdf4ff 0%, #fae8ff 100%)" // Light neon-ish pink
    case "valentine":
      return "linear-gradient(120deg, #fff1f2 0%, #ffe4e6 100%)" // Soft rose
    case "halloween":
      return "linear-gradient(to right, #2d2a2e, #1a1a1a)" // Dark grey/black
    case "forest":
      return "linear-gradient(to top, #f0fdf4 0%, #dcfce7 100%)" // Minty
    case "aqua":
      return "linear-gradient(to right, #eff6ff 0%, #dbeafe 100%)" // Light blue
    case "lofi":
      return "linear-gradient(120deg, #fafafa 0%, #f4f4f5 100%)" // Almost white
    case "pastel":
      return "linear-gradient(120deg, #fdf2f8 0%, #eff6ff 100%)" // Pink to blue pastel
    case "fantasy":
      return "linear-gradient(to top, #faf5ff 0%, #f3e8ff 100%)" // Light purple
    case "wireframe":
      return "linear-gradient(to right, #18181b, #27272a)" // Dark smooth
    case "black":
      return "linear-gradient(to right, #000000, #171717)"
    case "luxury":
      return "linear-gradient(to right, #0f172a, #1e293b)"
    case "dracula":
      return "linear-gradient(to right, #282a36, #44475a)"
    case "cmyk":
      return "linear-gradient(120deg, #fafafa 0%, #f4f4f5 100%)"
    case "autumn":
      return "linear-gradient(to right, #fff7ed 0%, #ffedd5 100%)" // Light orange
    case "business":
      return "linear-gradient(to right, #f1f5f9 0%, #e2e8f0 100%)"
    case "acid":
      return "linear-gradient(120deg, #f0fdfa 0%, #ccfbf1 100%)"
    case "lemonade":
      return "linear-gradient(120deg, #fefce8 0%, #fef08a 100%)"
    case "night":
      return "linear-gradient(to top, #0f172a 0%, #1e293b 100%)"
    case "coffee":
      return "linear-gradient(to right, #28231d 0%, #423930 100%)"
    case "winter":
      return "linear-gradient(to top, #f8fafc 0%, #e0f2fe 100%)"
    default:
      return "linear-gradient(120deg, #fdf4ff 0%, #fae8ff 100%)"
  }
}

function App() {
  const [currentTheme, setCurrentTheme] = useState("dark")
  const params = new URLSearchParams(window.location.search)
  const room = params.get("room")

  return (
    <main className="relative px-6 pt-14 lg:px-8">
      <div
        className="absolute inset-0 h-screen w-screen -z-1 transition-all duration-700 ease-in-out"
        style={{
          backgroundImage: getThemeGradient(currentTheme),
          opacity: 0.5,
        }}
      ></div>

      <ThemeController theme={currentTheme} setTheme={setCurrentTheme} />
      {room ? <GameCanvas room={room} /> : <LobbyView />}
      {/* <GridLayout className="layout" layout={layout} width={1200}>
        <div key="a">a</div>
        <div key="b">b</div>
        <div key="c">c</div>
        </GridLayout> */}
    </main>
  )
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
