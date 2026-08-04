"use client"

import type { ConceptData } from "@/lib/career-arc-concepts"

/**
 * Concept D — The One-Sheet. Career as a film poster.
 *
 * The mockup's star-rating pull-quotes were invented testimonials ("— a former
 * manager, probably"). Here the quotes are the user's OWN evidence claims,
 * verbatim, attributed to the role they came from — the poster conceit
 * survives, the fiction does not. No tagline is generated: the strapline is
 * built from the real first and current job titles.
 */

const INK = "#12100e"
const CREAM = "#f9f6f0"
const CORAL = "#dc4f33"
const PEACH = "#f4a58e"
const MUTED = "#8a8178"

export function OneSheet({ data }: { data: ConceptData }) {
  const first = data.roles[0]
  const current = data.roles[data.roles.length - 1]
  const headline = data.locker.slice(0, 3)
  const n = data.roles.length

  const W = 560, H = 180
  const step = n > 1 ? (W - 40) / (n - 1) : 0
  let d = ""
  data.roles.forEach((_, i) => {
    const x = 20 + i * step
    const y = 162 - (i * 136) / Math.max(1, n - 1)
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${162 - ((i - 1) * 136) / Math.max(1, n - 1)} L ${x} ${y}`
  })

  return (
    <div style={{ background: "#0a0908", minHeight: "100vh", padding: "clamp(16px, 4vw, 48px)" }}>
      <div
        className="mx-auto max-w-[760px] overflow-hidden rounded-[20px] px-6 py-10 text-center sm:px-12 sm:py-14"
        style={{ background: `radial-gradient(ellipse 80% 50% at 50% 22%, #2b1d15 0%, ${INK} 68%)`, border: "1px solid rgba(249,246,240,0.12)" }}
      >
        <div className="font-mono text-[10.5px] tracking-[0.3em]" style={{ color: MUTED }}>A TAILR ORIGINAL STORY</div>
        {data.name && (
          <div className="mt-3 font-mono text-[13px] tracking-[0.24em]" style={{ color: CREAM }}>{data.name.toUpperCase()}</div>
        )}

        <h1
          className="mt-5 font-black leading-[0.92] tracking-tight"
          style={{ fontSize: "clamp(56px, 14vw, 104px)", color: CREAM, textShadow: "0 0 60px rgba(220,79,51,0.45)" }}
        >
          THE<br />CLIMB<span style={{ color: CORAL }}>.</span>
        </h1>

        {first && current && (
          <p className="mx-auto mt-4 max-w-[34rem] text-[15px]" style={{ color: PEACH }}>
            {first.title} to {current.title}
            {data.tenureYears !== null ? ` · ${data.tenureYears} years` : ""}
            {data.promotions > 0 ? ` · ${data.promotions} promotion${data.promotions === 1 ? "" : "s"}` : ""}
          </p>
        )}

        <div className="relative mx-auto mt-8 max-w-[560px]">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Career climb">
            <path d={d} fill="none" stroke={CORAL} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            {n > 0 && (
              <>
                <circle cx={20 + (n - 1) * step} cy={26} r="9" fill={CORAL} />
                <circle cx={20 + (n - 1) * step} cy={26} r="18" fill="none" stroke={CORAL} strokeWidth="2" opacity="0.4" />
              </>
            )}
          </svg>
        </div>

        {headline.length > 0 && (
          <div className="mt-9 grid gap-4 text-left sm:grid-cols-3">
            {headline.map((item, i) => (
              <div key={i}>
                <div className="text-[13px] tracking-[0.2em]" style={{ color: CORAL }}>★★★★★</div>
                <p className="mt-1.5 text-[13.5px] font-semibold leading-snug" style={{ color: CREAM }}>
                  &ldquo;{item.claim.length > 96 ? item.claim.slice(0, 95) + "…" : item.claim}&rdquo;
                </p>
                <span className="mt-1 block font-mono text-[9.5px] tracking-[0.12em]" style={{ color: MUTED }}>
                  — YOUR CV{item.uses > 0 ? ` · USED IN ${item.uses} CV${item.uses === 1 ? "" : "S"}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="mx-auto mt-9 max-w-[46rem] text-[11.5px] leading-[1.9]" style={{ color: MUTED }}>
          {data.employers.length > 0 && (
            <>
              <b style={{ color: CREAM }}>{data.employers[0]}</b>
              {data.employers.length > 1 && (
                <> presents in association with {data.employers.slice(1).map((e, i) => (
                  <span key={e}>{i > 0 && " and "}<b style={{ color: CREAM }}>{e}</b></span>
                ))}</>
              )}
              {data.tenureYears !== null && <> · a {data.tenureYears}-year production</>}
              <br />
            </>
          )}
          {data.proofCount > 0 && (
            <>starring <b style={{ color: CREAM }}>{data.proofCount} verified proofs</b>
              {data.totalReuses > 0 && <> · deployed <b style={{ color: CREAM }}>{data.totalReuses} times</b> across tailored CVs</>}
              <br /></>
          )}
          edited by <b style={{ color: CREAM }}>Tailr</b> · no facts were invented in the making of this career
        </p>

        <div
          className="mt-8 inline-block rounded px-5 py-2 font-mono text-[11px] tracking-[0.2em]"
          style={{ background: CORAL, color: "#fff" }}
        >
          {current?.isCurrent ? "NOW SHOWING" : "IN PRODUCTION"} · {current?.title?.toUpperCase() ?? "YOUR CAREER"}
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 font-mono text-[9.5px] tracking-[0.16em]" style={{ color: MUTED }}>
          <span>CERT: VERIFIED-{data.proofCount}</span>
          <span>TAILR.APP</span>
          {data.tenureYears !== null && <span>RUNTIME: {data.tenureYears} YRS</span>}
        </div>
      </div>
    </div>
  )
}
