import { useState, useEffect } from "react"
import usePartySocket from "partysocket/react"

export default function LobbyView() {
  const [availableRooms, setAvailableRooms] = useState<
    { id: string; players: number; isPrivate?: boolean }[]
  >([])
  const [newRoomName, setNewRoomName] = useState("")
  const [roomPassword, setRoomPassword] = useState("")
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

    // Clean URL
    if (err) {
      window.history.replaceState({}, "", "/")
    }
  }, [])

  usePartySocket({
    party: "lobby",
    room: "global",
    onMessage(evt) {
      const data = JSON.parse(evt.data)
      if (data.type === "ROOM_LIST") {
        setAvailableRooms(data.rooms)
      }
    },
  })

  const joinRoom = (room: string, password?: string) => {
    let url = `/?room=${room}`
    if (password) url += `&password=${encodeURIComponent(password)}`
    window.location.href = url
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomName.trim()) return
    joinRoom(newRoomName, roomPassword)
  }

  return (
    <div className="container mx-auto p-4 flex flex-col gap-8 max-w-4xl relative">
      <div className="card bg-base-100 shadow-xl p-8 text-center border border-base-300">
        <h1 className="text-4xl font-bold text-primary flex items-center justify-center gap-4 mb-4">
          <img src="/favicon.svg" alt="Logo" width="48" height="48" />
          BlitzParty Lobby
        </h1>
        <p className="opacity-70">Choose a room to join or create a new one.</p>

        {errorMsg && (
          <div className="alert alert-error mt-4">
            <span className="font-bold">{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="btn btn-sm btn-ghost absolute right-2 top-2"
            >
              ✕
            </button>
          </div>
        )}

        <form
          onSubmit={handleCreate}
          className="my-8 flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Create Room Name..."
            className="input input-bordered w-full max-w-xs text-center"
          />
          <input
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            placeholder="Password (Optional)"
            type="password"
            className="input input-bordered w-full max-w-xs text-center"
          />
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </form>

        <div className="text-left w-full">
          <h3 className="text-xl font-bold mb-4">
            Active Rooms ({availableRooms.length})
          </h3>

          {availableRooms.length === 0 && (
            <p className="text-center opacity-50 py-8">
              No active games found. Be the first to start one!
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableRooms.map((r) => (
              <div
                key={r.id}
                onClick={() => {
                  if (r.isPrivate) {
                    const p = prompt("Enter password for " + r.id)
                    if (p) joinRoom(r.id, p)
                  } else {
                    joinRoom(r.id)
                  }
                }}
                className="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer p-4 flex flex-row justify-between items-center"
              >
                <span className="font-bold truncate">{r.id}</span>
                <div className="flex items-center gap-2">
                  {r.isPrivate && <span>🔒</span>}
                  <div className="badge badge-neutral">
                    {r.players} Player{r.players !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
