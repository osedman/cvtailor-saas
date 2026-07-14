"use client"

import { useState } from "react"
import { Lightbulb, ChevronRight, ArrowRight, Sparkles, Loader2 } from "lucide-react"
import type { PitchesResult } from "@/lib/anthropic"

interface InterviewPitchesProps {
  pitches: PitchesResult["interviewPitches"] | null
  loading: boolean
  onGenerate: () => void
}

export function InterviewPitches({ pitches, loading, onGenerate }: InterviewPitchesProps) {
  const [expandedPitch, setExpandedPitch] = useState<number | null>(null)

  return (
    <div className="mt-8 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-amber-50 rounded-lg">
          <Lightbulb className="w-4 h-4 text-amber-500" />
        </div>
        <h2 className="text-base font-semibold text-[#1e1813]">Interview Pitches</h2>
        <span className="text-xs text-gray-400 ml-1">STAR stories from your experience</span>
      </div>

      {!pitches ? (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 flex flex-col items-center gap-3">
          <p className="text-sm text-gray-500 text-center">
            Generate tailored STAR interview stories based on your CV and this role.
          </p>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] disabled:opacity-60 transition-colors"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate Interview Pitches</>}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {pitches.map((pitch, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
              <button
                onClick={() => setExpandedPitch(expandedPitch === i ? null : i)}
                className="w-full p-4 text-left flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-[#1e1813] mb-1">{pitch.title}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {pitch.relevantTo.map((tag, j) => (
                      <span key={j} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-500">{tag}</span>
                    ))}
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-300 transition-transform duration-200 ${expandedPitch === i ? "rotate-90" : ""}`} />
              </button>
              {expandedPitch === i && (
                <div className="px-4 pb-4 animate-fade-in-up">
                  <div className="pt-4 border-t border-gray-100 space-y-4">
                    {(["situation", "task", "action", "result"] as const).map((key) => (
                      <div key={key}>
                        <p className="text-xs font-medium text-[#dc4f33] uppercase tracking-wide mb-1">{key}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{pitch[key]}</p>
                      </div>
                    ))}
                    <div className="pt-2 flex items-center gap-2 text-xs text-gray-400">
                      <ArrowRight className="w-3 h-3" />
                      Use for: {pitch.relevantTo.join(", ")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
