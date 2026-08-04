"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Sparkles, TrendingUp } from "lucide-react"
import { Header } from "@/components/cv-tailor/header"
import { useAuth } from "@/components/auth/auth-provider"
import { LedgerView, type EvidenceAction } from "@/components/career-arc/ledger-view"
import { RevealCard } from "@/components/career-arc/reveal-card"
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
      {showReveal && bank !== null && (
        <RevealCard
          sections={s}
          evidence={bank.evidence}
          usage={bank.usage}
          onDone={() => setShowReveal(false)}
        />
      )}
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
