"use client"

/**
 * How Tailr works — the onboarding walkthrough, on the marketing site.
 *
 * Built for the win-back email (28 Jul 2026) and then moved here, because the
 * data said the problem is people who never had a first session at all: of 16
 * never-tailored users, only 3 ever logged in and none returned twice. A
 * walkthrough that only exists inside a win-back email reaches people after
 * they have gone cold. Here it reaches them before.
 *
 * Marketing path on purpose — `isAppPath` is a prefix allowlist, so this stays
 * on www rather than redirecting to the app host.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, ArrowLeft } from "lucide-react"
import { appPath } from "@/lib/site-url"

interface Slide {
  eyebrow?: string
  step?: string
  title: string
  body: string
  note?: { label: string; text: string }
  cards?: { title: string; text: string }[]
  cta?: boolean
}

const SLIDES: Slide[] = [
  {
    eyebrow: "60 second walkthrough",
    title: "One CV does not fit every job.",
    body: "Most applications are read for about seven seconds. Tailr rewrites your CV against the specific job in front of you, shows exactly how well it matches, and proves every claim against your own experience.",
  },
  {
    step: "1",
    title: "Paste the job.",
    body: "Any job URL, from any board — LinkedIn, Indeed, a company careers page. Tailr reads it and pulls out what the role actually asks for. If you only have the text, paste that instead.",
    note: { label: "Takes about 5 seconds.", text: "You see the requirements Tailr extracted before anything else happens, so you can check it understood the role." },
  },
  {
    step: "2",
    title: "Add your CV once.",
    body: "Upload a PDF or Word file, or paste it in. Tailr reads it once and remembers, so every future application starts from what it already knows about you.",
    note: { label: "No CV yet?", text: "Build one from your projects, certificates and experience. You approve every fact before it goes in." },
  },
  {
    step: "3",
    title: "Get the tailored version.",
    body: "A rewrite aimed at that job, with a match score you can audit line by line — every requirement mapped to the evidence that covers it, and an honest list of the gaps that do not.",
    note: { label: "Nothing is invented.", text: "Tailr reframes what you have actually done. Where the evidence is not there it says so, rather than writing a claim you would have to defend in an interview." },
  },
  {
    step: "4",
    title: "Then walk in prepared.",
    body: "Pick a template and download as Word. Get the interview questions you are likely to face, answered from your own experience. Track every application on one board, from saved through to offer.",
    note: { label: "The gaps become a plan.", text: "Anything the job wanted that you could not evidence turns into short, practical courses — most under a few hours." },
  },
  {
    eyebrow: "Why it is worth the 30 seconds",
    title: "What you actually get.",
    body: "",
    cards: [
      { title: "A score you can argue with", text: "Not a black box. Every point traces to a requirement and the evidence behind it." },
      { title: "Honest gaps", text: "You find out what is missing before a recruiter does, and what to do about it." },
      { title: "Interview prep from your life", text: "Answer frameworks built from your real projects, not generic advice." },
      { title: "Your whole search, tracked", text: "One board. Saved, applied, interviewing, offer." },
    ],
  },
  {
    eyebrow: "Free while we are in beta",
    title: "Your next application deserves better.",
    body: "Take one job you actually want, and give it thirty seconds.",
    cta: true,
  },
]

export default function HowItWorksPage() {
  const [i, setI] = useState(0)
  const last = SLIDES.length - 1
  const go = useCallback((n: number) => setI(Math.max(0, Math.min(last, n))), [last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(i + 1)
      if (e.key === "ArrowLeft") go(i - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [i, go])

  const s = SLIDES[i]

  return (
    <div className="ns min-h-screen flex flex-col" style={{ background: "var(--ns-cream)", padding: "clamp(20px,4vw,44px)" }}>
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="text-[20px] font-extrabold tracking-[-0.5px] text-[#1e1813]">
          tailr<span style={{ color: "var(--ns-coral)" }}>.</span>
        </Link>
        <a href={appPath("/tailor")} className="text-[13px] font-semibold" style={{ color: "var(--ns-coral)" }}>
          Skip to Tailr &rarr;
        </a>
      </header>

      {/* Progress rail — reads as a sequence, because it is one */}
      <div className="flex gap-1.5" style={{ marginTop: 22 }} aria-hidden="true">
        {SLIDES.map((_, k) => (
          <span key={k} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: k === i ? "var(--ns-coral)" : k < i ? "var(--ns-tint-2)" : "var(--ns-border)",
            transition: "background .35s ease",
          }} />
        ))}
      </div>

      <main className="flex-1 flex items-center" style={{ padding: "clamp(24px,5vh,60px) 0" }}>
        <div style={{ maxWidth: 660, width: "100%" }} className="ns-reveal" key={i}>
          {s.eyebrow && <div className="t-eyebrow" style={{ marginBottom: 14 }}>{s.eyebrow}</div>}
          {s.step && (
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, borderRadius: 999, background: "var(--ns-coral)",
              color: "#fff", fontSize: 15, fontWeight: 800, marginBottom: 16,
            }}>{s.step}</div>
          )}
          <h1 className="t-display" style={{ fontSize: "clamp(28px,5vw,42px)", margin: "0 0 16px" }}>{s.title}</h1>
          {s.body && <p className="t-lede" style={{ maxWidth: "56ch" }}>{s.body}</p>}

          {s.note && (
            <div style={{
              marginTop: 22, padding: "16px 18px", background: "var(--ns-paper)",
              border: "1px solid var(--ns-border)", borderRadius: 14,
            }}>
              <p className="t-body" style={{ margin: 0, color: "var(--ns-ink-70)" }}>
                <strong style={{ color: "var(--ns-ink)" }}>{s.note.label}</strong> {s.note.text}
              </p>
            </div>
          )}

          {s.cards && (
            <div className="grid gap-3" style={{ marginTop: 22, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
              {s.cards.map((c) => (
                <div key={c.title} style={{
                  background: "var(--ns-paper)", border: "1px solid var(--ns-border)",
                  borderRadius: 14, padding: "16px 18px",
                }}>
                  <h2 className="t-title" style={{ fontSize: 15.5, margin: "0 0 6px" }}>{c.title}</h2>
                  <p className="t-small" style={{ margin: 0 }}>{c.text}</p>
                </div>
              ))}
            </div>
          )}

          {s.cta && (
            <a href={appPath("/tailor")} className="ns-btn ns-btn-primary" style={{ marginTop: 20 }}>
              Tailor your first CV <ArrowRight className="w-4 h-4" />
            </a>
          )}
        </div>
      </main>

      <nav className="flex items-center gap-3 flex-wrap" style={{ paddingTop: 14, borderTop: "1px solid var(--ns-border)" }}>
        <button onClick={() => go(i - 1)} disabled={i === 0} className="ns-btn ns-btn-secondary" style={{ opacity: i === 0 ? 0.4 : 1 }}>
          <ArrowLeft className="w-3.5 h-3.5" />Back
        </button>
        <button onClick={() => go(i === last ? 0 : i + 1)} className="ns-btn ns-btn-primary">
          {i === last ? "Start over" : "Next"}{i !== last && <ArrowRight className="w-3.5 h-3.5" />}
        </button>
        <span className="t-mono tabular-nums" style={{ marginLeft: "auto" }}>{i + 1} of {SLIDES.length}</span>
      </nav>
    </div>
  )
}
