import usePartySocket from "partysocket/react"
import { useEffect, useState } from "react"
import { ServerMessageType } from "../../shared/types"
import { host } from "../utils"
import { Logo } from "./Logo"
import CreateRoomForm from "./lobby/CreateRoomForm"
import RoomList from "./lobby/RoomList"
import PasswordChallengeModal from "./lobby/PasswordChallengeModal"
import { useLobbyStore } from "../store/lobbyStore"
import { ThemeController } from "./ThemeController"

export default function LobbyView() {
  // Use store actions
  const setAvailableRooms = useLobbyStore((state) => state.setAvailableRooms)

  // Keep error message local as it's not high frequency update
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const err = params.get("error")
    if (err === "password") setErrorMsg("Invalid password provided.")
    if (err === "inactivity")
      setErrorMsg("You were disconnected due to inactivity.")
    if (err === "kicked")
      setErrorMsg("You were kicked from the room by the admin.")
    if (err === "banned") setErrorMsg("You are banned from this room.")

    // Clean URL
    if (err) {
      window.history.replaceState({}, "", "/")
    }
  }, [])

  usePartySocket({
    host,
    party: "lobby",
    room: "global",
    onMessage(evt) {
      const data = JSON.parse(evt.data)
      if (data.type === ServerMessageType.ROOM_LIST) {
        setAvailableRooms(data.rooms)
      }
    },
  })

  return (
    <div className="container mx-auto p-4 flex flex-col gap-8 max-w-4xl relative">
      <div className="card bg-base-100 shadow-xl p-8 text-center border border-base-300">
        <ThemeController />
        <Logo random />
        <p className="opacity-70 mt-4">
          Choose a room to join or create a new one.
        </p>

        {errorMsg && (
          <div className="alert alert-error mt-4 relative">
            <span className="font-bold">{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="btn btn-sm btn-ghost absolute right-2 top-2"
            >
              ✕
            </button>
          </div>
        )}

        <CreateRoomForm />

        <RoomList />
      </div>

      <PasswordChallengeModal />
    </div>
  )
}
