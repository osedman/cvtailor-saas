"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Sparkles, Loader2, ExternalLink, Check, CircleDot, Target, ArrowRight, Flag, MapPin, PartyPopper, FolderPlus, FileSearch, Plus, X, ChevronDown, TrendingUp, Database, Code2, Cloud, BarChart3, Users, Wrench, Palette, Presentation, BookOpen, Zap } from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { UpskillSection } from "@/components/upskill"
import { useAuth } from "@/components/auth/auth-provider"
import type { CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"
import { forecastReadyDate, daysSinceLastStitch } from "@/lib/career-path-compute"

const ACCENT = "#dc4f33"
const INK = "#1e1813"

interface Milestone { role: string; reachedAt: string }
interface TargetSkill { skill: string; have: boolean; importance?: "core" | "common" | "edge" }
interface CvFinding { label: string; detail: string }
interface CvFindings { headline: string; strengths: CvFinding[]; gaps: CvFinding[] }
interface TargetSuggestion { role: string; whyYou: string; fit?: number }
interface Roadmap {
  id: string
  target_role: string
  hours_per_week: number | null
  current_title: string
  milestones: Milestone[]
  intention: string
  items: CareerRoadmapItem[]
  target_skills: TargetSkill[] | null
  findings: CvFindings | null
}
interface Readiness { pct: number; have: number; total: number; missing: string[]; haveList?: string[] }
interface RankedGap { skill: string; unlockCount: number; sourceJobs: string[] }
interface UpskillItem extends CareerRoadmapItem { sourceRunId?: string | null; effortEstimateHours?: number | null; surfacedCount?: number }
interface PathData { roadmap: Roadmap | null; derivedTarget: string; readiness: Readiness; rankedGaps: RankedGap[]; arcAmbition: string; upskillItems?: UpskillItem[] }
interface SalaryBand { p25: number; median: number; p75: number; sampleSize: number }
interface SkillUnlock { skill: string; roles: number }
interface MarketSnapshot { role: string; region: string; totalRoles: number; band: SalaryBand | null; topCompanies: string[]; unlocks: SkillUnlock[]; fetchedAt: string }

const gbp = (n: number) => `£${Math.round(n / 1000)}k`

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch {
    throw new Error(`The server returned an unexpected response (${res.status}). Please try again in a moment.`)
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error
    throw new Error(msg || `Server error ${res.status}. Please try again.`)
  }
  return data as T
}

const STATUS_CYCLE: Record<CareerItemStatus, CareerItemStatus> = { todo: "in_progress", in_progress: "done", done: "todo" }

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const h = () => setReduced(mq.matches)
    mq.addEventListener("change", h)
    return () => mq.removeEventListener("change", h)
  }, [])
  return reduced
}

/** Eases from the previously shown value to the new one — so a readiness gain
 * is something you watch happen, not a number that was already different. */
function useAnimatedNumber(value: number, durationMs = 900) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    const from = fromRef.current
    if (reduced || from === value) { fromRef.current = value; setShown(value); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); fromRef.current = value }
  }, [value, durationMs, reduced])
  return shown
}

function Breadcrumb({ step }: { step: "A" | "B" | "C" | "D" }) {
  const steps = [
    { key: "A", label: "CV scan" },
    { key: "B", label: "Choose North Star" },
    { key: "C", label: "Lock target" },
    { key: "D", label: "Your path" },
  ]
  return (
    <div className="flex items-center gap-3 px-6 sm:px-12 pt-4" style={{ color: "var(--ns-ink-55)" }}>
      <span className="t-eyebrow">Career Path</span>
      <span style={{ width: 14, height: 1, background: "var(--ns-ink-15)" }} />
      <div className="flex items-center gap-2 flex-wrap">
        {steps.map((st, i) => (
          <span key={st.key} className="flex items-center gap-2">
            <span style={{ fontSize: 12, fontWeight: st.key === step ? 600 : 400, color: st.key === step ? "var(--ns-ink)" : "var(--ns-ink-40)" }}>{st.label}</span>
            {i < steps.length - 1 && <span style={{ width: 18, height: 1, background: "var(--ns-ink-15)", display: "inline-block" }} />}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The stitched-thread readiness meter — Tailr's signature motif. */
function ThreadMeter({ pct }: { pct: number }) {
  const W = 460, step = 8
  const filled = (pct / 100) * W
  const pts: Array<[number, number]> = []
  for (let x = 0; x <= filled; x += step) pts.push([x, x % (step * 2) === 0 ? 10 : 14])
  const d = pts.length > 1 ? "M " + pts.map((pt) => pt.join(" ")).join(" L ") : ""
  return (
    <svg width="100%" viewBox={`0 0 ${W} 22`} style={{ display: "block", overflow: "visible" }}>
      <line x1="0" y1="12" x2={W} y2="12" stroke="var(--ns-ink-15)" strokeWidth="1" strokeDasharray="1 4" />
      {d && <path d={d} className="ns-stitch" stroke="var(--ns-coral)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      <circle cx={filled} cy="12" r="3.5" fill="var(--ns-coral)" />
      <circle cx={filled} cy="12" r="6" fill="none" stroke="var(--ns-coral)" strokeOpacity="0.25" strokeWidth="1" />
    </svg>
  )
}

const SKILL_ICONS: Array<[RegExp, typeof Target]> = [
  [/power ?bi|tableau|analytics|\bbi\b|dashboard|report|excel/, BarChart3],
  [/sql|data|database|warehouse|etl/, Database],
  [/python|code|program|software|api|script|java|typescript|react|develop/, Code2],
  [/cloud|aws|azure|gcp|devops|kubernetes|docker|infra/, Cloud],
  [/stakeholder|leadership|manage|team|people|communicat|collaborat|influence/, Users],
  [/design|ux|ui|figma|brand|creative/, Palette],
  [/present|workshop|facilitat|training|coaching|speaking/, Presentation],
  [/rpa|automation|power ?platform|process|tooling|engineer/, Wrench],
  [/strategy|governance|framework|requirement|business|roadmap|planning/, BookOpen],
]
function pickIcon(skill: string): typeof Target {
  const s = skill.toLowerCase()
  for (const [re, icon] of SKILL_ICONS) if (re.test(s)) return icon
  return Zap
}

function SkillDetailModal({ item, gap, onClose, onCycle, onRemove, onReviewed, updating }: { item: CareerRoadmapItem; gap?: RankedGap; onClose: () => void; onCycle: (i: CareerRoadmapItem) => void; onRemove: (i: CareerRoadmapItem) => void; onReviewed: () => Promise<void>; updating: boolean }) {
  const [copied, setCopied] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [review, setReview] = useState<null | { passed: boolean; quality: number; feedback: string; cvPhrasing?: string; suggestedProject?: string }>(null)
  const evidenceInputRef = useRef<HTMLInputElement>(null)
  const isDone = item.status === "done"
  const isActive = item.status === "in_progress"

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const submitEvidence = async (file: File) => {
    setReviewing(true)
    setReview(null)
    try {
      const body = new FormData()
      body.append("file", file)
      body.append("skill", item.skill)
      const data = await readJson<{ passed: boolean; quality: number; feedback: string; cvPhrasing?: string; suggestedProject?: string }>(
        await fetch("/api/career-path/evidence", { method: "POST", body }),
      )
      setReview(data)
      await onReviewed()
      if (data.passed) toast.success(`${item.skill} closed — evidence accepted. Your readiness just moved.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't review that file.")
    } finally {
      setReviewing(false)
      if (evidenceInputRef.current) evidenceInputRef.current.value = ""
    }
  }

  return (
    <div className="ns-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label={item.skill}>
      <div className="ns ns-modal" style={{ background: "var(--ns-paper)" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4" style={{ padding: "22px 24px 0" }}>
          <div>
            <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
              <span className="t-eyebrow" style={{ fontSize: 10 }}>{isDone ? "Closed" : isActive ? "In progress" : "Not started"}</span>
              {item.evidence?.verdict === "pass" && <span className="t-mono" style={{ fontSize: 10 }}>· evidence on file</span>}
              {gap && gap.unlockCount > 0 && !isDone && (
                <span className="t-mono" style={{ fontSize: 10 }} title={gap.sourceJobs.join(", ")}>· unlocks {gap.unlockCount} saved job{gap.unlockCount === 1 ? "" : "s"}</span>
              )}
            </div>
            <h3 className="t-title" style={{ fontSize: 22, margin: 0 }}>{item.skill}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex items-center justify-center"
            style={{ width: 44, height: 44, marginTop: -8, marginRight: -10, borderRadius: 10, color: "var(--ns-ink-40)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 24px 0", maxHeight: "52vh", overflowY: "auto" }}>
          {review && (
            <div style={{ marginBottom: 16, padding: "14px 16px", background: review.passed ? "#eafaf0" : "var(--ns-tint-1)", border: `1px solid ${review.passed ? "#d7ecd9" : "var(--ns-tint-2)"}`, borderRadius: 12 }}>
              <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 8, color: review.passed ? "#16a34a" : "var(--ns-coral)" }}>
                {review.passed ? "Evidence accepted" : "Not quite yet"}
              </div>
              <p className="t-body" style={{ margin: 0 }}>{review.feedback}</p>
              {review.passed && review.cvPhrasing && (
                <p className="t-body" style={{ margin: "10px 0 0", fontWeight: 500 }}>New CV bullet: {review.cvPhrasing}</p>
              )}
              {!review.passed && review.suggestedProject && (
                <p className="t-body" style={{ margin: "10px 0 0" }}><span style={{ fontWeight: 600 }}>Try this instead:</span> {review.suggestedProject}</p>
              )}
            </div>
          )}

          <p className="t-body" style={{ color: "var(--ns-ink-70)", margin: 0 }}>{item.whyItMatters}</p>

          {item.resources?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>Learning resources</div>
              <div className="flex flex-col" style={{ gap: 8 }}>
                {item.resources.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="ns-resource">
                    <span className="t-body" style={{ fontWeight: 500 }}>{r.title}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="t-mono">
                        {r.source}
                        {r.durationNote ? ` · ${r.durationNote}` : ""}
                        {r.free === false ? " · paid" : ""}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5" style={{ color: "var(--ns-ink-40)" }} />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20, padding: "14px 16px", background: "var(--ns-cream)", border: "1px solid var(--ns-border)", borderRadius: 12 }}>
            <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Project idea</div>
            <p className="t-body" style={{ color: "var(--ns-ink-70)", margin: 0 }}>{item.projectBrief}</p>
          </div>

          {isDone && (
            <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--ns-tint-1)", border: "1px solid var(--ns-tint-2)", borderRadius: 12 }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Add to your CV</div>
                  <p className="t-body" style={{ margin: 0 }}>{item.cvPhrasing}</p>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(item.cvPhrasing); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="ns-btn ns-btn-secondary flex-shrink-0" style={{ padding: "8px 14px", fontSize: 12.5 }}>
                  {copied ? <>Copied <Check className="w-3 h-3" /></> : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "18px 24px 20px" }}>
          <input ref={evidenceInputRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) submitEvidence(f) }} />
          {isActive && !review?.passed ? (
            <>
              <button onClick={() => evidenceInputRef.current?.click()} disabled={reviewing}
                className="ns-btn ns-btn-primary w-full" style={{ padding: "14px 20px" }}>
                {reviewing ? <><Loader2 className="w-4 h-4 animate-spin" />Reviewing your evidence…</> : <>Upload evidence to close <ArrowRight className="w-4 h-4" /></>}
              </button>
              <p className="t-small" style={{ margin: "8px 0 0", textAlign: "center", fontSize: 11.5 }}>
                Project document or course certificate (PDF, DOCX, TXT). Read once, never stored.
              </p>
            </>
          ) : (
            <button onClick={() => onCycle(item)} disabled={updating}
              className={`ns-btn ${isDone ? "ns-btn-secondary" : "ns-btn-primary"} w-full`} style={{ padding: "14px 20px" }}>
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : isDone ? <>Move back to learning</> : <>Start this skill <ArrowRight className="w-4 h-4" /></>}
            </button>
          )}
          <div className="text-center" style={{ marginTop: 12 }}>
            {confirmRemove ? (
              <span className="t-small">Remove this skill?{" "}
                <button onClick={() => onRemove(item)} style={{ fontWeight: 600, color: "var(--ns-coral)" }}>Yes, remove</button>
                <span style={{ color: "var(--ns-ink-15)" }}> · </span>
                <button onClick={() => setConfirmRemove(false)}>Keep it</button>
              </span>
            ) : (
              <span className="t-small" style={{ color: "var(--ns-ink-40)" }}>
                {isActive && !review?.passed && (
                  <><button onClick={() => onCycle(item)} disabled={updating} style={{ color: "var(--ns-ink-40)" }}>Close without evidence</button><span style={{ color: "var(--ns-ink-15)" }}> · </span></>
                )}
                <button onClick={() => setConfirmRemove(true)} style={{ color: "var(--ns-ink-40)" }}>Remove from path</button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NorthStarJourney({ cachedFindings, seedIntention, onBuilt, onCancel }: { cachedFindings: CvFindings | null; seedIntention: string; onBuilt: () => Promise<void> | void; onCancel?: () => void }) {
  // The intro is the front door EVERY time — first visit and "Change North
  // Star" alike (Ose, 28 Jul). A cached scan doesn't skip the door; it makes
  // the door instant: Scan my CV with findings on file jumps straight to them.
  const [stage, setStage] = useState<"intro" | "scanning" | "findings" | "choosing" | "building">("intro")
  const [findings, setFindings] = useState<CvFindings | null>(cachedFindings)
  const [suggestions, setSuggestions] = useState<TargetSuggestion[] | null>(null)
  const [chooserMarket, setChooserMarket] = useState<Record<string, { band: SalaryBand | null; totalRoles: number; topCompanies: string[] }>>({})
  const [customRole, setCustomRole] = useState("")
  const [buildingRole, setBuildingRole] = useState("")

  const scan = async () => {
    // A scan is already on file (returning user / changing target): show it
    // instantly rather than re-billing an identical AI pass. "Rescan my CV"
    // on the findings screen covers a genuinely updated CV.
    if (findings) { setStage("findings"); return }
    await rescan()
  }

  const rescan = async () => {
    setStage("scanning")
    try {
      const data = await readJson<{ findings: CvFindings }>(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "scan-cv" }) }))
      setFindings(data.findings)
      setStage("findings")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read your CV.")
      setStage("intro")
    }
  }

  const toChooser = async () => {
    setStage("choosing")
    if (suggestions) return
    try {
      const data = await readJson<{ targets: TargetSuggestion[] }>(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "suggest-targets", intention: seedIntention }) }))
      setSuggestions(data.targets)
      loadChooserMarket(data.targets)
    } catch {
      setSuggestions([]) // chooser still works via the free-text field
    }
  }

  // Price the choice before it's made: salary band + live role count per
  // suggested target. Fire-and-forget — cards render immediately and the
  // market line fades in when (and only when) real data lands.
  const loadChooserMarket = async (targets: TargetSuggestion[]) => {
    try {
      const data = await readJson<{ enabled: boolean; summaries?: Record<string, { band: SalaryBand | null; totalRoles: number; topCompanies: string[] }> }>(
        await fetch("/api/career-path/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roles: targets.map((t) => t.role) }) })
      )
      if (data.enabled && data.summaries) setChooserMarket(data.summaries)
    } catch { /* market is garnish — never block the chooser */ }
  }

  const build = async (role: string) => {
    const r = role.trim()
    if (!r) { toast.error("Type or pick a role first."); return }
    setBuildingRole(r)
    setStage("building")
    try {
      const res = await readJson<{ enriching?: boolean }>(
        await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "set-target", role: r }) })
      )
      // The path exists now (skills + readiness) — show it immediately. The
      // learning plans behind each gap are generated by a second call; when it
      // lands we reload silently and the "no plan yet" items fill in.
      await onBuilt()
      if (res.enriching) {
        fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "enrich-plan" }) })
          .then((r2) => { if (r2.ok) return onBuilt() })
          .catch(() => { /* placeholders still render; enrichment can be retried on next visit */ })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't build your path.")
      setStage("choosing")
    }
  }

  if (stage === "intro") {
    return (
      <>
        <Breadcrumb step="A" />
        <main className="max-w-[1120px] mx-auto px-6 sm:px-12 py-16 pb-24">
          <div style={{ maxWidth: 720 }}>
            <div className="t-eyebrow" style={{ marginBottom: 14 }}>Step 1 · CV scan</div>
            <h1 className="t-display text-[32px] sm:text-[44px]" style={{ margin: "0 0 18px" }}>
              Let&apos;s see where you stand.
            </h1>
            <p className="t-lede" style={{ maxWidth: 620 }}>
              Tailr reads your CV as a career coach would &mdash; strengths first, honest gaps second &mdash; then helps
              you pick a North Star role and shows exactly what&apos;s between you and it. Everything traced
              to a line in your CV. Nothing invented.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-10">
            <button onClick={scan} className="ns-btn ns-btn-primary"><Sparkles className="w-4 h-4" />Scan my CV</button>
            {onCancel && <button onClick={onCancel} className="ns-btn ns-btn-ghost">Keep my current path</button>}
          </div>
          <p className="t-small" style={{ marginTop: 18 }}>
            No CV yet? <Link href="/career-path/first-cv" style={{ color: "var(--ns-coral)", fontWeight: 600 }}>Build one from projects, certificates and experience</Link> — you approve every fact.
          </p>
        </main>
      </>
    )
  }

  if (stage === "scanning") {
    return (
      <>
        <Breadcrumb step="A" />
        <div className="flex flex-col items-center justify-center gap-4 py-28">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--ns-ink-40)" }} />
          <p className="t-lede">Reading your CV the way a coach would&hellip;</p>
          <p className="t-small">No web research on this step. Just an honest read.</p>
        </div>
      </>
    )
  }

  if (stage === "findings" && findings) {
    return (
      <>
        <Breadcrumb step="A" />
        <main className="max-w-[1120px] mx-auto px-6 sm:px-12 py-10 pb-24">
          <div style={{ marginBottom: 40, maxWidth: 720 }}>
            <div className="t-eyebrow" style={{ marginBottom: 14 }}>Step 1 · CV scan</div>
            <h1 className="t-display text-[32px] sm:text-[44px]" style={{ margin: "0 0 18px" }}>What your CV actually shows.</h1>
            <p className="t-lede" style={{ maxWidth: 620 }}>{findings.headline}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <section>
              <div className="flex items-baseline justify-between" style={{ paddingBottom: 14, marginBottom: 22, borderBottom: "1px solid var(--ns-border)" }}>
                <h2 className="t-title" style={{ fontSize: 24, margin: 0 }}>Strengths<span style={{ color: "var(--ns-coral)" }}>.</span></h2>
                <span className="t-mono">{String(findings.strengths.length).padStart(2, "0")}</span>
              </div>
              <div className="flex flex-col" style={{ gap: 22 }}>
                {findings.strengths.map((f, i) => (
                  <div key={i} className="ns-reveal" style={{ "--ns-i": i } as React.CSSProperties}>
                    <div className="flex items-start" style={{ gap: 12, marginBottom: 10 }}>
                      <span style={{ marginTop: 7, width: 8, height: 8, borderRadius: "50%", background: "var(--ns-coral)", flexShrink: 0 }} />
                      <h3 style={{ fontSize: 15.5, fontWeight: 500, margin: 0, lineHeight: 1.35 }}>{f.label}</h3>
                    </div>
                    <div style={{ paddingLeft: 18, borderLeft: "1px solid var(--ns-tint-2)", marginLeft: 3 }}>
                      <p className="t-quote" style={{ margin: 0 }}>{f.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-baseline justify-between" style={{ paddingBottom: 14, marginBottom: 22, borderBottom: "1px solid var(--ns-border)" }}>
                <h2 className="t-title" style={{ fontSize: 24, margin: 0 }}>Development gaps<span style={{ color: "var(--ns-coral)" }}>.</span></h2>
                <span className="t-mono">{String(findings.gaps.length).padStart(2, "0")}</span>
              </div>
              <div className="flex flex-col" style={{ gap: 22 }}>
                {findings.gaps.map((g, i) => (
                  <div key={i} className="ns-reveal" style={{ "--ns-i": findings.strengths.length + i } as React.CSSProperties}>
                    <div className="flex items-start" style={{ gap: 12, marginBottom: 10 }}>
                      {/* Hollow coral ring: same hue as a strength's filled dot, so the
                          pair reads as one system — closed vs still open — rather than
                          a live marker next to a greyed-out one. (27 Jul sync: missing
                          skills read in the brand red, not faded.) */}
                      <span style={{ marginTop: 7, width: 8, height: 8, borderRadius: "50%", background: "transparent", border: "1.5px solid var(--ns-coral)", flexShrink: 0 }} />
                      <h3 style={{ fontSize: 15.5, fontWeight: 500, margin: 0, lineHeight: 1.35 }}>{g.label}</h3>
                    </div>
                    <div style={{ paddingLeft: 18, borderLeft: "1px dashed var(--ns-ink-15)", marginLeft: 3 }}>
                      <p className="t-body" style={{ color: "var(--ns-ink-70)", margin: 0 }}>{g.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" style={{ marginTop: 56, paddingTop: 28, borderTop: "1px solid var(--ns-border)" }}>
            <p className="t-small" style={{ maxWidth: 460, margin: 0 }}>No web research on this step. Just an honest read of what&apos;s already on your CV.</p>
            <div className="flex gap-3 items-center flex-wrap">
              <button onClick={rescan} className="ns-btn ns-btn-ghost" style={{ fontSize: 12.5 }}>Rescan my CV</button>
              {onCancel && <button onClick={onCancel} className="ns-btn ns-btn-secondary">Keep my current path</button>}
              <button onClick={toChooser} className="ns-btn ns-btn-primary">Suggest target roles <ArrowRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </main>
      </>
    )
  }

  if (stage === "choosing") {
    return (
      <>
        <Breadcrumb step="B" />
        <main className="max-w-[1120px] mx-auto px-6 sm:px-12 py-10 pb-24">
          <div style={{ marginBottom: 40, maxWidth: 720 }}>
            <div className="t-eyebrow" style={{ marginBottom: 14 }}>Step 2 · Choose your North Star</div>
            <h1 className="t-display text-[32px] sm:text-[44px]" style={{ margin: "0 0 18px" }}>Where you could realistically be in 1&ndash;2 years.</h1>
            <p className="t-lede" style={{ maxWidth: 620 }}>Targets grounded in what your CV already shows, best fit first. Not sure? You can search for your own role instead.</p>
          </div>

          {suggestions === null ? (
            <div className="flex items-center gap-3 py-8" style={{ color: "var(--ns-ink-55)" }}>
              <Loader2 className="w-4 h-4 animate-spin" /><span className="t-body">Finding roles that fit your CV&hellip;</span>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 14, marginBottom: 24 }}>
              {suggestions.map((t, i) => (
                <button key={i} onClick={() => build(t.role)} className="ns-card ns-rise text-left"
                  style={{ "--ns-i": i, padding: "22px 26px", background: "var(--ns-paper)", border: i === 0 ? "1.5px solid var(--ns-coral)" : "1px solid var(--ns-border)", borderRadius: 14 } as React.CSSProperties}>
                  <div className="flex items-start justify-between gap-6">
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="t-title" style={{ fontSize: 20 }}>{t.role}</span>
                        {i === 0 && <span className="t-eyebrow" style={{ fontSize: 10, padding: "3px 8px", background: "var(--ns-tint-1)", border: "1px solid var(--ns-tint-2)", borderRadius: 6 }}>Best fit</span>}
                      </div>
                      <p className="t-body" style={{ color: "var(--ns-ink-70)", margin: "8px 0 0", maxWidth: 560 }}>{t.whyYou}</p>
                      {(() => {
                        const m = chooserMarket[t.role]
                        if (!m) return null
                        const parts: string[] = []
                        if (m.band) parts.push(`${gbp(m.band.p25)}–${gbp(m.band.p75)} · median ${gbp(m.band.median)}`)
                        // Who's hiring beats how many: named employers are a door,
                        // a raw count on a niche title reads thin. The +N is open
                        // ROLES beyond the named employers' two, kept explicit so
                        // it can't be misread as N more companies.
                        if (m.topCompanies.length > 0) {
                          const named = m.topCompanies.slice(0, 2).join(", ")
                          const extra = m.totalRoles - 2
                          parts.push(`${named}${extra > 0 ? ` +${extra} open roles` : " hiring now"}`)
                        }
                        if (parts.length === 0) return null
                        return (
                          <p className="t-mono animate-fade-in-up" style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--ns-coral-deep)" }}>
                            {parts.join(" · ")}
                          </p>
                        )
                      })()}
                    </div>
                    {typeof t.fit === "number" && (
                      <div style={{ flexShrink: 0, textAlign: "right", minWidth: 84 }}>
                        <div className="t-mono" style={{ fontSize: 10, letterSpacing: "0.08em", marginBottom: 2 }}>CV FIT</div>
                        <div className="t-display" style={{ fontSize: 30, color: i === 0 ? "var(--ns-coral)" : "var(--ns-ink)" }}>{t.fit}<span style={{ fontSize: 14 }}>%</span></div>
                        <div style={{ marginTop: 6, height: 3, background: "var(--ns-ink-08)", borderRadius: 2 }}>
                          <div style={{ width: `${t.fit}%`, height: "100%", background: "var(--ns-coral)", borderRadius: 2 }} />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 8, paddingTop: 24, borderTop: "1px dashed var(--ns-border-strong)" }}>
            <div className="t-eyebrow" style={{ marginBottom: 12 }}>Or search your own</div>
            <div className="flex gap-3 max-w-md">
              <input value={customRole} onChange={(e) => setCustomRole(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") build(customRole) }}
                placeholder="e.g. Product Manager, Data Engineer&hellip;"
                className="flex-1 outline-none t-body"
                style={{ padding: "12px 16px", background: "var(--ns-paper)", border: "1px solid var(--ns-border)", borderRadius: 999 }} />
              <button onClick={() => build(customRole)} className="ns-btn ns-btn-primary">Go</button>
            </div>
            {onCancel && <p style={{ marginTop: 20 }}><button onClick={onCancel} className="ns-btn ns-btn-ghost" style={{ padding: 0 }}>Keep my current path</button></p>}
          </div>
        </main>
      </>
    )
  }

  // building — Step 3, researching the locked target
  return (
    <>
      <Breadcrumb step="C" />
      <main className="max-w-[1120px] mx-auto px-6 sm:px-12 py-10 pb-24">
        <div className="t-eyebrow" style={{ marginBottom: 14 }}>Step 3 · Your North Star</div>
        <h1 className="t-display text-[30px] sm:text-[40px]" style={{ margin: "0 0 18px", maxWidth: 720 }}>
          Researching what {buildingRole} roles actually ask for.
        </h1>
        <p className="t-lede" style={{ maxWidth: 560 }}>
          Tailr is reading live job postings, judging every requirement against your CV, and finding free
          UK resources for each gap. Takes a minute or two.
        </p>
        <div className="flex items-center gap-3 mt-10" style={{ color: "var(--ns-ink-55)" }}>
          <Loader2 className="w-5 h-5 animate-spin" /><span className="t-mono">researching &middot; live market data</span>
        </div>
      </main>
    </>
  )
}

/**
 * Core vs Upskill as one skills area with two views.
 *
 * Concept B (Ose, 28 Jul): the earlier design put Upskill in a tinted panel
 * below the skill map, which read as bolted on. A segmented control does the
 * separating instead, so neither list needs its own chrome. The open count
 * lives in the Upskill tab so the section is discoverable without being
 * clicked — the one real weakness of a tabbed layout.
 */
function SkillsSwitch({ upskill, upskillCount, coreCount, onChanged, renderCore }: {
  upskill: UpskillItem[]
  upskillCount: number
  coreCount: number
  onChanged: () => void
  renderCore: () => React.ReactNode
}) {
  const [view, setView] = useState<"core" | "upskill">("core")
  const tabs: { key: "core" | "upskill"; label: string; count: number }[] = [
    { key: "core", label: "North Star", count: coreCount },
    { key: "upskill", label: "Upskill", count: upskill.length },
  ]

  return (
    <section style={{ marginTop: 48 }}>
      <div className="flex items-baseline justify-between flex-wrap gap-3" style={{ paddingBottom: 14, borderBottom: "1px solid var(--ns-border)" }}>
        <h2 className="t-title" style={{ fontSize: 24, margin: 0 }}>Your skills<span style={{ color: "var(--ns-coral)" }}>.</span></h2>
        <span className="t-mono">
          {view === "core" ? `${coreCount} skills researched` : `${upskillCount} open`}
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Skill view"
        className="inline-flex"
        style={{
          marginTop: 20, padding: 3, borderRadius: 999,
          background: "var(--ns-paper)", border: "1px solid var(--ns-border)",
        }}
      >
        {tabs.map((t) => {
          const active = view === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setView(t.key)}
              className="transition-colors"
              style={{
                padding: "8px 18px", borderRadius: 999, fontSize: 12.5, fontWeight: 500,
                background: active ? "var(--ns-ink)" : "transparent",
                color: active ? "var(--ns-cream)" : "var(--ns-ink-55)",
                cursor: "pointer",
              }}
            >
              {t.label} · {String(t.count).padStart(2, "0")}
            </button>
          )
        })}
      </div>

      {view === "core"
        ? renderCore()
        : (
          <>
            <p className="t-small" style={{ margin: "16px 0 0", maxWidth: 620 }}>
              Skills individual jobs asked for. These never move your North Star readiness —
              close one and it counts toward that job, not the role you&rsquo;re aiming at.
            </p>
            <UpskillSection items={upskill} onChanged={onChanged} bare />
          </>
        )}
    </section>
  )
}

function SkillSet({ targetSkills, haveList, missing, items, onOpenSkill, onAddSkill, addingSkill }: {
  targetSkills: TargetSkill[]
  haveList: string[]
  missing: string[]
  items: CareerRoadmapItem[]
  onOpenSkill: (skill: string) => void
  onAddSkill: (skill: string) => void
  addingSkill: string | null
}) {
  const have = targetSkills.length > 0 ? targetSkills.filter((t) => t.have).map((t) => t.skill) : haveList
  const miss = targetSkills.length > 0 ? targetSkills.filter((t) => !t.have).map((t) => t.skill) : missing
  const core = new Set(targetSkills.filter((t) => t.importance === "core").map((t) => t.skill))
  if (have.length + miss.length === 0) return null
  const planFor = (skill: string) => items.find((it) => it.skill.toLowerCase() === skill.toLowerCase())

  return (
    <div>
      <div style={{ marginTop: 4 }}>
        <div className="flex items-baseline gap-3" style={{ marginBottom: 12 }}>
          {/* 27 Jul sync: MISSING is the coral one — the gap is what asks for
              attention, not the things already in hand. */}
          <span className="t-title" style={{ fontSize: 18 }}>Have</span>
          <span className="t-mono">{String(have.length).padStart(2, "0")}</span>
          <span style={{ flex: 1, height: 1, background: "var(--ns-border)" }} />
        </div>
        <div className="flex flex-wrap" style={{ gap: 10 }}>
          {have.map((sk, i) => (
            <span key={i} className="ns-chip ns-chip-have"><Check className="w-3 h-3" strokeWidth={2.5} />{sk}</span>
          ))}
        </div>
      </div>

      {miss.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="flex items-baseline gap-3" style={{ marginBottom: 6 }}>
            <span className="t-title" style={{ fontSize: 18, color: "var(--ns-coral-deep)" }}>Missing</span>
            <span className="t-mono">{String(miss.length).padStart(2, "0")}</span>
            <span style={{ flex: 1, height: 1, background: "var(--ns-border)" }} />
          </div>
          <p className="t-small" style={{ margin: "0 0 12px" }}>Every one of these is closeable — click a skill to see its plan, or to build one with free resources.</p>
          {/* A skill with no plan behind it renders identically to one that has
              a full plan, which made an empty path look like a broken page.
              Name the state instead. */}
          {miss.every((sk) => !planFor(sk)) && (
            <p className="t-small" style={{ margin: "0 0 12px", color: "var(--ns-coral-deep)" }}>
              No plans built yet. Click any skill and Tailr will find free, practical
              resources and a project to prove it.
            </p>
          )}
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            {miss.map((sk, i) => {
              const plan = planFor(sk)
              const isAdding = addingSkill === sk
              return (
                <button key={i} disabled={isAdding}
                  onClick={() => (plan ? onOpenSkill(plan.skill) : onAddSkill(sk))}
                  className="ns-chip ns-chip-missing ns-chip-action"
                  title={plan ? "Open the plan for this skill" : "Build a plan with free resources"}>
                  {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : plan ? <ArrowRight className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {sk}
                  {core.has(sk) && <span className="t-mono" style={{ fontSize: 9.5, color: "var(--ns-coral-deep)", letterSpacing: "0.08em" }}>CORE</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Modal({ icon: Icon, title, subtitle, children, onClose }: { icon: typeof PartyPopper; title: string; subtitle: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(30,24,19,0.5)" }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_16px_48px_rgba(30,24,19,0.3)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#fff7f4", color: ACCENT }}><Icon className="w-4 h-4" /></div>
            <div>
              <h3 className="text-[16px] font-bold text-[#1e1813]">{title}</h3>
              <p className="text-[12px] text-gray-400">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 rounded text-gray-300 hover:text-gray-500 hover:bg-black/5 transition-colors" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * The payoff the whole product exists for. Not a toast — a full-screen replay
 * of what they actually did: the rungs reached, the skills closed, the work
 * verified. This is the screen people screenshot.
 */
function ArcCelebration({ role, items, milestones, onClose, onNext }: {
  role: string
  items: CareerRoadmapItem[]
  milestones: Milestone[]
  onClose: () => void
  onNext: () => void
}) {
  const closed = items.filter((i) => i.status === "done")
  const verified = items.filter((i) => i.evidence?.verdict === "pass")
  const from = milestones.length > 0 ? milestones[0].role : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const stats = [
    { value: String(closed.length), label: closed.length === 1 ? "skill closed" : "skills closed" },
    ...(verified.length > 0 ? [{ value: String(verified.length), label: "verified with evidence" }] : []),
    ...(milestones.length > 0 ? [{ value: String(milestones.length + 1), label: "roles on your arc" }] : []),
  ]

  return (
    <div className="ns ns-celebrate" role="dialog" aria-modal="true" aria-label={`You got the job: ${role}`}>
      <div className="ns-celebrate-inner" style={{ maxWidth: 620, width: "100%", textAlign: "center" }}>
        <div className="t-eyebrow" style={{ marginBottom: 16 }}>You got the job</div>
        <h1 className="t-display text-[38px] sm:text-[56px]" style={{ margin: "0 0 18px" }}>{role}.</h1>
        <p className="t-lede" style={{ maxWidth: 460, margin: "0 auto" }}>
          {from
            ? <>You started this arc as {from}. You finish it here — and none of it was luck.</>
            : <>You set the target, closed the gaps, and proved the work. None of it was luck.</>}
        </p>

        <div className="flex flex-wrap justify-center" style={{ gap: 40, margin: "40px 0" }}>
          {stats.map((st, i) => (
            <div key={st.label} className="ns-stat-rise" style={{ "--ns-i": i } as React.CSSProperties}>
              <div className="t-display" style={{ fontSize: 44, color: "var(--ns-coral)" }}>{st.value}</div>
              <div className="t-small" style={{ marginTop: 4 }}>{st.label}</div>
            </div>
          ))}
        </div>

        {closed.length > 0 && (
          <div className="ns-stat-rise" style={{ "--ns-i": stats.length, marginBottom: 36 } as React.CSSProperties}>
            <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 12 }}>What you closed to get here</div>
            <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
              {closed.map((i) => (
                <span key={i.skill} className="ns-chip ns-chip-have">
                  <Check className="w-3 h-3" strokeWidth={2.5} />{i.skill}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center" style={{ gap: 12 }}>
          <button onClick={onNext} className="ns-btn ns-btn-primary">Set my next North Star <ArrowRight className="w-4 h-4" /></button>
          <button onClick={onClose} className="ns-btn ns-btn-secondary">Just enjoy this for now</button>
        </div>
      </div>
    </div>
  )
}

function GotJobModal({ currentTarget, onClose, onDone }: { currentTarget: string; onClose: () => void; onDone: (role: string) => void }) {
  const [role, setRole] = useState(currentTarget)
  const [next, setNext] = useState("")
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (!role.trim()) { toast.error("Which role did you land?"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "got-job", role, nextTarget: next }) })
      await readJson(res)
      onDone(role.trim())
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to update."); setLoading(false) }
  }
  return (
    <Modal icon={PartyPopper} title="You got the job" subtitle="We'll mark the rung reached and set what's next" onClose={onClose}>
      <label className="block text-[13px] font-semibold text-[#1e1813] mb-1.5">Which role did you land?</label>
      <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Data Analyst" className="w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15" />
      <label className="block text-[13px] font-semibold text-[#1e1813] mb-1.5 mt-4">Where next? <span className="font-normal text-gray-400">(optional)</span></label>
      <input value={next} onChange={(e) => setNext(e.target.value)} placeholder="Your next target role" className="w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15" />
      <button onClick={submit} disabled={loading} className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3 text-[14px] font-semibold text-white rounded-xl transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60" style={{ background: ACCENT }}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Mark it reached <PartyPopper className="w-4 h-4" /></>}
      </button>
    </Modal>
  )
}

function AddProjectModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (!text.trim()) { toast.error("Describe the project first."); return }
    setLoading(true)
    try {
      const res = await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "add-project", text }) })
      await readJson(res)
      toast.success("Project added to your Career Arc.")
      onDone()
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to add project."); setLoading(false) }
  }
  return (
    <Modal icon={FolderPlus} title="Add a project" subtitle="From your current work — it joins your Arc" onClose={onClose}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Describe something you built or delivered — what it was, what you did, any real numbers…" className="w-full px-3.5 py-2.5 text-[13.5px] border border-gray-200 rounded-lg outline-none focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300" />
      <p className="mt-1.5 text-[12px] text-gray-400">Tailr tidies it into a CV-ready entry. It won&apos;t invent anything you don&apos;t say.</p>
      <button onClick={submit} disabled={loading} className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3 text-[14px] font-semibold text-white rounded-xl transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60" style={{ background: ACCENT }}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Add to my Arc <FolderPlus className="w-4 h-4" /></>}
      </button>
    </Modal>
  )
}

function AddSkillsForJdModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [jd, setJd] = useState("")
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (!jd.trim()) { toast.error("Paste the job description first."); return }
    setLoading(true)
    try {
      const res = await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "add-skill-for-jd", jobDescription: jd }) })
      const data = await readJson<{ added: number; message?: string }>(res)
      if (data.added > 0) toast.success(`Added ${data.added} skill${data.added === 1 ? "" : "s"} to your path.`)
      else toast.info(data.message || "Your path already covers this job.")
      onDone()
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to read the job."); setLoading(false) }
  }
  return (
    <Modal icon={FileSearch} title="Add skills for a job" subtitle="Paste a JD — we add what you're missing" onClose={onClose}>
      <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={6} placeholder="Paste the full job description…" className="w-full px-3.5 py-2.5 text-[13.5px] border border-gray-200 rounded-lg outline-none focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300" />
      <p className="mt-1.5 text-[12px] text-gray-400">We read its requirements, skip what you already have, and add the rest with resources.</p>
      <button onClick={submit} disabled={loading} className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3 text-[14px] font-semibold text-white rounded-xl transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60" style={{ background: ACCENT }}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Reading the job…</> : <>Add the gaps <Plus className="w-4 h-4" /></>}
      </button>
    </Modal>
  )
}

function IntentionLine({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(value) }, [value])
  const save = async () => { setSaving(true); try { await onSave(draft.trim()) ; setEditing(false) } finally { setSaving(false) } }

  if (editing) {
    return (
      <div className="mb-6 rounded-xl border border-[#f5d9d0] bg-[#fffaf8] p-3.5">
        <label className="block text-[11px] font-semibold text-[#1e1813] mb-1.5">What are you trying to accomplish?</label>
        <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
          placeholder="e.g. move from delivery consulting into AI product leadership within 18 months"
          className="w-full text-[13px] px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300" />
        <div className="mt-2 flex gap-2">
          <button onClick={save} disabled={saving} className="text-[12px] font-semibold text-white rounded-lg px-3 py-1.5" style={{ background: ACCENT }}>{saving ? "Saving…" : "Save goal"}</button>
          <button onClick={() => { setDraft(value); setEditing(false) }} className="text-[12px] text-gray-500 px-2 py-1.5">Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <button onClick={() => setEditing(true)} className="mb-6 w-full text-left rounded-xl border border-dashed border-[#e5ddd2] hover:border-[#f5c9bb] px-3.5 py-2.5 transition-colors group">
      {value ? (
        <p className="text-[13px] text-[#1e1813]"><span className="text-gray-400">Aiming to </span>{value} <span className="text-[11px] text-gray-300 group-hover:text-[#dc4f33]">· edit</span></p>
      ) : (
        <p className="text-[13px] text-gray-400 group-hover:text-[#dc4f33]">+ Add your goal — what are you working towards? It steers what the path recommends.</p>
      )}
    </button>
  )
}

function LivingPath({ data, reload, onChangeTarget }: { data: PathData; reload: () => Promise<void>; onChangeTarget: () => void }) {
  const roadmap = data.roadmap!
  const [updating, setUpdating] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [modal, setModal] = useState<null | "gotjob" | "project" | "skills">(null)

  const cycleStatus = useCallback(async (item: CareerRoadmapItem) => {
    const nextStatus = STATUS_CYCLE[item.status]
    setUpdating(item.skill)
    try {
      const res = await fetch("/api/career-path", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill: item.skill, status: nextStatus }) })
      await readJson(res)
      await reload()
      if (nextStatus === "done") toast.success(`Nice — ${item.skill} done. Your readiness just moved.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.")
    } finally {
      setUpdating(null)
    }
  }, [reload])

  const [celebration, setCelebration] = useState<{ role: string } | null>(null)
  const [market, setMarket] = useState<MarketSnapshot | null>(null)
  useEffect(() => {
    // Flagged-off by default: the endpoint answers { enabled: false } and we
    // render nothing, so the path behaves exactly as it does without the key.
    let cancelled = false
    fetch("/api/career-path/market")
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.enabled && d?.snapshot) setMarket(d.snapshot) })
      .catch(() => { /* market insight is never load-bearing */ })
    return () => { cancelled = true }
  }, [])

  const [addingSkill, setAddingSkill] = useState<string | null>(null)
  const addSkill = useCallback(async (skill: string) => {
    setAddingSkill(skill)
    try {
      await readJson(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "add-skill", skill }) }))
      await reload()
      setSelected(skill)
      toast.success(`${skill} added to your path with free resources.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't build a plan for that skill.")
    } finally {
      setAddingSkill(null)
    }
  }, [reload])

  const removeSkill = useCallback(async (item: CareerRoadmapItem) => {
    try {
      await readJson(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "remove-skill", skill: item.skill }) }))
      toast.success(`Removed ${item.skill} from your path.`)
      setSelected(null)
      await reload()
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to remove.") }
  }, [reload])

  const gapBySkill = new Map(data.rankedGaps.map((g) => [g.skill.toLowerCase(), g]))
  const target = roadmap.target_role?.trim() || data.derivedTarget || "your target"
  const active = roadmap.items.filter((i) => i.status === "in_progress")
  const queued = roadmap.items.filter((i) => i.status === "todo")
    .sort((a, b) => (gapBySkill.get(b.skill.toLowerCase())?.unlockCount ?? 0) - (gapBySkill.get(a.skill.toLowerCase())?.unlockCount ?? 0))
  const done = roadmap.items.filter((i) => i.status === "done")
  const pct = data.readiness.pct
  // A readiness gain is the moment the user worked weeks for — show it moving.
  const shownPct = useAnimatedNumber(pct)
  const prevPctRef = useRef<number | null>(null)
  const [gain, setGain] = useState<number | null>(null)
  useEffect(() => {
    const prev = prevPctRef.current
    prevPctRef.current = pct
    if (prev !== null && pct > prev) {
      setGain(pct - prev)
      const t = setTimeout(() => setGain(null), 2800)
      return () => clearTimeout(t)
    }
  }, [pct])

  // Agenda rows: This week (active) → Next (first two queued) → Later (rest)
  const agenda: Array<{ item: CareerRoadmapItem; when: string; kind: "active" | "queued" | "later" }> = [
    ...active.map((item) => ({ item, when: "This week", kind: "active" as const })),
    ...queued.slice(0, 2).map((item) => ({ item, when: "Next", kind: "queued" as const })),
    ...queued.slice(2).map((item) => ({ item, when: "Later", kind: "later" as const })),
  ]

  return (
    <>
      <main className="max-w-[1120px] mx-auto px-6 sm:px-12 py-10 pb-24">
        {/* Header — North Star pinned */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between" style={{ gap: 40, marginBottom: 48 }}>
          <div style={{ maxWidth: 640 }}>
            <div className="t-eyebrow" style={{ marginBottom: 14 }}>Your path</div>
            <h1 className="t-display text-[32px] sm:text-[44px]" style={{ margin: "0 0 14px" }}>
              Stitching toward {target}.
            </h1>
            <p className="t-lede" style={{ maxWidth: 560, margin: 0 }}>
              {active.length > 0
                ? `${active.length === 1 ? "One skill" : `${active.length} skills`} in progress. The thread grows as you close each one — and lifts your next tailor automatically.`
                : queued.length > 0
                  ? "Start a skill below — the thread grows as you close each one, and lifts your next tailor automatically."
                  : "Every skill on this path is closed. Time to raise the target?"}
            </p>
            <IntentionLine value={roadmap.intention} onSave={async (v) => {
              await readJson(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "set-intention", intention: v }) }))
              await reload()
            }} />
          </div>

          {/* North Star pin */}
          <div style={{ padding: "18px 22px", background: "var(--ns-paper)", border: "1px solid var(--ns-border)", borderRadius: 12, minWidth: 280 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <Flag className="w-3 h-3" style={{ color: "var(--ns-coral-deep)" }} />
              <span className="t-mono" style={{ fontSize: 10.5, color: "var(--ns-coral-deep)", letterSpacing: "0.08em" }}>NORTH STAR</span>
            </div>
            <p className="t-title" style={{ fontSize: 22, margin: "0 0 12px" }}>{target}</p>
            <div className="flex justify-between items-baseline">
              <span className="t-small">Role readiness now</span>
              <span className="t-mono" style={{ color: "var(--ns-coral-deep)" }}>
                {gain !== null && <span className="ns-delta t-mono" style={{ fontSize: 12, marginRight: 6 }}>+{gain}%</span>}
                <span style={{ fontSize: 15 }}>{shownPct}%</span>{data.readiness.total > 0 ? ` · ${data.readiness.have}/${data.readiness.total}` : ""}
              </span>
            </div>
            <div style={{ marginTop: 10, borderRadius: 8 }} className={gain !== null ? "ns-pulse" : undefined}>
              <ThreadMeter key={pct} pct={pct} />
            </div>
            {(() => {
              const open = roadmap.items.filter((i) => i.status !== "done").length
              const f = forecastReadyDate(open, roadmap.hours_per_week)
              const stitch = daysSinceLastStitch(roadmap.items)
              return (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--ns-border)" }}>
                  {f.readyByLabel && (
                    <p className="t-body" style={{ margin: 0 }}>
                      At{" "}
                      <select
                        value={roadmap.hours_per_week ?? 3}
                        onChange={async (e) => {
                          try {
                            await readJson(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "set-pace", hoursPerWeek: Number(e.target.value) }) }))
                            await reload()
                          } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't update your pace.") }
                        }}
                        aria-label="Hours per week"
                        style={{ font: "inherit", fontWeight: 600, color: "var(--ns-coral-deep)", background: "transparent", border: "none", borderBottom: "1px dashed var(--ns-ink-40)", cursor: "pointer", padding: "0 2px" }}>
                        {[1, 2, 3, 5, 8, 10].map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>{" "}
                      hrs/week · on course for <strong>{f.readyByLabel}</strong>
                    </p>
                  )}
                  {stitch !== null && (
                    <p className="t-mono" style={{ margin: "6px 0 0" }}>last stitch · {stitch === 0 ? "today" : stitch === 1 ? "yesterday" : `${stitch} days ago`}</p>
                  )}
                  <p className="t-small" style={{ margin: "6px 0 0", fontSize: 11 }}>A forecast, not a deadline — it shifts with your pace.</p>
                </div>
              )
            })()}
            {market && (market.band || market.totalRoles > 0) && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--ns-border)" }}>
                <div className="t-eyebrow" style={{ fontSize: 9.5, marginBottom: 6 }}>Live UK market</div>
                {market.band && (
                  <p className="t-body" style={{ margin: 0 }}>
                    <strong>{gbp(market.band.p25)}–{gbp(market.band.p75)}</strong>
                    <span className="t-small"> typical · median {gbp(market.band.median)}</span>
                  </p>
                )}
                {market.totalRoles > 0 && (
                  <p className="t-mono" style={{ margin: "4px 0 0" }}>{market.totalRoles.toLocaleString()} live roles</p>
                )}
                {market.topCompanies.length > 0 && (
                  <p className="t-small" style={{ margin: "4px 0 0", fontSize: 11.5 }}>Hiring now: {market.topCompanies.join(", ")}</p>
                )}
              </div>
            )}
            <button onClick={onChangeTarget} className="ns-btn ns-btn-ghost" style={{ padding: "10px 0 0", fontSize: 12.5 }}>Change North Star</button>
          </div>
        </div>

        {/* Agenda with vertical thread */}
        {agenda.length > 0 && (
          <div>
            {agenda.map((row, i) => {
              const isFirstOfGroup = i === 0 || agenda[i - 1].when !== row.when
              const isLast = i === agenda.length - 1
              const gap = gapBySkill.get(row.item.skill.toLowerCase())
              return (
                <div key={row.item.skill} className="ns-rise" style={{ "--ns-i": i } as React.CSSProperties}>
                  {isFirstOfGroup && <div className="t-eyebrow" style={{ margin: "8px 0 12px", paddingLeft: 48 }}>{row.when}</div>}
                  <div className="grid" style={{ gridTemplateColumns: "48px 1fr", opacity: row.kind === "later" ? 0.75 : 1 }}>
                    {/* Thread column */}
                    <div style={{ position: "relative", minHeight: 96 }}>
                      <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 1, borderLeft: row.kind === "later" ? "1px dashed var(--ns-ink-15)" : "1px solid var(--ns-ink-15)" }} />
                      <div style={{
                        position: "absolute", left: 8, top: 22, width: 16, height: 16, borderRadius: "50%",
                        background: row.kind === "active" ? "var(--ns-coral)" : "var(--ns-cream)",
                        border: row.kind === "active" ? "1.5px solid var(--ns-coral)" : row.kind === "queued" ? "1px solid var(--ns-ink-40)" : "1px dashed var(--ns-ink-40)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {row.kind === "active" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ns-paper)" }} />}
                      </div>
                    </div>
                    {/* Content */}
                    <div style={{ padding: "18px 0 26px", borderBottom: isLast ? "none" : "1px solid var(--ns-border)" }}>
                      <div className="flex items-baseline justify-between" style={{ gap: 20 }}>
                        <div style={{ flex: 1 }}>
                          <div className="flex items-center flex-wrap" style={{ gap: 10, marginBottom: 6 }}>
                            <h3 style={{ fontSize: 17, fontWeight: 500, margin: 0, lineHeight: 1.3 }}>{row.item.skill}</h3>
                            {row.kind === "active" && (
                              <span className="t-mono" style={{ fontSize: 10, color: "var(--ns-coral-deep)", padding: "2px 7px", background: "var(--ns-tint-1)", border: "1px solid var(--ns-tint-2)", borderRadius: 4, letterSpacing: "0.08em" }}>IN PROGRESS</span>
                            )}
                            {gap && gap.unlockCount > 0 && (
                              <span className="t-mono" style={{ fontSize: 10 }} title={gap.sourceJobs.join(", ")}>unlocks {gap.unlockCount} saved job{gap.unlockCount === 1 ? "" : "s"}</span>
                            )}
                            {(() => {
                              const u = market?.unlocks.find((x) => x.skill === row.item.skill)
                              return u ? (
                                <span className="t-mono" style={{ fontSize: 10, color: "var(--ns-coral-deep)" }}>opens {u.roles} live role{u.roles === 1 ? "" : "s"}</span>
                              ) : null
                            })()}
                          </div>
                          <p className="t-body" style={{ color: "var(--ns-ink-70)", margin: "0 0 12px", maxWidth: 620 }}>{row.item.whyItMatters}</p>
                          {row.item.resources?.length > 0 && (
                            <span className="t-mono">{row.item.resources[0].source} · {row.item.resources.length} resource{row.item.resources.length === 1 ? "" : "s"}</span>
                          )}
                        </div>
                        <div style={{ paddingTop: 4, flexShrink: 0 }}>
                          {row.kind === "active" ? (
                            <button onClick={() => setSelected(row.item.skill)} className="ns-btn ns-btn-secondary" style={{ padding: "10px 16px", fontSize: 13 }}>Resume <ArrowRight className="w-3 h-3" /></button>
                          ) : (
                            <button onClick={() => setSelected(row.item.skill)} className="ns-btn ns-btn-ghost" style={{ padding: "10px 12px", fontSize: 13, color: "var(--ns-ink-55)" }}>Preview</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Closed skills */}
        {done.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="t-eyebrow" style={{ marginBottom: 12 }}>Closed · {done.length}</div>
            <div className="flex flex-wrap" style={{ gap: 10 }}>
              {done.map((item) => (
                <button key={item.skill} onClick={() => setSelected(item.skill)} className="ns-chip ns-chip-have">
                  <Check className="w-3 h-3" strokeWidth={2.5} />{item.skill}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Your proof — evidence that passed review. Pride you can point at. */}
        {(() => {
          const proven = roadmap.items.filter((i) => i.evidence?.verdict === "pass")
          if (proven.length === 0) return null
          return (
            <section style={{ marginTop: 48 }}>
              <div className="flex items-baseline justify-between" style={{ paddingBottom: 14, borderBottom: "1px solid var(--ns-border)" }}>
                <h2 className="t-title" style={{ fontSize: 24, margin: 0 }}>Your proof<span style={{ color: "var(--ns-coral)" }}>.</span></h2>
                <span className="t-mono">{proven.length} verified</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12, marginTop: 20 }}>
                {proven.map((item, i) => (
                  <div key={item.skill} className="ns-rise" style={{ "--ns-i": i, padding: "16px 18px", background: "var(--ns-paper)", border: "1px solid var(--ns-tint-2)", borderRadius: 12 } as React.CSSProperties}>
                    <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                      <Check className="w-3.5 h-3.5" style={{ color: "var(--ns-coral-deep)" }} strokeWidth={2.5} />
                      <span className="t-body" style={{ fontWeight: 600 }}>{item.skill}</span>
                    </div>
                    {item.evidence?.note && <p className="t-small" style={{ margin: "0 0 8px" }}>{item.evidence.note}</p>}
                    <p className="t-body" style={{ margin: 0, color: "var(--ns-ink-70)" }}>{item.cvPhrasing}</p>
                    <button onClick={() => { navigator.clipboard.writeText(item.cvPhrasing); toast.success("CV bullet copied.") }}
                      className="t-mono" style={{ marginTop: 10, color: "var(--ns-coral-deep)" }}>copy CV bullet</button>
                  </div>
                ))}
              </div>
            </section>
          )
        })()}

        {/* One skills area, two views. The segmented switch is the whole
            separating device — the previous tinted panel below the map read as
            bolted on. North Star is the default view; Upskill announces its
            count in the tab so it can't be missed. */}
        <SkillsSwitch
          upskill={data.upskillItems ?? []}
          upskillCount={(data.upskillItems ?? []).filter((i) => i.status !== "done").length}
          coreCount={(roadmap.target_skills ?? []).length}
          onChanged={() => { void reload() }}
          renderCore={() => (
            <SkillSet targetSkills={roadmap.target_skills ?? []} haveList={data.readiness.haveList ?? []} missing={data.readiness.missing} items={roadmap.items} onOpenSkill={(sk) => setSelected(sk)} onAddSkill={addSkill} addingSkill={addingSkill} />
          )}
        />

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" style={{ marginTop: 56, paddingTop: 28, borderTop: "1px solid var(--ns-border)" }}>
          <p className="t-small" style={{ margin: 0, maxWidth: 480 }}>Close a skill and its CV bullet flows back into your next tailor automatically.</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setModal("gotjob")} className="ns-btn ns-btn-secondary"><PartyPopper className="w-4 h-4" />I got the job</button>
            <button onClick={() => setModal("project")} className="ns-btn ns-btn-secondary"><FolderPlus className="w-4 h-4" />Add a project</button>
            <button onClick={() => setModal("skills")} className="ns-btn ns-btn-primary"><FileSearch className="w-4 h-4" />Add skills for a job</button>
          </div>
        </div>

        {modal === "gotjob" && (
          <GotJobModal
            currentTarget={roadmap.target_role || data.derivedTarget}
            onClose={() => setModal(null)}
            onDone={(role) => { setModal(null); setCelebration({ role }); reload() }}
          />
        )}
        {celebration && (
          <ArcCelebration
            role={celebration.role}
            items={roadmap.items}
            milestones={roadmap.milestones ?? []}
            onClose={() => setCelebration(null)}
            onNext={() => { setCelebration(null); onChangeTarget() }}
          />
        )}
        {modal === "project" && (
          <AddProjectModal onClose={() => setModal(null)} onDone={() => setModal(null)} />
        )}
        {modal === "skills" && (
          <AddSkillsForJdModal onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />
        )}
        {selected && roadmap.items.some((i) => i.skill === selected) && (
          <SkillDetailModal
            item={roadmap.items.find((i) => i.skill === selected)!}
            gap={gapBySkill.get(selected.toLowerCase())}
            onClose={() => setSelected(null)}
            onCycle={cycleStatus}
            onRemove={removeSkill}
            onReviewed={reload}
            updating={updating === selected}
          />
        )}
      </main>
    </>
  )
}

function CareerPathContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<PathData | null | undefined>(undefined) // undefined = loading
  const [betaLocked, setBetaLocked] = useState(false)
  const [changingTarget, setChangingTarget] = useState(false)

  useEffect(() => { if (!authLoading && !user) router.push("/tailor") }, [authLoading, user, router])

  const load = useCallback(async () => {
    const res = await fetch("/api/career-path")
    if (res.status === 403) { setBetaLocked(true); setData(null); return }
    const d = await readJson<PathData>(res)
    setData(d)
  }, [])

  useEffect(() => { if (user) load().catch(() => setData(null)) }, [user, load])

  if (authLoading || !user || data === undefined) {
    return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
  }

  if (betaLocked) {
    return (
      <div className="ns min-h-screen">
        <Header enhanced />
        <main className="max-w-[640px] mx-auto px-6 py-24 text-center">
          <div className="t-eyebrow" style={{ marginBottom: 14 }}>Career path</div>
          <h1 className="t-display text-[32px]" style={{ margin: "0 0 14px" }}>Almost ready<span style={{ color: "var(--ns-coral)" }}>.</span></h1>
          <p className="t-lede" style={{ margin: "0 auto 24px", maxWidth: 460 }}>
            The career path is in a small private beta while we finish it properly. It's coming to everyone soon.
          </p>
          <Link href="/tailor" className="ns-btn ns-btn-primary" style={{ display: "inline-flex" }}>Back to tailoring</Link>
        </main>
      </div>
    )
  }

  const prefillSkills = (searchParams.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const savedFindings = data?.roadmap?.findings ?? null
  const cachedFindings = savedFindings?.strengths?.length ? savedFindings : null

  return (
    <div className="ns min-h-screen">
      <Header enhanced />
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <Link href="/tailor" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 hover:text-[#1e1813] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Back to Tailr
        </Link>
        
      </div>
      {changingTarget ? (
        <NorthStarJourney
          cachedFindings={cachedFindings}
          seedIntention={data?.roadmap?.intention || data?.arcAmbition || ""}
          onBuilt={async () => { await load(); setChangingTarget(false) }}
          onCancel={data?.roadmap ? () => setChangingTarget(false) : undefined}
        />
      ) : data && data.roadmap ? (
        <LivingPath data={data} reload={load} onChangeTarget={() => setChangingTarget(true)} />
      ) : (
        // The CV-first North Star journey is the only way in. Gaps passed via
        // ?skills= (from a tailor run) steer the target suggestions.
        <NorthStarJourney
          cachedFindings={null}
          seedIntention={[data?.arcAmbition ?? "", prefillSkills.length > 0 ? `Skills they want to close: ${prefillSkills.join(", ")}` : ""].filter(Boolean).join(". ")}
          onBuilt={() => load()}
        />
      )}
    </div>
  )
}

export default function CareerPathPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>}>
      <CareerPathContent />
    </Suspense>
  )
}
