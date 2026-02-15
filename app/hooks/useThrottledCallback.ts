import { useRef, useCallback } from "react"

export function useThrottledCallback<T extends (...args: any[]) => void>(
  callback: T,
  delayMs: number,
): T {
  const lastCall = useRef(0)

  return useCallback(
    (...args: any[]) => {
      const now = Date.now()
      if (now - lastCall.current >= delayMs) {
        lastCall.current = now
        callback(...args)
      }
    },
    [callback, delayMs],
  ) as T
}
