"use client"

interface TailorButtonProps {
  isLoading: boolean
  loadingStatus?: string
  onClick: () => void
  disabled: boolean
  isLimitReached: boolean
}

export function TailorButton({
  isLoading,
  loadingStatus = "Tailoring…",
  onClick,
  disabled,
  isLimitReached,
}: TailorButtonProps) {
  if (isLimitReached) {
    return (
      <button className="px-6 py-3 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-all duration-150 ease-out w-full md:w-auto">
        Upgrade to continue →
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`px-6 py-3 text-sm font-medium rounded-lg transition-all duration-150 ease-out w-full md:w-auto min-w-[220px] ${
        disabled
          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
          : isLoading
          ? "bg-[#dc4f33] text-white cursor-wait"
          : "bg-[#dc4f33] text-white hover:bg-[#b3341b] active:scale-[0.98]"
      }`}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse" />
          {loadingStatus}
        </span>
      ) : (
        "Tailor my CV"
      )}
    </button>
  )
}
