"use client"

import { useState, useCallback, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Header } from "@/components/cv-tailor/header"
import { ResizablePanels } from "@/components/cv-tailor/resizable-panels"
import { TailorButton } from "@/components/cv-tailor/tailor-button"
import { ResultsTabs } from "@/components/cv-tailor/results-tabs"
import { EmptyState } from "@/components/cv-tailor/empty-state"
import { SignInModal } from "@/components/auth/sign-in-modal"
import { useAuth } from "@/components/auth/auth-provider"
import { ProgressSteps } from "@/components/cv-tailor/progress-steps"
import { HistoryDrawer, type HistoryItem } from "@/components/cv-tailor/history-drawer"
import type { TailorResult, CoverLetterResult, PitchesResult, InterviewPrepResult } from "@/lib/anthropic"
import { markOnboardingStep, isOnboardingDismissed } from "@/lib/onboarding"
import { isAdminEmail } from "@/lib/admin"
import { Lightbulb, X } from "lucide-react"

/**
 * Safely read a JSON API response. If the body isn't JSON — e.g. Vercel's
 * "An error occurred…" gateway page when a function times out (the source of
 * the old "Unexpected token A" error) — return a clear, status-aware message
 * instead of letting JSON.parse throw a cryptic error.
 */
async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON body — almost always a platform timeout/crash page
    if (res.status === 504 || res.status === 408 || /timeout|timed out/i.test(text)) {
      throw new Error("That took too long to process. Try a shorter CV or job description, then run it again.")
    }
    throw new Error(`The server returned an unexpected response (${res.status}). Please try again in a moment.`)
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error
    throw new Error(msg || `Server error ${res.status}. Please try again.`)
  }
  return data as T
}

function AuthErrorHandler() {
  const searchParams = useSearchParams()
  useEffect(() => {
    const error = searchParams.get("error")
    const desc = searchParams.get("error_description") ?? ""
    if (error) {
      const msg = desc.includes("expired")
        ? "That sign-in link has expired — please request a new one."
        : desc.includes("already")
        ? "This link has already been used. Please request a new one."
        : "Sign-in failed. Please try again."
      toast.error(msg, { duration: 6000 })
    }
  }, [searchParams])
  return null
}

export default function CVTailorPage() {
  const { user } = useAuth()
  // Enhanced workspace UI — now rolled out to everyone.
  const enhanced = true
  const [cvText, setCvText] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<TailorResult | null>(null)
  const [showSignIn, setShowSignIn] = useState(false)

  const hasContent = cvText.length > 0 || jobDescription.length > 0
  const canTailor = cvText.length > 0 && jobDescription.length > 0

  // Onboarding: tick "paste a job description" once there's content
  useEffect(() => {
    if (jobDescription.trim().length > 0) markOnboardingStep("job")
  }, [jobDescription])

  const [loadingStatus, setLoadingStatus] = useState("Tailoring…")
  const [progressStep, setProgressStep] = useState(0)
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [pitches, setPitches] = useState<PitchesResult["interviewPitches"] | null>(null)
  const [loadingCoverLetter, setLoadingCoverLetter] = useState(false)
  const [loadingPitches, setLoadingPitches] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [scrapedJobUrl, setScrapedJobUrl] = useState("")
  const [prepQuestions, setPrepQuestions] = useState<InterviewPrepResult["interviewQuestions"] | null>(null)
  const [loadingPrep, setLoadingPrep] = useState(false)
  const [companyAnalysis, setCompanyAnalysis] = useState<string | null>(null)
  const [loadingCompany, setLoadingCompany] = useState(false)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [tailoredFromCv, setTailoredFromCv] = useState<string | null>(null)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)

  // Onboarding guidance (coachmarks, feature strip, post-tailor nudge) —
  // gated to the admin account for review before a wider rollout.
  const guideEnabled = isAdminEmail(user?.email) && !isOnboardingDismissed()
  const guideStep: "cv" | "job" | "tailor" | null = !guideEnabled
    ? null
    : cvText.length === 0 ? "cv"
    : jobDescription.length === 0 ? "job"
    : !results ? "tailor"
    : null

  const handleTailor = useCallback(async () => {
    if (!canTailor) return
    if (!user) { setShowSignIn(true); return }

    setIsLoading(true)
    setResults(null)
    setCoverLetter(null)
    setPitches(null)
    setPrepQuestions(null)
    setCompanyAnalysis(null)
    setHistoryId(null)
    setProgressStep(0)
    setLoadingStatus("Analysing job requirements…")

    try {
      // Step through progress indicators while Claude works (~5s per step)
      const stepInterval = setInterval(() => {
        setProgressStep((s) => {
          const next = s + 1
          const labels = ["Analysing job requirements…", "Matching your experience…", "Rewriting bullet points…", "Checking ATS compatibility…", "Finalising your CV…"]
          if (next < labels.length) setLoadingStatus(labels[next])
          return Math.min(next, 4)
        })
      }, 5000)

      // Client-side timeout slightly under the platform limit, so we show a
      // clean message rather than waiting on a gateway error page.
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 290_000)

      let data: { result?: TailorResult; historyId?: string | null; compressed?: boolean; cached?: boolean; error?: string }
      try {
        const res = await fetch("/api/tailor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cv: cvText, jobDescription, jobUrl: scrapedJobUrl }),
          signal: ac.signal,
        })
        data = await readJson<{ result?: TailorResult; historyId?: string | null; error?: string }>(res)
      } finally {
        clearTimeout(timer)
        clearInterval(stepInterval)
      }

      setProgressStep(4)

      if (!data.result) {
        throw new Error("No result returned from server. Please try again.")
      }

      setResults(data.result)
      setHistoryId(data.historyId ?? null)
      setTailoredFromCv(cvText)
      markOnboardingStep("tailor")

      if (data.cached) {
        toast.info("Same CV and job as a previous run — showing your existing result.", { duration: 6000 })
      }

      if (data.compressed) {
        toast.info("Your CV was quite long, so we removed formatting noise before tailoring. All your experience and content is preserved.", { duration: 8000 })
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError"
      toast.error(
        aborted
          ? "That took too long to process. Try a shorter CV or job description, then run it again."
          : err instanceof Error ? err.message : "Failed to tailor CV. Please try again."
      )
    } finally {
      setIsLoading(false)
      setLoadingStatus("Tailoring…")
      setProgressStep(0)
    }
  }, [canTailor, user, cvText, jobDescription])

  const handleGenerateCoverLetter = useCallback(async () => {
    setLoadingCoverLetter(true)
    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: cvText, jobDescription }),
      })
      const data = await readJson<CoverLetterResult>(res)
      setCoverLetter(data.coverLetter)
      markOnboardingStep("cover")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate cover letter.")
    } finally {
      setLoadingCoverLetter(false)
    }
  }, [cvText, jobDescription])

  const handleGeneratePitches = useCallback(async () => {
    setLoadingPitches(true)
    try {
      const res = await fetch("/api/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: cvText, jobDescription }),
      })
      const data = await readJson<PitchesResult>(res)
      setPitches(data.interviewPitches)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate pitches.")
    } finally {
      setLoadingPitches(false)
    }
  }, [cvText, jobDescription])

  const handleGeneratePrep = useCallback(async () => {
    setLoadingPrep(true)
    try {
      const res = await fetch("/api/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: cvText, jobDescription }),
      })
      const data = await readJson<InterviewPrepResult>(res)
      setPrepQuestions(data.interviewQuestions)
      markOnboardingStep("prep")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate interview prep.")
    } finally {
      setLoadingPrep(false)
    }
  }, [cvText, jobDescription])

  const handleGenerateCompany = useCallback(async () => {
    if (!results) return
    setLoadingCompany(true)
    try {
      const res = await fetch("/api/company-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: results.companyName,
          jobTitle: results.jobTitle,
          jobDescription,
        }),
      })
      const data = await readJson<{ companyAnalysis: string }>(res)
      setCompanyAnalysis(data.companyAnalysis)
      markOnboardingStep("company")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to analyse company.")
    } finally {
      setLoadingCompany(false)
    }
  }, [results, jobDescription])

  const handleRestoreHistory = useCallback((item: HistoryItem) => {
    setResults(item.result)
    setCoverLetter(null)
    setPitches(null)
    setPrepQuestions(null)
    setCompanyAnalysis(null)
    setHistoryId(item.id)
    setTailoredFromCv(null)
  }, [])

  return (
    <div className={`min-h-screen flex flex-col ${enhanced ? "bg-[#f4f1ea]" : "bg-white"}`}>
      <Suspense fallback={null}><AuthErrorHandler /></Suspense>
      <Header
        enhanced={enhanced}
        onSignInClick={() => setShowSignIn(true)}
        onHistoryClick={() => setHistoryOpen(true)}
      />

      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-4">
        {/* Workspace panels */}
        <div className={`flex-1 flex flex-col min-h-[60vh] ${enhanced ? "pt-5" : ""}`}>
          <ResizablePanels
            enhanced={enhanced}
            guideStep={guideStep}
            cvText={cvText}
            setCvText={setCvText}
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            onJobUrlScraped={setScrapedJobUrl}
          />
        </div>

        {/* Match score (shown once results are ready) */}
        {results && (
          enhanced
            ? <div className="pt-2 pb-4"><MatchScoreBar score={results.matchScore} /></div>
            : <div className="py-4 flex justify-center"><MatchScoreBadge score={results.matchScore} /></div>
        )}

        {/* CTA */}
        <div className={`py-6 flex flex-col items-center gap-3 ${enhanced ? "" : "border-t border-gray-100"}`}>
          <TailorButton
            enhanced={enhanced}
            isLoading={isLoading}
            loadingStatus={loadingStatus}
            onClick={handleTailor}
            disabled={!canTailor}
            isLimitReached={false}
          />
          {isLoading && <ProgressSteps currentStep={progressStep} />}
          {!user && canTailor && !isLoading && (
            <p className="text-xs text-gray-400">Sign in to tailor your CV</p>
          )}
          {guideStep === "tailor" && user && !isLoading && (
            <p className="inline-flex items-center gap-2 text-xs font-medium text-[#dc4f33]">
              <span className="w-5 h-5 rounded-full bg-[#dc4f33] text-white text-[11px] font-extrabold flex items-center justify-center">3</span>
              You&apos;re all set — hit Tailor my CV
            </p>
          )}
        </div>

        {/* Results section */}
        <div className="pb-12">
          {results ? (
            <>
              {guideEnabled && !nudgeDismissed && (
                <NextStepNudge
                  prepDone={!!prepQuestions}
                  coverDone={!!coverLetter}
                  companyDone={!!companyAnalysis}
                  onDismiss={() => setNudgeDismissed(true)}
                />
              )}
              <div className={`relative z-10 ${enhanced ? "" : "bg-white"}`}>
                <ResultsTabs
                  enhanced={enhanced}
                  results={results}
                  coverLetter={coverLetter}
                  loadingCoverLetter={loadingCoverLetter}
                  onGenerateCoverLetter={handleGenerateCoverLetter}
                  prepQuestions={prepQuestions}
                  loadingPrep={loadingPrep}
                  onGeneratePrep={handleGeneratePrep}
                  pitches={pitches}
                  loadingPitches={loadingPitches}
                  onGeneratePitches={handleGeneratePitches}
                  originalCV={tailoredFromCv}
                  companyAnalysis={companyAnalysis}
                  loadingCompany={loadingCompany}
                  onGenerateCompany={handleGenerateCompany}
                  historyId={historyId}
                />
              </div>
            </>
          ) : !hasContent ? (
            <EmptyState guide={guideEnabled} />
          ) : null}
        </div>
      </main>

      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleRestoreHistory}
      />
    </div>
  )
}

function NextStepNudge({
  prepDone, coverDone, companyDone, onDismiss,
}: { prepDone: boolean; coverDone: boolean; companyDone: boolean; onDismiss: () => void }) {
  // Point the user at the first feature they haven't explored yet.
  const next =
    !prepDone ? { tab: "Interview Prep", desc: "see the questions you'll likely be asked" } :
    !coverDone ? { tab: "Cover Letter", desc: "generate a tailored cover letter in one click" } :
    !companyDone ? { tab: "Company", desc: "get a quick brief on the company" } :
    null
  if (!next) return null

  return (
    <div className="mb-4 flex items-center gap-3 bg-[#fff7f4] border border-[#f5d9d0] rounded-xl px-4 py-3">
      <Lightbulb className="w-4 h-4 text-[#dc4f33] flex-shrink-0" />
      <p className="flex-1 text-[13px] text-[#1e1813]">
        Nice — your CV is tailored. <span className="font-semibold">Next:</span> open the{" "}
        <span className="font-semibold text-[#dc4f33]">{next.tab}</span> tab to {next.desc}.
      </p>
      <button onClick={onDismiss} className="p-1 -mr-1 rounded text-gray-300 hover:text-gray-500 hover:bg-black/5 transition-colors" aria-label="Dismiss tip">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function MatchScoreBar({ score }: { score: number }) {
  const verdict =
    score >= 75 ? { label: "Strong match", sub: "Your experience covers most must-have requirements.", color: "#1d9e75", ring: "#1d9e75", track: "#d3eee4" } :
    score >= 50 ? { label: "Moderate match", sub: "A solid base — check Gaps to strengthen the rest.", color: "#bf7d10", ring: "#e0a32a", track: "#f5e6c8" } :
    { label: "Low match — room to improve", sub: "See Gaps to close the missing requirements.", color: "#dc4f33", ring: "#dc4f33", track: "#f0d9d2" }

  const c = 2 * Math.PI * 19
  return (
    <div className="flex items-center gap-4 bg-[#faf8f3] border border-[#f0ebe1] rounded-2xl px-5 py-4">
      <div className="relative w-12 h-12 flex-shrink-0">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="19" fill="none" stroke={verdict.track} strokeWidth="5" />
          <circle cx="23" cy="23" r="19" fill="none" stroke={verdict.ring} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(score / 100) * c} ${c}`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold" style={{ color: verdict.color }}>{score}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-[#1e1813]">{verdict.label}</p>
        <p className="text-[12.5px] text-gray-500">{verdict.sub}</p>
      </div>
    </div>
  )
}

function MatchScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? "bg-green-50 text-green-700 border-green-200" :
    score >= 50 ? "bg-amber-50 text-amber-700 border-amber-200" :
    "bg-red-50 text-red-700 border-red-200"

  const label =
    score >= 75 ? "Strong match" :
    score >= 50 ? "Moderate match" :
    "Low match"

  return (
    <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full border text-sm font-medium ${color}`}>
      <div className="relative w-8 h-8">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
          <circle
            cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={`${(score / 100) * 75.4} 75.4`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">{score}</span>
      </div>
      {label} — {score}% match
    </div>
  )
}
