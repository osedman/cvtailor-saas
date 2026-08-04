"use client"

import type { ConceptData } from "@/lib/career-arc-concepts"

/**
 * Concept E — The Ledger (raw concept, as first drawn).
 *
 * This is the direction that became the shipped /career-arc page; kept here in
 * its original audited-accounts form for comparison. Δ LEVEL marks promotions
 * derived from same-employer title changes. The mockup's "contingent asset"
 * note named a target role and a readiness figure — omitted here, since the
 * product holds neither.
 */

const PAPER = "#fdfcf9"
const INK = "#1e1813"
const CORAL = "#dc4f33"
const SAND = "#e0d6c9"
const SAND_LT = "#ece2d6"
const MUTED = "#a89e93"
const DIM = "#55504a"

export function LedgerSheet({ data }: { data: ConceptData }) {
  return (
    <div style={{ background: "#f4f1ea", minHeight: "100vh", padding: "clamp(16px, 4vw, 44px)" }}>
      <div className="relative mx-auto max-w-[980px] border p-6 sm:p-10" style={{ background: PAPER, borderColor: SAND }}>
        <div className="border-b pb-4" style={{ borderColor: INK, borderBottomWidth: 2 }}>
          <h1 className="font-mono text-[clamp(15px,3vw,21px)] font-bold tracking-[0.12em]" style={{ color: INK }}>
            CAREER LEDGER{data.name ? ` — ${data.name.toUpperCase()}` : ""}
          </h1>
          <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10.5px]" style={{ color: DIM }}>
            {data.period && <span>PERIOD: {data.period}</span>}
            <span>BASIS: EVIDENCE-FIRST, NOTHING INVENTED</span>
            <span>AUDITED BY: TAILR</span>
          </div>
        </div>

        <div
          className="absolute right-6 top-24 hidden -rotate-[8deg] border-[3px] px-3 py-1.5 text-center sm:right-10 md:block"
          style={{ borderColor: CORAL, color: CORAL }}
        >
          <div className="font-mono text-[15px] font-bold tracking-[0.18em]">VERIFIED</div>
          <div className="font-mono text-[8px] tracking-[0.14em]">{data.proofCount} PROOFS · 0 EXCEPTIONS</div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: 640 }}>
            <thead>
              <tr className="font-mono text-[10px] tracking-[0.14em]" style={{ color: MUTED }}>
                <th className="border-b py-2 pr-3" style={{ borderColor: SAND, width: 70 }}>YEAR</th>
                <th className="border-b py-2 pr-3" style={{ borderColor: SAND }}>ENTRY</th>
                <th className="border-b py-2 pr-3" style={{ borderColor: SAND }}>EVIDENCE ON FILE</th>
                <th className="border-b py-2 text-right" style={{ borderColor: SAND, width: 110 }}>Δ LEVEL</th>
              </tr>
            </thead>
            <tbody>
              {data.roles.map((role, i) => (
                <tr key={i} className="align-top">
                  <td className="border-b py-3 pr-3 font-mono text-[12px] tabular-nums" style={{ borderColor: SAND_LT, color: DIM }}>
                    {role.startYear ?? "—"}
                  </td>
                  <td className="border-b py-3 pr-3" style={{ borderColor: SAND_LT }}>
                    <span className="text-[13.5px] font-bold" style={{ color: INK }}>{role.title}</span>
                    <span className="mt-0.5 block text-[11.5px]" style={{ color: MUTED }}>{role.company}</span>
                  </td>
                  <td className="border-b py-3 pr-3 text-[12.5px] leading-snug" style={{ borderColor: SAND_LT, color: DIM }}>
                    {role.proofs.length > 0
                      ? role.proofs.slice(0, 2).map((p, j) => (
                          <span key={j} className="block">{p.length > 88 ? p.slice(0, 87) + "…" : p}</span>
                        ))
                      : <span style={{ color: MUTED }}>—</span>}
                  </td>
                  <td className="border-b py-3 text-right font-mono text-[12px]" style={{ borderColor: SAND_LT }}>
                    {role.isPromotion
                      ? <span className="font-bold" style={{ color: CORAL }}>+1</span>
                      : <span style={{ color: MUTED }}>—</span>}
                  </td>
                </tr>
              ))}
              <tr className="font-mono text-[12px] font-bold" style={{ color: INK }}>
                <td className="py-3" />
                <td className="py-3 tracking-[0.1em]">NET POSITION</td>
                <td className="py-3 text-[11.5px]">
                  {data.proofCount} VERIFIED PROOFS · {data.totalReuses} DEPLOYMENTS
                </td>
                <td className="py-3 text-right" style={{ color: data.promotions > 0 ? CORAL : MUTED }}>
                  {data.promotions > 0 ? `+${data.promotions} LEVEL${data.promotions === 1 ? "" : "S"}` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 border-t pt-4 text-[11.5px] leading-[1.9]" style={{ borderColor: SAND, color: DIM }}>
          <b className="font-mono text-[10.5px] tracking-[0.1em]" style={{ color: INK }}>NOTE 1 — ACCOUNTING POLICY.</b>{" "}
          Entries are recognised only when substantiated by the subject&apos;s CV or their own written answers. Adjectives are expensed immediately.
          <br />
          <b className="font-mono text-[10.5px] tracking-[0.1em]" style={{ color: INK }}>NOTE 2 — BASIS OF Δ LEVEL.</b>{" "}
          A level is recognised on a title change with the same employer. Moves between employers are recorded as entries, not gains — the ledger does not rank one employer against another.
          <br />
          <b className="font-mono text-[10.5px] tracking-[0.1em]" style={{ color: INK }}>NOTE 3 — GOING CONCERN.</b>{" "}
          {data.promotions > 0
            ? "Trajectory shows progression across the period. The auditors see no reason to doubt continued ascent."
            : "The record stands on its evidence rather than its title history."}
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-3 font-mono text-[9.5px] tracking-[0.14em]" style={{ borderColor: SAND, color: MUTED }}>
          <span>E&amp;OE</span>
          <span>TAILR.APP</span>
        </div>
      </div>
    </div>
  )
}
