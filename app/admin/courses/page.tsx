"use client"

/**
 * Course review + catalogue — admin only.
 *
 * Two views behind one segmented switch, the same device the career path uses:
 * PENDING is the trust gate's queue (untrusted sources land here instead of in
 * front of users), CATALOGUE is everything live.
 *
 * Built to the Figma frames "Admin — Course review queue" and
 * "Admin — Catalogue view" (figma.com/design/PyzSuQcvilrl80EjFrUP73).
 *
 * Both views are bulk-first: one sync produced 37 candidates and the catalogue
 * is ~2,000 rows, so one-at-a-time would make either unusable. Search and
 * paging happen in Postgres — see the API route.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, ExternalLink, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/auth-provider"

interface Candidate {
  id: string; provider: string; title: string; url: string
  channel: string; durationMinutes: number | null; skillTags: string[]
}
interface CatalogCourse {
  id: string; provider: string; title: string; url: string
  durationMinutes: number | null; skillTags: string[]
  accessType: string; status: string; syncSource: string
}

const fmtDuration = (m: number | null) => {
  if (!m || m <= 0) return "—"
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}

const ROW: React.CSSProperties = {
  padding: "12px 14px", borderRadius: 10, background: "var(--ns-paper)",
}
const BTN = "px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors disabled:opacity-40"

export default function CoursesPage() {
  const { user, loading: authLoading } = useAuth()
  const [view, setView] = useState<"pending" | "catalog">("pending")
  const [forbidden, setForbidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // pending
  const [pending, setPending] = useState<Candidate[] | null>(null)
  // catalogue
  const [courses, setCourses] = useState<CatalogCourse[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [providers, setProviders] = useState<string[]>([])
  const [q, setQ] = useState("")
  const [provider, setProvider] = useState("")
  const [freeOnly, setFreeOnly] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [pendingByProvider, setPendingByProvider] = useState<Record<string, number>>({})

  const loadPending = useCallback(async () => {
    const res = await fetch("/api/admin/course-candidates")
    if (res.status === 403) { setForbidden(true); setPending([]); return }
    const d = await res.json()
    setPending(d.candidates ?? [])
    setPendingByProvider(d.pendingByProvider ?? {})
    setSelected(new Set())
  }, [])

  const loadCatalog = useCallback(async (nextOffset = 0, append = false) => {
    setLoadingCatalog(true)
    try {
      const p = new URLSearchParams({ offset: String(nextOffset) })
      if (q) p.set("q", q)
      if (provider) p.set("provider", provider)
      if (freeOnly) p.set("free", "1")
      const res = await fetch(`/api/admin/course-catalog?${p}`)
      if (res.status === 403) { setForbidden(true); return }
      const d = await res.json()
      setCourses((prev) => append ? [...prev, ...(d.courses ?? [])] : (d.courses ?? []))
      setTotal(d.total ?? 0)
      setOffset(nextOffset)
      if (d.providers) setProviders(d.providers)
      if (!append) setSelected(new Set())
    } finally { setLoadingCatalog(false) }
  }, [q, provider, freeOnly])

  useEffect(() => { if (user) loadPending().catch(() => setPending([])) }, [user, loadPending])
  useEffect(() => { if (user && view === "catalog") void loadCatalog(0) }, [user, view, loadCatalog])

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const act = async (url: string, action: string, after: () => Promise<void>) => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || "Failed.")
      toast.success(`${Object.values(d)[0]} ${action}d`)
      await after()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.")
    } finally { setBusy(false) }
  }

  /**
   * Act on every pending candidate from one provider. The server works in
   * bounded pages and reports what is left, so this keeps going until the
   * provider is clear — a first-party catalog can be thousands of rows, and
   * one visible page of 200 would otherwise never empty the queue.
   */
  const actOnProvider = async (name: string, action: "approve" | "reject") => {
    const total = pendingByProvider[name] ?? 0
    if (total === 0) return
    if (!confirm(`${action === "approve" ? "Approve" : "Reject"} all ${total} pending ${name} ${total === 1 ? "course" : "courses"}?`)) return
    setBusy(true)
    try {
      let done = 0
      for (;;) {
        const res = await fetch("/api/admin/course-candidates", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, provider: name }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d?.error || "Failed.")
        done += (d.approved ?? d.rejected ?? 0) as number
        if (action === "reject" || !d.remaining) break
      }
      toast.success(`${done} ${name} ${done === 1 ? "course" : "courses"} ${action}d`)
      await loadPending()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.")
    } finally { setBusy(false) }
  }

  if (authLoading || pending === null) {
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

  const rows: { id: string }[] = view === "pending" ? pending : courses
  const allSelected = rows.length > 0 && selected.size === rows.length

  return (
    <div className="ns min-h-screen" style={{ background: "var(--ns-cream)" }}>
      <main className="max-w-[880px] mx-auto px-6 sm:px-10 py-9">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 hover:text-[#1e1813] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Admin
        </Link>

        <div className="t-eyebrow" style={{ marginTop: 22, marginBottom: 10 }}>Admin · Courses</div>
        <h1 className="t-title" style={{ fontSize: 26, margin: 0 }}>
          {view === "pending" ? "Review queue" : "Course catalogue"}
          <span style={{ color: "var(--ns-coral)" }}>.</span>
        </h1>

        {/* Segmented switch — same device as the career path */}
        <div role="tablist" aria-label="Course view" className="inline-flex" style={{
          marginTop: 18, padding: 3, borderRadius: 999,
          background: "var(--ns-paper)", border: "1px solid var(--ns-border)",
        }}>
          {([["pending", `Pending · ${pending.length}`], ["catalog", `Catalogue · ${total || "…"}`]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k}
              onClick={() => { setView(k); setSelected(new Set()) }}
              style={{
                padding: "8px 18px", borderRadius: 999, fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                background: view === k ? "var(--ns-ink)" : "transparent",
                color: view === k ? "var(--ns-cream)" : "var(--ns-ink-55)",
              }}>{label}</button>
          ))}
        </div>

        <p className="t-small" style={{ margin: "14px 0 0", maxWidth: 640 }}>
          {view === "pending"
            ? "Approve puts a course in front of users. Reject is remembered, so the same video never comes back. Trusted channels skip this queue."
            : "Everything live. Retiring hides a course from recommendations immediately — the row stays, so the next sync can’t quietly re-add it."}
        </p>

        {view === "catalog" && (
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 16 }}>
            <div className="flex items-center gap-2 flex-1" style={{
              minWidth: 220, padding: "9px 12px", borderRadius: 8,
              background: "var(--ns-paper)", border: "1px solid var(--ns-border)",
            }}>
              <Search className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void loadCatalog(0) }}
                placeholder="Search title or skill…" aria-label="Search catalogue"
                className="flex-1 bg-transparent outline-none text-[12.5px] text-[#1e1813] placeholder:text-gray-400"
              />
            </div>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              aria-label="Filter by provider"
              className="text-[12px] font-medium text-[#5c534c] rounded-lg px-3 py-2.5 border border-[#eee6da] bg-[#fffdfa]">
              <option value="">All providers</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => setFreeOnly((v) => !v)}
              className={`text-[12px] font-medium rounded-lg px-3 py-2.5 border transition-colors ${freeOnly ? "bg-[#fff7f4] border-[#f5d9d0] text-[#b3341b]" : "bg-[#fffdfa] border-[#eee6da] text-[#5c534c]"}`}>
              Free only
            </button>
            <button onClick={() => void loadCatalog(0)} disabled={loadingCatalog}
              className="p-2.5 rounded-lg border border-[#eee6da] bg-[#fffdfa] text-gray-400 hover:text-[#1e1813] transition-colors" aria-label="Apply search">
              {loadingCatalog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {/* Whole-provider decisions. The list below is capped at 200, so after a
            first-party catalog sync it shows a fraction of what is waiting;
            these counts are the real totals and the buttons act on all of them. */}
        {view === "pending" && Object.keys(pendingByProvider).length > 0 && (
          <div className="flex flex-col gap-2" style={{
            marginTop: 16, padding: "12px 14px", borderRadius: 10,
            background: "#fffdfa", border: "1px solid #eee6da",
          }}>
            <span className="t-mono text-[11px] uppercase tracking-wide text-[#8a8178]">
              Decide a whole provider
            </span>
            {Object.entries(pendingByProvider).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
              <div key={name} className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] text-[#1e1813]" style={{ flex: 1, minWidth: 160 }}>
                  <strong>{name}</strong>
                  <span className="text-[#8a8178]"> · {count} awaiting review</span>
                </span>
                <button onClick={() => void actOnProvider(name, "approve")} disabled={busy}
                  className={`${BTN} text-white bg-[#1e1813] hover:bg-[#332a22]`}>
                  Approve all {count}
                </button>
                <button onClick={() => void actOnProvider(name, "reject")} disabled={busy}
                  className={`${BTN} bg-white border border-[#eee6da] text-[#b3341b] hover:bg-[#fff7f4]`}>
                  Reject all
                </button>
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" style={{
            marginTop: 16, padding: "10px 14px", borderRadius: 10,
            background: "var(--ns-tint-1)", border: "1px solid var(--ns-tint-2)",
          }}>
            <button onClick={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
              className="text-[12px] font-medium text-[#1e1813] hover:text-[#dc4f33] transition-colors">
              {allSelected ? "Clear selection" : "Select all"}
            </button>
            <span className="t-mono" style={{ flex: 1 }}>{selected.size} selected</span>
            {view === "pending" ? (
              <>
                <button onClick={() => act("/api/admin/course-candidates", "approve", loadPending)}
                  disabled={busy || !selected.size} className={`${BTN} text-white bg-[#1e1813] hover:bg-[#332a22]`}>
                  Approve selected
                </button>
                <button onClick={() => act("/api/admin/course-candidates", "reject", loadPending)}
                  disabled={busy || !selected.size} className={`${BTN} bg-white border border-[#eee6da] text-[#b3341b] hover:bg-[#fff7f4]`}>
                  Reject
                </button>
              </>
            ) : (
              <>
                <button onClick={() => act("/api/admin/course-catalog", "retire", () => loadCatalog(0))}
                  disabled={busy || !selected.size} className={`${BTN} bg-white border border-[#eee6da] text-[#b3341b] hover:bg-[#fff7f4]`}>
                  Retire selected
                </button>
                <button onClick={() => act("/api/admin/course-catalog", "restore", () => loadCatalog(0))}
                  disabled={busy || !selected.size} className={`${BTN} bg-white border border-[#eee6da] text-[#5c534c] hover:bg-gray-50`}>
                  Restore
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col" style={{ gap: 8, marginTop: 14 }}>
          {rows.length === 0 && (
            <p className="t-small" style={{ marginTop: 8 }}>
              {view === "pending"
                ? "Nothing waiting. Everything the last sync found came from a trusted channel."
                : "No courses match that search."}
            </p>
          )}

          {view === "pending" && pending.map((c) => (
            <div key={c.id} className="flex items-center gap-3.5" style={{
              ...ROW, border: `1px solid ${selected.has(c.id) ? "var(--ns-tint-2)" : "var(--ns-border)"}`,
            }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)}
                aria-label={`Select ${c.title}`}
                style={{ width: 15, height: 15, accentColor: "#dc4f33", flexShrink: 0, cursor: "pointer" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{c.title}</p>
                <p className="t-small" style={{ margin: "3px 0 0" }}>
                  {[c.channel || c.provider, fmtDuration(c.durationMinutes), c.skillTags.slice(0, 4).join(", ")].filter(Boolean).join("  ·  ")}
                </p>
              </div>
              <a href={c.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[#eee6da] bg-white text-[#5c534c] hover:text-[#1e1813] transition-colors">
                Watch<ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          ))}

          {view === "catalog" && courses.map((c) => {
            const retired = c.status !== "active"
            return (
              <div key={c.id} className="flex items-center gap-3.5" style={{
                ...ROW, opacity: retired ? 0.55 : 1,
                border: `1px solid ${selected.has(c.id) ? "var(--ns-tint-2)" : "var(--ns-border)"}`,
              }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)}
                  aria-label={`Select ${c.title}`}
                  style={{ width: 15, height: 15, accentColor: "#dc4f33", flexShrink: 0, cursor: "pointer" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>
                    {c.title}
                    {retired && <span className="t-mono" style={{ marginLeft: 8, color: "var(--ns-coral-deep)" }}>retired</span>}
                  </p>
                  <p className="t-small" style={{ margin: "3px 0 0" }}>
                    {[c.provider, fmtDuration(c.durationMinutes), c.accessType,
                      (c.skillTags ?? []).slice(0, 3).join(", ")].filter(Boolean).join("  ·  ")}
                  </p>
                </div>
                <a href={c.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[#eee6da] bg-white text-[#5c534c] hover:text-[#1e1813] transition-colors">
                  Open<ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
            )
          })}
        </div>

        {view === "catalog" && courses.length > 0 && (
          <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
            <span className="t-mono">Showing {courses.length} of {total.toLocaleString()}</span>
            {courses.length < total && (
              <button onClick={() => void loadCatalog(offset + 40, true)} disabled={loadingCatalog}
                className="text-[12px] font-medium text-[#dc4f33] hover:underline disabled:opacity-50">
                {loadingCatalog ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
