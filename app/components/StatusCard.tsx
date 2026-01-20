import React from "react"

interface StatusCardProps {
  icon?: React.ReactNode
  title: React.ReactNode
  children?: React.ReactNode
  actions?: React.ReactNode
}

export default function StatusCard({
  icon,
  title,
  children,
  actions,
}: StatusCardProps) {
  return (
    <div className="container mx-auto p-4 flex flex-col gap-6 max-w-md mt-10">
      <div className="card bg-base-100 shadow-xl p-6 text-center border border-base-300">
        {icon && (
          <div className="mb-4 flex justify-center text-4xl">{icon}</div>
        )}
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <div className="opacity-70 mb-4">{children}</div>
        {actions && <div className="flex flex-col gap-2">{actions}</div>}
      </div>
    </div>
  )
}
