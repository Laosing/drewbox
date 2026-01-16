import { useEffect, useState, useRef } from "react"

const CHANNEL_NAME = "blitzparty_session"
const PING_MESSAGE = "PING_ACTIVE_SESSION"
const PONG_MESSAGE = "PONG_ACTIVE_SESSION"

export function useMultiTabPrevention() {
  const [isBlocked, setBlocked] = useState(false)
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel

    const handleMessage = (event: MessageEvent) => {
      if (event.data === PING_MESSAGE) {
        // Another tab is asking if we are active.
        // We are active (since this hook is mounted in GameCanvas).
        // Reply so they know to block themselves.
        channel.postMessage(PONG_MESSAGE)
      } else if (event.data === PONG_MESSAGE) {
        // We received a reply, meaning another tab is already active.
        // We should block ourselves.
        setBlocked(true)
      }
    }

    channel.addEventListener("message", handleMessage)

    // Check if anyone else is there
    channel.postMessage(PING_MESSAGE)

    return () => {
      channel.removeEventListener("message", handleMessage)
      channel.close()
    }
  }, [])

  return isBlocked
}
