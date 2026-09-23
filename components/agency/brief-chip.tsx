"use client"

/**
 * ON BRIEF V2 · 1 DIFFERENCE — frame 25, band D.
 *
 * The same chip on the recruiter's role header and the client's room header,
 * fed by the same computation (roleBriefStatus) through each side's own
 * route, so both read the same sentence for the same difference. Divergence
 * is FLAGGED, never blocked. Silence when the role runs on no brief.
 */

import { useEffect, useState } from "react"
import Link from "next/link"

export interface BriefStatusPayload {
  status: {
    briefId: string
    version: number
    title: string
    movedOnTo: number | null
    differences: Array<{ key: string; label: string; brief: string; role: string }>
  } | null
  roundNames?: string[]
}

export function useBriefStatus(roleId: string, hat: "recruiter" | "client") {
  const [data, setData] = useState<BriefStatusPayload | null | "error">(null)
  useEffect(() => {
    let live = true
    const url = hat === "recruiter" ? `/api/agency/roles/${roleId}/brief` : `/api/hiring/roles/${roleId}/brief`
    fetch(url)
      .then(async (r) => {
        if (!live) return
        if (!r.ok) return setData("error")
        setData((await r.json()) as BriefStatusPayload)
      })
      .catch(() => live && setData("error"))
    return () => {
      live = false
    }
  }, [roleId, hat])
  return data
}

export function BriefChip({ roleId, hat, data }: { roleId: string; hat: "recruiter" | "client"; data: BriefStatusPayload | null | "error" }) {
  if (!data || data === "error" || !data.status) return null
  const s = data.status
  const n = s.differences.length
  const href = hat === "recruiter" ? `/api/agency/roles/${roleId}/brief` : `/hiring/briefs/${s.briefId}`
  const briefHref = hat === "recruiter" ? `/agencies/briefs/${s.briefId}` : `/hiring/briefs/${s.briefId}`
  void href
  return (
    <div className="ag-brief-chips-row">
      <Link href={briefHref} className="ag-brief-chip-on">
        On brief v{s.version}
      </Link>
      {s.movedOnTo && (
        <span className="ag-brief-chip-warn" title={`The brief was approved again as v${s.movedOnTo}; this role still runs on v${s.version}.`}>
          Brief has moved on to v{s.movedOnTo}
        </span>
      )}
      {n > 0 && (
        <details className="ag-brief-diff">
          <summary className="ag-brief-chip-warn">
            {n} difference{n === 1 ? "" : "s"} from the brief
          </summary>
          <ul>
            {s.differences.map((d) => (
              <li key={d.key}>
                <b>{d.label}:</b> the brief says {d.brief}; the role has {d.role}.
              </li>
            ))}
          </ul>
          <p className="ag-meta">
            {hat === "recruiter" ? "Amend the brief to a new version, change the role back, or keep the difference — the client sees this too." : `${"Your recruiter"} has departed from the brief here. Ask them, or wait for an amended brief.`}
          </p>
        </details>
      )}
    </div>
  )
}
