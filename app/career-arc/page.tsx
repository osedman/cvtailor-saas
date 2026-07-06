"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft, Loader2, Sparkles, TrendingUp, Trophy, Star, Briefcase,
  ShieldCheck, LineChart, Users, Rocket, Target, Layers, BookOpen, Wrench,
  type LucideIcon,
} from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import type { CareerProfileSections, CareerQuestion } from "@/lib/anthropic"

const ACCENT = "#dc4f33"
const INK = "#1e1813"

const QUALITY_ICONS: Record<string, LucideIcon> = {
  shield: ShieldCheck, chart: LineChart, users: Users, rocket: Rocket,
  target: Target, layers: Layers, book: BookOpen, tool: Wrench,
}

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

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.15 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function Reveal({ children }: { children: React.ReactNode }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  return <div ref={ref} className={visible ? "animate-fade-in-up" : "opacity-0"}>{children}</div>
}

function useCountUp(target: number, active: boolean, durationMs = 1000) {
  const [value, setValue] = useState(0)
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    if (!active) return
    if (reduced || target === 0) { setValue(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, durationMs, reduced])
  return value
}

/** A stat block: counts up if the value is a plain number, renders as-is otherwise */
function StatBlock({ value, label, active }: { value: string; label: string; active: boolean }) {
  const numeric = /^\d+$/.test(value.trim()) ? parseInt(value.trim(), 10) : null
  const count = useCountUp(numeric ?? 0, active && numeric !== null)
  return (
    <div className="bg-white rounded-2xl p-4 text-center">
      <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)", color: ACCENT }}>
        {numeric !== null ? count : value}
      </p>
      <p className="mt-1.5 text-[12px] text-gray-400">{label}</p>
    </div>
  )
}

function SectionHeading({ icon: Icon, children, sub }: { icon?: LucideIcon; children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-[#1e1813] flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4" style={{ color: ACCENT }} />}{children}
      </h2>
      {sub && <p className="mt-1 text-[12px] text-gray-400">{sub}</p>}
    </div>
  )
}

/** Wizard step 2: personalised questions, each individually skippable (blank = skipped) */
function QuestionsStep({ cv, questions, onBuilt }: { cv: string; questions: CareerQuestion[]; onBuilt: (p: Profile) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [building, setBuilding] = useState(false)

  const build = useCallback(async (withAnswers: boolean) => {
    setBuilding(true)
    try {
      const payload = withAnswers
        ? questions.map((q) => ({ question: q.question, answer: answers[q.key] ?? "" }))
        : []
      const res = await fetch("/api/career-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv, answers: payload }),
      })
      const data = await readJson<{ profile: Profile }>(res)
      onBuilt(data.profile)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build your Career Arc.")
      setBuilding(false)
    }
  }, [cv, questions, answers, onBuilt])

  if (building) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        <p className="text-sm text-gray-400">Building your Career Arc…</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: ACCENT }}>
          <Sparkles className="w-3 h-3" />
        </div>
        <span className="text-[12px] text-gray-400">CV read</span>
        <div className="flex-1 h-px" style={{ background: ACCENT }} />
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-semibold" style={{ background: ACCENT }}>2</div>
        <span className="text-[12px] font-semibold text-[#1e1813]">Your story</span>
        <div className="flex-1 h-px bg-gray-200" />
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] text-gray-400 bg-white border border-gray-200">3</div>
        <span className="text-[12px] text-gray-400">Build</span>
      </div>

      <h1 className="text-[22px] font-extrabold tracking-tight text-[#1e1813]">A few things your CV can&apos;t tell us</h1>
      <p className="mt-1.5 text-[13px] text-gray-500">All optional — answer any, skip any. Your answers appear in your arc, in your own words.</p>

      <div className="mt-6 space-y-3">
        {questions.map((q) => (
          <div key={q.key} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[13.5px] font-semibold text-[#1e1813] mb-2">{q.question}</p>
            <textarea
              value={answers[q.key] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
              placeholder="A sentence or two — or leave blank to skip"
              rows={2}
              className="w-full text-[13px] px-3 py-2 border border-gray-200 rounded-lg outline-none transition-colors focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300"
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => build(true)}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 text-[14px] font-semibold text-white rounded-xl shadow-sm transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98]"
          style={{ background: ACCENT }}
        >
          <Sparkles className="w-4 h-4" />Build my arc
        </button>
        <button
          onClick={() => build(false)}
          className="px-4 py-3 text-[13px] font-medium text-gray-500 border border-gray-200 rounded-xl hover:text-[#1e1813] hover:border-gray-300 transition-colors"
        >
          Skip questions
        </button>
      </div>
    </div>
  )
}

/** Wizard step 1 when no tailor history exists: paste CV */
function CVPasteStep({ onCv }: { onCv: (cv: string) => void }) {
  const [cv, setCv] = useState("")
  return (
    <div className="max-w-xl mx-auto py-16 px-4">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 shadow-sm" style={{ background: "#fff7f4", color: ACCENT }}>
        <TrendingUp className="w-6 h-6" />
      </div>
      <h1 className="text-[28px] font-extrabold tracking-tight text-[#1e1813]">Build your Career Arc</h1>
      <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">
        Paste your CV, answer a couple of quick questions, and Tailr turns it into a highlight reel of your career.
      </p>
      <textarea
        value={cv} onChange={(e) => setCv(e.target.value)} placeholder="Paste your CV text here…" rows={12}
        className="mt-6 w-full px-3.5 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none transition-colors focus:border-[#dc4f33] focus:ring-2 focus:ring-[#dc4f33]/15 placeholder:text-gray-300"
      />
      <button
        onClick={() => { if (!cv.trim()) { toast.error("Paste your CV first."); return } onCv(cv) }}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold text-white rounded-xl shadow-sm transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98]"
        style={{ background: ACCENT }}
      >
        Continue
      </button>
    </div>
  )
}

function Cover({ s }: { s: CareerProfileSections }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className="relative overflow-hidden px-6 sm:px-10 py-10 sm:py-12" style={{ background: INK }}>
      <div className="absolute pointer-events-none" style={{
        width: 380, height: 380, right: -120, top: -120, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(220,79,51,0.25) 0%, rgba(220,79,51,0) 70%)",
      }} />
      <div className={`relative ${visible ? "animate-fade-in-up" : "opacity-0"}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#f4a58e" }}>Career Arc</p>
        {s.identity.name && (
          <h1 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem, 4.5vw, 2.8rem)", lineHeight: 1.1, color: "#f9f6f0" }}>
            {s.identity.name}<span style={{ color: ACCENT }}>.</span>
          </h1>
        )}
        <p className={`${s.identity.name ? "mt-1.5 text-[16px]" : "mt-3 font-extrabold text-[24px]"}`} style={{ color: s.identity.name ? "#a89e93" : "#f9f6f0" }}>
          {s.identity.roleLine}
        </p>
        {s.stats?.length > 0 && (
          <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {s.stats.slice(0, 4).map((st, i) => (
              <CoverStat key={i} value={st.value} label={st.label} active={visible} />
            ))}
          </div>
        )}
        {s.identity.supportingLine && (
          <p className="mt-6 text-[13px] leading-relaxed max-w-xl" style={{ color: "#8a8178" }}>{s.identity.supportingLine}</p>
        )}
      </div>
    </div>
  )
}

function CoverStat({ value, label, active }: { value: string; label: string; active: boolean }) {
  const numeric = /^\d+$/.test(value.trim()) ? parseInt(value.trim(), 10) : null
  const count = useCountUp(numeric ?? 0, active && numeric !== null)
  return (
    <div className="rounded-xl p-3.5 text-center" style={{ background: "rgba(249,246,240,0.07)" }}>
      <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: "clamp(1.5rem, 3.5vw, 2rem)", color: "#f4a58e" }}>
        {numeric !== null ? count : value}
      </p>
      <p className="mt-1.5 text-[11px]" style={{ color: "#8a8178" }}>{label}</p>
    </div>
  )
}

function StoryQuote({ label, text }: { label: string; text: string }) {
  if (!text) return null
  return (
    <div className="bg-white rounded-r-2xl p-5" style={{ borderLeft: `3px solid ${ACCENT}` }}>
      <p className="text-[10.5px] uppercase tracking-[0.12em] text-gray-400 mb-1.5">{label}</p>
      <p className="text-[14px] text-[#1e1813] leading-relaxed italic">&ldquo;{text}&rdquo;</p>
    </div>
  )
}

function Achievements({ achievements }: { achievements: CareerProfileSections["achievements"] }) {
  if (!achievements?.length) return null
  return (
    <div>
      <SectionHeading icon={Trophy}>The numbers</SectionHeading>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {achievements.slice(0, 4).map((a, i) => (
          <div key={i} className="bg-white rounded-2xl p-5">
            <p className="font-extrabold leading-none" style={{ fontSize: "clamp(1.4rem, 3vw, 1.8rem)", color: ACCENT }}>{a.value}</p>
            <p className="mt-2 text-[12px] text-gray-500 leading-relaxed">{a.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The climb as literal steps: one flat run per role, one vertical jump per move.
    Only the first, last, and milestone steps get labels, so text can never collide. */
function Steps({ s }: { s: CareerProfileSections }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  const n = s.timeline?.length ?? 0
  if (n < 2) return null

  const W = 600, PADX = 20, PADT = 42, PADB = 28, RISE = 40
  const H = PADT + PADB + (n - 1) * RISE
  const run = (W - PADX * 2) / n
  const ys = s.timeline.map((_, i) => H - PADB - i * RISE)
  const xs = s.timeline.map((_, i) => PADX + i * run)

  let d = `M ${xs[0]} ${ys[0]}`
  for (let i = 1; i < n; i++) d += ` L ${xs[i]} ${ys[i - 1]} L ${xs[i]} ${ys[i]}`
  d += ` L ${W - PADX} ${ys[n - 1]}`

  const yearOf = (t: CareerProfileSections["timeline"][number]) => (t.start.match(/\d{4}/)?.[0] ?? "")
  const milestoneYears = new Set((s.growth?.milestones ?? []).map((m) => m.year))
  const labelled = new Set<number>([0, n - 1])
  s.timeline.forEach((t, i) => { if (milestoneYears.has(yearOf(t))) labelled.add(i) })

  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: 4, strokeLinejoin: "round" as const }
  const short = (t: string) => (t.length > 30 ? t.slice(0, 28) + "…" : t)

  return (
    <div ref={ref}>
      <SectionHeading icon={TrendingUp}>The climb</SectionHeading>
      <div className="rounded-2xl bg-white p-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <path
            d={d} fill="none" stroke={ACCENT} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 1400, strokeDashoffset: visible ? 0 : 1400, transition: "stroke-dashoffset 1.4s ease-out" }}
          />
          {Array.from(labelled).sort((a, b) => a - b).map((i, k) => {
            const role = s.timeline[i]
            const isLast = i === n - 1
            const label = short(role.title)
            const estWidth = label.length * 6.6
            const overflows = xs[i] + 5 + estWidth > W - 6
            const lx = overflows ? W - PADX : xs[i] + 5
            const anchor = overflows ? "end" : "start"
            const ly = ys[i]
            return (
              <g key={i} style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease-out ${0.4 + k * 0.15}s` }}>
                <text x={lx} y={ly - 21} textAnchor={anchor} fontSize={11} fontWeight={700} fill={isLast ? ACCENT : INK} style={halo}>{label}</text>
                <text x={lx} y={ly - 9} textAnchor={anchor} fontSize={10} fontWeight={500} fill="#55504a" style={halo}>
                  {isLast && /present|now|current/i.test(role.end) ? "Now" : yearOf(role)}
                </text>
              </g>
            )
          })}
          <circle cx={W - PADX} cy={ys[n - 1]} r={6} fill={ACCENT} style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease-out 1.2s" }} />
        </svg>
        {s.story?.turningPoint && (
          <p className="mt-3 text-[13px] italic border-t border-gray-50 pt-3" style={{ color: "#55504a" }}>&ldquo;{s.story.turningPoint}&rdquo;</p>
        )}
      </div>
    </div>
  )
}

/** The career told as named eras */
function Chapters({ chapters }: { chapters: CareerProfileSections["chapters"] }) {
  if (!chapters?.length) return null
  const TOPS = ["#f5d9d0", "#e68a6d", "#dc4f33", "#993c1d"]
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {chapters.map((ch, i) => (
        <div key={i} className="bg-white p-5 rounded-b-2xl" style={{ borderTop: `3px solid ${TOPS[i % TOPS.length]}` }}>
          <p className="text-[10.5px] uppercase tracking-[0.1em] text-gray-400">Chapter {i + 1} · {ch.span}</p>
          <p className="mt-1.5 text-[15px] font-bold text-[#1e1813]">{ch.name}</p>
          <p className="mt-1 text-[12.5px] text-gray-500 leading-relaxed">{ch.summary}</p>
        </div>
      ))}
    </div>
  )
}

/** Staircase: role-by-role detail, bar width = seniority progression, highlights inline */
function Staircase({ timeline }: { timeline: CareerProfileSections["timeline"] }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  const n = timeline?.length ?? 0
  if (!n) return null
  const rows = [...timeline].reverse() // newest first

  return (
    <div ref={ref}>
      <SectionHeading icon={Briefcase}>Role by role</SectionHeading>
      <div className="rounded-2xl bg-white p-5 divide-y divide-gray-50">
        {rows.map((role, i) => {
          const seniority = (n - i) / n
          const isCurrent = i === 0
          return (
            <div key={i} className="py-4 first:pt-0 last:pb-0">
              <div className="h-2 rounded-full bg-gray-50 mb-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: visible ? `${Math.max(18, seniority * 100)}%` : "0%",
                    background: isCurrent ? ACCENT : `rgba(220,79,51,${0.25 + seniority * 0.5})`,
                    transition: `width 0.8s ease-out ${i * 0.1}s`,
                  }}
                />
              </div>
              <p className="text-[14px] font-bold text-[#1e1813]">
                {role.title}
                <span className="font-normal text-gray-400"> · {role.company}</span>
              </p>
              <p className="text-[11.5px] mb-1" style={{ color: isCurrent ? ACCENT : "#a89e93" }}>
                {isCurrent && /present|now|current/i.test(role.end) ? "Now" : `${role.start}–${role.end}`}
              </p>
              {role.highlights?.map((h, j) => (
                <p key={j} className="text-[13px] text-gray-600 leading-relaxed">{h}</p>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Organisations({ organisations }: { organisations: CareerProfileSections["organisations"] }) {
  if (!organisations?.length) return null
  const MONO_BG = [INK, ACCENT, "#6b6259", "#993c1d", "#444441"]
  return (
    <div>
      <SectionHeading icon={Users}>Organisations</SectionHeading>
      <div className="flex flex-wrap gap-2.5">
        {organisations.map((org, i) => {
          const initials = org.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
          return (
            <div key={i} className="flex items-center gap-2.5 bg-white rounded-xl py-2 pl-2 pr-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-semibold" style={{ background: MONO_BG[i % MONO_BG.length] }}>
                {initials}
              </div>
              <div>
                <p className="text-[12.5px] font-semibold text-[#1e1813]">{org.name}</p>
                <p className="text-[10.5px] text-gray-400">
                  {org.roleCount} role{org.roleCount === 1 ? "" : "s"}{org.span ? ` · ${org.span}` : ""}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SkillBars({ skills }: { skills: CareerProfileSections["skills"] }) {
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
      <SectionHeading>Skills</SectionHeading>
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
                <span key={j} className="text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-[#fff7f4] text-[#1e1813] border border-[#f5d9d0]">{name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrophyCase({ projects, proudestQuote }: { projects: CareerProfileSections["projects"]; proudestQuote: string }) {
  if (!projects?.length) return null
  const featured = projects.find((p) => p.featured)
  const rest = projects.filter((p) => !p.featured)
  return (
    <div>
      <SectionHeading icon={Trophy}>Key projects</SectionHeading>
      {featured && (
        <div className="mb-4 rounded-2xl p-5 text-white" style={{ background: INK }}>
          <p className="text-[10.5px] uppercase tracking-[0.12em] mb-1.5" style={{ color: "#f4a58e" }}>Proudest work</p>
          <p className="text-[16px] font-bold mb-1">{featured.title}</p>
          <p className="text-[13px] leading-relaxed" style={{ color: "#cfc8bf" }}>{featured.summary}</p>
          {proudestQuote && <p className="mt-3 text-[13px] italic" style={{ color: "#f4a58e" }}>&ldquo;{proudestQuote}&rdquo;</p>}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {rest.map((p, i) => (
          <div key={i} className="rounded-2xl bg-white p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: "#fff7f4", color: ACCENT }}>
              <Trophy className="w-4 h-4" />
            </div>
            <p className="text-[14px] font-bold text-[#1e1813] mb-1">{p.title}</p>
            <p className="text-[13px] text-gray-600 leading-relaxed">{p.summary}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Qualities({ qualities }: { qualities: CareerProfileSections["qualities"] }) {
  if (!qualities?.length) return null
  return (
    <div>
      <SectionHeading icon={Star} sub="Inferred from patterns across your CV — a signal, not a verdict.">
        What your career says about you
      </SectionHeading>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {qualities.map((q, i) => {
          const Icon = QUALITY_ICONS[q.icon] ?? Star
          return (
            <div key={i} className="rounded-2xl bg-white p-4">
              <Icon className="w-5 h-5 mb-2" style={{ color: ACCENT }} />
              <p className="text-[14px] font-bold text-[#1e1813]">{q.label}</p>
              <p className="mt-0.5 text-[12px] text-gray-500 leading-relaxed">{q.evidence}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Card-based reveal with full art direction: alternating ink/cream slides,
    ghost numerals, glows, staggered type. Tap to advance, always skippable. */
function RevealCard({ s, onDone }: { s: CareerProfileSections; onDone: () => void }) {
  const years = s.stats?.find((st) => /year/i.test(st.label))
  const roles = s.stats?.find((st) => /role/i.test(st.label))
  const yearsNum = years && /^\d+$/.test(years.value.trim()) ? parseInt(years.value, 10) : null
  const topAchievement = s.achievements?.[0]
  const qualities = (s.qualities ?? []).slice(0, 3)

  type Slide = "title" | "years" | "origin" | "climb" | "number" | "qualities" | "final"
  const slides: Slide[] = [
    "title",
    ...(yearsNum !== null ? (["years"] as Slide[]) : []),
    ...(s.story?.origin ? (["origin"] as Slide[]) : []),
    ...((s.timeline?.length ?? 0) >= 2 ? (["climb"] as Slide[]) : []),
    ...(topAchievement ? (["number"] as Slide[]) : []),
    ...(qualities.length > 0 ? (["qualities"] as Slide[]) : []),
    "final",
  ]
  const [index, setIndex] = useState(0)
  const slide = slides[index]
  const isLast = index === slides.length - 1
  const count = useCountUp(yearsNum ?? 0, slide === "years", 1400)

  // Ink slides feel cinematic; cream slides breathe. Alternate by content weight.
  const DARK: Slide[] = ["title", "climb", "number", "final"]
  const dark = DARK.includes(slide)
  const next = () => { if (isLast) onDone(); else setIndex(index + 1) }

  const stagger = (i: number) => ({ animation: "fade-in-up 0.55s ease-out both", animationDelay: `${0.15 + i * 0.18}s` })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(30,24,19,0.6)", backdropFilter: "blur(4px)" }}>
      <style>{`@keyframes arc-draw { from { stroke-dashoffset: 700; } to { stroke-dashoffset: 0; } }
@keyframes glow-in { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }`}</style>
      <div
        role="dialog"
        aria-label="Your Career Arc reveal"
        className="relative w-full max-w-xl rounded-[28px] p-8 sm:p-12 flex flex-col overflow-hidden shadow-[0_24px_64px_rgba(30,24,19,0.45)] cursor-pointer select-none transition-colors duration-500"
        style={{ background: dark ? INK : "#f9f6f0", minHeight: "30rem" }}
        onClick={next}
      >
        {/* Ambient glow on ink slides */}
        {dark && (
          <div className="absolute pointer-events-none" style={{
            width: 420, height: 420, right: -140, top: -140, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(220,79,51,0.28) 0%, rgba(220,79,51,0) 70%)",
          }} />
        )}

        <div className="relative flex items-center justify-between mb-4">
          <p className="text-[11px] tabular-nums" style={{ color: dark ? "#8a8178" : "#a89e93" }}>
            {String(index + 1).padStart(2, "0")} — {String(slides.length).padStart(2, "0")}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onDone() }}
            className="text-[12px] transition-colors"
            style={{ color: dark ? "#8a8178" : "#a89e93" }}
          >
            Skip
          </button>
        </div>

        <div key={index} className="relative flex-1 flex flex-col justify-center py-6">
          <div className="w-9 h-[3px] mb-7 rounded-full" style={{ background: ACCENT, ...stagger(0) }} />

          {slide === "title" && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] mb-5" style={{ color: "#f4a58e", ...stagger(1) }}>Your Career Arc</p>
              <p className="font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem, 5.5vw, 2.9rem)", lineHeight: 1.15, color: "#f9f6f0" }}>
                {years && roles ? (
                  <>
                    <span className="block" style={stagger(2)}>{years.value} years.</span>
                    <span className="block" style={stagger(3)}>{roles.value} roles.</span>
                    <span className="block" style={{ color: "#f4a58e", ...stagger(4) }}>One direction.</span>
                  </>
                ) : (
                  <span style={stagger(2)}>{s.identity.roleLine}</span>
                )}
              </p>
            </>
          )}

          {slide === "years" && (
            <>
              <p className="absolute right-0 top-1/2 -translate-y-1/2 font-extrabold tabular-nums pointer-events-none" style={{ fontSize: "17rem", lineHeight: 1, color: "rgba(220,79,51,0.07)" }}>
                {years?.value}
              </p>
              <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: "clamp(5rem, 16vw, 8rem)", color: ACCENT, ...stagger(1) }}>{count}</p>
              <p className="mt-4 text-[17px] font-semibold text-gray-500" style={stagger(2)}>years building a career</p>
            </>
          )}

          {slide === "origin" && (
            <>
              <p className="absolute -left-2 -top-2 font-extrabold pointer-events-none" style={{ fontSize: "11rem", lineHeight: 1, color: "rgba(220,79,51,0.1)", fontFamily: "Georgia, serif" }}>&ldquo;</p>
              <p className="text-[11px] uppercase tracking-[0.25em] mb-5 text-gray-400" style={stagger(1)}>Where it started</p>
              <p className="text-[20px] text-[#1e1813] leading-relaxed italic" style={stagger(2)}>&ldquo;{s.story.origin}&rdquo;</p>
            </>
          )}

          {slide === "climb" && (
            <>
              <p className="text-[11px] uppercase tracking-[0.25em] mb-2" style={{ color: "#8a8178", ...stagger(1) }}>The climb</p>
              <p className="text-[16px] font-bold mb-6" style={{ color: "#f9f6f0", ...stagger(2) }}>
                {s.growth?.fromTitle} <span style={{ color: "#8a8178" }}>→</span> <span style={{ color: "#f4a58e" }}>{s.growth?.toTitle}</span>
              </p>
              <div style={stagger(3)}>
                <svg viewBox="0 0 300 110" className="w-full">
                  {(() => {
                    const n = s.timeline.length
                    const run = 280 / n
                    let d = `M 10 ${96}`
                    for (let i = 1; i < n; i++) {
                      const y = 96 - (i * 82) / (n - 1)
                      d += ` L ${10 + i * run} ${96 - ((i - 1) * 82) / (n - 1)} L ${10 + i * run} ${y}`
                    }
                    d += ` L 290 14`
                    return (
                      <>
                        <path d={d} fill="none" stroke="rgba(220,79,51,0.25)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"
                          style={{ strokeDasharray: 700, animation: "arc-draw 1.6s ease-out both", animationDelay: "0.5s" }} />
                        <path d={d} fill="none" stroke={ACCENT} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
                          style={{ strokeDasharray: 700, animation: "arc-draw 1.6s ease-out both", animationDelay: "0.5s" }} />
                        <circle cx={290} cy={14} r={6} fill={ACCENT} style={{ animation: "glow-in 0.4s ease-out both", animationDelay: "2s" }} />
                        <circle cx={290} cy={14} r={12} fill="none" stroke={ACCENT} strokeWidth={1.5} opacity={0.4} style={{ animation: "glow-in 0.5s ease-out both", animationDelay: "2.1s" }} />
                      </>
                    )
                  })()}
                </svg>
              </div>
              <p className="mt-4 text-[12px]" style={{ color: "#8a8178", ...stagger(4) }}>{s.timeline.length} roles, every one a step up</p>
            </>
          )}

          {slide === "number" && topAchievement && (
            <>
              <div className="absolute pointer-events-none" style={{
                width: 300, height: 300, left: "50%", top: "50%", transform: "translate(-50%, -50%)", borderRadius: "50%",
                background: "radial-gradient(circle, rgba(220,79,51,0.18) 0%, rgba(220,79,51,0) 70%)",
                animation: "glow-in 1s ease-out both", animationDelay: "0.3s",
              }} />
              <p className="text-[11px] uppercase tracking-[0.25em] mb-4" style={{ color: "#8a8178", ...stagger(1) }}>One number that says it all</p>
              <p className="font-extrabold leading-none" style={{ fontSize: "clamp(3.2rem, 11vw, 5.5rem)", color: "#f4a58e", textShadow: "0 0 40px rgba(220,79,51,0.35)", ...stagger(2) }}>
                {topAchievement.value}
              </p>
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "#cfc8bf", ...stagger(3) }}>{topAchievement.label}</p>
            </>
          )}

          {slide === "qualities" && (
            <>
              <p className="text-[11px] uppercase tracking-[0.25em] mb-6 text-gray-400" style={stagger(1)}>Your career says you&apos;re a</p>
              <div className="space-y-2">
                {qualities.map((q, i) => (
                  <p key={i} className="font-extrabold tracking-tight flex items-baseline gap-3" style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)", lineHeight: 1.2, color: i === qualities.length - 1 ? ACCENT : INK, ...stagger(2 + i) }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0 translate-y-[-0.35rem]" style={{ background: ACCENT }} />
                    {q.label}.
                  </p>
                ))}
              </div>
            </>
          )}

          {slide === "final" && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] mb-5" style={{ color: "#f4a58e", ...stagger(1) }}>Ready</p>
              <p className="font-extrabold tracking-tight mb-8" style={{ fontSize: "clamp(1.8rem, 5vw, 2.6rem)", lineHeight: 1.2, color: "#f9f6f0", ...stagger(2) }}>
                This is your Career Arc{s.identity.name ? `, ${s.identity.name.split(" ")[0]}` : ""}<span style={{ color: ACCENT }}>.</span>
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); onDone() }}
                className="self-start inline-flex items-center gap-2 px-6 py-3 text-[15px] font-semibold text-white rounded-xl shadow-lg transition-all hover:shadow-xl hover:brightness-105 active:scale-[0.98]"
                style={{ background: ACCENT, boxShadow: "0 8px 24px rgba(220,79,51,0.4)", ...stagger(3) }}
              >
                See the full picture
              </button>
            </>
          )}
        </div>

        <div className="relative flex items-center justify-between mt-6">
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <div key={i} className="h-1 rounded-full transition-all duration-300" style={{ width: i === index ? 22 : 8, background: i <= index ? ACCENT : dark ? "#4a4038" : "#e8ddd2" }} />
            ))}
          </div>
          {!isLast && <p className="text-[11px]" style={{ color: dark ? "#6b6259" : "#c4bab0" }}>tap to continue</p>}
        </div>
      </div>
    </div>
  )
}

function CareerArcView({ profile, onRebuild, reveal }: { profile: Profile; onRebuild: () => void; reveal: boolean }) {
  const s = profile.sections
  const [showReveal, setShowReveal] = useState(reveal)

  const replay = () => setShowReveal(true)

  const Section = ({ children }: { children: React.ReactNode }) => (
    <div className="py-10 first:pt-0 last:pb-0"><Reveal>{children}</Reveal></div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-20">
      {showReveal && <RevealCard s={s} onDone={() => setShowReveal(false)} />}

      <div className="rounded-[24px] overflow-hidden border border-[#e0d6c9] shadow-[0_16px_48px_rgba(30,24,19,0.14)]">
        <Cover s={s} />
        <div className="px-6 sm:px-10 py-10 divide-y divide-[#ece2d6]" style={{ background: "#fdfcf9" }}>
          {s.story?.origin && <Section><StoryQuote label="Where it started" text={s.story.origin} /></Section>}
          <Section><Achievements achievements={s.achievements} /></Section>
          <Section><Steps s={s} /></Section>
          {(s.chapters?.length ?? 0) > 0 && <Section><Chapters chapters={s.chapters} /></Section>}
          <Section><Staircase timeline={s.timeline} /></Section>
          <Section>
            <div className="grid lg:grid-cols-2 gap-10 items-start">
              <Organisations organisations={s.organisations} />
              <SkillBars skills={s.skills} />
            </div>
          </Section>
          <Section><TrophyCase projects={s.projects} proudestQuote="" /></Section>
          <Section><Qualities qualities={s.qualities} /></Section>
          {s.story?.ambition && <Section><StoryQuote label="Where this is heading" text={s.story.ambition} /></Section>}
        </div>
      </div>

      <div className="mt-8 text-center">
        <Reveal>
          <div className="pt-2 text-center">
            <div className="inline-flex items-center gap-3">
              <button
                onClick={replay}
                className="text-[13px] font-medium text-gray-400 hover:text-[#1e1813] border border-gray-200 hover:border-gray-300 rounded-lg px-4 py-2 transition-colors"
              >
                Replay the reveal
              </button>
              <button
                onClick={onRebuild}
                className="text-[13px] font-medium text-gray-400 hover:text-[#1e1813] border border-gray-200 hover:border-gray-300 rounded-lg px-4 py-2 transition-colors"
              >
                Rebuild my arc
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

type WizardState =
  | { step: "loading" }
  | { step: "paste" }
  | { step: "fetching-questions"; cv: string }
  | { step: "questions"; cv: string; questions: CareerQuestion[] }
  | { step: "done"; profile: Profile; fresh: boolean }

export default function CareerArcPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [state, setState] = useState<WizardState>({ step: "loading" })

  useEffect(() => {
    if (!authLoading && !user) router.push("/tailor")
  }, [authLoading, user, router])

  const startWizard = useCallback(async (cv: string) => {
    setState({ step: "fetching-questions", cv })
    try {
      const res = await fetch("/api/career-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv, mode: "questions" }),
      })
      const data = await readJson<{ questions: CareerQuestion[] }>(res)
      setState({ step: "questions", cv, questions: data.questions })
    } catch (err) {
      if (err instanceof Error && /paste your CV/i.test(err.message)) {
        setState({ step: "paste" })
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to read your CV.")
        setState({ step: "paste" })
      }
    }
  }, [])

  useEffect(() => {
    if (!user) return
    fetch("/api/career-profile")
      .then((res) => readJson<{ profile: Profile | null }>(res))
      .then((data) => {
        // Old-schema rows (pre-redesign) lack identity — treat as not built yet
        if (data.profile?.sections?.identity) {
          setState({ step: "done", profile: data.profile, fresh: false })
        } else {
          startWizard("")
        }
      })
      .catch(() => setState({ step: "paste" }))
  }, [user, startWizard])

  if (authLoading || !user || state.step === "loading") {
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

      {state.step === "done" && (
        <CareerArcView profile={state.profile} onRebuild={() => startWizard("")} reveal={state.fresh} />
      )}
      {state.step === "paste" && <CVPasteStep onCv={startWizard} />}
      {state.step === "fetching-questions" && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          <p className="text-sm text-gray-400">Reading your CV…</p>
        </div>
      )}
      {state.step === "questions" && (
        <QuestionsStep
          cv={state.cv}
          questions={state.questions}
          onBuilt={(profile) => setState({ step: "done", profile, fresh: true })}
        />
      )}
    </div>
  )
}
