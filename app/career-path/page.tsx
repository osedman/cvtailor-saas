"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Sparkles, Loader2, ExternalLink, Check, CircleDot, Target, ArrowRight, Flag, MapPin } from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import type { CareerRoadmapItem, CareerItemStatus } from "@/lib/anthropic"

const ACCENT = "#dc4f33"
const INK = "#1e1813"

interface Milestone { role: string; reachedAt: string }
interface Roadmap {
  id: string
  target_role: string
  hours_per_week: number | null
  current_title: string
  milestones: Milestone[]
  items: CareerRoadmapItem[]
}
interface Readiness { pct: number; have: number; total: number; missing: string[] }
interface RankedGap { skill: string; unlockCount: number; sourceJobs: string[] }
interface PathData { roadmap: Roadmap | null; derivedTarget: string; readiness: Readiness; rankedGaps: RankedGap[] }

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

function SkillCard({ item, gap, onCycle, updating }: { item: CareerRoadmapItem; gap?: RankedGap; onCycle: (i: CareerRoadmapItem) => void; updating: boolean }) {
  const [copied, setCopied] = useState(false)
  const isDone = item.status === "done"
  const isActive = item.status === "in_progress"
  const isTodo = item.status === "todo"

  return (
    <div
      className={`group rounded-2xl border bg-white p-5 transition-all ${isTodo ? "border-gray-100 hover:border-[#f5c9bb] hover:shadow-[0_2px_16px_rgba(220,79,51,0.06)]" : "border-gray-100"}`}
      style={isActive ? { borderColor: "#f5d9d0", background: "linear-gradient(180deg, #fffaf8, #ffffff)" } : undefined}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onCycle(item)}
          disabled={updating}
          className="flex-shrink-0 w-8 h-8 mt-0.5 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={isDone ? { background: "#16a34a" } : isActive ? { background: ACCENT, boxShadow: "0 0 0 4px rgba(220,79,51,0.14)" } : { background: "#fff", border: `1.5px dashed ${ACCENT}66` }}
          title={isDone ? "Mark as to do" : isActive ? "Mark as done" : "Start this skill"}
        >
          {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: isDone || isActive ? "#fff" : ACCENT }} /> : <StatusIcon status={item.status} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-[16px] font-bold ${isDone ? "text-gray-400 line-through" : "text-[#1e1813]"}`}>{item.skill}</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: isDone ? "#dcfce7" : isActive ? "#ffeae4" : "#fff7f4", color: isDone ? "#16a34a" : ACCENT }}>
              {isActive ? "in progress" : isDone ? "done" : "not started"}
            </span>
            {!isDone && gap && gap.unlockCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1e1813] text-white" title={gap.sourceJobs.join(", ")}>
                <Sparkles className="w-2.5 h-2.5" />unlocks {gap.unlockCount} saved job{gap.unlockCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className={`mt-1 text-[13.5px] leading-relaxed ${isTodo ? "text-gray-600" : "text-gray-500"}`}>{item.whyItMatters}</p>

          {item.resources?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.resources.map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-600 hover:text-[#dc4f33] bg-gray-50 hover:bg-[#ffeae4] border border-gray-100 rounded-lg px-2.5 py-1.5 transition-colors">
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
                <button
                  onClick={() => { navigator.clipboard.writeText(item.cvPhrasing); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="flex-shrink-0 text-[11px] font-medium text-green-700 bg-white hover:bg-green-100 border border-green-200 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {isTodo && (
            <button onClick={() => onCycle(item)} disabled={updating} className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold transition-colors hover:underline" style={{ color: ACCENT }}>
              Start this skill <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RebuildConfirm({ doneCount, onConfirm, onCancel }: { doneCount: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(30,24,19,0.5)" }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_16px_48px_rgba(30,24,19,0.3)]">
        <h3 className="text-[17px] font-bold text-[#1e1813]">Rebuild your path?</h3>
        <p className="mt-2 text-[13.5px] text-gray-600 leading-relaxed">
          This replaces your current path with a fresh one.
          {doneCount > 0 && <> You&apos;ve marked <span className="font-semibold text-[#1e1813]">{doneCount} skill{doneCount === 1 ? "" : "s"} done</span> — that progress will be lost.</>}
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={onConfirm} className="flex-1 py-2.5 text-[14px] font-semibold text-white rounded-xl" style={{ background: ACCENT }}>Rebuild anyway</button>
          <button onClick={onCancel} className="px-4 py-2.5 text-[13px] font-medium text-gray-500 border border-gray-200 rounded-xl hover:text-[#1e1813]">Keep it</button>
        </div>
      </div>
    </div>
  )
}

/** Pre-seeded generate — no blank form. Target + skills come from the user's history/signal. */
function SeededStart({ seedTarget, seedSkills, onGenerated }: { seedTarget: string; seedSkills: string[]; onGenerated: () => void }) {
  const [targetRole, setTargetRole] = useState(seedTarget)
  const [skillsText, setSkillsText] = useState(seedSkills.join(", "))
  const [loading, setLoading] = useState(false)

  const submit = useCallback(async () => {
    const skills = skillsText.split(",").map((s) => s.trim()).filter(Boolean)
    if (skills.length === 0) { toast.error("Add at least one skill to build your path around."); return }
    setLoading(true)
    try {
      const res = await fetch("/api/career-path", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole, hoursPerWeek: 5, skills }),
      })
      await readJson(res)
      onGenerated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build your path.")
      setLoading(false)
    }
  }, [targetRole, skillsText, onGenerated])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        <p className="text-sm text-gray-400">Building your path — finding real, free resources…</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-14 px-4">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 shadow-sm" style={{ background: "#fff7f4", color: ACCENT }}>
        <MapPin className="w-6 h-6" />
      </div>
      <h1 className="text-[26px] font-extrabold tracking-tight text-[#1e1813]">Map your path</h1>
      <p className="mt-2 text-[14.5px] text-gray-500 leading-relaxed">
        {seedTarget ? <>Built from the roles you&apos;ve been tailoring for. Tweak anything, then map it.</> : <>Tell us where you&apos;re aiming and the skills to close.</>}
      </p>
      <div className="mt-7 space-y-5">
        <div>
          <label className="block text-[13px] font-semibold text-[#1e1813] mb-1.5">Where are you aiming?</label>
          <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Senior Data Analyst"
            className="w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none transition-colors focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300" />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-[#1e1813] mb-1.5">Skills to close</label>
          <input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="e.g. SQL, stakeholder management"
            className="w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none transition-colors focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300" />
          <p className="mt-1.5 text-[12px] text-gray-400">Comma-separated. Pre-filled from gaps that keep coming up in your tailors.</p>
        </div>
      </div>
      <button onClick={submit} className="mt-8 w-full inline-flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold text-white rounded-xl shadow-sm transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98]" style={{ background: ACCENT }}>
        <Sparkles className="w-4 h-4" />Map my path
      </button>
    </div>
  )
}

function LivingPath({ data, reload }: { data: PathData; reload: () => Promise<void> }) {
  const roadmap = data.roadmap!
  const [updating, setUpdating] = useState<string | null>(null)
  const [confirmRebuild, setConfirmRebuild] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)

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

  const gapBySkill = new Map(data.rankedGaps.map((g) => [g.skill.toLowerCase(), g]))
  // not-done first, ordered by unlock count; done at the bottom
  const openItems = roadmap.items.filter((i) => i.status !== "done")
    .sort((a, b) => (gapBySkill.get(b.skill.toLowerCase())?.unlockCount ?? 0) - (gapBySkill.get(a.skill.toLowerCase())?.unlockCount ?? 0))
  const doneItems = roadmap.items.filter((i) => i.status === "done")
  const doneCount = doneItems.length

  if (rebuilding) {
    return <SeededStart seedTarget={roadmap.target_role || data.derivedTarget} seedSkills={roadmap.items.map((i) => i.skill)} onGenerated={() => { setRebuilding(false); reload() }} />
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>Your career path</p>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-tight text-[#1e1813]">The road ahead</h1>
        </div>
        <button onClick={() => setConfirmRebuild(true)} className="text-[13px] font-medium text-gray-500 hover:text-[#1e1813] border border-gray-200 hover:border-gray-300 rounded-lg px-3.5 py-2 transition-colors">
          Rebuild path
        </button>
      </div>

      <JourneyLine roadmap={roadmap} readiness={data.readiness} derivedTarget={data.derivedTarget} />

      <div className="mt-8 flex items-center gap-2">
        <Flag className="w-4 h-4" style={{ color: ACCENT }} />
        <h2 className="text-sm font-semibold text-[#1e1813]">Skills to close{openItems.length > 0 ? ` · ${openItems.length}` : ""}</h2>
      </div>
      <div className="mt-4 space-y-4">
        {openItems.map((item) => (
          <SkillCard key={item.skill} item={item} gap={gapBySkill.get(item.skill.toLowerCase())} onCycle={cycleStatus} updating={updating === item.skill} />
        ))}
      </div>

      {doneItems.length > 0 && (
        <>
          <div className="mt-8 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-[#1e1813]">Closed · {doneItems.length}</h2>
          </div>
          <div className="mt-4 space-y-4">
            {doneItems.map((item) => (
              <SkillCard key={item.skill} item={item} onCycle={cycleStatus} updating={updating === item.skill} />
            ))}
          </div>
        </>
      )}

      {confirmRebuild && (
        <RebuildConfirm doneCount={doneCount} onCancel={() => setConfirmRebuild(false)} onConfirm={() => { setConfirmRebuild(false); setRebuilding(true) }} />
      )}
    </div>
  )
}

function CareerPathContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<PathData | null | undefined>(undefined) // undefined = loading

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

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <Header enhanced />
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <Link href="/tailor" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 hover:text-[#1e1813] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Back to Tailr
        </Link>
      </div>
      {data && data.roadmap ? (
        <LivingPath data={data} reload={load} />
      ) : (
        <SeededStart
          seedTarget={data?.derivedTarget ?? ""}
          seedSkills={prefillSkills}
          onGenerated={() => load()}
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
