"use client"

import { useState, useMemo } from "react"
import {
  MessageCircleQuestion, ChevronRight, Sparkles, Loader2,
  Target, Compass, ListChecks, AlertTriangle,
} from "lucide-react"
import type { InterviewPrepResult, QuestionCategory } from "@/lib/anthropic"

type Question = InterviewPrepResult["interviewQuestions"][number]

const CATEGORY_STYLE: Record<QuestionCategory, { label: string; cls: string }> = {
  "behavioural":   { label: "Behavioural",   cls: "bg-[#ffeae4] text-[#dc4f33]" },
  "technical":     { label: "Technical",     cls: "bg-violet-50 text-violet-600" },
  "role-specific": { label: "Role-specific", cls: "bg-teal-50 text-teal-600" },
  "motivation":    { label: "Motivation",    cls: "bg-amber-50 text-amber-600" },
  "gap-probing":   { label: "Gap probing",   cls: "bg-red-50 text-red-500" },
}

const FILTERS: Array<{ id: QuestionCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "behavioural", label: "Behavioural" },
  { id: "technical", label: "Technical" },
  { id: "role-specific", label: "Role-specific" },
  { id: "motivation", label: "Motivation" },
  { id: "gap-probing", label: "Gap probing" },
]

interface InterviewPrepProps {
  questions: Question[] | null
  loading: boolean
  onGenerate: () => void
}

export function InterviewPrep({ questions, loading, onGenerate }: InterviewPrepProps) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filter, setFilter] = useState<QuestionCategory | "all">("all")

  const filtered = useMemo(() => {
    if (!questions) return []
    return filter === "all" ? questions : questions.filter(q => q.category === filter)
  }, [questions, filter])

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    questions?.forEach(q => c.set(q.category, (c.get(q.category) ?? 0) + 1))
    return c
  }, [questions])

  return (
    <div className="mt-8 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-[#ffeae4] rounded-lg">
          <MessageCircleQuestion className="w-4 h-4 text-[#dc4f33]" />
        </div>
        <h2 className="text-base font-semibold text-[#1e1813]">Interview Prep</h2>
        <span className="text-xs text-gray-400 ml-1">likely questions with answer frameworks</span>
      </div>

      {!questions ? (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 flex flex-col items-center gap-3">
          <p className="text-sm text-gray-500 text-center max-w-md">
            Predict the questions you&apos;ll face in the interview — including the ones probing
            your gaps — with a framework and talking points for each.
          </p>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] disabled:opacity-60 transition-colors"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Predicting questions…</>
              : <><Sparkles className="w-4 h-4" />Generate Interview Prep</>}
          </button>
        </div>
      ) : (
        <>
          {/* Category filter */}
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {FILTERS.map(f => {
              const count = f.id === "all" ? questions.length : (counts.get(f.id) ?? 0)
              if (f.id !== "all" && count === 0) return null
              return (
                <button
                  key={f.id}
                  onClick={() => { setFilter(f.id); setExpanded(null) }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all
                    ${filter === f.id
                      ? "bg-[#1e1813] text-white border-[#1e1813]"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}
                >
                  {f.label} <span className="opacity-60">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Questions */}
          <div className="space-y-3">
            {filtered.map((q, i) => {
              const cat = CATEGORY_STYLE[q.category] ?? CATEGORY_STYLE["role-specific"]
              const isOpen = expanded === i
              return (
                <div
                  key={`${filter}-${i}`}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : i)}
                    className="w-full p-4 text-left flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium mb-1.5 ${cat.cls}`}>
                        {cat.label}
                      </span>
                      <h3 className="text-sm font-medium text-[#1e1813] leading-snug">
                        &ldquo;{q.question}&rdquo;
                      </h3>
                    </div>
                    <ChevronRight className={`w-5 h-5 text-gray-300 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 animate-fade-in-up">
                      <div className="pt-4 border-t border-gray-100 space-y-4">
                        {/* Why asked */}
                        <div className="flex gap-2.5">
                          <Target className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">What they&apos;re probing</p>
                            <p className="text-sm text-gray-600 leading-relaxed">{q.whyAsked}</p>
                          </div>
                        </div>

                        {/* Framework */}
                        <div className="flex gap-2.5">
                          <Compass className="w-4 h-4 text-[#dc4f33] mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-[#dc4f33] uppercase tracking-wide mb-0.5">Answer framework</p>
                            <p className="text-sm text-gray-600 leading-relaxed">{q.framework}</p>
                          </div>
                        </div>

                        {/* Points to hit */}
                        <div className="flex gap-2.5">
                          <ListChecks className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Points to hit from your CV</p>
                            <ul className="space-y-1">
                              {q.pointsToHit.map((p, j) => (
                                <li key={j} className="text-sm text-gray-600 leading-relaxed flex gap-2">
                                  <span className="text-green-400 flex-shrink-0">•</span>{p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Watch out */}
                        <div className="flex gap-2.5 bg-amber-50/60 rounded-lg p-3 -mx-1">
                          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-0.5">Watch out</p>
                            <p className="text-sm text-gray-600 leading-relaxed">{q.watchOut}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
