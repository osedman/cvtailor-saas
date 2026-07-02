"use client"

import { useEffect, useState } from "react"
import { TrendingUp, X } from "lucide-react"
import { computeCareerSignal, type CareerSignal } from "@/lib/career-signal"
import type { RequirementMapping } from "@/lib/anthropic"

const DISMISSED_KEY = "tailr:career-signal:dismissed"

/**
 * Phase 1 of the career-memory idea: after enough tailor history exists,
 * surface skills that keep showing up as weak across DIFFERENT job targets.
 * Pure client-side aggregation over data the app already has — no new AI
 * calls. See lib/career-signal.ts for the logic.
 */
export function CareerSignalBanner() {
  const [signals, setSignals] = useState<CareerSignal[] | null>(null)
  const [dismissed, setDismissed] = useState(true) // default hidden until checked

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1")
    } catch { /* ignore */ }

    let cancelled = false
    fetch("/api/history")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { history?: Array<{ result?: { requirementsCoverage?: RequirementMapping[] } }> } | null) => {
        if (cancelled || !data?.history) return
        const runs = data.history
          .map((h) => h.result?.requirementsCoverage)
          .filter((r): r is RequirementMapping[] => Array.isArray(r) && r.length > 0)
        setSignals(computeCareerSignal(runs))
      })
      .catch(() => { /* silent — this is a nice-to-have insight, not critical path */ })

    return () => { cancelled = true }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISSED_KEY, "1") } catch { /* ignore */ }
  }

  if (dismissed || !signals || signals.length === 0) return null

  const [top, ...rest] = signals
  const others = rest.map((s) => s.keyword).join(", ")

  return (
    <div className="mb-4 flex items-center gap-3 bg-[#fff7f4] border border-[#f5d9d0] rounded-xl px-4 py-3">
      <TrendingUp className="w-4 h-4 text-[#dc4f33] flex-shrink-0" />
      <p className="flex-1 text-[13px] text-[#1e1813]">
        <span className="font-semibold">Pattern spotted:</span> across your last few applications,{" "}
        <span className="font-semibold text-[#dc4f33]">{top.keyword}</span>
        {others && <> (and {others})</>} keeps coming up as a weak spot. Worth strengthening if you're targeting similar roles.
      </p>
      <button onClick={dismiss} className="p-1 -mr-1 rounded text-gray-300 hover:text-gray-500 hover:bg-black/5 transition-colors" aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
