import { createRoot } from "react-dom/client"
import GameCanvas from "./components/GameCanvas"
import LobbyView from "./components/LobbyView"
import ThemeController from "./components/ThemeController"
import "./styles.css"

import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"

import { StrictMode } from "react"

function App() {
  const params = new URLSearchParams(window.location.search)
  const room = params.get("room")

  return (
    <main className="relative h-full">
      <ThemeController />
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
