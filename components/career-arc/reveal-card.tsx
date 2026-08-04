"use client"

import { useEffect, useState } from "react"
import type { CareerProfileSections } from "@/lib/anthropic"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import { buildRevealSlides, isDarkSlide, type RevealSlide } from "@/lib/career-arc-reveal"

/**
 * The reveal, rebuilt in the Ledger × Tailr skin (Aug 3).
 *
 * It opens and closes on the proof count, so the first thing a new arc says is
 * the thing the whole product promises, and its big number is a real evidence
 * card with its CV line named beneath it. Tap-to-advance, skip and replay
 * behave exactly as before — those worked and were left alone.
 */

const ACCENT = "#dc4f33"
const PEACH = "#f4a58e"
const INK = "#1e1813"
const CREAM = "#f9f6f0"
const MUTED = "#8a8178"

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

function useCountUp(target: number, active: boolean, durationMs = 1200) {
  const [value, setValue] = useState(0)
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    if (!active) return
    if (reduced || target === 0) { setValue(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / durationMs))
      setValue(Math.round((1 - Math.pow(1 - t, 3)) * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, durationMs, reduced])
  return value
}

/** The NOTHING INVENTED stamp, drawn as it lands. */
function Stamp({ count, small = false }: { count: number; small?: boolean }) {
  return (
    <div
      className={`inline-block -rotate-[9deg] rounded-lg border-[3px] text-center ${small ? "px-3 py-1.5" : "px-5 py-2.5"}`}
      style={{ borderColor: ACCENT, color: ACCENT, animation: "stamp-in 0.5s cubic-bezier(0.2,1.4,0.4,1) both", animationDelay: "0.25s" }}
    >
      <div className={`font-mono font-bold tracking-[0.2em] ${small ? "text-[13px]" : "text-[19px]"}`}>NOTHING INVENTED</div>
      <div className={`mt-0.5 font-mono tracking-[0.16em] ${small ? "text-[7.5px]" : "text-[9px]"}`}>
        {count} PROOF{count === 1 ? "" : "S"} · SOURCED FROM YOUR CV
      </div>
    </div>
  )
}

function ClimbLine({ roleCount }: { roleCount: number }) {
  const n = Math.max(2, roleCount)
  const W = 300, H = 110
  const step = (W - 20) / (n - 1)
  let d = `M 10 96`
  for (let i = 1; i < n; i++) {
    const y = 96 - (i * 82) / (n - 1)
    d += ` L ${10 + i * step} ${96 - ((i - 1) * 82) / (n - 1)} L ${10 + i * step} ${y}`
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden="true">
      <path d={d} fill="none" stroke="rgba(220,79,51,0.25)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: 700, animation: "arc-draw 1.6s ease-out both", animationDelay: "0.4s" }} />
      <path d={d} fill="none" stroke={ACCENT} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: 700, animation: "arc-draw 1.6s ease-out both", animationDelay: "0.4s" }} />
      <circle cx={10 + (n - 1) * step} cy={14} r={6} fill={ACCENT}
        style={{ animation: "glow-in 0.4s ease-out both", animationDelay: "1.9s" }} />
      <circle cx={10 + (n - 1) * step} cy={14} r={12} fill="none" stroke={ACCENT} strokeWidth={1.5} opacity={0.4}
        style={{ animation: "glow-in 0.5s ease-out both", animationDelay: "2s" }} />
    </svg>
  )
}

export function RevealCard({
  sections, evidence, usage, onDone,
}: {
  sections: CareerProfileSections
  evidence: EvidenceRow[]
  usage: Record<string, number>
  onDone: () => void
}) {
  const slides = buildRevealSlides(sections, evidence, usage)
  const [index, setIndex] = useState(0)
  const slide = slides[Math.min(index, slides.length - 1)]
  const isLast = index >= slides.length - 1
  const dark = isDarkSlide(slide)

  const proofCount = slide.kind === "proofs" ? slide.count : 0
  const counted = useCountUp(proofCount, slide.kind === "proofs", 1300)
  const yearCount = useCountUp(slide.kind === "span" ? slide.years : 0, slide.kind === "span", 1200)

  const next = () => { if (isLast) onDone(); else setIndex(index + 1) }
  const stagger = (i: number) => ({ animation: "fade-in-up 0.55s ease-out both", animationDelay: `${0.15 + i * 0.16}s` })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(30,24,19,0.6)", backdropFilter: "blur(4px)" }}>
      <style>{`@keyframes arc-draw { from { stroke-dashoffset: 700; } to { stroke-dashoffset: 0; } }
@keyframes glow-in { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
@keyframes stamp-in { from { opacity: 0; transform: rotate(-24deg) scale(1.9); } to { opacity: 0.95; transform: rotate(-9deg) scale(1); } }
@media (prefers-reduced-motion: reduce) {
  [data-reveal] *, [data-reveal] { animation-duration: 0.01ms !important; animation-delay: 0ms !important; }
}`}</style>
      <div
        data-reveal
        role="dialog"
        aria-label="Your Career Arc reveal"
        className="relative flex w-full max-w-xl cursor-pointer select-none flex-col overflow-hidden rounded-[28px] p-8 shadow-[0_24px_64px_rgba(30,24,19,0.45)] transition-colors duration-500 sm:p-12"
        style={{ background: dark ? INK : CREAM, minHeight: "30rem" }}
        onClick={next}
      >
        {dark && (
          <div className="pointer-events-none absolute" style={{
            width: 420, height: 420, right: -140, top: -140, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(220,79,51,0.28) 0%, rgba(220,79,51,0) 70%)",
          }} />
        )}

        <div className="relative mb-4 flex items-center justify-between">
          <p className="font-mono text-[11px] tabular-nums" style={{ color: dark ? MUTED : "#a89e93" }}>
            {String(index + 1).padStart(2, "0")} — {String(slides.length).padStart(2, "0")}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onDone() }}
            className="rounded text-[12px] transition-colors focus-visible:ring-2 focus-visible:ring-[#dc4f33]/40"
            style={{ color: dark ? MUTED : "#a89e93" }}
          >
            Skip
          </button>
        </div>

        <div key={index} className="relative flex flex-1 flex-col justify-center py-6">
          <div className="mb-7 h-[3px] w-9 rounded-full" style={{ background: ACCENT, ...stagger(0) }} />

          {slide.kind === "proofs" && (
            <>
              <p className="mb-5 font-mono text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: PEACH, ...stagger(1) }}>
                Your career, on the record
              </p>
              <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: "clamp(5rem, 16vw, 8rem)", color: CREAM, ...stagger(2) }}>
                {counted}
              </p>
              <p className="mt-4 text-[17px] font-semibold" style={{ color: "#cfc8bf", ...stagger(3) }}>
                proof{slide.count === 1 ? "" : "s"} on file — every one traceable to your CV
              </p>
              <p className="mt-2 text-[13px]" style={{ color: MUTED, ...stagger(4) }}>Nothing generated. Nothing embellished.</p>
            </>
          )}

          {slide.kind === "span" && (
            <>
              <p className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-extrabold tabular-nums" style={{ fontSize: "17rem", lineHeight: 1, color: "rgba(220,79,51,0.07)" }}>
                {slide.years}
              </p>
              <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: "clamp(5rem, 16vw, 8rem)", color: ACCENT, ...stagger(1) }}>{yearCount}</p>
              <p className="mt-4 text-[17px] font-semibold" style={{ color: "#55504a", ...stagger(2) }}>
                years · {slide.roles} role{slide.roles === 1 ? "" : "s"} · one line
              </p>
            </>
          )}

          {slide.kind === "origin" && (
            <>
              <p className="pointer-events-none absolute -left-2 -top-2 font-extrabold" style={{ fontSize: "11rem", lineHeight: 1, color: "rgba(220,79,51,0.1)", fontFamily: "Georgia, serif" }}>&ldquo;</p>
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: "#a89e93", ...stagger(1) }}>Where it started</p>
              <p className="text-[20px] italic leading-relaxed" style={{ color: INK, ...stagger(2) }}>&ldquo;{slide.text}&rdquo;</p>
              <p className="mt-5 text-[12px]" style={{ color: "#a89e93", ...stagger(3) }}>In your words, kept as you wrote them.</p>
            </>
          )}

          {slide.kind === "climb" && (
            <>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: MUTED, ...stagger(1) }}>The climb</p>
              <p className="mb-6 text-[16px] font-bold" style={{ color: CREAM, ...stagger(2) }}>
                {slide.from} <span style={{ color: MUTED }}>→</span> <span style={{ color: PEACH }}>{slide.to}</span>
              </p>
              <div style={stagger(3)}><ClimbLine roleCount={slide.roleCount} /></div>
              <p className="mt-4 text-[12px]" style={{ color: MUTED, ...stagger(4) }}>
                {slide.roleCount} roles — sideways moves and breaks are chapters too
              </p>
            </>
          )}

          {slide.kind === "number" && (
            <>
              <div className="pointer-events-none absolute" style={{
                width: 300, height: 300, left: "50%", top: "50%", transform: "translate(-50%, -50%)", borderRadius: "50%",
                background: "radial-gradient(circle, rgba(220,79,51,0.18) 0%, rgba(220,79,51,0) 70%)",
                animation: "glow-in 1s ease-out both", animationDelay: "0.3s",
              }} />
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: MUTED, ...stagger(1) }}>One number, and where it came from</p>
              <p className="font-extrabold leading-none" style={{ fontSize: "clamp(3.2rem, 11vw, 5.5rem)", color: PEACH, textShadow: "0 0 40px rgba(220,79,51,0.35)", ...stagger(2) }}>
                {slide.figure}
              </p>
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "#cfc8bf", ...stagger(3) }}>{slide.claim}</p>
              {(slide.source || slide.cvLine !== null) && (
                <p className="mt-4 font-mono text-[10.5px] tracking-[0.12em]" style={{ color: MUTED, ...stagger(4) }}>
                  {[slide.source.toUpperCase(), slide.cvLine !== null ? `YOUR CV, LINE ${slide.cvLine}` : ""].filter(Boolean).join(" · ")}
                </p>
              )}
            </>
          )}

          {slide.kind === "final" && (
            <>
              {slide.count > 0 && <div style={stagger(1)}><Stamp count={slide.count} /></div>}
              <p className="mb-8 mt-7 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.8rem, 5vw, 2.6rem)", lineHeight: 1.2, color: CREAM, ...stagger(2) }}>
                This is your Career Arc{slide.firstName ? `, ${slide.firstName}` : ""}<span style={{ color: ACCENT }}>.</span>
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); onDone() }}
                className="inline-flex items-center gap-2 self-start rounded-xl px-6 py-3 text-[15px] font-semibold text-white shadow-lg transition-all hover:brightness-105 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/50"
                style={{ background: ACCENT, boxShadow: "0 8px 24px rgba(220,79,51,0.4)", ...stagger(3) }}
              >
                Open the ledger
              </button>
            </>
          )}
        </div>

        <div className="relative mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <div key={i} className="h-1 rounded-full transition-all duration-300"
                style={{ width: i === index ? 22 : 8, background: i <= index ? ACCENT : dark ? "#4a4038" : "#e8ddd2" }} />
            ))}
          </div>
          {!isLast && <p className="text-[11px]" style={{ color: dark ? "#6b6259" : "#c4bab0" }}>tap to continue</p>}
        </div>
      </div>
    </div>
  )
}
