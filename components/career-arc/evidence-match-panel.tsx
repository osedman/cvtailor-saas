"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import type { RequirementMapping } from "@/lib/anthropic"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import { matchEvidenceToRequirements, type NamedGap } from "@/lib/career-arc-tailor-match"

/**
 * Tailor sidebar panels (rebuild stage 5, screen 05): coverage meter,
 * requirements with EV-chip traceability into the evidence bank, and named
 * gap cards feeding the career path. Renders nothing until the evidence bank
 * loads — and stays silent for users outside the Career Arc beta (403) or on
 * any error, so the tailor experience never depends on it.
 */

const ACCENT = "#dc4f33"
const INK = "#1e1813"
const SAND = "#e0d6c9"
const SAND_LT = "#ece2d6"
const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-[#dc4f33]/40 focus-visible:ring-offset-1"

function GapCard({ gap, onAdd, busy, added }: { gap: NamedGap; onAdd: () => void; busy: boolean; added: boolean }) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3.5" style={{ borderColor: SAND_LT }}>
      <p className="text-[13px] font-bold" style={{ color: INK }}>
        {gap.requirement}
        {gap.isMust && <span className="ml-1.5 font-mono text-[8.5px] tracking-[0.14em] text-[#a89e93]">MUST-HAVE</span>}
      </p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-[#8a8178]">
        Not evidenced in your CV. If you have it, add the line; if not, it&apos;s a skill to build.
      </p>
      <button
        onClick={onAdd}
        disabled={busy || added}
        className={`mt-2.5 rounded-lg border bg-[#f9f6f0] px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-[#dc4f33] hover:text-[#dc4f33] disabled:opacity-60 ${FOCUS_RING}`}
        style={{ borderColor: SAND, color: added ? "#8a8178" : INK }}
      >
        {added ? "On your path ✓" : busy ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Adding…</span> : "Add to career path →"}
      </button>
    </div>
  )
}

export function EvidenceMatchPanel({
  requirements, jobTitle, companyName, evidence: providedEvidence, compact = false,
}: {
  requirements: RequirementMapping[]
  jobTitle?: string
  companyName?: string
  /** Supply the bank to skip the fetch — used by the CV-tab rail. */
  evidence?: EvidenceRow[]
  /** Rail mode: tighter type, no gap cards (they live in the Gaps tab). */
  compact?: boolean
}) {
  const [evidence, setEvidence] = useState<EvidenceRow[] | null>(providedEvidence ?? null)
  const [addingSkill, setAddingSkill] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (providedEvidence) { setEvidence(providedEvidence); return }
    let cancelled = false
    fetch("/api/career-evidence")
      .then(async (res) => {
        if (!res.ok) return null // beta-locked or unavailable — stay silent
        const data = await res.json().catch(() => null)
        return Array.isArray(data?.evidence) ? (data.evidence as EvidenceRow[]) : null
      })
      .then((rows) => { if (!cancelled && rows && rows.length > 0) setEvidence(rows) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [providedEvidence])

  const summary = useMemo(
    () => (evidence ? matchEvidenceToRequirements(requirements, evidence) : null),
    [requirements, evidence],
  )

  if (!summary || summary.total === 0) return null

  const addToPath = async (gap: NamedGap) => {
    setAddingSkill(gap.skill)
    try {
      const res = await fetch("/api/career-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "add-skill", skill: gap.skill, origin: "jd" }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setAdded((s) => new Set(s).add(gap.skill))
        toast.info("Already on your career path.")
        return
      }
      if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`)
      setAdded((s) => new Set(s).add(gap.skill))
      toast.success(`"${gap.skill}" added to your career path.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that skill — try again.")
    } finally {
      setAddingSkill(null)
    }
  }

  const roleLine = [jobTitle, companyName].filter(Boolean).join(" · ")

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ background: "#fdfcf9", borderColor: SAND }}>
      <div className="border-b px-5 py-4" style={{ borderColor: SAND_LT }}>
        <h3 className="font-mono text-[11px] font-bold tracking-[0.2em]" style={{ color: INK }}>EVIDENCE MATCHED</h3>
        <p className="mt-0.5 text-[11.5px] text-[#a89e93]">
          {roleLine ? `${roleLine} · ` : ""}{summary.total} requirement{summary.total === 1 ? "" : "s"} on file
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[34px] font-extrabold leading-none tabular-nums" style={{ color: ACCENT }}>{summary.covered}</span>
          <span className="text-[13px] text-[#8a8178]">of {summary.total} requirements</span>
        </div>
        <div className="mt-2.5 flex gap-1" role="img" aria-label={`${summary.covered} of ${summary.total} requirements covered`}>
          {Array.from({ length: summary.total }, (_, i) => (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{ background: i < summary.covered ? ACCENT : SAND_LT }}
            />
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-[#a89e93]">
          {summary.pulled} pulled from your evidence bank · {summary.implied} implied · {summary.gaps.length} named gap{summary.gaps.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="border-b px-5 py-4" style={{ borderColor: SAND_LT }}>
        <h3 className="font-mono text-[11px] font-bold tracking-[0.2em]" style={{ color: INK }}>REQUIREMENTS — MATCHED</h3>
        <ul className="mt-2.5 space-y-2.5">
          {summary.rows.filter((r) => r.covered).map((row, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: ACCENT }}
                aria-hidden="true"
              >
                ✓
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-snug" style={{ color: INK }}>{row.requirement}</p>
                {row.matches.length > 0 ? (
                  <p className="mt-0.5 text-[11.5px] text-[#8a8178]">
                    pulled from{" "}
                    {row.matches.map((m, j) => (
                      <span key={m.id}>
                        {j > 0 && ", "}
                        <span className="font-mono text-[10.5px] font-bold" style={{ color: ACCENT }} title={m.snippet}>{m.label}</span>
                      </span>
                    ))}
                    {" · "}{row.matches[0].snippet}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11.5px] text-[#a89e93]">implied by your CV — no bank card yet</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {summary.gaps.length > 0 && !compact && (
        <div className="px-5 py-4">
          <h3 className="font-mono text-[11px] font-bold tracking-[0.2em]" style={{ color: INK }}>
            NAMED GAPS · {summary.gaps.length}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-[#a89e93]">Real gaps, not writing problems — Tailr won&apos;t paper over them.</p>
          <div className="mt-2.5 space-y-2.5">
            {summary.gaps.map((gap, i) => (
              <GapCard
                key={i}
                gap={gap}
                busy={addingSkill === gap.skill}
                added={added.has(gap.skill)}
                onAdd={() => addToPath(gap)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
