"use client"

/**
 * Quick wins — run-surfaced skills, closable in about a week.
 *
 * Two placements, one write path. The strip lives in the tailor results (the
 * moment gaps are freshest); the section lives on the career path. Both render
 * the same card and both mutate career_roadmap_items via /api/upskill, so
 * closing an item in either place produces the identical state change — there
 * is no second copy to drift.
 */

import { useRef, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, ArrowRight, BadgeCheck, Check, CircleDot, ExternalLink, Loader2, Plus, Sparkles, Upload, Zap } from "lucide-react"
import type { CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"
import { promotionEligible } from "@/lib/career-path-compute"

const ACCENT = "#dc4f33"

/** Item shape returned by /api/upskill and /api/career-path (store fields included) */
export interface QuickWinItem extends CareerRoadmapItem {
  horizon?: "quick" | "core"
  sourceRunId?: string | null
  effortEstimateHours?: number | null
  surfacedCount?: number
}

const STATUS_NEXT: Record<CareerItemStatus, CareerItemStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
}

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Server error ${res.status}`)
  return data as T
}

/** One quick-win card: cycle status, resources, project idea, CV line when done */
export function QuickWinCard({
  item,
  onCycle,
  onVerified,
  onPromoted,
  busy = false,
}: {
  item: QuickWinItem
  onCycle: (skill: string, status: CareerItemStatus) => void
  /** Called after a passed evidence review, with the evidence-grounded CV line */
  onVerified?: (skill: string, cvPhrasing?: string) => void
  /** Called after the user moves this skill onto their core path */
  onPromoted?: (skill: string) => void
  busy?: boolean
}) {
  const isDone = item.status === "done"
  const isActive = item.status === "in_progress"
  const isProven = item.evidence?.verdict === "pass"
  const hours = item.effortEstimateHours ?? item.effortHours
  const [verifying, setVerifying] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Promotion is offered, never automatic: 3+ runs surfacing the same skill is
  // a pattern in what the user applies for; an evidence-backed close is proven
  // investment. Either earns the question — only their click moves it.
  const offerPromotion = !!onPromoted && promotionEligible(item)

  const promote = async () => {
    setPromoting(true)
    try {
      await readJson(await fetch("/api/upskill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "promote", skill: item.skill }),
      }))
      toast.success(`${item.skill} is now part of your main path`)
      onPromoted?.(item.skill)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move that skill.")
    } finally {
      setPromoting(false)
    }
  }

  // Same reviewer the career path uses — the evidence route reads both
  // horizons, so a quick win earns "proven" exactly the way a core skill does.
  const uploadEvidence = async (file: File) => {
    setVerifying(true)
    try {
      const body = new FormData()
      body.set("file", file)
      body.set("skill", item.skill)
      const data = await readJson<{ passed: boolean; feedback?: string; cvPhrasing?: string }>(
        await fetch("/api/career-path/evidence", { method: "POST", body }))
      if (data.passed) {
        toast.success(`${item.skill} verified — it now counts in your next tailor`)
        onVerified?.(item.skill, data.cvPhrasing)
      } else {
        toast.info(data.feedback || "Not quite there yet — check the suggested project and try again.", { duration: 8000 })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not review that file.")
    } finally {
      setVerifying(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onCycle(item.skill, STATUS_NEXT[item.status])}
          disabled={busy}
          className="flex-shrink-0 w-7 h-7 mt-0.5 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-60"
          style={isDone ? { background: "#16a34a" } : isActive ? { background: ACCENT } : { background: "#fff", border: `1.5px dashed ${ACCENT}66` }}
          title={isDone ? "Mark as to do" : isActive ? "Mark as done" : "Start this skill"}
        >
          {busy
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: isDone || isActive ? "#fff" : ACCENT }} />
            : isDone ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.75} />
            : isActive ? <CircleDot className="w-3.5 h-3.5 text-white" />
            : <ArrowRight className="w-3 h-3" style={{ color: ACCENT }} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={`text-[15px] font-bold ${isDone ? "text-gray-400 line-through" : "text-[#1e1813]"}`}>{item.skill}</h4>
            {typeof hours === "number" && hours > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#fff7f4] text-[#dc4f33]">
                <Zap className="w-2.5 h-2.5" />~{Math.round(hours)}h
              </span>
            )}
            {(item.surfacedCount ?? 1) > 1 && (
              <span className="text-[10px] font-medium text-gray-400">seen in {item.surfacedCount} applications</span>
            )}
          </div>
          {item.whyItMatters && <p className="mt-1 text-[13px] text-gray-600 leading-relaxed">{item.whyItMatters}</p>}
          {item.resources?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {item.resources.map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-[#dc4f33] bg-gray-50 hover:bg-[#ffeae4] border border-gray-100 rounded-lg px-2.5 py-1.5 transition-colors">
                  <ExternalLink className="w-3 h-3" />{r.title} <span className="text-gray-400">· {r.source}</span>
                </a>
              ))}
            </div>
          )}
          {item.projectBrief && (
            <div className="mt-2.5 rounded-xl bg-gray-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Prove it with</p>
              <p className="text-[12.5px] text-gray-700 leading-relaxed">{item.projectBrief}</p>
            </div>
          )}
          {isDone && item.cvPhrasing && (
            <div className="mt-2.5 rounded-xl border border-green-100 bg-green-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1">Add to your CV</p>
              <p className="text-[12.5px] text-[#1e1813] leading-relaxed">{item.cvPhrasing}</p>
            </div>
          )}
          {offerPromotion && (
            <div className="mt-2.5 flex items-center gap-2 flex-wrap rounded-xl border border-[#f5d9d0] bg-[#fff7f4] px-3 py-2.5">
              <p className="flex-1 min-w-[200px] text-[12px] text-[#1e1813] leading-snug">
                {(item.surfacedCount ?? 1) >= 3
                  ? <>This keeps coming up — <span className="font-semibold">{item.surfacedCount} applications</span> have asked for it.</>
                  : <>You proved this one. Want it on your main path?</>}
              </p>
              <button
                onClick={promote}
                disabled={promoting}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#dc4f33] bg-white border border-[#f5d9d0] rounded-lg px-2.5 py-1.5 hover:bg-[#ffeae4] transition-colors disabled:opacity-60"
              >
                {promoting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Make it part of my path
              </button>
            </div>
          )}
          {isDone && (
            isProven ? (
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-green-600">
                <BadgeCheck className="w-3.5 h-3.5" />
                Verified — this counts in your next tailor
              </p>
            ) : (
              <div className="mt-2.5">
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadEvidence(f) }} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={verifying}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-[#dc4f33] border border-gray-200 hover:border-[#f5d9d0] rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-60"
                >
                  {verifying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Reviewing…</> : <><Upload className="w-3.5 h-3.5" />Verify with evidence</>}
                </button>
                <p className="mt-1.5 text-[11px] text-gray-400">Upload the project or certificate — verified skills are the ones that lift your future match scores.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

/** Shared status-cycle handler: one PATCH, optimistic-free (list is server truth) */
function useCycle(onItems: (items: QuickWinItem[]) => void) {
  const [busySkill, setBusySkill] = useState<string | null>(null)
  const cycle = async (skill: string, status: CareerItemStatus) => {
    setBusySkill(skill)
    try {
      const data = await readJson<{ items: QuickWinItem[] }>(await fetch("/api/upskill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill, status }),
      }))
      onItems(data.items)
      if (status === "done") toast.success("Closed. Verify it with evidence to make it count in your next tailor.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update.")
    } finally {
      setBusySkill(null)
    }
  }
  return { cycle, busySkill }
}

// ── Tailor results: "Close these gaps" strip ────────────────────────────────

export function QuickWinsStrip({
  historyId,
  weakSkills,
  jobTitle,
}: {
  historyId: string | null
  weakSkills: string[]
  jobTitle?: string
}) {
  const [loading, setLoading] = useState(false)
  const [captured, setCaptured] = useState<QuickWinItem[] | null>(null)
  const [candidates, setCandidates] = useState<QuickWinItem[]>([])
  const [accepting, setAccepting] = useState<string | null>(null)
  const { cycle, busySkill } = useCycle((items) => {
    // The PATCH returns every item; keep only the ones this strip captured
    setCaptured((prev) => prev
      ? items.filter((i) => prev.some((p) => p.skill.toLowerCase() === i.skill.toLowerCase()))
      : prev)
  })

  if (weakSkills.length === 0) {
    return <p className="text-[13px] text-gray-500">No gaps flagged on this run — your CV already covers what this job asks for.</p>
  }
  if (!historyId) {
    return <p className="text-[13px] text-gray-400">Run a tailor while signed in to turn these gaps into a plan.</p>
  }

  const generate = async () => {
    setLoading(true)
    try {
      const data = await readJson<{ captured: QuickWinItem[]; candidates: QuickWinItem[] }>(
        await fetch("/api/upskill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ historyId, skills: weakSkills, jobTitle }),
        }))
      setCaptured(data.captured)
      setCandidates(data.candidates)
      if (data.captured.length > 0) {
        toast.success(`${data.captured.length} quick win${data.captured.length === 1 ? "" : "s"} added to your career path`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build your plan.")
    } finally {
      setLoading(false)
    }
  }

  const accept = async (item: QuickWinItem) => {
    setAccepting(item.skill)
    try {
      await readJson(await fetch("/api/upskill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "accept", item }),
      }))
      setCandidates((prev) => prev.filter((c) => c.skill !== item.skill))
      toast.success(`${item.skill} added to your career path`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that skill.")
    } finally {
      setAccepting(null)
    }
  }

  if (captured === null) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-[#f5d9d0] bg-[#fff7f4] p-4">
          <p className="text-[13.5px] leading-relaxed text-[#1e1813]">
            <span className="font-semibold">Close the gaps for this job.</span> Small ones land on your career path as quick wins — free resources, a project to prove each skill, and the exact CV line. Closing one raises your match here and everywhere else.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {weakSkills.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-2.5 py-1.5 bg-gray-50 border border-gray-100 text-gray-600">
              <AlertCircle className="w-3 h-3 text-[#dc4f33]" /> {s}
            </span>
          ))}
        </div>
        <div>
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 py-3 px-5 text-[14px] font-semibold text-white rounded-xl shadow-sm transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Finding resources…</> : <><Sparkles className="w-4 h-4" />Close these gaps</>}
          </button>
          {loading && <p className="mt-2.5 text-[12px] text-gray-400">Searching for real, free resources — this can take up to a minute.</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {captured.length > 0 && (
        <div className="space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
            Quick wins — on your career path now
          </p>
          {captured.map((item) => (
            <QuickWinCard
              key={item.skill}
              item={item}
              onCycle={cycle}
              busy={busySkill === item.skill}
              onPromoted={(skill) => setCaptured((prev) => prev ? prev.filter((p) => p.skill !== skill) : prev)}
              onVerified={(skill, cvPhrasing) => setCaptured((prev) => prev
                ? prev.map((p) => p.skill === skill
                    ? { ...p, evidence: { fileName: "", judgedAt: new Date().toISOString(), verdict: "pass", quality: 3, note: "" }, cvPhrasing: cvPhrasing || p.cvPhrasing }
                    : p)
                : prev)}
            />
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
            Bigger commitments — your call
          </p>
          {candidates.map((item) => {
            const hours = item.effortHours
            return (
              <div key={item.skill} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-[15px] font-bold text-[#1e1813]">{item.skill}</h4>
                      {typeof hours === "number" && hours > 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">~{Math.round(hours)}h — a real commitment</span>
                      )}
                    </div>
                    {item.whyItMatters && <p className="mt-1 text-[13px] text-gray-600 leading-relaxed">{item.whyItMatters}</p>}
                  </div>
                  <button
                    onClick={() => accept(item)}
                    disabled={accepting === item.skill}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#dc4f33] border border-[#f5d9d0] bg-white rounded-lg px-3 py-2 hover:bg-[#fff7f4] transition-colors disabled:opacity-60"
                  >
                    {accepting === item.skill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add to my path
                  </button>
                </div>
              </div>
            )
          })}
          <p className="text-[11px] text-gray-400">These are bigger than a week's work, so they only join your path if you say so.</p>
        </div>
      )}

      {captured.length === 0 && candidates.length === 0 && (
        <p className="text-[13px] text-gray-500">Nothing new to add — these gaps are already on your career path.</p>
      )}
    </div>
  )
}

// ── Career path: "Quick wins" section ───────────────────────────────────────

export function QuickWinsSection({
  items,
  onChanged,
}: {
  items: QuickWinItem[]
  onChanged: () => void
}) {
  const { cycle, busySkill } = useCycle(() => onChanged())
  if (items.length === 0) return null
  const done = items.filter((i) => i.status === "done").length

  return (
    <section style={{ marginTop: 48 }}>
      <div className="flex items-baseline justify-between" style={{ paddingBottom: 14, borderBottom: "1px solid var(--ns-border)" }}>
        <h2 className="t-title" style={{ fontSize: 24, margin: 0 }}>Quick wins</h2>
        <span className="t-mono">{done} of {items.length} closed</span>
      </div>
      <p className="t-small" style={{ margin: "10px 0 0" }}>
        Small gaps your job applications keep surfacing — each closable in about a week. They sit beside your main path and never move its forecast.
      </p>
      <div className="space-y-3" style={{ marginTop: 20 }}>
        {items.map((item) => (
          <QuickWinCard key={item.skill} item={item} onCycle={cycle} busy={busySkill === item.skill} onVerified={() => onChanged()} onPromoted={() => onChanged()} />
        ))}
      </div>
    </section>
  )
}
