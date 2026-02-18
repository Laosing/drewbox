import { create } from "zustand"
import {
  GameState,
  GlobalClientMessageType,
  ServerMessageType,
  type GameMode,
  type Player,
} from "../../shared/types"
import { SETTINGS_CONFIG } from "../../shared/config"
import { STORAGE_KEYS } from "../config"
import type PartySocket from "partysocket"

type LogMessage = { message: string; timestamp: number }
type ChatMessage = { senderName: string; text: string; timestamp: number }

interface GameStateHelper {
  // State
  gameState: GameState
  players: Player[]
  gameMode?: GameMode
  serverState: any
  logs: LogMessage[]
  gameLogEnabled: boolean
  chatMessages: ChatMessage[]
  chatEnabled: boolean
  myName: string
  clientId: string
  socket: PartySocket | null

  // Actions
  setSocket: (socket: PartySocket) => void
  setMyName: (name: string) => void
  setClientId: (id: string) => void
  handleMessage: (data: any) => void

  // User Actions
  updateName: (name: string) => void
  sendChat: (text: string) => void
  kickPlayer: (playerId: string) => void
  // UI State
  activeModal: "none" | "name" | "settings"
  openModal: (modal: "none" | "name" | "settings") => void

  updateSettings: (pendingSettings: any) => void
  addLog: (msg: string) => void
}

export const useGameStore = create<GameStateHelper>((set, get) => ({
  gameState: GameState.LOBBY,
  players: [],
  gameMode: undefined,
  serverState: {},
  logs: [],
  gameLogEnabled: true,
  chatMessages: [],
  chatEnabled: true,
  myName: "",
  clientId: "",
  socket: null,
  activeModal: "none",

  setSocket: (socket) => set({ socket }),
  setMyName: (name) => set({ myName: name }),
  setClientId: (id) => set({ clientId: id }),
  openModal: (modal) => set({ activeModal: modal }),

  handleMessage: (data) => {
    const state = get()

    if (data.type === ServerMessageType.STATE_UPDATE) {
      set((prev) => ({
        gameState: data.gameState ?? prev.gameState,
        players: data.players ?? prev.players,
        gameMode: data.gameMode ?? prev.gameMode,
        chatEnabled: data.chatEnabled ?? prev.chatEnabled,
        gameLogEnabled: data.gameLogEnabled ?? prev.gameLogEnabled,
        serverState: { ...prev.serverState, ...data },
      }))
    } else if (data.type === ServerMessageType.KICK) {
      window.location.href = "/"
    } else if (data.type === ServerMessageType.ERROR) {
      if (!data.hide) get().addLog(`Error: ${data.message}`)
    } else if (data.type === ServerMessageType.BONUS) {
      get().addLog(`Bonus: ${data.message}`)
    } else if (data.type === ServerMessageType.EXPLOSION) {
      const pName =
        state.players.find((p) => p.id === data.playerId)?.name || "Unknown"
      get().addLog(`BOOM! Player: ${pName} lost a life!`)
    } else if (data.type === ServerMessageType.SYSTEM_MESSAGE) {
      get().addLog(`${data.message}`)
    } else if (data.type === ServerMessageType.VALID_WORD) {
      get().addLog(`${data.message}`)
    } else if (data.type === ServerMessageType.GAME_OVER) {
      if (data.winnerId) {
        const winner = state.players.find((p) => p.id === data.winnerId)
        const winnerName = winner?.name || data.winnerId
        const lastWord = winner?.lastTurn?.word
        get().addLog(
          `Game Over! Winner: ${winnerName}${lastWord ? ` | Last word: ${lastWord}` : ""}`,
        )
      } else {
        get().addLog("Game Over!")
      }
    } else if (
      data.type === ServerMessageType.CHAT_MESSAGE &&
      data.senderName &&
      data.text
    ) {
      set((prev) => ({
        chatMessages: [
          ...prev.chatMessages,
          {
            senderName: data.senderName!,
            text: data.text!,
            timestamp: Date.now(),
          },
        ].slice(-100),
      }))
    }
  },

  // Helper to add log (internal use primarily)
  addLog: (msg: string) =>
    set((state) => ({
      logs: [{ message: msg, timestamp: Date.now() }, ...state.logs].slice(
        0,
        50,
      ),
    })),

  updateName: (name: string) => {
    set({ myName: name })
    localStorage.setItem(STORAGE_KEYS.USERNAME, name)
    get().socket?.send(
      JSON.stringify({
        type: GlobalClientMessageType.SET_NAME,
        name,
      }),
    )
  },

  sendChat: (text: string) => {
    get().socket?.send(
      JSON.stringify({
        type: GlobalClientMessageType.CHAT_MESSAGE,
        text,
      }),
    )
  },

  kickPlayer: (playerId: string) => {
    get().socket?.send(
      JSON.stringify({
        type: GlobalClientMessageType.KICK_PLAYER,
        playerId,
      }),
    )
  },

  updateSettings: (pendingSettings: any) => {
    const { type, gameState, players, guesses, ...rawSettings } =
      pendingSettings
    const { gameMode, socket } = get()

    if (!gameMode) return
    const config = SETTINGS_CONFIG[gameMode]
    if (!config) return

    const result = config.schema.partial().safeParse(rawSettings)
    if (result.success && Object.keys(result.data).length > 0) {
      socket?.send(
        JSON.stringify({
          ...result.data,
          type: config.messageType,
        }),
      )
    }
  },
}))
