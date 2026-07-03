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

function Hero({ s }: { s: CareerProfileSections }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={visible ? "animate-fade-in-up" : "opacity-0"}>
      <div className="pt-14 pb-4 px-4 max-w-4xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: ACCENT }}>Career Arc</p>
        {s.identity.name && (
          <h1 className="mt-2 font-extrabold tracking-tight text-[#1e1813]" style={{ fontSize: "clamp(1.9rem, 4.5vw, 2.6rem)", lineHeight: 1.1 }}>
            {s.identity.name}
          </h1>
        )}
        <p className={`${s.identity.name ? "mt-1 text-[17px] text-gray-500" : "mt-2 font-extrabold tracking-tight text-[#1e1813]"}`}
          style={s.identity.name ? undefined : { fontSize: "clamp(1.6rem, 4vw, 2.2rem)", lineHeight: 1.15 }}>
          {s.identity.roleLine}
        </p>
        {s.stats?.length > 0 && (
          <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {s.stats.slice(0, 4).map((st, i) => <StatBlock key={i} value={st.value} label={st.label} active={visible} />)}
          </div>
        )}
        {s.identity.supportingLine && (
          <p className="mt-5 text-[13px] text-gray-400 leading-relaxed max-w-xl">{s.identity.supportingLine}</p>
        )}
      </div>
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

/** The ascent: mountain area chart, 2-3 milestone camps only, turning point quote as caption */
function Ascent({ s }: { s: CareerProfileSections }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  const n = s.timeline?.length ?? 0
  if (n < 2) return null

  const W = 600, H = 214, PADX = 24, PADY = 42
  const points = s.timeline.map((_, i) => ({
    x: PADX + (i * (W - PADX * 2)) / (n - 1),
    y: H - PADY - (i * (H - PADY * 2)) / (n - 1),
  }))
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const area = `${line} L ${points[n - 1].x} ${H - 6} L ${points[0].x} ${H - 6} Z`

  const milestones = (s.growth?.milestones ?? []).slice(0, 3)
  const yearOf = (t: CareerProfileSections["timeline"][number]) => (t.start.match(/\d{4}/)?.[0] ?? "")
  const camps = milestones.map((m) => {
    const idx = s.timeline.findIndex((t) => yearOf(t) === m.year)
    return { ...m, idx: idx >= 0 ? idx : null }
  }).filter((c): c is typeof c & { idx: number } => c.idx !== null)

  return (
    <div ref={ref}>
      <SectionHeading icon={TrendingUp}>The climb</SectionHeading>
      <div className="rounded-2xl bg-white p-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <path d={area} fill="#fdeee8" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.8s ease-out 0.4s" }} />
          <path
            d={line} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 900, strokeDashoffset: visible ? 0 : 900, transition: "stroke-dashoffset 1.2s ease-out" }}
          />
          {camps.map((c, i) => {
            const p = points[c.idx]
            const isLast = c.idx === n - 1
            const anchor = c.idx === 0 ? "start" : isLast ? "end" : "middle"
            const tx = c.idx === 0 ? p.x : isLast ? p.x + 6 : p.x
            const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: 4, strokeLinejoin: "round" as const }
            return (
              <g key={i} style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease-out ${0.5 + i * 0.2}s` }}>
                <circle cx={p.x} cy={p.y} r={isLast ? 7 : 5} fill={isLast ? ACCENT : "#fff"} stroke={ACCENT} strokeWidth={2.5} />
                {isLast ? (
                  <>
                    <text x={tx} y={p.y - 26} textAnchor={anchor} fontSize={12} fontWeight={700} fill={INK} style={halo}>{c.year}</text>
                    <text x={tx} y={p.y - 13} textAnchor={anchor} fontSize={11} fontWeight={500} fill={INK} style={halo}>{c.label}</text>
                  </>
                ) : (
                  <>
                    <text x={tx} y={p.y + 20} textAnchor={anchor} fontSize={12} fontWeight={700} fill={INK} style={halo}>{c.year}</text>
                    <text x={tx} y={p.y + 33} textAnchor={anchor} fontSize={11} fontWeight={500} fill={INK} style={halo}>{c.label}</text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
        {s.story?.turningPoint && (
          <p className="mt-3 text-[13px] italic border-t border-gray-50 pt-3" style={{ color: "#55504a" }}>&ldquo;{s.story.turningPoint}&rdquo;</p>
        )}
      </div>
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

function CareerArcView({ profile, onRebuild }: { profile: Profile; onRebuild: () => void }) {
  const s = profile.sections
  return (
    <div>
      <Hero s={s} />
      <div className="max-w-4xl mx-auto px-4 space-y-14 pb-20 pt-8">
        {s.story?.origin && <Reveal><StoryQuote label="Where it started" text={s.story.origin} /></Reveal>}
        <Reveal><Achievements achievements={s.achievements} /></Reveal>
        <Reveal><Ascent s={s} /></Reveal>
        <Reveal><Staircase timeline={s.timeline} /></Reveal>
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <Reveal><Organisations organisations={s.organisations} /></Reveal>
          <Reveal><SkillBars skills={s.skills} /></Reveal>
        </div>
        <Reveal><TrophyCase projects={s.projects} proudestQuote="" /></Reveal>
        <Reveal><Qualities qualities={s.qualities} /></Reveal>
        {s.story?.ambition && <Reveal><StoryQuote label="Where this is heading" text={s.story.ambition} /></Reveal>}
        <Reveal>
          <div className="pt-2 text-center">
            <button
              onClick={onRebuild}
              className="text-[13px] font-medium text-gray-400 hover:text-[#1e1813] border border-gray-200 hover:border-gray-300 rounded-lg px-4 py-2 transition-colors"
            >
              Rebuild my arc
            </button>
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
  | { step: "done"; profile: Profile }

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
          setState({ step: "done", profile: data.profile })
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
        <CareerArcView profile={state.profile} onRebuild={() => startWizard("")} />
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
          onBuilt={(profile) => setState({ step: "done", profile })}
        />
      )}
    </div>
  )
}
