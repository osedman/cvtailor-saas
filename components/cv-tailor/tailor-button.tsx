"use client"

import { Sparkles, ArrowRight } from "lucide-react"

interface TailorButtonProps {
  isLoading: boolean
  loadingStatus?: string
  onClick: () => void
  disabled: boolean
  isLimitReached: boolean
  enhanced?: boolean
}

export function TailorButton({
  isLoading,
  loadingStatus = "Tailoring…",
  onClick,
  disabled,
  isLimitReached,
  enhanced = false,
}: TailorButtonProps) {
  if (isLimitReached) {
    return (
      <button className="px-6 py-3 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-all duration-150 ease-out w-full md:w-auto">
        Upgrade to continue →
      </button>
    )
  }

  const base = enhanced
    ? "px-8 py-3.5 text-[15px] font-bold rounded-xl transition-all duration-150 ease-out w-full md:w-auto min-w-[240px]"
    : "px-6 py-3 text-sm font-medium rounded-lg transition-all duration-150 ease-out w-full md:w-auto min-w-[220px]"

  const state = disabled
    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
    : isLoading
    ? "bg-[#dc4f33] text-white cursor-wait"
    : enhanced
    ? "bg-[#dc4f33] text-white hover:bg-[#b3341b] active:scale-[0.98] shadow-[0_6px_18px_rgba(220,79,51,0.32)] hover:shadow-[0_8px_22px_rgba(220,79,51,0.4)] hover:-translate-y-0.5"
    : "bg-[#dc4f33] text-white hover:bg-[#b3341b] active:scale-[0.98]"

  return (
    <button onClick={onClick} disabled={disabled || isLoading} className={`${base} ${state}`}>
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse" />
          {loadingStatus}
        </span>
      ) : enhanced ? (
        <span className="inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Tailor my CV
          <ArrowRight className="w-4 h-4" />
        </span>
      ) : (
        "Tailor my CV"
      )}
    </button>
  )
}
