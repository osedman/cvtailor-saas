"use client"

import { useState, useRef, useCallback } from "react"
import { GripVertical } from "lucide-react"

interface ResizablePanelsProps {
  cvText: string
  setCvText: (text: string) => void
  jobDescription: string
  setJobDescription: (text: string) => void
}

export function ResizablePanels({
  cvText,
  setCvText,
  jobDescription,
  setJobDescription,
}: ResizablePanelsProps) {
  const [leftWidth, setLeftWidth] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [focusedPanel, setFocusedPanel] = useState<"left" | "right" | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100
      setLeftWidth(Math.max(25, Math.min(75, newLeftWidth)))
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex-1 flex relative select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Left Panel - Your CV */}
      <div
        className="flex flex-col p-4"
        style={{ width: `${leftWidth}%` }}
      >
        <div
          className={`relative flex-1 rounded-lg transition-all duration-150 ease-out ${
            focusedPanel === "left"
              ? "shadow-[inset_0_2px_8px_rgba(0,0,0,0.06)] ring-1 ring-gray-200"
              : "shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]"
          } bg-gray-50/50`}
        >
          <label
            className={`absolute left-3 transition-all duration-150 ease-out pointer-events-none ${
              focusedPanel === "left" || cvText
                ? "top-2 text-xs text-[#2563eb] font-medium"
                : "top-4 text-sm text-gray-400"
            }`}
          >
            Your CV
          </label>
          <textarea
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            onFocus={() => setFocusedPanel("left")}
            onBlur={() => setFocusedPanel(null)}
            className="w-full h-full pt-8 px-3 pb-8 bg-transparent resize-none focus:outline-none font-mono text-sm text-[#0f0f0f] placeholder:text-gray-300"
            placeholder={focusedPanel === "left" || cvText ? "" : "Paste your CV here..."}
          />
          <span className="absolute bottom-2 right-3 text-xs text-gray-400">
            {cvText.length.toLocaleString()} chars
          </span>
          {!cvText && focusedPanel !== "left" && (
            <span className="absolute top-4 left-[170px] text-sm text-gray-400 animate-typing-cursor">
              |
            </span>
          )}
        </div>
      </div>

      {/* Divider with drag handle */}
      <div
        className={`relative w-px bg-gray-200 cursor-col-resize group ${
          isDragging ? "bg-[#2563eb]" : ""
        }`}
        onMouseDown={handleMouseDown}
      >
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-10 flex items-center justify-center rounded-lg transition-all duration-150 ${
            isDragging
              ? "bg-[#2563eb] text-white"
              : "bg-white border border-gray-200 text-gray-400 group-hover:border-gray-300 group-hover:text-gray-500"
          }`}
        >
          <GripVertical className="w-4 h-4" />
        </div>
      </div>

      {/* Right Panel - Job Description */}
      <div
        className="flex flex-col p-4"
        style={{ width: `${100 - leftWidth}%` }}
      >
        <div
          className={`relative flex-1 rounded-lg transition-all duration-150 ease-out ${
            focusedPanel === "right"
              ? "shadow-[inset_0_2px_8px_rgba(0,0,0,0.06)] ring-1 ring-gray-200"
              : "shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]"
          } bg-gray-50/50`}
        >
          <label
            className={`absolute left-3 transition-all duration-150 ease-out pointer-events-none ${
              focusedPanel === "right" || jobDescription
                ? "top-2 text-xs text-[#2563eb] font-medium"
                : "top-4 text-sm text-gray-400"
            }`}
          >
            Job Description
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            onFocus={() => setFocusedPanel("right")}
            onBlur={() => setFocusedPanel(null)}
            className="w-full h-full pt-8 px-3 pb-8 bg-transparent resize-none focus:outline-none text-sm text-[#0f0f0f] placeholder:text-gray-300"
            placeholder={focusedPanel === "right" || jobDescription ? "" : "Paste the job description here..."}
          />
          <span className="absolute bottom-2 right-3 text-xs text-gray-400">
            {jobDescription.length.toLocaleString()} chars
          </span>
        </div>
      </div>
    </div>
  )
}
