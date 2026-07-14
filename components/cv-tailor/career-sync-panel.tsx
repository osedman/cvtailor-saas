"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, Copy, Loader2, Plus, Target, ArrowRight, CircleDot, X } from "lucide-react"
import type { TailorResult, CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"

const ACCENT = "#dc4f33"
const SEEN_GAPS_KEY = "tailr:career-sync:seen-gaps"

/** Remember suggested gaps so the same skill isn't re-pitched on every run (keep the list bounded) */
function rememberGaps(skills: string[]) {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(SEEN_GAPS_KEY) ?? "[]")
    const merged = Array.from(new Set([...seen, ...skills.map((s) => s.toLowerCase())])).slice(-50)
    localStorage.setItem(SEEN_GAPS_KEY, JSON.stringify(merged))
  } catch { /* ignore */ }
}

interface Roadmap {
  id: string
  target_role: string
  items: CareerRoadmapItem[]
}

/**
 * The living-profile bridge between tailoring and the career path: after each
 * tailor run it compares this job's requirement evidence against the user's
 * roadmap — surfacing skills they're already closing, suggesting "mark done"
 * when a roadmap skill now shows strong evidence, and offering one-click
 * "add to career path" for new gaps. No extra AI calls except when adding.
 */
export function CareerSyncPanel({ results }: { results: TailorResult }) {
  const [roadmap, setRoadmap] = useState<Roadmap | null | undefined>(undefined)
  const [adding, setAdding] = useState<string | null>(null)
  const [marking, setMarking] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [shown, setShown] = useState(false)

  // Slide in a beat after the results land, so it reads as a follow-up, not clutter
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 1200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/career-path")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { roadmap?: Roadmap | null } | null) => {
        if (!cancelled) setRoadmap(data?.roadmap ?? null)
      })
      .catch(() => { if (!cancelled) setRoadmap(null) })
    return () => { cancelled = true }
  }, [])

  const analysis = useMemo(() => {
    const coverage = results.requirementsCoverage ?? []
    const weak = new Map<string, string>() // lowercase -> display
    const mustWeak = new Map<string, string>() // weak keywords from must-have requirements only
    const strong = new Set<string>()
    for (const r of coverage) {
      for (const kw of r.keywords ?? []) {
        const key = kw.trim().toLowerCase()
        if (!key) continue
        if (r.strength === "partial" || r.strength === "none") {
          if (!weak.has(key)) weak.set(key, kw.trim())
          if (r.type === "must" && !mustWeak.has(key)) mustWeak.set(key, kw.trim())
        } else if (r.strength === "strong") {
          strong.add(key)
        }
      }
    }

    const items = roadmap?.items ?? []
    const matches = (skill: string, key: string) => {
      const s = skill.toLowerCase()
      return s === key || s.includes(key) || key.includes(s)
    }

    const closing: CareerRoadmapItem[] = []
    const nowStrong: CareerRoadmapItem[] = []
    for (const item of items) {
      if (item.status !== "done" && Array.from(strong).some((k) => matches(item.skill, k))) {
        nowStrong.push(item)
      } else if (Array.from(weak.keys()).some((k) => matches(item.skill, k))) {
        closing.push(item)
      }
    }

    // Anti-spam: only suggest gaps from MUST-have requirements, max 2 per run,
    // and never re-suggest a skill the user has already seen and ignored.
    let seenSuggestions: string[] = []
    try { seenSuggestions = JSON.parse(localStorage.getItem(SEEN_GAPS_KEY) ?? "[]") } catch { /* ignore */ }
    const knownSkills = items.map((i) => i.skill.toLowerCase())
    const newGaps = Array.from(mustWeak.entries())
      .filter(([key]) => !knownSkills.some((s) => matches(s, key)))
      .filter(([key]) => !seenSuggestions.includes(key))
      .map(([, display]) => display)
      .slice(0, 2)

    return { closing, nowStrong, newGaps }
  }, [results, roadmap])

  const addSkill = useCallback(async (skill: string) => {
    setAdding(skill)
    try {
      const res = await fetch("/api/career-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "add-skill", skill }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to add the skill.")
      setRoadmap(data.roadmap)
      rememberGaps([skill])
      toast.success(`${skill} added to your career path — resources and a project idea are ready.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the skill.")
    } finally {
      setAdding(null)
    }
  }, [])

  const markDone = useCallback(async (item: CareerRoadmapItem) => {
    setMarking(item.skill)
    try {
      const res = await fetch("/api/career-path", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: item.skill, status: "done" satisfies CareerItemStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to update.")
      setRoadmap(data.roadmap)
      toast.success(`${item.skill} marked done — copy its CV bullet below.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update.")
    } finally {
      setMarking(null)
    }
  }, [])

  const copyPhrase = useCallback(async (item: CareerRoadmapItem) => {
    await navigator.clipboard.writeText(item.cvPhrasing)
    setCopied(item.skill)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  // Nothing to say: still loading, dismissed, or nothing ACTIONABLE — status
  // chips alone aren't worth a popup, only mark-done suggestions or new gaps.
  if (roadmap === undefined || dismissed) return null
  const { closing, nowStrong, newGaps } = analysis
  const actionable = nowStrong.length > 0 || newGaps.length > 0
  if (!actionable) return null

  const doneItems = (roadmap?.items ?? []).filter((i) => i.status === "done" && nowStrong.every((s) => s.skill !== i.skill))

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-[min(26rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl border border-[#f5d9d0] bg-[#fffaf8] p-5 shadow-[0_8px_32px_rgba(30,24,19,0.14)] transition-all duration-300 ease-out"
      style={{ opacity: shown ? 1 : 0, transform: shown ? "translateY(0)" : "translateY(16px)", pointerEvents: shown ? "auto" : "none" }}
      role="dialog"
      aria-label="Career path updates from this application"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-[#1e1813] flex items-center gap-2">
          <Target className="w-4 h-4 flex-shrink-0" style={{ color: ACCENT }} />
          Your career path, updated by this application
        </h3>
        <button
          onClick={() => { rememberGaps(newGaps); setDismissed(true) }}
          className="flex-shrink-0 p-1 -mr-1 -mt-1 rounded text-gray-300 hover:text-gray-500 hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <Link href="/career-path" className="inline-flex items-center gap-1 text-[12px] font-semibold hover:underline mb-3" style={{ color: ACCENT }}>
        Open career path <ArrowRight className="w-3 h-3" />
      </Link>

      <div className="space-y-3">
        {nowStrong.map((item) => (
          <div key={item.skill} className="flex items-center gap-3 bg-white rounded-xl border border-green-100 px-3.5 py-2.5">
            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="flex-1 text-[13px] text-[#1e1813]">
              <span className="font-semibold">{item.skill}</span> showed strong evidence in this application — closed it?
            </p>
            <button
              onClick={() => markDone(item)}
              disabled={marking === item.skill}
              className="flex-shrink-0 text-[12px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
            >
              {marking === item.skill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark done"}
            </button>
          </div>
        ))}

        {closing.map((item) => (
          <div key={item.skill} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-3.5 py-2.5">
            <CircleDot className="w-4 h-4 flex-shrink-0" style={{ color: ACCENT }} />
            <p className="flex-1 text-[13px] text-[#1e1813]">
              This job also wants <span className="font-semibold">{item.skill}</span> — already on your path
              <span className="text-gray-400"> · {item.status === "in_progress" ? "in progress" : "not started"}</span>
            </p>
          </div>
        ))}

        {doneItems.map((item) => (
          <div key={item.skill} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-3.5 py-2.5">
            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="flex-1 text-[13px] text-[#1e1813]">
              You&apos;ve completed <span className="font-semibold">{item.skill}</span> — add its bullet to this CV
            </p>
            <button
              onClick={() => copyPhrase(item)}
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              {copied === item.skill ? <><Check className="w-3.5 h-3.5 text-green-600" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy bullet</>}
            </button>
          </div>
        ))}

        {newGaps.map((skill) => (
          <div key={skill} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-3.5 py-2.5">
            <Plus className="w-4 h-4 flex-shrink-0" style={{ color: ACCENT }} />
            <p className="flex-1 text-[13px] text-[#1e1813]">
              New gap spotted: <span className="font-semibold">{skill}</span>
            </p>
            <button
              onClick={() => addSkill(skill)}
              disabled={adding !== null}
              className="flex-shrink-0 text-[12px] font-semibold text-white rounded-lg px-3 py-1.5 transition-all hover:brightness-105 disabled:opacity-60"
              style={{ background: ACCENT }}
            >
              {adding === skill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add to career path"}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
