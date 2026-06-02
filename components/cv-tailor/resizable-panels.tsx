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

  const handleMouseDown = useCallback(() => setIsDragging(true), [])
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setLeftWidth(Math.max(25, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100)))
  }, [isDragging])
  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  return (
    <div
      ref={containerRef}
      className="flex-1 flex relative select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Left Panel — Your CV */}
      <div className="flex flex-col p-4" style={{ width: `${leftWidth}%` }}>
        <div className={`relative flex-1 flex flex-col rounded-lg transition-all duration-150 ease-out bg-gray-50/50 overflow-hidden ${
          focusedPanel === "left"
            ? "shadow-[inset_0_2px_8px_rgba(0,0,0,0.06)] ring-1 ring-gray-200"
            : "shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]"
        }`}>
          {/* Fixed label bar — always on top, never overlaps text */}
          <div className="flex-shrink-0 px-3 pt-2.5 pb-1.5 bg-gray-50/50">
            <span className="text-xs font-medium text-[#2563eb]">Your CV</span>
          </div>
          <textarea
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            onFocus={() => setFocusedPanel("left")}
            onBlur={() => setFocusedPanel(null)}
            className="flex-1 w-full px-3 pb-8 bg-transparent resize-none focus:outline-none font-mono text-sm text-[#0f0f0f] leading-relaxed placeholder:text-gray-300"
            placeholder="Paste your CV here…"
          />
          <span className="absolute bottom-2 right-3 text-xs text-gray-400 pointer-events-none">
            {cvText.length.toLocaleString()} chars
          </span>
        </div>
      </div>

      {/* Divider */}
      <div
        className={`relative w-px cursor-col-resize group ${isDragging ? "bg-[#2563eb]" : "bg-gray-200"}`}
        onMouseDown={handleMouseDown}
      >
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-10 flex items-center justify-center rounded-lg transition-all duration-150 ${
          isDragging ? "bg-[#2563eb] text-white" : "bg-white border border-gray-200 text-gray-400 group-hover:border-gray-300 group-hover:text-gray-500"
        }`}>
          <GripVertical className="w-4 h-4" />
        </div>
      </div>

      {/* Right Panel — Job Description */}
      <div className="flex flex-col p-4" style={{ width: `${100 - leftWidth}%` }}>
        <div className={`relative flex-1 flex flex-col rounded-lg transition-all duration-150 ease-out bg-gray-50/50 overflow-hidden ${
          focusedPanel === "right"
            ? "shadow-[inset_0_2px_8px_rgba(0,0,0,0.06)] ring-1 ring-gray-200"
            : "shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]"
        }`}>
          <div className="flex-shrink-0 px-3 pt-2.5 pb-1.5 bg-gray-50/50">
            <span className="text-xs font-medium text-[#2563eb]">Job Description</span>
          </div>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            onFocus={() => setFocusedPanel("right")}
            onBlur={() => setFocusedPanel(null)}
            className="flex-1 w-full px-3 pb-8 bg-transparent resize-none focus:outline-none text-sm text-[#0f0f0f] leading-relaxed placeholder:text-gray-300"
            placeholder="Paste the job description here…"
          />
          <span className="absolute bottom-2 right-3 text-xs text-gray-400 pointer-events-none">
            {jobDescription.length.toLocaleString()} chars
          </span>
        </div>
      </div>
    </div>
  )
}
