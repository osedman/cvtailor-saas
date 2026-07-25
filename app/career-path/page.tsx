"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Sparkles, Loader2, ExternalLink, Check, CircleDot, Target, ArrowRight, Flag, MapPin, PartyPopper, FolderPlus, FileSearch, Plus, X, ChevronDown, TrendingUp, Database, Code2, Cloud, BarChart3, Users, Wrench, Palette, Presentation, BookOpen, Zap } from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import type { CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"

const ACCENT = "#dc4f33"
const INK = "#1e1813"

interface Milestone { role: string; reachedAt: string }
interface TargetSkill { skill: string; have: boolean; importance?: "core" | "common" | "edge" }
interface CvFinding { label: string; detail: string }
interface CvFindings { headline: string; strengths: CvFinding[]; gaps: CvFinding[] }
interface TargetSuggestion { role: string; whyYou: string }
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
interface PathData { roadmap: Roadmap | null; derivedTarget: string; readiness: Readiness; rankedGaps: RankedGap[]; arcAmbition: string }

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

function StatusIcon({ status }: { status: CareerItemStatus }) {
  if (status === "done") return <Check className="w-4 h-4 text-white" strokeWidth={2.75} />
  if (status === "in_progress") return <CircleDot className="w-4 h-4 text-white" strokeWidth={2.25} />
  return <ArrowRight className="w-3.5 h-3.5" style={{ color: ACCENT }} strokeWidth={2.5} />
}

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

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold: 0.2 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function useCountUp(target: number, active: boolean, durationMs = 1100) {
  const [value, setValue] = useState(0)
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    if (!active) return
    if (reduced || target === 0) { setValue(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      setValue(Math.round((1 - Math.pow(1 - t, 3)) * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, durationMs, reduced])
  return value
}

/**
 * The living path as one continuous line: reached rungs (milestones, solid) flow
 * into "you are here", then a forward segment toward the target whose fill is the
 * user's readiness for that role. The target node is a ring gauge of readiness %.
 */
function JourneyLine({ roadmap, readiness, derivedTarget }: { roadmap: Roadmap; readiness: Readiness; derivedTarget: string }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  const pct = useCountUp(readiness.pct, visible)

  const current = roadmap.current_title?.trim() || "You"
  const target = roadmap.target_role?.trim() || derivedTarget || "Your goal"
  const past = (roadmap.milestones ?? []).map((m) => m.role).filter(Boolean)

  const nodes = [
    ...past.map((label) => ({ label, kind: "past" as const })),
    { label: current, kind: "current" as const },
    { label: target, kind: "target" as const },
  ]
  const n = nodes.length
  const W = Math.max(380, n * 150), H = 176, PX = 46, TOP = 48, BOT = 46
  const x = (i: number) => PX + (i * (W - PX * 2)) / (n - 1)
  const y = (i: number) => H - BOT - (i * (H - BOT - TOP)) / (n - 1)

  const currentIdx = n - 2
  const targetIdx = n - 1
  // Solid line through the travelled part (start → current)
  const pastPath = nodes.slice(0, currentIdx + 1).map((_, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(i)}`).join(" ")
  // Forward segment current → target, and its readiness fill
  const cx = x(currentIdx), cy = y(currentIdx), tx = x(targetIdx), ty = y(targetIdx)
  const f = readiness.pct / 100
  const fx = cx + (tx - cx) * f, fy = cy + (ty - cy) * f
  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: 4, strokeLinejoin: "round" as const }

  return (
    <div ref={ref} className="rounded-2xl bg-white p-5 sm:p-6 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 340 }}>
        {/* dashed forward segment */}
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke="#e5ddd2" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" />
        {/* travelled solid line */}
        {currentIdx > 0 && (
          <path d={pastPath} fill="none" stroke={ACCENT} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 1200, strokeDashoffset: visible ? 0 : 1200, transition: "stroke-dashoffset 1.2s ease-out" }} />
        )}
        {/* readiness fill along the forward segment */}
        <line x1={cx} y1={cy} x2={visible ? fx : cx} y2={visible ? fy : cy} stroke={ACCENT} strokeWidth={3.5} strokeLinecap="round"
          style={{ transition: "all 1.2s ease-out 0.3s" }} />

        {/* past nodes */}
        {past.map((label, i) => (
          <g key={`p${i}`} style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease-out ${i * 0.12}s` }}>
            <circle cx={x(i)} cy={y(i)} r={5} fill={ACCENT} />
            <text x={x(i)} y={y(i) + 20} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#8a8178" style={halo}>{label.length > 16 ? label.slice(0, 15) + "…" : label}</text>
          </g>
        ))}

        {/* current node */}
        <g style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease-out 0.4s" }}>
          <circle cx={cx} cy={cy} r={11} fill="none" stroke={ACCENT} strokeWidth={1.5} opacity={0.35} />
          <circle cx={cx} cy={cy} r={7} fill={ACCENT} />
          <text x={cx} y={cy - 26} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#f4795c" style={halo}>YOU ARE HERE</text>
          <text x={cx} y={cy - 14} textAnchor="middle" fontSize={12} fontWeight={700} fill={INK} style={halo}>{current.length > 22 ? current.slice(0, 20) + "…" : current}</text>
        </g>

        {/* target node = readiness ring */}
        <g style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease-out 0.7s" }}>
          <circle cx={tx} cy={ty} r={16} fill="#fff" stroke="#eee6da" strokeWidth={4} />
          <circle cx={tx} cy={ty} r={16} fill="none" stroke={ACCENT} strokeWidth={4} strokeLinecap="round"
            transform={`rotate(-90 ${tx} ${ty})`}
            style={{ strokeDasharray: 2 * Math.PI * 16, strokeDashoffset: (2 * Math.PI * 16) * (1 - (visible ? f : 0)), transition: "stroke-dashoffset 1.3s ease-out 0.4s" }} />
          <text x={tx} y={ty + 3.5} textAnchor="middle" fontSize={11} fontWeight={800} fill={INK} className="tabular-nums">{pct}%</text>
          <text x={tx} y={ty - 26} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#a89e93" style={halo}>TARGET</text>
          <text x={tx} y={ty - 14} textAnchor="middle" fontSize={12} fontWeight={700} fill={INK} style={halo}>{target.length > 22 ? target.slice(0, 20) + "…" : target}</text>
        </g>
      </svg>

      <p className="mt-2 text-center text-[13px] text-gray-500">
        {readiness.total > 0
          ? <>You have <span className="font-semibold text-[#1e1813]">{readiness.have} of {readiness.total}</span> things <span className="font-semibold text-[#1e1813]">{target}</span> roles ask for.</>
          : <>Tailor a few {target !== "Your goal" ? `${target} ` : ""}jobs and your readiness will fill in here.</>}
      </p>
    </div>
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

function SkillTile({ item, gap, onOpen }: { item: CareerRoadmapItem; gap?: RankedGap; onOpen: (i: CareerRoadmapItem) => void }) {
  const Icon = pickIcon(item.skill)
  const isDone = item.status === "done"
  const isActive = item.status === "in_progress"
  return (
    <button onClick={() => onOpen(item)}
      className="relative text-left rounded-2xl border p-4 transition-all hover:shadow-[0_4px_20px_rgba(30,24,19,0.08)] hover:-translate-y-0.5"
      style={isActive ? { borderColor: "#f5d9d0", background: "linear-gradient(180deg,#fffaf8,#fff)" } : isDone ? { borderColor: "#d7ecd9", background: "#fff" } : { borderColor: "#eee6da", background: "#fff" }}>
      {!isDone && gap && gap.unlockCount > 0 && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: ACCENT }} title={`Unlocks ${gap.sourceJobs.join(", ")}`}>
          <TrendingUp className="w-3 h-3" />{gap.unlockCount}
        </span>
      )}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={isDone ? { background: "#eafaf0", color: "#16a34a" } : { background: "#fff7f4", color: ACCENT }}>
        {isDone ? <Check className="w-5 h-5" strokeWidth={2.5} /> : <Icon className="w-5 h-5" />}
      </div>
      <p className={`text-[14px] font-bold truncate ${isDone ? "text-gray-400 line-through" : "text-[#1e1813]"}`}>{item.skill}</p>
      <p className="text-[11px] mt-0.5" style={{ color: isActive ? ACCENT : isDone ? "#16a34a" : "#a89e93" }}>
        {isActive ? "Learning" : isDone ? "Closed" : "Not started"}
      </p>
    </button>
  )
}

function SkillDetailModal({ item, gap, onClose, onCycle, onRemove, updating }: { item: CareerRoadmapItem; gap?: RankedGap; onClose: () => void; onCycle: (i: CareerRoadmapItem) => void; onRemove: (i: CareerRoadmapItem) => void; updating: boolean }) {
  const [copied, setCopied] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const Icon = pickIcon(item.skill)
  const isDone = item.status === "done"
  const isActive = item.status === "in_progress"
  const statusLabel = isActive ? "Learning" : isDone ? "Closed" : "Not started yet"
  return (
    <Modal icon={Icon} title={item.skill} subtitle={statusLabel} onClose={onClose}>
      <div className="max-h-[68vh] overflow-y-auto -mr-2 pr-2">
        {!isDone && gap && gap.unlockCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1e1813] text-white mb-3" title={gap.sourceJobs.join(", ")}>
            <TrendingUp className="w-2.5 h-2.5" />unlocks {gap.unlockCount} saved job{gap.unlockCount === 1 ? "" : "s"}
          </span>
        )}
        <p className="text-[13px] text-gray-600 leading-relaxed">{item.whyItMatters}</p>

        {item.resources?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.resources.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-[#dc4f33] bg-gray-50 hover:bg-[#ffeae4] border border-gray-100 rounded-lg px-2.5 py-1.5 transition-colors">
                <ExternalLink className="w-3 h-3" />{r.title} <span className="text-gray-400">· {r.source}</span>
              </a>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-xl bg-gray-50/70 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Project idea</p>
          <p className="text-[13px] text-gray-700 leading-relaxed">{item.projectBrief}</p>
        </div>

        {isDone && (
          <div className="mt-3 rounded-xl border border-green-100 bg-green-50/60 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1">Add to your CV</p>
                <p className="text-[13px] text-[#1e1813] leading-relaxed">{item.cvPhrasing}</p>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(item.cvPhrasing); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="flex-shrink-0 text-[11px] font-medium text-green-700 bg-white hover:bg-green-100 border border-green-200 rounded-lg px-2.5 py-1.5 transition-colors">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      <button onClick={() => onCycle(item)} disabled={updating}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3 text-[14px] font-semibold rounded-xl transition-all active:scale-[0.98] disabled:opacity-60"
        style={isDone ? { background: "#fff", border: "1px solid #e5e7eb", color: "#6b7280" } : { background: ACCENT, color: "#fff" }}>
        {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : isDone ? <>Move back to learning</> : isActive ? <>Mark as done <Check className="w-4 h-4" /></> : <>Start this skill <ArrowRight className="w-4 h-4" /></>}
      </button>

      <div className="mt-3 text-center">
        {confirmRemove ? (
          <span className="text-[12px] text-gray-500">Remove this skill?{" "}
            <button onClick={() => onRemove(item)} className="font-semibold" style={{ color: ACCENT }}>Yes, remove</button>
            <span className="text-gray-300"> · </span>
            <button onClick={() => setConfirmRemove(false)} className="text-gray-500">Keep it</button>
          </span>
        ) : (
          <button onClick={() => setConfirmRemove(true)} className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors">Remove from path</button>
        )}
      </div>
    </Modal>
  )
}

/**
 * The CV-first North Star journey: scan the CV (strengths first, then honest
 * gaps), choose a 1-2 year target role, then Tailr researches what that role's
 * market demands and shows the transparent gap map. The only way into the path.
 */
function NorthStarJourney({ cachedFindings, seedIntention, onBuilt, onCancel }: { cachedFindings: CvFindings | null; seedIntention: string; onBuilt: () => Promise<void> | void; onCancel?: () => void }) {
  const [stage, setStage] = useState<"intro" | "scanning" | "findings" | "choosing" | "building">(cachedFindings ? "findings" : "intro")
  const [findings, setFindings] = useState<CvFindings | null>(cachedFindings)
  const [suggestions, setSuggestions] = useState<TargetSuggestion[] | null>(null)
  const [customRole, setCustomRole] = useState("")
  const [buildingRole, setBuildingRole] = useState("")

  const scan = async () => {
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
    } catch {
      setSuggestions([]) // chooser still works via the free-text field
    }
  }

  const build = async (role: string) => {
    const r = role.trim()
    if (!r) { toast.error("Type or pick a role first."); return }
    setBuildingRole(r)
    setStage("building")
    try {
      await readJson(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "set-target", role: r }) }))
      await onBuilt()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't build your path.")
      setStage("choosing")
    }
  }

  if (stage === "intro") {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-6 shadow-sm" style={{ background: "#fff7f4", color: ACCENT }}>
          <FileSearch className="w-7 h-7" />
        </div>
        <h1 className="text-[27px] font-extrabold tracking-tight text-[#1e1813]">Let&apos;s see where you stand</h1>
        <p className="mt-3 text-[14.5px] text-gray-500 leading-relaxed max-w-md mx-auto">
          Tailr reads your CV like a career coach — what makes you strong, where the honest gaps are — then helps you pick a North Star role and shows exactly what&apos;s between you and it.
        </p>
        <button onClick={scan} className="mt-8 inline-flex items-center justify-center gap-2 px-8 py-3.5 text-[15px] font-semibold text-white rounded-xl shadow-sm transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98]" style={{ background: ACCENT }}>
          <Sparkles className="w-4 h-4" />Scan my CV
        </button>
        {onCancel && <p className="mt-4"><button onClick={onCancel} className="text-[13px] text-gray-400 hover:text-gray-600">Keep my current path</button></p>}
      </div>
    )
  }

  if (stage === "scanning") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-28">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        <p className="text-sm text-gray-400">Reading your CV the way a coach would…</p>
      </div>
    )
  }

  if (stage === "findings" && findings) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>Your CV, read honestly</p>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight text-[#1e1813] leading-snug">{findings.headline}</h1>

        <div className="mt-7">
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-[#1e1813]">What makes you strong</h2>
          </div>
          <div className="space-y-2.5">
            {findings.strengths.map((s, i) => (
              <div key={i} className="rounded-xl border border-[#d7ecd9] bg-white p-3.5">
                <p className="text-[13.5px] font-bold text-[#1e1813]">{s.label}</p>
                <p className="mt-0.5 text-[12.5px] text-gray-500 leading-relaxed">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Flag className="w-4 h-4" style={{ color: ACCENT }} />
            <h2 className="text-sm font-semibold text-[#1e1813]">Where to grow next</h2>
          </div>
          <div className="space-y-2.5">
            {findings.gaps.map((g, i) => (
              <div key={i} className="rounded-xl border border-[#eee6da] bg-white p-3.5">
                <p className="text-[13.5px] font-bold text-[#1e1813]">{g.label}</p>
                <p className="mt-0.5 text-[12.5px] text-gray-500 leading-relaxed">{g.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <button onClick={toChooser} className="mt-8 w-full inline-flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold text-white rounded-xl shadow-sm transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98]" style={{ background: ACCENT }}>
          Choose my North Star <ArrowRight className="w-4 h-4" />
        </button>
        <p className="mt-2.5 text-center text-[12px] text-gray-400">Next: pick the role you&apos;re aiming at in the next 1–2 years.</p>
      </div>
    )
  }

  if (stage === "choosing") {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>Your North Star</p>
        <h1 className="mt-2 text-[24px] font-extrabold tracking-tight text-[#1e1813]">Where are you heading?</h1>
        <p className="mt-2 text-[14px] text-gray-500 leading-relaxed">Pick the role you want in the next 1–2 years. Tailr will research what it really demands in the market and show you the honest distance.</p>

        {suggestions === null ? (
          <div className="mt-8 flex items-center gap-3 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">Finding roles that fit your CV…</span></div>
        ) : (
          <div className="mt-6 space-y-2.5">
            {suggestions.map((t, i) => (
              <button key={i} onClick={() => build(t.role)}
                className="w-full text-left rounded-xl border border-[#eee6da] bg-white p-4 transition-all hover:border-[#dc4f33] hover:shadow-[0_4px_18px_rgba(30,24,19,0.06)] group">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14.5px] font-bold text-[#1e1813]">{t.role}</p>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#dc4f33] transition-colors flex-shrink-0" />
                </div>
                <p className="mt-1 text-[12.5px] text-gray-500 leading-relaxed">{t.whyYou}</p>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6">
          <label className="block text-[13px] font-semibold text-[#1e1813] mb-1.5">Or search your own</label>
          <div className="flex gap-2">
            <input value={customRole} onChange={(e) => setCustomRole(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") build(customRole) }}
              placeholder="e.g. Product Manager, Data Engineer…"
              className="flex-1 px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none transition-colors focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300" />
            <button onClick={() => build(customRole)} className="px-4 py-2.5 text-[14px] font-semibold text-white rounded-lg" style={{ background: ACCENT }}>Go</button>
          </div>
        </div>
        {onCancel && <p className="mt-5 text-center"><button onClick={onCancel} className="text-[13px] text-gray-400 hover:text-gray-600">Keep my current path</button></p>}
      </div>
    )
  }

  // building
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-28 px-4 text-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      <p className="text-sm font-semibold text-[#1e1813]">Researching what {buildingRole} roles really ask for…</p>
      <p className="text-[13px] text-gray-400 max-w-sm">Tailr is reading real job postings, comparing them against your CV, and finding free UK resources for every gap. Takes a minute or two.</p>
    </div>
  )
}

/** The transparent gap map: every skill the North Star's market asks for,
 * split into what the CV already evidences and what's still to close. This is
 * the "show me the 60" answer — nothing hidden behind a number. */
function GapMap({ targetSkills, targetRole }: { targetSkills: TargetSkill[]; targetRole: string }) {
  const [open, setOpen] = useState(false)
  const have = targetSkills.filter((s) => s.have)
  const missing = targetSkills.filter((s) => !s.have)
  return (
    <div className="mt-5 rounded-2xl bg-white p-5">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <p className="text-sm font-semibold text-[#1e1813]">What {targetRole} roles ask for</p>
          <p className="text-[12px] text-gray-400 mt-0.5">You have {have.length} of {targetSkills.length} — every one listed, nothing hidden</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          {have.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-2">Already evidenced in your CV · {have.length}</p>
              <div className="flex flex-wrap gap-1.5">
                {have.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[12px] font-medium text-green-800 bg-[#eafaf0] border border-[#d7ecd9] rounded-full px-2.5 py-1">
                    <Check className="w-3 h-3" strokeWidth={2.5} />{s.skill}
                  </span>
                ))}
              </div>
            </div>
          )}
          {missing.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: ACCENT }}>Still to close · {missing.length}</p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1e1813] bg-[#fff7f4] border border-[#f5d9d0] rounded-full px-2.5 py-1">
                    {s.skill}{s.importance === "core" && <span className="text-[9px] font-bold uppercase" style={{ color: ACCENT }}>core</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
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

function GotJobModal({ currentTarget, onClose, onDone }: { currentTarget: string; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState(currentTarget)
  const [next, setNext] = useState("")
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (!role.trim()) { toast.error("Which role did you land?"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "got-job", role, nextTarget: next }) })
      await readJson(res)
      toast.success(`Congratulations on ${role.trim()}! It's on your path — and your Arc.`)
      onDone()
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

function ActionsBar({ onGotJob, onAddProject, onAddSkills }: { onGotJob: () => void; onAddProject: () => void; onAddSkills: () => void }) {
  const btn = "flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold rounded-xl border transition-all hover:shadow-sm"
  return (
    <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
      <button onClick={onGotJob} className={btn} style={{ borderColor: "#f5d9d0", color: ACCENT, background: "#fff7f4" }}><PartyPopper className="w-4 h-4" />I got the job</button>
      <button onClick={onAddProject} className={`${btn} border-gray-200 text-[#1e1813] bg-white hover:border-gray-300`}><FolderPlus className="w-4 h-4" />Add a project</button>
      <button onClick={onAddSkills} className={`${btn} border-gray-200 text-[#1e1813] bg-white hover:border-gray-300`}><FileSearch className="w-4 h-4" />Add skills for a job</button>
    </div>
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

  const removeSkill = useCallback(async (item: CareerRoadmapItem) => {
    try {
      await readJson(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "remove-skill", skill: item.skill }) }))
      toast.success(`Removed ${item.skill} from your path.`)
      setSelected(null)
      await reload()
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to remove.") }
  }, [reload])

  const gapBySkill = new Map(data.rankedGaps.map((g) => [g.skill.toLowerCase(), g]))
  // not-done first, ordered by unlock count; done at the bottom
  const openItems = roadmap.items.filter((i) => i.status !== "done")
    .sort((a, b) => (gapBySkill.get(b.skill.toLowerCase())?.unlockCount ?? 0) - (gapBySkill.get(a.skill.toLowerCase())?.unlockCount ?? 0))
  const doneItems = roadmap.items.filter((i) => i.status === "done")

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>Your career path</p>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-tight text-[#1e1813]">The road ahead</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={onChangeTarget} className="text-[13px] font-medium text-gray-500 hover:text-[#1e1813] border border-gray-200 hover:border-gray-300 rounded-lg px-3.5 py-2 transition-colors">
            Change North Star
          </button>
        </div>
      </div>

      <IntentionLine value={roadmap.intention} onSave={async (v) => {
        await readJson(await fetch("/api/career-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "set-intention", intention: v }) }))
        await reload()
      }} />

      <JourneyLine roadmap={roadmap} readiness={data.readiness} derivedTarget={data.derivedTarget} />

      {(roadmap.target_skills?.length ?? 0) > 0 && (
        <GapMap targetSkills={roadmap.target_skills!} targetRole={roadmap.target_role || data.derivedTarget || "your target"} />
      )}

      <ActionsBar
        onGotJob={() => setModal("gotjob")}
        onAddProject={() => setModal("project")}
        onAddSkills={() => setModal("skills")}
      />

      <div className="mt-8 flex items-center gap-2">
        <Flag className="w-4 h-4" style={{ color: ACCENT }} />
        <h2 className="text-sm font-semibold text-[#1e1813]">Skills to close{openItems.length > 0 ? ` · ${openItems.length}` : ""}</h2>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {openItems.map((item) => (
          <SkillTile key={item.skill} item={item} gap={gapBySkill.get(item.skill.toLowerCase())} onOpen={(i) => setSelected(i.skill)} />
        ))}
      </div>

      {doneItems.length > 0 && (
        <>
          <div className="mt-8 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-[#1e1813]">Closed · {doneItems.length}</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {doneItems.map((item) => (
              <SkillTile key={item.skill} item={item} onOpen={(i) => setSelected(i.skill)} />
            ))}
          </div>
        </>
      )}

      {modal === "gotjob" && (
        <GotJobModal currentTarget={roadmap.target_role || data.derivedTarget} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />
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
          updating={updating === selected}
        />
      )}
    </div>
  )
}

function CareerPathContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<PathData | null | undefined>(undefined) // undefined = loading
  const [changingTarget, setChangingTarget] = useState(false)

  useEffect(() => { if (!authLoading && !user) router.push("/tailor") }, [authLoading, user, router])

  const load = useCallback(async () => {
    const res = await fetch("/api/career-path")
    const d = await readJson<PathData>(res)
    setData(d)
  }, [])

  useEffect(() => { if (user) load().catch(() => setData(null)) }, [user, load])

  if (authLoading || !user || data === undefined) {
    return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
  }

  const prefillSkills = (searchParams.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const savedFindings = data?.roadmap?.findings ?? null
  const cachedFindings = savedFindings?.strengths?.length ? savedFindings : null

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <Header enhanced />
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <Link href="/tailor" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 hover:text-[#1e1813] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Back to Tailr
        </Link>
        <Link href="/career-path/first-cv" className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#f1d4cb] bg-[#fff7f4] px-5 py-4 transition-all hover:border-[#dc4f33] hover:shadow-[0_4px_18px_rgba(30,24,19,0.06)]">
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#dc4f33]">New · First CV builder</span>
            <span className="mt-1 block text-sm font-bold text-[#1e1813]">No CV yet? Build one from projects, certificates and experience.</span>
            <span className="mt-0.5 block text-xs text-gray-500">Upload evidence or tell us what you have done. You approve every fact.</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-[#dc4f33]" />
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
