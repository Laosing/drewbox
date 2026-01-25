import { useNavigate } from "@tanstack/react-router"
import usePartySocket from "partysocket/react"
import { useEffect, useState } from "react"
import { GameMode, ServerMessageType } from "../../shared/types"
import { getGameModeName, host } from "../utils"
import { CustomAvatar, Logo } from "./Logo"
import { Modal } from "./Modal"
import { GameIcon, HouseIcon, LockIcon } from "./Icons"

export default function LobbyView() {
  const navigate = useNavigate()
  const [availableRooms, setAvailableRooms] = useState<
    { id: string; players: number; isPrivate?: boolean; mode?: GameMode }[]
  >([])
  const [newRoomName, setNewRoomName] = useState("")
  const [roomPassword, setRoomPassword] = useState("")
  const [selectedMode, setSelectedMode] = useState<GameMode>(
    GameMode.BOMB_PARTY,
  )
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState("")
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)

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

  const joinRoom = (room: string, password?: string, mode?: GameMode) => {
    navigate({
      to: `/${room}`,
      search: { mode, password },
    })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomName.trim()) return
    joinRoom(newRoomName, roomPassword, selectedMode)
  }

  return (
    <div className="container mx-auto p-4 flex flex-col gap-8 max-w-4xl relative">
      <div className="card bg-base-100 shadow-xl p-8 text-center border border-base-300">
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

        <form onSubmit={handleCreate} className="join justify-center mt-8">
          <div>
            <label className="input w-full validator">
              <HouseIcon />
              <input
                value={newRoomName}
                onChange={(e) => {
                  setNewRoomName(e.target.value.substring(0, 4))
                }}
                placeholder="Room (4 chars)"
                className="uppercase placeholder:capitalize placeholder:tracking-normal tracking-widest"
                maxLength={4}
                minLength={4}
                required
                pattern="[a-z]{4}"
              />
            </label>
            <p className="validator-hint">Must be 4 letters</p>
          </div>

          <div>
            <label className="input w-full">
              <LockIcon />
              <input
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder="Password (Optional)"
                type="password"
                className=""
              />
            </label>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={newRoomName.length !== 4}
          >
            Create
          </button>
        </form>

        <div className="flex justify-center mb-8">
          <div className="form-control w-full max-w-xs">
            <fieldset className="fieldset">
              <legend className="fieldset-legend text-lg">
                <GameIcon /> Game Mode
              </legend>
              <select
                className="select select-bordered w-full"
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value as GameMode)}
              >
                <option value={GameMode.BOMB_PARTY}>Bombparty</option>
                <option value={GameMode.WORDLE}>Wordle</option>
                <option value={GameMode.WORD_CHAIN}>Word Chain</option>
              </select>
              <p className="label justify-center">
                {selectedMode === GameMode.BOMB_PARTY &&
                  "Fast-paced word association game"}
                {selectedMode === GameMode.WORDLE &&
                  "Multiplayer cooperative word guessing"}
                {selectedMode === GameMode.WORD_CHAIN &&
                  "Strategic last-letter word builder"}
              </p>
            </fieldset>
          </div>
        </div>

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
                    setSelectedRoomId(r.id)
                    setPasswordInput("")
                    setIsPasswordModalOpen(true)
                  } else {
                    joinRoom(r.id, undefined, r.mode)
                  }
                }}
                className="card card-side bg-base-100 shadow-sm cursor-pointer"
              >
                <figure>
                  <CustomAvatar name={r.id} className="p-4 w-24 h-24" />
                </figure>
                <div className="card-body">
                  <h2 className="card-title uppercase font-bold">
                    {r.id} {r.isPrivate && <LockIcon />}
                  </h2>
                  <div className="card-actions">
                    <div className="badge badge-primary">
                      {r.players} Player{r.players !== 1 ? "s" : ""}
                    </div>
                    <div className="badge badge-primary">
                      {getGameModeName(r.mode)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        title={`Enter password for ${selectedRoomId?.toUpperCase()}`}
        onActionClick={() => {
          if (selectedRoomId && passwordInput) {
            joinRoom(
              selectedRoomId,
              passwordInput,
              availableRooms.find((r) => r.id === selectedRoomId)?.mode,
            )
          }
        }}
        onActionText="Join"
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      >
        <input
          type="password"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          placeholder="Password"
          className="input input-bordered w-full"
        />
      </Modal>
    </div>
  )
}
