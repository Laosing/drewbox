import { createRoot } from "react-dom/client"
import "./styles.css"
import GameCanvas from "./components/GameCanvas"
import LobbyView from "./components/LobbyView"
import ThemeController from "./components/ThemeController"

function App() {
  const params = new URLSearchParams(window.location.search)
  const room = params.get("room")

  return (
    <main>
      <ThemeController />
      {room ? <GameCanvas room={room} /> : <LobbyView />}
    </main>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
