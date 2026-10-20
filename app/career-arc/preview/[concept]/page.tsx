"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { MissionControl } from "@/components/career-arc/concepts/mission-control"
import { MetroMap } from "@/components/career-arc/concepts/metro-map"
import { OneSheet } from "@/components/career-arc/concepts/one-sheet"
import { LedgerSheet } from "@/components/career-arc/concepts/ledger-sheet"
import {
  CONCEPT_IDS, CONCEPT_META, deriveConceptData, isConceptId, type ConceptData,
} from "@/lib/career-arc-concepts"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import type { CareerProfileSections } from "@/lib/anthropic"

/**
 * Concept previews: the four alternate Career Arc directions, rendered against
 * the signed-in user's real arc so they can be compared as products rather
 * than as static mockups. Private, beta-gated, and never linked publicly.
 */

const CORAL = "#dc4f33"

export default function ConceptPreviewPage({ params }: { params: Promise<{ concept: string }> }) {
  const { concept } = use(params)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<ConceptData | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "empty" | "locked">("loading")

  useEffect(() => {
    if (!authLoading && !user) router.push("/tailor")
  }, [authLoading, user, router])

  const load = useCallback(async () => {
    try {
      const [profileRes, evidenceRes] = await Promise.all([
        fetch("/api/career-profile"),
        fetch("/api/career-evidence"),
      ])
      if (profileRes.status === 403) { setState("locked"); return }
      const profile = await profileRes.json().catch(() => null)
      const sections: CareerProfileSections | null = profile?.profile?.sections ?? null
      if (!sections?.identity) { setState("empty"); return }
      const bank = evidenceRes.ok ? await evidenceRes.json().catch(() => null) : null
      setData(deriveConceptData(
        sections,
        (bank?.evidence ?? []) as EvidenceRow[],
        (bank?.usage ?? {}) as Record<string, number>,
      ))
      setState("ready")
    } catch {
      setState("empty")
    }
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  if (!isConceptId(concept)) {
    return (
      <Shell concept="ledger">
        <p className="p-16 text-center text-[13px] text-gray-500">
          Unknown concept. Pick one of the four above.
        </p>
      </Shell>
    )
  }

  if (authLoading || state === "loading") {
    return (
      <Shell concept={concept}>
        <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
      </Shell>
    )
  }
  if (state === "locked") {
    return (
      <Shell concept={concept}>
        <p className="p-16 text-center text-[13px] text-gray-500">Career Arc is in a small private beta.</p>
      </Shell>
    )
  }
  if (state === "empty" || !data) {
    return (
      <Shell concept={concept}>
        <p className="p-16 text-center text-[13px] text-gray-500">
          Build your Career Arc first — then every concept renders from your real record.{" "}
          <Link href="/career-arc" className="font-semibold" style={{ color: CORAL }}>Go to Career Arc →</Link>
        </p>
      </Shell>
    )
  }

  return (
    <Shell concept={concept}>
      {concept === "mission-control" && <MissionControl data={data} />}
      {concept === "metro-map" && <MetroMap data={data} />}
      {concept === "one-sheet" && <OneSheet data={data} />}
      {concept === "ledger" && <LedgerSheet data={data} />}
    </Shell>
  )
}

function Shell({ concept, children }: { concept: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <div className="border-b border-[#e0d6c9] bg-white/70 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/career-arc" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 transition-colors hover:text-[#1e1813]">
            <ArrowLeft className="h-3.5 w-3.5" />Career Arc
          </Link>
          <span className="font-mono text-[10.5px] tracking-[0.18em] text-[#a89e93]">CONCEPT PREVIEW</span>
          <span className="flex-1" />
          <nav className="flex flex-wrap gap-1.5">
            {CONCEPT_IDS.map((id) => {
              const active = id === concept
              return (
                <Link
                  key={id}
                  href={`/career-arc/preview/${id}`}
                  aria-current={active ? "page" : undefined}
                  className="rounded-lg border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] transition-colors focus-visible:ring-2 focus-visible:ring-[#dc4f33]/40 focus-visible:ring-offset-1"
                  style={active
                    ? { background: "#1e1813", borderColor: "#1e1813", color: "#f9f6f0" }
                    : { background: "#fff", borderColor: "#e0d6c9", color: "#55504a" }}
                >
                  {CONCEPT_META[id].name.toUpperCase()}
                </Link>
              )
            })}
          </nav>
        </div>
        {isConceptId(concept) && (
          <p className="mx-auto mt-1.5 max-w-[1200px] text-[11.5px] text-[#a89e93]">{CONCEPT_META[concept].tagline}</p>
        )}
      </div>
      {children}
    </div>
  )
}
