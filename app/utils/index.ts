import { GameMode } from "../../shared/types"

export const host = import.meta.env.PROD
  ? window.location.origin
  : "http://localhost:1999"

export const getGameModeName = (mode?: GameMode) => {
  switch (mode) {
    case GameMode.BOMB_PARTY:
      return "Bombparty"
    case GameMode.WORDLE:
      return "Wordle"
    case GameMode.WORD_CHAIN:
      return "Word Chain"
    default:
      return ""
  }
}
