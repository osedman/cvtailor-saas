"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Sparkles, TrendingUp, Trophy, Star } from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import type { CareerProfileSections } from "@/lib/anthropic"

const ACCENT = "#dc4f33"
const INK = "#1e1813"

interface Profile {
  id: string
  source: string
  sections: CareerProfileSections
}

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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const handler = () => setReduced(mq.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return reduced
}

/** Fires once when the element scrolls into view */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.2 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={`${className} ${visible ? "animate-fade-in-up" : "opacity-0"}`}>
      {children}
    </div>
  )
}

/** Counts 0 -> target once the value becomes visible/active */
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
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setValue(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, durationMs, reduced])
  return value
}

/** Click-to-edit text — click to reveal an input/textarea, blur or Enter to save */
function EditableText({
  value, onSave, multiline = false, className = "", placeholder = "",
}: {
  value: string; onSave: (next: string) => void; multiline?: boolean; className?: string; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = () => { setEditing(false); if (draft.trim() !== value.trim()) onSave(draft.trim()) }

  if (editing) {
    const Field = multiline ? "textarea" : "input"
    return (
      <Field
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (!multiline && e.key === "Enter") commit() }}
        rows={multiline ? 3 : undefined}
        className={`${className} w-full bg-white border border-[#f5c9bb] rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-[#dc4f33]/15`}
      />
    )
  }
  return (
    <button onClick={() => setEditing(true)} className={`${className} text-left w-full rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-[#fff7f4] cursor-text`} title="Click to edit">
      {value || <span className="text-gray-300">{placeholder}</span>}
    </button>
  )
}

function CVPasteForm({ onGenerated }: { onGenerated: (p: Profile) => void }) {
  const [cv, setCv] = useState("")
  const [loading, setLoading] = useState(false)
  const submit = useCallback(async () => {
    if (!cv.trim()) { toast.error("Paste your CV first."); return }
    setLoading(true)
    try {
      const res = await fetch("/api/career-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cv }) })
      const data = await readJson<{ profile: Profile }>(res)
      onGenerated(data.profile)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build your Career Arc.")
    } finally {
      setLoading(false)
    }
  }, [cv, onGenerated])

  return (
    <div className="max-w-xl mx-auto py-16 px-4">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 shadow-sm" style={{ background: "#fff7f4", color: ACCENT }}>
        <TrendingUp className="w-6 h-6" />
      </div>
      <h1 className="text-[28px] font-extrabold tracking-tight text-[#1e1813]">Build your Career Arc</h1>
      <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">
        Paste your CV and Tailr will turn it into a highlight reel of your career — timeline, skills, growth, and the projects you should be proud of.
      </p>
      <textarea
        value={cv} onChange={(e) => setCv(e.target.value)} placeholder="Paste your CV text here…" rows={12}
        className="mt-6 w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none transition-colors focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300"
      />
      <button
        onClick={submit} disabled={loading}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold text-white rounded-xl shadow-sm transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
        style={{ background: ACCENT }}
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Building your Career Arc…</> : <><Sparkles className="w-4 h-4" />Build my Career Arc</>}
      </button>
    </div>
  )
}

/** Hero: name/headline in oversized type + one big honest stat, count-up on reveal */
function Hero({ s }: { s: CareerProfileSections }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  const years = s.growth?.tenureYears ?? 0
  const count = useCountUp(years, visible)
  return (
    <div ref={ref} className={visible ? "animate-fade-in-up" : "opacity-0"}>
      <div className="text-center py-16 px-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.25em]" style={{ color: ACCENT }}>Career Arc</p>
        <h1 className="mt-3 font-extrabold tracking-tight text-[#1e1813]" style={{ fontSize: "clamp(2.25rem, 6vw, 4.5rem)", lineHeight: 1.05 }}>
          {s.headline}
        </h1>
        {years > 0 && (
          <div className="mt-8 inline-flex items-baseline gap-3">
            <span className="font-extrabold tabular-nums" style={{ fontSize: "clamp(3.5rem, 12vw, 7rem)", color: ACCENT, lineHeight: 1 }}>
              {count}
            </span>
            <span className="text-lg font-semibold text-gray-400 pb-2">years building a career</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** An actual ascending line chart from first title to current title, one point per role */
function GrowthArc({ timeline, growth }: { timeline: CareerProfileSections["timeline"]; growth: CareerProfileSections["growth"] }) {
  if (!timeline || timeline.length < 2) return null
  const { ref, visible } = useInView<HTMLDivElement>()
  const W = 600, H = 180, PAD = 30
  const n = timeline.length
  const points = timeline.map((role, i) => {
    const x = PAD + (i * (W - PAD * 2)) / (n - 1)
    const y = H - PAD - (i * (H - PAD * 2)) / (n - 1) // later roles sit higher
    return { x, y, title: role.title }
  })
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const pathLen = 900 // generous upper bound for stroke-dash animation

  return (
    <div ref={ref}>
      <h2 className="text-sm font-semibold text-[#1e1813] mb-1.5 flex items-center gap-2">
        <TrendingUp className="w-4 h-4" style={{ color: ACCENT }} />Growth
      </h2>
      <p className="text-[12px] text-gray-400 mb-4">{growth.fromTitle} → {growth.toTitle}</p>
      <div className="rounded-2xl border border-gray-100 bg-white p-6 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
          <path
            d={path}
            fill="none"
            stroke={ACCENT}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: pathLen,
              strokeDashoffset: visible ? 0 : pathLen,
              transition: "stroke-dashoffset 1.2s ease-out",
            }}
          />
          {points.map((p, i) => (
            <g key={i} style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease-out ${0.3 + i * 0.15}s` }}>
              <circle cx={p.x} cy={p.y} r={i === n - 1 ? 7 : 5} fill={i === n - 1 ? ACCENT : "#fff"} stroke={ACCENT} strokeWidth={2.5} />
              <text x={p.x} y={p.y - 14} textAnchor="middle" className="text-[10px] font-semibold" fill={INK}>
                {p.title.length > 18 ? p.title.slice(0, 16) + "…" : p.title}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

/** Vertical timeline: alternating cards on a line that draws itself in on scroll */
function Timeline({ timeline }: { timeline: CareerProfileSections["timeline"] }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  if (!timeline?.length) return null
  return (
    <div ref={ref}>
      <h2 className="text-sm font-semibold text-[#1e1813] mb-6">Timeline</h2>
      <div className="relative">
        <div
          className="absolute left-1/2 md:left-1/2 top-0 w-px bg-gradient-to-b from-[#dc4f33] to-[#f5d9d0] -translate-x-1/2 origin-top"
          style={{ height: "100%", transform: `translateX(-50%) scaleY(${visible ? 1 : 0})`, transition: "transform 1.4s ease-out" }}
        />
        <div className="space-y-10">
          {timeline.map((role, i) => {
            const left = i % 2 === 0
            return (
              <div key={i} className="relative grid md:grid-cols-2 gap-4 md:gap-10 items-start">
                <div
                  className="absolute left-1/2 top-1.5 w-3 h-3 rounded-full -translate-x-1/2 border-2 border-white"
                  style={{ background: ACCENT, boxShadow: visible ? "0 0 0 4px rgba(220,79,51,0.12)" : "none", transition: `box-shadow 0.4s ease-out ${0.3 + i * 0.15}s` }}
                />
                <div className={left ? "md:text-right md:pr-14" : "md:col-start-2 md:pl-14"}>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 inline-block w-full text-left">
                    <p className="text-[15px] font-bold text-[#1e1813]">{role.title}</p>
                    <p className="text-[12.5px] text-gray-400 mb-2">{role.company} · {role.start}–{role.end}</p>
                    {role.highlights?.map((h, j) => (
                      <p key={j} className="text-[13px] text-gray-600 leading-relaxed">{h}</p>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Skill categories rendered as bars sized by real skill-count share, not invented proficiency */
function SkillBars({ skills, patch }: { skills: CareerProfileSections["skills"]; patch: (p: Partial<CareerProfileSections>) => void }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  if (!skills?.length) return null

  const byCategory = new Map<string, string[]>()
  for (const sk of skills) {
    const list = byCategory.get(sk.category) ?? []
    list.push(sk.name)
    byCategory.set(sk.category, list)
  }
  const entries = Array.from(byCategory.entries())
  const max = Math.max(...entries.map(([, list]) => list.length))

  return (
    <div ref={ref}>
      <h2 className="text-sm font-semibold text-[#1e1813] mb-4">Skills</h2>
      <div className="space-y-4">
        {entries.map(([category, names], i) => (
          <div key={category}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-[#1e1813]">{category}</span>
              <span className="text-[11px] text-gray-400">{names.length} skill{names.length === 1 ? "" : "s"}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${ACCENT}, #f4795c)`,
                  width: visible ? `${(names.length / max) * 100}%` : "0%",
                  transition: `width 0.9s ease-out ${i * 0.12}s`,
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {names.map((name, j) => (
                <span key={j} className="text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-[#fff7f4] text-[#1e1813] border border-[#f5d9d0]">
                  {name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Project cards as a "trophy case" grid */
function TrophyCase({ projects, onSave }: { projects: CareerProfileSections["projects"]; onSave: (i: number, next: string) => void }) {
  if (!projects?.length) return null
  return (
    <div>
      <h2 className="text-sm font-semibold text-[#1e1813] mb-4 flex items-center gap-2">
        <Trophy className="w-4 h-4" style={{ color: ACCENT }} />Key projects
      </h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {projects.map((p, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: "#fff7f4", color: ACCENT }}>
              <Trophy className="w-4 h-4" />
            </div>
            <p className="text-[15px] font-bold text-[#1e1813] mb-1">{p.title}</p>
            <EditableText value={p.summary} multiline onSave={(next) => onSave(i, next)} className="text-[13px] text-gray-600 leading-relaxed" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Inferred trait tiles — bold, badge-like, but flat/professional, not cartoon medals */
function QualityTiles({ qualities }: { qualities: string[] }) {
  if (!qualities?.length) return null
  return (
    <div>
      <h2 className="text-sm font-semibold text-[#1e1813] mb-1.5 flex items-center gap-2">
        <Star className="w-4 h-4" style={{ color: ACCENT }} />What your career says about you
      </h2>
      <p className="text-[12px] text-gray-400 mb-4">Inferred from patterns across your CV — a signal, not a verdict.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {qualities.map((q, i) => (
          <div key={i} className="rounded-xl border-2 p-4 text-center transition-transform hover:-translate-y-0.5" style={{ borderColor: "#f5d9d0" }}>
            <p className="text-[15px] font-extrabold uppercase tracking-wide" style={{ color: ACCENT }}>{q}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CareerArcView({ profile, onUpdated }: { profile: Profile; onUpdated: (p: Profile) => void }) {
  const s = profile.sections

  const patch = useCallback(async (partial: Partial<CareerProfileSections>) => {
    try {
      const res = await fetch("/api/career-profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: partial }) })
      const data = await readJson<{ profile: Profile }>(res)
      onUpdated(data.profile)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save your edit.")
    }
  }, [onUpdated])

  return (
    <div>
      <Hero s={s} />
      <div className="max-w-3xl mx-auto px-4 space-y-16 pb-20">
        <Reveal><GrowthArc timeline={s.timeline} growth={s.growth} /></Reveal>
        <Reveal><Timeline timeline={s.timeline} /></Reveal>
        <Reveal><SkillBars skills={s.skills} patch={patch} /></Reveal>
        <Reveal>
          <TrophyCase
            projects={s.projects}
            onSave={(i, next) => {
              const projects = s.projects.map((pr, j) => (j === i ? { ...pr, summary: next } : pr))
              patch({ projects })
            }}
          />
        </Reveal>
        <Reveal><QualityTiles qualities={s.qualities} /></Reveal>
        <Reveal>
          <div className="pt-4 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 mb-1">Headline</p>
            <EditableText value={s.headline} onSave={(next) => patch({ headline: next })} className="text-[14px] text-[#1e1813]" />
          </div>
        </Reveal>
      </div>
    </div>
  )
}

export default function CareerArcPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined) // undefined = loading
  const [needsCv, setNeedsCv] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/tailor")
  }, [authLoading, user, router])

  const autoGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/career-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const data = await readJson<{ profile: Profile }>(res)
      setProfile(data.profile)
    } catch (err) {
      if (err instanceof Error && /paste your CV/i.test(err.message)) {
        setNeedsCv(true)
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to build your Career Arc.")
        setNeedsCv(true)
      }
    } finally {
      setGenerating(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    fetch("/api/career-profile")
      .then((res) => readJson<{ profile: Profile | null }>(res))
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile)
        } else {
          setProfile(null)
          autoGenerate()
        }
      })
      .catch(() => { setProfile(null); setNeedsCv(true) })
  }, [user, autoGenerate])

  if (authLoading || !user || profile === undefined) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <Header enhanced />
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <Link href="/tailor" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 hover:text-[#1e1813] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Back to Tailr
        </Link>
      </div>

      {profile ? (
        <CareerArcView profile={profile} onUpdated={setProfile} />
      ) : generating ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          <p className="text-sm text-gray-400">Building your Career Arc…</p>
        </div>
      ) : needsCv ? (
        <CVPasteForm onGenerated={setProfile} />
      ) : (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}
    </div>
  )
}
