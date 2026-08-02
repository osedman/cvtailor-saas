"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Sparkles, TrendingUp } from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import { LedgerView, type EvidenceAction } from "@/components/career-arc/ledger-view"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import type { CareerProfileSections, CareerQuestion } from "@/lib/anthropic"

const ACCENT = "#dc4f33"
const INK = "#1e1813"

interface Profile {
  id: string
  source: string
  updated_at?: string
  sections: CareerProfileSections
}

interface EvidenceBankData {
  evidence: EvidenceRow[]
  usage: Record<string, number>
  usedCvCount: number
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

function formatExtractedDate(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function CareerArcView({ profile, onRebuild, reveal }: { profile: Profile; onRebuild: () => void; reveal: boolean }) {
  const s = profile.sections
  const [showReveal, setShowReveal] = useState(reveal)
  const [bank, setBank] = useState<EvidenceBankData | null>(null)

  const loadBank = useCallback(async () => {
    const res = await fetch("/api/career-evidence")
    const data = await readJson<EvidenceBankData>(res)
    setBank({ evidence: data.evidence ?? [], usage: data.usage ?? {}, usedCvCount: data.usedCvCount ?? 0 })
  }, [])

  useEffect(() => {
    loadBank().catch(() => setBank({ evidence: [], usage: {}, usedCvCount: 0 }))
  }, [loadBank])

  const onAction = useCallback(async (action: EvidenceAction) => {
    const res = await fetch("/api/career-evidence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    })
    const data = await readJson<{ evidence: EvidenceRow[] }>(res)
    setBank((prev) => (prev ? { ...prev, evidence: data.evidence } : prev))
    // Usage and the reuse stat shift when the bank changes — refresh quietly.
    loadBank().catch(() => {})
  }, [loadBank])

  return (
    <>
      {showReveal && <RevealCard s={s} onDone={() => setShowReveal(false)} />}
      {bank === null ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          <p className="text-sm text-gray-400">Opening your ledger…</p>
        </div>
      ) : (
        <LedgerView
          sections={s}
          lastExtracted={formatExtractedDate(profile.updated_at)}
          evidence={bank.evidence}
          usage={bank.usage}
          usedCvCount={bank.usedCvCount}
          onAction={onAction}
          onRebuild={onRebuild}
          onReplay={() => setShowReveal(true)}
        />
      )}
    </>
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
  const [betaLocked, setBetaLocked] = useState(false)

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
      .then((res) => {
        if (res.status === 403) { setBetaLocked(true); return Promise.reject(new Error("beta")) }
        return readJson<{ profile: Profile | null }>(res)
      })
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

  if (betaLocked) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-[#1e1813]">Career Arc is in a small private beta.</p>
        <p className="text-sm text-gray-500 max-w-sm">We&apos;re finishing it properly before it comes to everyone.</p>
        <Link href="/tailor" className="text-sm text-[#dc4f33] hover:underline">Back to tailoring</Link>
      </div>
    )
  }

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
      <div className="max-w-[1080px] mx-auto px-4 pt-4">
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
