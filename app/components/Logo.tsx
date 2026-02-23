import { useEffect, useState } from "react"
import { generateAvatar } from "../utils/avatar"

export const Logo = ({
  name,
  random,
  showText = true,
  size = 48,
}: {
  name?: string
  random?: boolean
  showText?: boolean
  size?: number
}) => {
  const [randomName, setRandomName] = useState<string | null>(null)

  useEffect(() => {
    function generateRandomName() {
      const randomString = Math.random().toString(36).substring(2, 6)
      setRandomName(randomString)
    }
    if (random && !name) {
      generateRandomName()
      const interval = setInterval(() => {
        generateRandomName()
      }, 1000)
      return () => {
        clearInterval(interval)
      }
    }
  }, [random, name])

  const displayName = name || randomName

  return (
    <div className="flex items-center justify-center gap-4">
      {displayName ? (
        <CustomAvatar name={displayName} width={size} height={size} />
      ) : (
        <LogoIcon width={size} height={size} />
      )}
      {showText && <h1 className="text-4xl font-bold text-primary">drewbox</h1>}
    </div>
  )
}

export const LogoIcon = ({
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) => {
  return <img src="/favicon.svg" alt="Logo" width="48" height="48" {...props} />
}

export const CustomAvatar = ({
  name,
  ...props
}: {
  name?: string
} & React.ImgHTMLAttributes<HTMLImageElement>) => {
  if (!name) return null
  return (
    <img
      src={`data:image/svg+xml;base64,${btoa(generateAvatar(name))}`}
      alt="Avatar"
      width="48"
      height="48"
      {...props}
    />
  )
}
