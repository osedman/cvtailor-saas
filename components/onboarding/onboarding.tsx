"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sparkles, X, Check, ChevronDown, ChevronUp, ArrowRight, Rocket } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import {
  ONBOARDING_STEPS, isStepDone, onboardingProgress, isOnboardingComplete,
  isOnboardingDismissed, dismissOnboarding, hasSeenWelcome, markWelcomeSeen,
  type OnboardingStep,
} from "@/lib/onboarding"

const ACCENT = "#dc4f33"

// Only surface onboarding inside the signed-in app, never on marketing/auth.
const APP_PREFIXES = ["/tailor", "/history", "/tracker"]

/** Subscribe to the cross-app onboarding change event + storage + focus. */
function useOnboardingTick() {
  const [, force] = useState(0)
  useEffect(() => {
    const bump = () => force((n) => n + 1)
    window.addEventListener("tailr:onboarding", bump)
    window.addEventListener("storage", bump)
    window.addEventListener("focus", bump)
    return () => {
      window.removeEventListener("tailr:onboarding", bump)
      window.removeEventListener("storage", bump)
      window.removeEventListener("focus", bump)
    }
  }, [])
}

// ── Welcome modal (first /tailor visit) ──────────────────────────────────

function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 animate-fade-in-up">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: "#fff7f4", color: ACCENT }}>
          <Rocket className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight text-[#1e1813]">Welcome to Tailr</h2>
        <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">
          Here is the 30 second flow to your first tailored CV:
        </p>
        <ol className="mt-4 space-y-2.5">
          {[
            ["Drop in your CV", "Upload a PDF or DOCX, or paste it"],
            ["Paste the job", "Or drop a LinkedIn or Indeed link"],
            ["Hit Tailor", "Get an evidence-checked rewrite and match score"],
          ].map(([t, d], i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: ACCENT }}>{i + 1}</span>
              <div>
                <p className="text-sm font-semibold text-[#1e1813] leading-snug">{t}</p>
                <p className="text-xs text-gray-400">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <button
          onClick={onClose}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white rounded-xl transition-colors"
          style={{ background: ACCENT }}
        >
          Let&apos;s go <ArrowRight className="w-4 h-4" />
        </button>
        <p className="mt-3 text-center text-[11px] text-gray-400">
          We&apos;ll keep a quick checklist in the corner to guide you.
        </p>
      </div>
    </div>
  )
}

// ── Getting-started checklist (persistent, bottom-left) ───────────────────

function Checklist({ onDismiss }: { onDismiss: () => void }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const { done, total } = onboardingProgress()

  const go = (id: OnboardingStep) => {
    if (id === "tracker") router.push("/tracker")
    else router.push("/tailor")
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white shadow-[0_12px_40px_rgba(30,24,19,0.14)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#fff7f4", color: ACCENT }}>
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-[#1e1813] leading-tight">Getting started</p>
          <p className="text-[11px] text-gray-400">{done} of {total} done</p>
        </div>
        {collapsed ? <ChevronUp className="w-4 h-4 text-gray-300" /> : <ChevronDown className="w-4 h-4 text-gray-300" />}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDismiss() } }}
          className="p-1 -mr-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </span>
      </button>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div className="h-full transition-all duration-300" style={{ width: `${(done / total) * 100}%`, background: ACCENT }} />
      </div>

      {/* Steps */}
      {!collapsed && (
        <ul className="p-2">
          {ONBOARDING_STEPS.map((s) => {
            const ok = isStepDone(s.id)
            return (
              <li key={s.id}>
                <button
                  onClick={() => !ok && go(s.id)}
                  disabled={ok}
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${ok ? "cursor-default" : "hover:bg-gray-50"}`}
                >
                  <span className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center border ${ok ? "bg-green-500 border-green-500" : "border-gray-300"}`}>
                    {ok && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[12.5px] font-medium leading-snug ${ok ? "text-gray-400 line-through" : "text-[#1e1813]"}`}>{s.label}</span>
                    {!ok && <span className="block text-[11px] text-gray-400 leading-snug">{s.hint}</span>}
                  </span>
                  {!ok && <ArrowRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Orchestrator (mounted once in the root layout) ────────────────────────

export function Onboarding() {
  const pathname = usePathname()
  const { user, loading } = useAuth()
  useOnboardingTick()
  const [mounted, setMounted] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => setMounted(true), [])

  const inApp = APP_PREFIXES.some((p) => pathname?.startsWith(p))

  // Show the welcome modal once, on the first visit to the tailor page.
  useEffect(() => {
    if (mounted && user && pathname === "/tailor" && !hasSeenWelcome() && !isOnboardingComplete()) {
      setShowWelcome(true)
    }
  }, [mounted, user, pathname])

  const closeWelcome = useCallback(() => {
    markWelcomeSeen()
    setShowWelcome(false)
  }, [])

  if (!mounted || loading || !user || !inApp) return null

  const complete = isOnboardingComplete()
  const dismissed = isOnboardingDismissed()
  const showChecklist = !complete && !dismissed && !showWelcome

  return (
    <>
      {showWelcome && <WelcomeModal onClose={closeWelcome} />}
      {showChecklist && <Checklist onDismiss={dismissOnboarding} />}
    </>
  )
}
