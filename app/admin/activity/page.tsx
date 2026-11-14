"use client"

/**
 * Activity — every change made from the admin area. Support and up.
 *
 * Built to the Figma frame "Admin — Activity (desktop 1100)"
 * (figma.com/design/PyzSuQcvilrl80EjFrUP73, 13:139). Read-only: there is no
 * control here that changes an entry, and no route that could.
 */
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AdminPageHeader, adminErrorMessage } from "@/components/admin/admin-shell"
import type { AuditArea } from "@/lib/admin-roles"
import { describeActivity, formatActivityTime, type ActivityEntry } from "@/lib/admin-activity-text"

const FILTERS: Array<{ key: AuditArea | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "admins", label: "Admins" },
  { key: "users", label: "Users" },
  { key: "agencies", label: "Agencies" },
  { key: "config", label: "Configuration" },
]

interface Page { entries: ActivityEntry[]; total: number; page: number; pageSize: number }

export default function AdminActivityPage() {
  const [area, setArea] = useState<AuditArea | "all">("all")
  const [page, setPage] = useState(0)
  const [data, setData] = useState<Page | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (area !== "all") params.set("area", area)
      const res = await fetch(`/api/admin/activity?${params}`, { cache: "no-store" })
      if (!res.ok) throw new Error(await adminErrorMessage(res, "Could not load activity."))
      setData((await res.json()) as Page)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activity.")
    } finally {
      setLoading(false)
    }
  }, [area, page])

  useEffect(() => { void load() }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 sm:px-10 sm:pb-11 sm:pt-[34px]">
      <AdminPageHeader
        eyebrow="Admin · Activity"
        title="Activity"
        lede="Every change made from the admin area: who did it, what changed and the reason they gave. Entries cannot be edited or deleted."
      />

      <div className="-mx-4 mt-3.5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by area">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="ns-admin-filter" aria-pressed={area === f.key}
            onClick={() => { setArea(f.key); setPage(0) }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-3.5" aria-live="polite" aria-busy={loading}>
        {error ? (
          <div className="ns-admin-panel flex flex-wrap items-center justify-between gap-3 px-3.5 py-3" role="alert">
            <p className="text-[12px] font-medium text-[#b3341b]">{error}</p>
            <button type="button" className="ns-admin-btn ns-admin-btn-sm" onClick={() => void load()}>Try again</button>
          </div>
        ) : !data ? (
          <div className="flex justify-center py-14" role="status" aria-label="Loading activity">
            <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
          </div>
        ) : data.entries.length === 0 ? (
          <div className="rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
            <p className="text-[13px] font-medium">Nothing recorded yet</p>
            <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">
              {area === "all"
                ? "Changes made from the admin area will appear here."
                : "No changes in this area yet."}
            </p>
          </div>
        ) : (
          <>
            <ul className={`ns-admin-card px-4 py-1 transition-opacity ${loading ? "opacity-60" : ""}`}>
              {data.entries.map((e, i) => (
                <li key={e.id}
                  className={`flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4 ${i < data.entries.length - 1 ? "border-b border-[#eee6da]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13px] font-medium leading-[1.5]">{describeActivity(e)}</p>
                    <p className="mt-[3px] break-words text-[11.5px] leading-[1.5] text-[#5c534c]">Reason: {e.reason}</p>
                  </div>
                  <time dateTime={e.at} className="shrink-0 text-[11px] leading-[1.5] text-[#8a8178]">{formatActivityTime(e.at)}</time>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav className="mt-3.5 flex items-center justify-between gap-3" aria-label="Activity pages">
                <button type="button" className="ns-admin-btn ns-admin-btn-sm" disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}>Newer</button>
                <span className="text-[11.5px] text-[#5c534c]">Page {page + 1} of {pages}</span>
                <button type="button" className="ns-admin-btn ns-admin-btn-sm" disabled={page + 1 >= pages || loading}
                  onClick={() => setPage((p) => p + 1)}>Older</button>
              </nav>
            )}
          </>
        )}
      </div>
    </main>
  )
}
