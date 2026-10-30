"use client"

/**
 * The recommendation's state, lifted out of the panel so two things can
 * share one result: the Recommendation tab that renders it and the Matrix
 * tab's "+ The N it recommends" chip that counts from it. Owning it in the
 * page (via this hook) also keeps the result alive across tab switches.
 *
 * It POSTs the recommendation route and nothing else. The route writes no
 * decision, and neither does anything here.
 */

import { useCallback, useState } from "react"
import type { RecommendationResult } from "@/lib/agency/recommendation"
import { errorMessage } from "@/lib/error-message"

export interface RecommendationState {
  result: RecommendationResult | null
  busy: boolean
  error: string
  /** Runs it; resolves to the result so a caller can act on it in one go. */
  generate: () => Promise<RecommendationResult | null>
}

export function useRecommendation(roleId: string): RecommendationState {
  const [result, setResult] = useState<RecommendationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const generate = useCallback(async () => {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/recommendation`, { method: "POST" })
      const body = await res.json()
      // A failed load must never read as an empty one.
      if (!res.ok) throw new Error(body?.error || `The recommendation failed (${res.status})`)
      const next = body as RecommendationResult
      setResult(next)
      return next
    } catch (e) {
      setError(errorMessage(e))
      return null
    } finally {
      setBusy(false)
    }
  }, [roleId])

  return { result, busy, error, generate }
}
