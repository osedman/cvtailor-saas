"use client"

import { useState, useEffect } from "react"

interface TailorButtonProps {
  isLoading: boolean
  onClick: () => void
  disabled: boolean
  isLimitReached: boolean
}

const loadingMessages = [
  "Analysing job fit…",
  "Rewriting bullets…",
  "Checking ATS…",
]

export function TailorButton({
  isLoading,
  onClick,
  disabled,
  isLimitReached,
}: TailorButtonProps) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [displayText, setDisplayText] = useState("")
  const [isTyping, setIsTyping] = useState(true)

  useEffect(() => {
    if (!isLoading) {
      setMessageIndex(0)
      setDisplayText("")
      setIsTyping(true)
      return
    }

    const message = loadingMessages[messageIndex]
    let charIndex = 0

    if (isTyping) {
      const typeInterval = setInterval(() => {
        if (charIndex <= message.length) {
          setDisplayText(message.slice(0, charIndex))
          charIndex++
        } else {
          clearInterval(typeInterval)
          setTimeout(() => {
            setIsTyping(false)
          }, 600)
        }
      }, 40)
      return () => clearInterval(typeInterval)
    } else {
      const nextIndex = (messageIndex + 1) % loadingMessages.length
      setMessageIndex(nextIndex)
      setIsTyping(true)
    }
  }, [isLoading, messageIndex, isTyping])

  if (isLimitReached) {
    return (
      <button
        className="px-6 py-3 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-all duration-150 ease-out w-full md:w-auto"
      >
        Upgrade to continue →
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`px-6 py-3 text-sm font-medium rounded-lg transition-all duration-150 ease-out w-full md:w-auto min-w-[200px] ${
        disabled
          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
          : isLoading
          ? "bg-[#2563eb] text-white"
          : "bg-[#2563eb] text-white hover:bg-[#1d4ed8] active:scale-[0.98]"
      }`}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse" />
          {displayText}
          <span className="animate-typing-cursor">|</span>
        </span>
      ) : (
        "Tailor my CV"
      )}
    </button>
  )
}
