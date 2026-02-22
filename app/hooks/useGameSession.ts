import usePartySocket from "partysocket/react"
import { useEffect, useState, useMemo } from "react"
import { host } from "../utils"
import { useGameStore } from "../store/gameStore"
import { GameMode } from "../../shared/types"
import { STORAGE_KEYS } from "../config"

export function useGameSession({
  room,
  password,
  initialMode,
}: {
  room: string
  password?: string | null
  initialMode?: string | null
}) {
  const setSocket = useGameStore((state) => state.setSocket)
  const handleMessage = useGameStore((state) => state.handleMessage)
  const setClientId = useGameStore((state) => state.setClientId)
  const clientId = useGameStore((state) => state.clientId)

  // Initialize persistent client ID
  useEffect(() => {
    if (typeof window === "undefined") return
    let id = localStorage.getItem(STORAGE_KEYS.CLIENT_ID)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEYS.CLIENT_ID, id)
    }
    setClientId(id)

  }, [])

  // Keep initialName stable to prevent socket reconnect
  const [initialName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEYS.USERNAME) || ""
    }
    return ""
  })

  // Set initial game mode if provided (only once)
  useEffect(() => {
    if (initialMode) {
      useGameStore.setState({ gameMode: initialMode as GameMode })
    }
  }, [initialMode])

  const query = useMemo(
    () => ({
      ...(password ? { password } : {}),
      ...(initialMode ? { mode: initialMode } : {}),
      name: initialName,
      clientId,
    }),
    [password, initialMode, initialName, clientId],
  )

  const socket = usePartySocket({
    host,
    room: room,
    query,
    onMessage(evt) {
      const data = JSON.parse(evt.data)
      handleMessage(data)
    },
    onClose(evt) {
      if (typeof window === "undefined") return
      if (evt.code === 4000) window.location.href = "/?error=password"
      if (evt.code === 4001) window.location.href = "/?error=inactivity"
      if (evt.code === 4002) window.location.href = "/?error=kicked"
      if (evt.code === 4003) window.location.href = "/?error=banned"
    },
  })

  // Sync socket to store
  useEffect(() => {
    if (socket) {
      setSocket(socket)
    }
  }, [socket])

  return socket
}
