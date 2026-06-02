"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { Header } from "@/components/cv-tailor/header"
import { ResizablePanels } from "@/components/cv-tailor/resizable-panels"
import { TailorButton } from "@/components/cv-tailor/tailor-button"
import { ResultsTabs } from "@/components/cv-tailor/results-tabs"
import { EmptyState } from "@/components/cv-tailor/empty-state"
import { InterviewPitches } from "@/components/cv-tailor/interview-pitches"
import { SignInModal } from "@/components/auth/sign-in-modal"
import { useAuth } from "@/components/auth/auth-provider"
import type { TailorResult } from "@/lib/anthropic"

export default function CVTailorPage() {
  const { user } = useAuth()
  const [cvText, setCvText] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<TailorResult | null>(null)
  const [showSignIn, setShowSignIn] = useState(false)

  const hasContent = cvText.length > 0 || jobDescription.length > 0
  const canTailor = cvText.length > 0 && jobDescription.length > 0

  const handleTailor = useCallback(async () => {
    if (!canTailor) return

    if (!user) {
      setShowSignIn(true)
      return
    }

    setIsLoading(true)
    setResults(null)

    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: cvText, jobDescription }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Something went wrong")
      }

      const { result } = await res.json()
      setResults(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to tailor CV. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [canTailor, user, cvText, jobDescription])

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header onSignInClick={() => setShowSignIn(true)} />

      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-4">
        {/* Workspace panels */}
        <div className="flex-1 flex flex-col min-h-[60vh]">
          <ResizablePanels
            cvText={cvText}
            setCvText={setCvText}
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
          />
        </div>

        {/* Match score (shown once results are ready) */}
        {results && (
          <div className="py-4 flex justify-center">
            <MatchScoreBadge score={results.matchScore} />
          </div>
        )}

        {/* CTA */}
        <div className="py-6 flex flex-col items-center gap-2 border-t border-gray-100">
          <TailorButton
            isLoading={isLoading}
            onClick={handleTailor}
            disabled={!canTailor}
            isLimitReached={false}
          />
          {!user && canTailor && !isLoading && (
            <p className="text-xs text-gray-400">Sign in to tailor your CV</p>
          )}
        </div>

        {/* Results section */}
        <div className="pb-12">
          {results ? (
            <>
              <ResultsTabs results={results} />
              <InterviewPitches pitches={results.interviewPitches} />
            </>
          ) : !hasContent ? (
            <EmptyState />
          ) : null}
        </div>
      </main>

      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
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
