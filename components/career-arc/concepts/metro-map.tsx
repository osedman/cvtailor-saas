"use client"

import { categoryColour, type ConceptData } from "@/lib/career-arc-concepts"

/**
 * Concept C — The Metro Map. Career as a transit network.
 *
 * Honest mapping: the main coral line is the role timeline; each additional
 * line is an EVIDENCE CATEGORY, joining the network at the role where its
 * first card is sourced (career_evidence.source_role). Interchanges are
 * promotions derived from same-employer title changes. The mockup's "P&L line
 * under construction" and named terminus are omitted — the product has no
 * target-role field, so there is nothing honest to name.
 */

const INK = "#1e1813"
const CORAL = "#dc4f33"
const MUTED = "#a89e93"
const CREAM = "#f9f6f0"

export function MetroMap({ data }: { data: ConceptData }) {
  const n = data.roles.length
  if (n === 0) {
    return <div className="p-16 text-center text-[13px]" style={{ color: MUTED }}>No roles on file yet.</div>
  }

  const W = 1200, H = 470
  const X0 = 140, X1 = 940, Y0 = 380, Y1 = 140
  const step = n > 1 ? (X1 - X0) / (n - 1) : 0
  const stations = data.roles.map((role, i) => ({
    ...role,
    x: X0 + i * step,
    y: n > 1 ? Y0 - (i * (Y0 - Y1)) / (n - 1) : Y0,
  }))

  // Main line: horizontal runs with 45° risers, the transit-diagram idiom.
  let main = `M 40 ${stations[0].y} H ${stations[0].x}`
  for (let i = 1; i < n; i++) {
    const prev = stations[i - 1], cur = stations[i]
    const rise = Math.min(80, (cur.x - prev.x) * 0.45)
    main += ` H ${(cur.x - rise).toFixed(1)} L ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`
  }
  main += ` H ${X1 + 40}`

  return (
    <div style={{ background: CREAM, minHeight: "100vh", padding: "clamp(16px, 4vw, 40px)" }}>
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-1 font-mono text-[11px] tracking-[0.22em]" style={{ color: MUTED }}>TAILR TRANSIT AUTHORITY</div>
        <h1 className="text-[clamp(24px,5vw,34px)] font-black tracking-tight" style={{ color: INK }}>
          {data.firstName ? `${data.firstName}'s network` : "The network"}<span style={{ color: CORAL }}>.</span>
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "#55504a" }}>
          {n} station{n === 1 ? "" : "s"} · {data.employers.length} operator{data.employers.length === 1 ? "" : "s"} · {data.categoryLines.length} line{data.categoryLines.length === 1 ? "" : "s"} in service
        </p>

        <div className="mt-5 overflow-x-auto rounded-2xl border bg-white p-4" style={{ borderColor: "#e0d6c9" }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 720 }} role="img" aria-label="Career metro map">
            {/* Category lines, offset below the main line, joining where their first evidence is sourced */}
            {data.categoryLines.map((line, li) => {
              const offset = 26 + li * 18
              const start = stations[Math.min(line.joinsAt, n - 1)]
              let d = `M ${start.x - 60} ${start.y + offset} H ${start.x}`
              for (let i = Math.min(line.joinsAt, n - 1) + 1; i < n; i++) {
                const prev = stations[i - 1], cur = stations[i]
                const rise = Math.min(80, (cur.x - prev.x) * 0.45)
                d += ` H ${(cur.x - rise).toFixed(1)} L ${cur.x.toFixed(1)} ${(cur.y + offset).toFixed(1)}`
              }
              d += ` H ${X1 + 40}`
              return (
                <path key={line.category} d={d} fill="none" stroke={categoryColour(line.category)} strokeWidth="9"
                  strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              )
            })}

            {/* Main line */}
            <path d={main} fill="none" stroke={CORAL} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
            {/* Onward, unnamed: the product has no target role to promise */}
            <path d={`M ${X1 + 40} ${stations[n - 1].y} L ${X1 + 150} ${stations[n - 1].y - 60}`}
              fill="none" stroke={CORAL} strokeWidth="11" strokeLinecap="round" strokeDasharray="2 20" opacity="0.65" />

            {stations.map((s, i) => (
              <g key={i}>
                {s.isPromotion ? (
                  <>
                    <circle cx={s.x} cy={s.y} r="16" fill="#fff" stroke={INK} strokeWidth="5" />
                    <circle cx={s.x} cy={s.y} r="7" fill="#fff" stroke={CORAL} strokeWidth="4" />
                  </>
                ) : s.isCurrent ? (
                  <>
                    <circle cx={s.x} cy={s.y} r="13" fill={CORAL} />
                    <circle cx={s.x} cy={s.y} r="20" fill="none" stroke={CORAL} strokeWidth="2" opacity="0.45" />
                  </>
                ) : (
                  <circle cx={s.x} cy={s.y} r="11" fill="#fff" stroke={CORAL} strokeWidth="5" />
                )}
                <text x={s.x} y={s.y - 34} textAnchor="middle" fontSize="14" fontWeight="700" fill={INK}
                  style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 5 } as React.CSSProperties}>
                  {s.title.length > 26 ? s.title.slice(0, 25) + "…" : s.title}
                </text>
                <text x={s.x} y={s.y - 18} textAnchor="middle" fontSize="11.5" fill={MUTED}
                  style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 4 } as React.CSSProperties}>
                  {s.company}{s.isPromotion ? " · interchange" : ""}
                </text>
                {s.startYear && (
                  <text x={s.x} y={s.y + 30} textAnchor="middle" fontSize="11" fontFamily="ui-monospace, monospace" fill="#55504a"
                    style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 4 } as React.CSSProperties}>
                    {s.startYear}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]" style={{ color: "#55504a" }}>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-7 rounded-full" style={{ background: CORAL }} />Career line
          </span>
          {data.categoryLines.map((line) => (
            <span key={line.category} className="inline-flex items-center gap-2">
              <span className="inline-block h-2.5 w-7 rounded-full" style={{ background: categoryColour(line.category) }} />
              {line.category} · {line.count} proof{line.count === 1 ? "" : "s"}
            </span>
          ))}
          <span className="text-[11.5px]" style={{ color: MUTED }}>
            Interchanges mark promotions · each line joins where its first evidence was earned · map not to scale, careers rarely are
          </span>
        </div>
      </div>
    </div>
  )
}
