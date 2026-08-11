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
import { AlertCircle, ArrowRight, BadgeCheck, Check, ChevronDown, CircleDot, ExternalLink, Loader2, Plus, Sparkles, Upload, Zap } from "lucide-react"
import type { CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"
import { useCareerBeta } from "@/hooks/use-career-beta"

const ACCENT = "#dc4f33"

/** Shared visible focus treatment. :focus-visible so the ring appears for
 *  keyboard users without flashing on every mouse click. */
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dc4f33]/50 focus-visible:ring-offset-1"

/** Item shape returned by /api/upskill and /api/career-path (store fields included) */
export interface UpskillItem extends CareerRoadmapItem {
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
  busy = false,
  compact = false,
}: {
  item: UpskillItem
  onCycle: (skill: string, status: CareerItemStatus) => void
  /** Called after a passed evidence review, with the evidence-grounded CV line */
  onVerified?: (skill: string, cvPhrasing?: string) => void
  /** Called after the user moves this skill onto their core path */
  busy?: boolean
  /**
   * Collapsed row instead of a full card. Used on the career path, where these
   * are a list you return to and scannability beats detail — four expanded
   * cards is a wall of text you cannot read at a glance. The tailor-results
   * strip stays expanded: there, the detail IS the pitch.
   */
  compact?: boolean
}) {
  const isDone = item.status === "done"
  const isActive = item.status === "in_progress"
  const isProven = item.evidence?.verdict === "pass"
  const hours = item.effortEstimateHours ?? item.effortHours
  const [verifying, setVerifying] = useState(false)
  const [open, setOpen] = useState(!compact)
  const fileRef = useRef<HTMLInputElement>(null)

  // Promotion is offered, never automatic: 3+ runs surfacing the same skill is
  // a pattern in what the user applies for; an evidence-backed close is proven
  // investment. Either earns the question — only their click moves it.


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
  // A heading inside a <button> is invalid; in compact mode the row IS the
  // control, so the skill renders as a span. Expanded cards keep h3 (the
  // section owns h2 — h4 would skip a level).
  const HeaderTag = (compact ? "button" : "div") as "button" | "div"
  const TitleTag = (compact ? "span" : "h3") as "span" | "h3"

  const shell = compact
    ? { borderRadius: 12, border: "1px solid var(--ns-border)", background: "var(--ns-paper)", padding: "12px 14px" }
    : { borderRadius: 16, border: "1px solid var(--ns-border)", background: "#fff", padding: 16 }

  return (
    <div style={shell}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onCycle(item.skill, STATUS_NEXT[item.status])}
          disabled={busy}
          // 28px dot, but the button itself is padded out to a 44px tap target
          // (WCAG 2.5.5) — the visual size and the hit area are not the same thing.
          className={`flex-shrink-0 flex items-center justify-center -m-2 p-2 rounded-full transition-transform active:scale-90 disabled:opacity-60 ${FOCUS}`}
          style={{ touchAction: "manipulation" }}
          aria-label={isDone ? `Mark ${item.skill} as to do` : isActive ? `Mark ${item.skill} as done` : `Start ${item.skill}`}
        >
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={isDone ? { background: "#16a34a" } : isActive ? { background: ACCENT } : { background: "#fff", border: `1.5px dashed ${ACCENT}66` }}
        >
          {busy
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: isDone || isActive ? "#fff" : ACCENT }} />
            : isDone ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.75} />
            : isActive ? <CircleDot className="w-3.5 h-3.5 text-white" />
            : <ArrowRight className="w-3 h-3" style={{ color: ACCENT }} />}
        </span>
        </button>
        <div className="flex-1 min-w-0">
          <HeaderTag
            {...(compact
              ? { type: "button" as const, onClick: () => setOpen((v) => !v), "aria-expanded": open,
                  className: `w-full flex items-center gap-2 flex-wrap text-left rounded ${FOCUS}` }
              : { className: "flex items-center gap-2 flex-wrap" })}
          >
            <TitleTag className={`text-[15px] font-bold break-words min-w-0 ${isDone ? "text-[color:var(--ns-ink-40)] line-through" : "text-[#1e1813]"}`}>{item.skill}</TitleTag>
            {typeof hours === "number" && hours > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#fff7f4] text-[#dc4f33]">
                <Zap aria-hidden="true" className="w-2.5 h-2.5" />~{Math.round(hours)}h
              </span>
            )}
            {(item.surfacedCount ?? 1) > 1 && (
              <span className="text-[10px] font-medium tabular-nums" style={{ color: "var(--ns-ink-70)" }}>seen in {item.surfacedCount} applications</span>
            )}
            {isProven && !open && (
              <BadgeCheck className="w-3.5 h-3.5" style={{ color: "#16a34a" }} />
            )}
            {compact && (
              <ChevronDown
                aria-hidden="true"
                className={`w-3.5 h-3.5 ml-auto flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                style={{ color: "var(--ns-ink-40)" }}
              />
            )}
          </HeaderTag>
          {(!compact || open) && (<>
          {item.whyItMatters && <p className="mt-1 text-[13px] text-gray-600 leading-relaxed">{item.whyItMatters}</p>}
          {item.resources?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {item.resources.map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-[#dc4f33] bg-gray-50 hover:bg-[#ffeae4] border border-gray-100 rounded-lg px-2.5 py-1.5 transition-colors ${FOCUS}`}>
                  <ExternalLink aria-hidden="true" className="w-3 h-3" />{r.title}{" "}
                  <span style={{ color: "var(--ns-ink-70)" }}>· {r.source}</span>
                  <span className="sr-only"> (opens in a new tab)</span>
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
          {isDone && (
            isProven ? (
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-green-600">
                <BadgeCheck aria-hidden="true" className="w-3.5 h-3.5" />
                Verified — this counts in your next tailor
              </p>
            ) : (
              <div className="mt-2.5">
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" aria-label={`Upload evidence for ${item.skill}`}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadEvidence(f) }} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={verifying}
                  className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-[#dc4f33] border border-gray-200 hover:border-[#f5d9d0] rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-60 ${FOCUS}`}
                >
                  {verifying ? <><Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />Reviewing…</> : <><Upload aria-hidden="true" className="w-3.5 h-3.5" />Verify with evidence</>}
                </button>
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--ns-ink-70)" }}>Upload the project or certificate — verified skills are the ones that lift your future match scores.</p>
              </div>
            )
          )}
          </>)}
        </div>
      </div>
    </div>
  )
}

/** Shared status-cycle handler: one PATCH, optimistic-free (list is server truth) */
function useCycle(onItems: (items: UpskillItem[]) => void) {
  const [busySkill, setBusySkill] = useState<string | null>(null)
  const cycle = async (skill: string, status: CareerItemStatus) => {
    setBusySkill(skill)
    try {
      const data = await readJson<{ items: UpskillItem[] }>(await fetch("/api/upskill", {
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

export function UpskillStrip({
  historyId,
  weakSkills,
  jobTitle,
  condensed = false,
}: {
  historyId: string | null
  weakSkills: string[]
  jobTitle?: string
  /** One-row form for when the named-gap rows already list the gaps above
      this strip (Gaps tab restructure, 11 Aug 2026) — no explainer card,
      no pill list repeating the same skills. */
  condensed?: boolean
}) {
  const careerBeta = useCareerBeta()
  const [loading, setLoading] = useState(false)
  const [captured, setCaptured] = useState<UpskillItem[] | null>(null)
  const [candidates, setCandidates] = useState<UpskillItem[]>([])
  const [accepting, setAccepting] = useState<string | null>(null)
  const { cycle, busySkill } = useCycle((items) => {
    // The PATCH returns every item; keep only the ones this strip captured
    setCaptured((prev) => prev
      ? items.filter((i) => prev.some((p) => p.skill.toLowerCase() === i.skill.toLowerCase()))
      : prev)
  })

  // Outside the beta the strip would render a CTA that only 403s.
  if (!careerBeta) return null
  if (weakSkills.length === 0) {
    return <p className="text-[13px] text-gray-500">No gaps flagged on this run — your CV already covers what this job asks for.</p>
  }
  if (!historyId) {
    return <p className="text-[13px] text-gray-400">Run a tailor while signed in to turn these gaps into a plan.</p>
  }

  const generate = async () => {
    setLoading(true)
    try {
      const data = await readJson<{ captured: UpskillItem[]; candidates: UpskillItem[] }>(
        await fetch("/api/upskill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ historyId, skills: weakSkills, jobTitle }),
        }))
      setCaptured(data.captured)
      setCandidates(data.candidates)
      if (data.captured.length > 0) {
        toast.success(`${data.captured.length} skill${data.captured.length === 1 ? "" : "s"} added to Upskill`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build your plan.")
    } finally {
      setLoading(false)
    }
  }

  const accept = async (item: UpskillItem) => {
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
    if (condensed) {
      return (
        <div className="flex w-full items-center gap-3 rounded-xl bg-[#f9f6f0] px-4 py-3">
          <span className="shrink-0 text-[12.5px] font-semibold text-[#1e1813]">Close these gaps</span>
          <span className="hidden min-w-0 flex-1 truncate text-[11.5px] text-[#a89e93] sm:inline">
            {loading
              ? "Searching real, free resources · can take up to a minute"
              : `free resources, a project and the exact CV line for each of the ${weakSkills.length} skill${weakSkills.length === 1 ? "" : "s"} this run flagged`}
          </span>
          <button
            onClick={generate}
            disabled={loading}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Finding resources…</>
              : <><Sparkles className="w-3.5 h-3.5" />Build the plan →</>}
          </button>
        </div>
      )
    }
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-[#f5d9d0] bg-[#fff7f4] p-4">
          <p className="text-[13.5px] leading-relaxed text-[#1e1813]">
            <span className="font-semibold">Close the gaps for this job.</span> Small ones land in your Upskill list — free resources, a project to prove each skill, and the exact CV line. Closing one raises your match here and everywhere else.
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
            Upskill — on your career path now
          </p>
          {captured.map((item) => (
            <QuickWinCard
              key={item.skill}
              item={item}
              onCycle={cycle}
              busy={busySkill === item.skill}
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
                    {accepting === item.skill ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add to my path
                  </button>
                </div>
              </div>
            )
          })}
          <p className="text-[11px]" style={{ color: "var(--ns-ink-70)" }}>These are bigger than a week&rsquo;s work, so they only join your path if you say so.</p>
        </div>
      )}

      {captured.length === 0 && candidates.length === 0 && (
        <p className="text-[13px] text-gray-500">Nothing new to add — these gaps are already on your career path.</p>
      )}
    </div>
  )
}

// ── Career path: "Quick wins" section ───────────────────────────────────────

export function UpskillSection({
  items,
  onChanged,
  bare = false,
}: {
  items: UpskillItem[]
  onChanged: () => void
  /** Rendered inside the skills segmented switch, which already supplies the
   *  heading and the separation. The tinted panel and its own header are the
   *  chrome that made this read as bolted on — drop both. */
  bare?: boolean
}) {
  const { cycle, busySkill } = useCycle(() => onChanged())
  if (items.length === 0) {
    return bare ? (
      <p className="t-small" style={{ marginTop: 20 }}>
        Nothing here yet. Gaps you add from a tailored CV land in Upskill.
      </p>
    ) : null
  }

  // Split rather than stack. A flat list of identical cards gives a 2-hour
  // task the same weight as a 3x-surfaced one and buries what is still open
  // under what is finished.
  const open = items.filter((i) => i.status !== "done")
  const closed = items.filter((i) => i.status === "done")
  const totalHours = open.reduce((sum, i) => sum + (i.effortEstimateHours ?? i.effortHours ?? 0), 0)

  return (
    <section style={{ marginTop: bare ? 20 : 48 }}>
      {!bare && (
        <div className="flex items-baseline justify-between" style={{ paddingBottom: 14, borderBottom: "1px solid var(--ns-border)" }}>
          <h2 className="t-title" style={{ fontSize: 24, margin: 0 }}>Upskill<span style={{ color: "var(--ns-coral)" }}>.</span></h2>
          <span className="t-mono tabular-nums">{closed.length} of {items.length} closed</span>
        </div>
      )}

      {/* Inside the switch this is plain content — the segmented control is
          what separates Upskill from the North Star, so the panel would just
          be a second, competing device. */}
      <div style={bare ? { marginTop: 0 } : {
        marginTop: 20,
        background: "var(--ns-tint-1)",
        border: "1px solid var(--ns-tint-2)",
        borderRadius: 16,
        padding: "18px 18px 20px",
      }}>
        {/* The contract, stated plainly. Core is the North Star and nothing
            else; these came from individual job descriptions and stay here. */}
        <p className="t-small" style={{ margin: "0 0 4px" }}>
          Skills individual jobs asked for. They never move your North Star readiness —
          close one and it counts toward that job, not the role you&rsquo;re aiming at.
        </p>
        {open.length > 0 && totalHours > 0 && (
          <p className="t-mono" style={{ margin: "0 0 16px", color: "var(--ns-coral-deep)" }}>
            {open.length} open · roughly {Math.round(totalHours)}h of work left
          </p>
        )}

        {open.length > 0 && (
          <div className="space-y-2">
            {open.map((item) => (
              <QuickWinCard
                key={item.skill}
                item={item}
                onCycle={cycle}
                busy={busySkill === item.skill}
                compact
                onVerified={() => onChanged()}
              />
            ))}
          </div>
        )}

        {closed.length > 0 && (
          <details style={{ marginTop: open.length > 0 ? 18 : 0 }}>
            <summary className="t-mono" style={{ cursor: "pointer", color: "var(--ns-ink-55)" }}>
              {closed.length} closed
            </summary>
            <div className="space-y-2" style={{ marginTop: 12 }}>
              {closed.map((item) => (
                <QuickWinCard
                  key={item.skill}
                  item={item}
                  onCycle={cycle}
                  busy={busySkill === item.skill}
                  compact
                  onVerified={() => onChanged()}
                />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  )
}
