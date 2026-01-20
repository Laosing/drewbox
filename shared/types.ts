export enum ServerMessageType {
  STATE_UPDATE = "STATE_UPDATE",
  ERROR = "ERROR",
  BONUS = "BONUS",
  EXPLOSION = "EXPLOSION",
  GAME_OVER = "GAME_OVER",
  CHAT_MESSAGE = "CHAT_MESSAGE",
  TYPING_UPDATE = "TYPING_UPDATE",
  ROOM_LIST = "ROOM_LIST",
  SYSTEM_MESSAGE = "SYSTEM_MESSAGE",
  VALID_WORD = "VALID_WORD",
}

export enum ClientMessageType {
  START_GAME = "START_GAME",
  STOP_GAME = "STOP_GAME",
  SUBMIT_WORD = "SUBMIT_WORD",
  UPDATE_TYPING = "UPDATE_TYPING",
  SET_NAME = "SET_NAME",
  CHAT_MESSAGE = "CHAT_MESSAGE",
  UPDATE_SETTINGS = "UPDATE_SETTINGS",
  KICK_PLAYER = "KICK_PLAYER",
}

export enum GameState {
  LOBBY = "LOBBY",
  PLAYING = "PLAYING",
  ENDED = "ENDED",
}

export type ClientMessage =
  | { type: ClientMessageType.START_GAME }
  | { type: ClientMessageType.STOP_GAME }
  | { type: ClientMessageType.SUBMIT_WORD; word: string }
  | { type: ClientMessageType.UPDATE_TYPING; text: string }
  | { type: ClientMessageType.SET_NAME; name: string }
  | { type: ClientMessageType.CHAT_MESSAGE; text: string }
  | {
      type: ClientMessageType.UPDATE_SETTINGS
      startingLives?: number
      maxTimer?: number
      chatEnabled?: boolean
      syllableChangeThreshold?: number
    }
  | { type: ClientMessageType.KICK_PLAYER; playerId: string }
