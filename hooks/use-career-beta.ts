"use client"

import { useEffect, useState } from "react"

/**
 * Is the signed-in user in the career-path beta?
 *
 * One fetch per page load, shared by every consumer via a module-level
 * promise. Starts FALSE and flips true when confirmed — gated surfaces stay
 * hidden until known rather than flashing and vanishing for non-beta users.
 * Remove alongside lib/feature-gate.ts when the beta opens up.
 */

let cached: boolean | null = null
let inflight: Promise<boolean> | null = null

async function fetchBeta(): Promise<boolean> {
  if (cached !== null) return cached
  if (!inflight) {
    inflight = fetch("/api/career-path/access")
      .then((r) => (r.ok ? r.json() : { beta: false }))
      .then((d: { beta?: boolean }) => {
        cached = !!d.beta
        return cached
      })
      .catch(() => {
        inflight = null // transient failure: allow a later retry
        return false
      })
  }
  return inflight
}

export function useCareerBeta(): boolean {
  const [beta, setBeta] = useState(cached ?? false)
  useEffect(() => {
    let alive = true
    fetchBeta().then((b) => { if (alive) setBeta(b) })
    return () => { alive = false }
  }, [])
  return beta
}
