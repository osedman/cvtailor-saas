"use client"

/**
 * Names the agency this screen is scoped to, and switches between them.
 *
 * The naming is the important half. Before this, nothing in the recruiter
 * chrome said which agency you were in — fine while everyone belonged to
 * exactly one, and quietly dangerous the moment someone belonged to two,
 * because the roles, candidates and clients on screen all came from an agency
 * the product never named.
 *
 * With one membership it renders as a label, not a control: a dropdown with a
 * single option invites a choice that does not exist.
 */

import { useCallback, useEffect, useState } from "react"

interface Membership {
  agencyId: string
  agencyName: string
  role: string
}

export function AgencySwitcher() {
  const [current, setCurrent] = useState<Membership | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/agency/session")
        if (!res.ok || cancelled) return
        const body = (await res.json()) as {
          current?: Membership
          memberships?: Membership[]
        }
        if (cancelled) return
        setCurrent(body.current ?? null)
        setMemberships(body.memberships ?? [])
      } catch {
        /* the chrome staying quiet is better than an error in the sidebar */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const switchTo = useCallback(async (agencyId: string) => {
    setSwitching(true)
    setError(false)
    try {
      const res = await fetch("/api/agency/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId }),
      })
      if (!res.ok) {
        setError(true)
        setSwitching(false)
        return
      }
      // Everything on screen was scoped to the old agency, so reload rather
      // than re-fetch piecemeal and risk a half-swapped page.
      window.location.reload()
    } catch {
      setError(true)
      setSwitching(false)
    }
  }, [])

  if (!current) return null

  return (
    <div className="ag-agency-id">
      <div className="ag-rail-label">Agency</div>
      {memberships.length > 1 ? (
        <>
          <label className="ag-sr-only" htmlFor="ag-switch">
            Agency you are working in
          </label>
          <select
            id="ag-switch"
            className="ag-agency-select"
            value={current.agencyId}
            disabled={switching}
            onChange={(e) => switchTo(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.agencyId} value={m.agencyId}>
                {m.agencyName || "Unnamed agency"}
              </option>
            ))}
          </select>
          {error && <p className="ag-agency-err">Could not switch. Try again.</p>}
        </>
      ) : (
        <p className="ag-agency-name">{current.agencyName || "Your agency"}</p>
      )}
    </div>
  )
}
