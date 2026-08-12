"use client"

// "How Tailr works" — four steps, each with a small static visual.
//
// This was a scroll-pinned 3D card scene until 28 Jul 2026, when Ose asked for
// the animation to go. The layout below is the one that always shipped to small
// screens and to anyone with prefers-reduced-motion; it is now what everybody
// sees. Nothing is client-side any more except the Link, so this could become a
// server component if the imports ever allow it.

import Link from "next/link"
import { ArrowRight } from "lucide-react"

const ACCENT = "#dc4f33"
const INK = "#1e1813"

const QUESTIONS = [
  "Tell us about a delivery you rescued when the timeline slipped.",
  "How do you keep stakeholders aligned when priorities conflict?",
  "Walk us through a decision you made with incomplete data.",
  "Where would you improve our onboarding funnel first?",
]

const STEPS = [
  {
    n: "01", t: "Tailor your CV.",
    d: "Tailr rewrites your CV for the exact role, in about 30 seconds, with ATS safe output.",
  },
  {
    n: "02", t: "See your match score.",
    d: "Evidence based scoring against the job description, requirement by requirement.",
  },
  {
    n: "03", t: "Prepare for interviews.",
    d: "Nine likely questions predicted from your tailored CV and the role.",
  },
  {
    n: "04", t: "Track every application.",
    d: "Every version, score and stage in one place. Nothing slips.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-label="How Tailr works">
<div className="py-24 px-5">
  <div className="max-w-xl mx-auto">
    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-center" style={{ color: ACCENT }}>How Tailr works</p>
    <h2 className="mt-3 text-center text-[clamp(28px,5vw,38px)] font-extrabold tracking-[-0.025em] leading-tight" style={{ color: INK }}>
      One CV, ready for every application.
    </h2>
    <div className="mt-10 flex flex-col divide-y divide-gray-100">
      {STEPS.map((s, i) => (
        <div key={s.n} className="py-9">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2.5" style={{ color: ACCENT }}>
            Step {Number(s.n)} <span className="font-medium text-gray-400" style={{ fontFamily: "var(--font-jetbrains)" }}>/ 04</span>
          </p>
          <h3 className="text-[24px] font-extrabold tracking-[-0.025em] mb-1.5" style={{ color: INK }}>{s.t}</h3>
          <p className="text-[15px] text-gray-500 leading-relaxed mb-5">{s.d}</p>
          <StaticBeat index={i} />
        </div>
      ))}
    </div>
    <div className="mt-4 flex items-center justify-center gap-3">
      <Link href="/tailor" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white text-[15px] font-semibold" style={{ background: ACCENT }}>
        Tailor my CV <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  </div>
</div>
    </section>
  )
}

// Static per-step visuals for the fallback layout.
function StaticBeat({ index }: { index: number }) {
  const frame = "relative h-[210px] rounded-2xl overflow-hidden border" as const
  const frameStyle = { background: "#fff7f4", borderColor: "#ffeae4" }
  const card = "absolute bg-white border border-gray-200 rounded-xl shadow-[0_14px_30px_rgba(30,24,19,0.10)]" as const

  if (index === 0) {
    return (
      <div className={frame} style={frameStyle} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${card} w-[190px] h-[120px] left-1/2 p-3`} style={{ top: 118 - i * 12, transform: `translateX(-50%) rotate(${-4 + i * 3}deg)`, zIndex: 3 - i }}>
            <div className="flex flex-col gap-2">
              {[["50%", false], ["76%", true], ["62%", false], ["44%", true]].map(([w, t], k) => (
                <div key={k} className="h-1.5 rounded-full" style={{ width: w as string, background: t ? "#ffd8cd" : "#eceae6" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className={frame} style={frameStyle} aria-hidden="true">
        <div className={`${card} w-[230px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3.5`}>
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-3 flex flex-col gap-2">
              {["80%", "55%"].map((w, k) => (
                <div key={k} className="h-1.5 rounded-full" style={{ width: w, background: "#eceae6" }} />
              ))}
              <div className="h-1.5 rounded-full" style={{ width: "70%", background: "#ffd8cd" }} />
            </div>
            <div className="text-center">
              <b className="text-[22px] font-extrabold" style={{ color: "#16a34a" }}>87</b>
              <div className="text-[7px] uppercase tracking-[0.18em] text-gray-400">match</div>
            </div>
          </div>
          <div className="flex gap-1.5 mt-3">
            <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}>Strong</span>
            <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ffeae4", color: ACCENT }}>Transferable</span>
            <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fdf2d9", color: "#9a6b00" }}>Partial</span>
          </div>
        </div>
      </div>
    )
  }
  if (index === 2) {
    return (
      <div className={frame} style={frameStyle} aria-hidden="true">
        {QUESTIONS.slice(0, 3).map((question, i) => (
          <div key={question} className={`${card} w-[165px] h-[122px] p-3`} style={{ left: `${14 + i * 27}%`, top: 44 + (i % 2) * 22, transform: `rotate(${-5 + i * 5}deg)`, zIndex: i }}>
            <span className="block text-[8px] font-bold uppercase tracking-[0.13em] mb-1.5" style={{ color: ACCENT }}>Interview prep</span>
            <p className="text-[10.5px] font-semibold leading-snug">{question.slice(0, 58)}&hellip;</p>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={frame} style={frameStyle} aria-hidden="true">
      {["Applied", "Interview", "Offer"].map((name, i) => (
        <div key={name} className="absolute w-[27%]" style={{ left: `${8 + i * 31.5}%`, top: 16 }}>
          <b className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">{name}</b>
          {Array.from({ length: i === 0 ? 3 : i === 1 ? 2 : 1 }).map((_, r) => (
            <div
              key={r}
              className="h-[34px] bg-white rounded-lg mt-2 border shadow-[0_6px_14px_rgba(30,24,19,0.06)]"
              style={{ borderColor: i === 1 && r === 0 ? "#ffd8cd" : "#eceae6" }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
