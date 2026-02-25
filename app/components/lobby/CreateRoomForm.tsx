import { useLobbyStore } from "../../store/lobbyStore"
import { GameMode } from "../../../shared/types"
import { HouseIcon, LockIcon, GameIcon } from "../Icons"
import { useNavigate } from "@tanstack/react-router"

export default function CreateRoomForm() {
  const navigate = useNavigate()

  // Selectors to minimize re-renders (though we are using all of them here,
  // separating this component prevents LobbyView and RoomList from re-rendering)
  const newRoomName = useLobbyStore((state) => state.newRoomName)
  const roomPassword = useLobbyStore((state) => state.roomPassword)
  const selectedMode = useLobbyStore((state) => state.selectedMode)

  const setNewRoomName = useLobbyStore((state) => state.setNewRoomName)
  const setRoomPassword = useLobbyStore((state) => state.setRoomPassword)
  const setSelectedMode = useLobbyStore((state) => state.setSelectedMode)

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomName.trim()) return

    // Navigation logic
    navigate({
      to: `/${newRoomName}`,
      search: { mode: selectedMode, password: roomPassword },
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleCreate}
        className="join join-vertical sm:join-horizontal justify-center mt-8"
      >
        <div>
          <label className="input w-full validator">
            <HouseIcon />
            <input
              value={newRoomName}
              onChange={(e) =>
                setNewRoomName(
                  e.target.value.toLocaleLowerCase().substring(0, 4),
                )
              }
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
              <option value={GameMode.BLACKJACK}>Blackjack</option>
            </select>
            <p className="label justify-center">
              {selectedMode === GameMode.BOMB_PARTY &&
                "Fast-paced word association game"}
              {selectedMode === GameMode.WORDLE &&
                "Multiplayer cooperative word guessing"}
              {selectedMode === GameMode.WORD_CHAIN &&
                "Strategic last-letter word builder"}
              {selectedMode === GameMode.BLACKJACK &&
                "Classic casino card game against the dealer"}
            </p>
          </fieldset>
        </div>
      </div>
    </div>
  )
}
