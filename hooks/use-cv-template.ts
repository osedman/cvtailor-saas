"use client"

import { useCallback, useEffect, useState } from "react"
import { toTemplateId, DEFAULT_TEMPLATE_ID, type CvTemplateId } from "@/lib/cv-templates"

const LS_KEY = "tailr:cv-template"

/**
 * The user's CV template preference: their saved default, changeable at any
 * time from the results panel.
 *
 * Local-first. localStorage paints the right template immediately on load
 * (a CV visibly re-skinning itself a beat after render looks broken), then the
 * server value — the real cross-device default — corrects it if they differ.
 * Signed-out users still get a working picker; it just never persists server side.
 */
export function useCvTemplate() {
  const [template, setTemplateState] = useState<CvTemplateId>(DEFAULT_TEMPLATE_ID)

  // Instant paint from the last known choice
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(LS_KEY)
      if (cached) setTemplateState(toTemplateId(cached))
    } catch { /* private mode / storage disabled — the default is fine */ }
  }, [])

  // Then reconcile with the stored default
  useEffect(() => {
    let cancelled = false
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.cvTemplate) return
        setTemplateState(toTemplateId(d.cvTemplate))
      })
      .catch(() => { /* signed out or offline — keep the local value */ })
    return () => { cancelled = true }
  }, [])

  const setTemplate = useCallback((id: CvTemplateId) => {
    setTemplateState(id)
    try { window.localStorage.setItem(LS_KEY, id) } catch { /* non-fatal */ }
    // Persist as the new default. Deliberately fire-and-forget: switching
    // template is a preview action and must stay instant, and the local value
    // already carries the choice if the write loses.
    fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cvTemplate: id }),
    }).catch(() => {})
  }, [])

  return { template, setTemplate }
}
