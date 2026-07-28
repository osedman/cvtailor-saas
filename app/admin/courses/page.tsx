"use client"

/**
 * Course review queue — admin only.
 *
 * The sync sends anything from an untrusted channel here instead of putting it
 * in front of users. Built to the Figma frame
 * (figma.com/design/PyzSuQcvilrl80EjFrUP73, "Admin — Course review queue").
 *
 * Bulk-first on purpose: one YouTube run produced 37 candidates, and a
 * one-at-a-time UI for that is how a review queue becomes a graveyard.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, ExternalLink, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/auth-provider"

interface Candidate {
  id: string
  provider: string
  title: string
  url: string
  channel: string
  channelId: string
  durationMinutes: number | null
  skillTags: string[]
}

const fmtDuration = (m: number | null) => {
  if (!m || m <= 0) return "—"
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}

export default function CourseReviewPage() {
  const { user, loading: authLoading } = useAuth()
  const [items, setItems] = useState<Candidate[] | null>(null)
  const [catalogCount, setCatalogCount] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/course-candidates")
    if (res.status === 403) { setForbidden(true); setItems([]); return }
    const data = await res.json()
    setItems(data.candidates ?? [])
    setCatalogCount(data.catalogCount ?? 0)
    setSelected(new Set())
  }, [])

  useEffect(() => { if (user) load().catch(() => setItems([])) }, [user, load])

  const act = async (action: "approve" | "reject") => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/course-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed.")
      toast.success(action === "approve"
        ? `${data.approved} added to the catalogue`
        : `${data.rejected} rejected`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  if (authLoading || items === null) {
    return <div className="min-h-screen bg-[#f9f6f0] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
    </div>
  }
  if (forbidden) {
    return <div className="min-h-screen bg-[#f9f6f0] flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-gray-500">You don&apos;t have access to this page.</p>
      <Link href="/tailor" className="text-sm text-[#dc4f33] hover:underline">Back to Tailr</Link>
    </div>
  }

  const allSelected = items.length > 0 && selected.size === items.length

  return (
    <div className="ns min-h-screen" style={{ background: "var(--ns-cream)" }}>
      <main className="max-w-[880px] mx-auto px-6 sm:px-10 py-9">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 hover:text-[#1e1813] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Admin
        </Link>

        <div className="t-eyebrow" style={{ marginTop: 22, marginBottom: 10 }}>Admin · Course review</div>
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <h1 className="t-title" style={{ fontSize: 26, margin: 0 }}>
            Review queue<span style={{ color: "var(--ns-coral)" }}>.</span>
          </h1>
          <span className="t-mono tabular-nums">
            {items.length} pending · {catalogCount.toLocaleString()} in catalogue
          </span>
        </div>

        <p className="t-small" style={{ margin: "12px 0 0", maxWidth: 640 }}>
          Approve puts a course in front of users. Reject remembers the decision so the
          same video never comes back. Anything from an already-trusted channel skips
          this queue entirely.
        </p>

        {items.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" style={{
            marginTop: 20, padding: "10px 14px", borderRadius: 10,
            background: "var(--ns-tint-1)", border: "1px solid var(--ns-tint-2)",
          }}>
            <button
              onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
              className="text-[12px] font-medium text-[#1e1813] hover:text-[#dc4f33] transition-colors"
            >
              {allSelected ? "Clear selection" : "Select all"}
            </button>
            <span className="t-mono" style={{ flex: 1 }}>{selected.size} selected</span>
            <button
              onClick={() => act("approve")}
              disabled={busy || selected.size === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium text-white bg-[#1e1813] disabled:opacity-40 hover:bg-[#332a22] transition-colors"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}Approve selected
            </button>
            <button
              onClick={() => act("reject")}
              disabled={busy || selected.size === 0}
              className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium bg-white border border-[#eee6da] text-[#b3341b] disabled:opacity-40 hover:bg-[#fff7f4] transition-colors"
            >
              Reject
            </button>
            <button onClick={() => { void load() }} aria-label="Refresh"
              className="p-1.5 rounded-lg border border-[#eee6da] bg-white text-gray-400 hover:text-[#1e1813] transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-col" style={{ gap: 8, marginTop: 14 }}>
          {items.length === 0 && (
            <p className="t-small" style={{ marginTop: 8 }}>
              Nothing waiting. Everything the last sync found came from a trusted channel.
            </p>
          )}
          {items.map((c) => {
            const sel = selected.has(c.id)
            return (
              <div key={c.id} className="flex items-center gap-3.5" style={{
                padding: "12px 14px", borderRadius: 10,
                background: "var(--ns-paper)",
                border: `1px solid ${sel ? "var(--ns-tint-2)" : "var(--ns-border)"}`,
              }}>
                <input
                  type="checkbox" checked={sel} onChange={() => toggle(c.id)}
                  aria-label={`Select ${c.title}`}
                  style={{ width: 15, height: 15, accentColor: "#dc4f33", flexShrink: 0, cursor: "pointer" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{c.title}</p>
                  <p className="t-small" style={{ margin: "3px 0 0" }}>
                    {[c.channel || c.provider, fmtDuration(c.durationMinutes), c.skillTags.slice(0, 4).join(", ")]
                      .filter(Boolean).join("  ·  ")}
                  </p>
                </div>
                <a href={c.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[#eee6da] bg-white text-[#5c534c] hover:text-[#1e1813] transition-colors">
                  Watch<ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
