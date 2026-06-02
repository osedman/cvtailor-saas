"use client"

interface UsageBarProps {
  used: number
  total: number
}

export function UsageBar({ used, total }: UsageBarProps) {
  const isAtLimit = used >= total

  return (
    <div
      className={`flex items-center justify-center gap-3 py-2 text-xs transition-colors duration-150 ${
        isAtLimit ? "text-amber-600" : "text-gray-500"
      }`}
    >
      <span>
        {used} / {total} tailors used
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full transition-colors duration-150 ${
              i < used
                ? isAtLimit
                  ? "bg-amber-500"
                  : "bg-[#2563eb]"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  )
}
