"use client"

import type { ConceptData } from "@/lib/career-arc-concepts"
import { categoryColour } from "@/lib/career-arc-concepts"

/**
 * Concept B — Mission Control. Career telemetry.
 *
 * The mockup's headline gauges (momentum 87/100, readiness 78%, skill ratings
 * out of 100) have no honest source in the product, so those tiles are filled
 * with real counts instead: proofs on file, reuses across tailored CVs, role
 * moves. The dark instrumented look is preserved exactly.
 */

const CREAM = "#f9f6f0"
const CORAL = "#dc4f33"
const PEACH = "#f4a58e"
const MUTED = "#8a8178"
const TILE = "#1c1916"
const LINE = "rgba(249,246,240,0.08)"
const TRACK = "#332e29"

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border p-5" style={{ background: TILE, borderColor: LINE }}>
      <h3 className="mb-3.5 font-mono text-[10.5px] tracking-[0.2em]" style={{ color: MUTED }}>{label}</h3>
      {children}
    </div>
  )
}

export function MissionControl({ data }: { data: ConceptData }) {
  const n = data.roles.length
  const W = 300, H = 110, PAD = 8
  const step = n > 1 ? (W - PAD * 2) / (n - 1) : 0
  let d = ""
  data.roles.forEach((_, i) => {
    const x = PAD + i * step
    const y = 98 - (i * 86) / Math.max(1, n - 1)
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${98 - ((i - 1) * 86) / Math.max(1, n - 1)} L ${x} ${y}`
  })

  return (
    <div className="font-mono" style={{ background: "#0c0b0a", minHeight: "100vh", padding: "clamp(16px, 4vw, 40px)" }}>
      <div className="mx-auto max-w-[1200px] border p-5 sm:p-8" style={{ background: "#131110", borderColor: LINE, color: CREAM }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3.5" style={{ borderColor: LINE }}>
          <span className="text-[13px] font-bold tracking-[0.08em]">TAILR// CAREER TELEMETRY</span>
          <span className="flex-1" />
          {data.name && <span className="text-[11.5px]" style={{ color: MUTED }}>SUBJECT: {data.name.toUpperCase()}</span>}
          {data.tenureYears !== null && <span className="text-[11.5px]" style={{ color: MUTED }}>UPTIME: {data.tenureYears}Y</span>}
          <span className="rounded px-2.5 py-1 text-[11.5px] font-bold" style={{ color: CORAL, background: "rgba(220,79,51,0.15)" }}>
            ▲ {data.promotions > 0 ? "ASCENDING" : "IN SERVICE"}
          </span>
        </div>

        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="EVIDENCE ON FILE">
            <div className="flex items-center gap-4">
              <svg width="96" height="96" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="50" fill="none" stroke={TRACK} strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="50" fill="none" stroke={CORAL} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${Math.min(1, data.proofCount / 20) * 314} 314`} transform="rotate(-90 60 60)"
                />
              </svg>
              <div>
                <div className="text-[44px] font-bold leading-none tabular-nums" style={{ fontFamily: "system-ui, sans-serif" }}>{data.proofCount}</div>
                <div className="mt-1.5 text-[10.5px]" style={{ color: MUTED }}>VERIFIED PROOFS</div>
                <div className="mt-1 text-[10.5px] font-medium" style={{ color: CORAL }}>0 UNSUBSTANTIATED</div>
              </div>
            </div>
          </Tile>

          <Tile label={`TRAJECTORY — ${n} ROLE${n === 1 ? "" : "S"}`}>
            <svg width="100%" height="110" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Career trajectory">
              <line x1="8" y1="104" x2={W - 8} y2="104" stroke={TRACK} strokeWidth="1" />
              <path d={d} fill="none" stroke={CORAL} strokeWidth="3" strokeLinecap="round" />
              {n > 0 && <circle cx={PAD + (n - 1) * step} cy={98 - 86} r="5" fill={CORAL} />}
            </svg>
            <div className="mt-1.5 text-[10.5px]" style={{ color: MUTED }}>
              {data.promotions} PROMOTION{data.promotions === 1 ? "" : "S"} · {data.employers.length} EMPLOYER{data.employers.length === 1 ? "" : "S"}
            </div>
          </Tile>

          <Tile label="REUSE ACROSS TAILORED CVS">
            <div className="text-[26px] font-bold" style={{ fontFamily: "system-ui, sans-serif" }}>{data.totalReuses}</div>
            <div className="my-2.5 h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, data.totalReuses)}%`, background: CORAL }} />
            </div>
            <div className="text-[10.5px]" style={{ color: MUTED }}>
              TIMES YOUR EVIDENCE HAS BEEN DEPLOYED INTO A TAILORED CV
            </div>
          </Tile>

          <Tile label="SKILL MATRIX">
            {data.skillGroups.length === 0 ? (
              <p className="text-[11px]" style={{ color: MUTED }}>NO SKILL DATA ON FILE</p>
            ) : (
              data.skillGroups.slice(0, 5).map((group) => {
                const max = Math.max(...data.skillGroups.map((g) => g.names.length))
                return (
                  <div key={group.category} className="mb-2.5 grid grid-cols-[100px_1fr_28px] items-center gap-2.5 text-[11px]">
                    <span className="truncate uppercase">{group.category}</span>
                    <span className="h-1.5 overflow-hidden rounded-full" style={{ background: TRACK }}>
                      <span className="block h-full rounded-full" style={{ width: `${(group.names.length / max) * 100}%`, background: CORAL }} />
                    </span>
                    <span className="text-right tabular-nums" style={{ color: MUTED }}>{group.names.length}</span>
                  </div>
                )
              })
            )}
            <div className="mt-2.5 text-[10.5px]" style={{ color: MUTED }}>COUNTS OF NAMED SKILLS — NOT RATINGS</div>
          </Tile>

          <Tile label="EVIDENCE LOCKER">
            {data.locker.slice(0, 4).map((item, i) => (
              <div key={i} className="flex justify-between gap-3 border-b border-dashed py-1.5 text-[11.5px]" style={{ borderColor: LINE }}>
                <span className="min-w-0 flex-1 truncate">{item.claim}</span>
                <span className="shrink-0 font-medium" style={{ color: PEACH }}>{item.uses} DEPLOY{item.uses === 1 ? "" : "S"}</span>
              </div>
            ))}
            <div className="mt-2.5 text-[10.5px]" style={{ color: MUTED }}>{data.proofCount} VERIFIED · 0 UNSUBSTANTIATED CLAIMS</div>
          </Tile>

          <Tile label="SIGNAL FEED">
            {data.feed.slice(0, 5).map((event, i) => (
              <p key={i} className="text-[11px] leading-[1.9]" style={{ color: MUTED }}>
                <span style={{ color: CREAM }}>{event.when}</span>{" "}
                <span style={{ color: event.kind === "promotion" ? CORAL : PEACH }}>
                  {event.kind === "promotion" ? "PROMOTION" : event.kind === "evidence" ? "EVIDENCE" : "ROLE START"}
                </span>{" "}
                — {event.text}
              </p>
            ))}
          </Tile>
        </div>

        <div className="mt-3.5 flex flex-wrap justify-between gap-2 border-t pt-3 text-[10.5px] tracking-[0.12em]" style={{ borderColor: LINE, color: MUTED }}>
          <span>ALL FIGURES SOURCED FROM YOUR CV AND TAILOR HISTORY</span>
          <span>TAILR.APP</span>
        </div>
      </div>
    </div>
  )
}

export function conceptAccent(category: string) {
  return categoryColour(category)
}
