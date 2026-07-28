"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Target, X, ArrowRight } from "lucide-react"
import { useCareerBeta } from "@/hooks/use-career-beta"

const DISMISSED_KEY = "tailr:career-path-announcement:dismissed"

/**
 * One-time launch announcement for Career Path. Shows to signed-in users on
 * the tailor page until they dismiss it or already have a roadmap. Mirrors
 * the Career Arc announcement so the two feel like siblings.
 */
export function CareerPathAnnouncement() {
  const [visible, setVisible] = useState(false)
  const careerBeta = useCareerBeta()

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "1") return
    } catch { /* ignore */ }

    let cancelled = false
    fetch("/api/career-path")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { roadmap?: unknown } | null) => {
        // Someone who already built a path doesn't need the announcement
        if (!cancelled && !data?.roadmap) setVisible(true)
      })
      .catch(() => { if (!cancelled) setVisible(true) })
    return () => { cancelled = true }
  }, [])

  const dismiss = () => {
    setVisible(false)
    try { localStorage.setItem(DISMISSED_KEY, "1") } catch { /* ignore */ }
  }

  if (!visible || !careerBeta) return null

  return (
    <div className="relative mb-4 flex items-center gap-3 rounded-xl px-4 py-3 overflow-hidden" style={{ background: "#1e1813" }}>
      <div className="absolute pointer-events-none" style={{
        width: 200, height: 200, right: -60, top: -60, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(220,79,51,0.35) 0%, rgba(220,79,51,0) 70%)",
      }} />
      <Target className="relative w-4 h-4 flex-shrink-0" style={{ color: "#f4a58e" }} />
      <p className="relative flex-1 text-[13px]" style={{ color: "#f9f6f0" }}>
        <span className="font-semibold" style={{ color: "#f4a58e" }}>New — Career Path.</span>{" "}
        The skills that keep coming up short across your applications, turned into a plan with free resources and a project for each.{" "}
        <Link href="/career-path" className="inline-flex items-center gap-1 font-semibold hover:underline" style={{ color: "#f4a58e" }}>
          See yours <ArrowRight className="w-3 h-3" />
        </Link>
      </p>
      <button onClick={dismiss} className="relative p-1 -mr-1 rounded transition-colors hover:bg-white/10" style={{ color: "#8a8178" }} aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
