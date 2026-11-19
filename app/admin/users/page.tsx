"use client"

/**
 * Users — find a consumer account. Support and up.
 *
 * Built to the Figma frame "Admin — Users (desktop 1100)"
 * (figma.com/design/PyzSuQcvilrl80EjFrUP73, 18:130). A search, not a list:
 * nothing is shown until three characters are typed.
 */
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { AdminPageHeader, adminErrorMessage } from "@/components/admin/admin-shell"
import { USER_SEARCH_MIN } from "@/lib/admin-users"

interface UserRow { id: string; email: string | null; name: string | null; plan: string; createdAt: string }

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

export default function AdminUsersPage() {
  const [q, setQ] = useState("")
  const [result, setResult] = useState<{ term: string; users: UserRow[]; more: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const latest = useRef(0)

  const term = q.trim()
  const ready = term.length >= USER_SEARCH_MIN

  useEffect(() => {
    const call = ++latest.current
    if (!ready) { setResult(null); setError(null); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(term)}`, { cache: "no-store" })
        if (!res.ok) throw new Error(await adminErrorMessage(res, "Could not search."))
        const body = (await res.json()) as { users: UserRow[]; more: boolean }
        // A slower earlier search must not overwrite a newer one.
        if (call !== latest.current) return
        setResult({ term, ...body }); setError(null)
      } catch (e) {
        if (call === latest.current) setError(e instanceof Error ? e.message : "Could not search.")
      } finally {
        if (call === latest.current) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [term, ready])

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 sm:px-10 sm:pb-11 sm:pt-[34px]">
      <AdminPageHeader
        eyebrow="Admin · Users"
        title="Users"
        lede="Find a person by email or name to see how their account stands and fix it. You see counts and settings, never a CV or anything they have written."
      />

      <div className="mt-3.5">
        <label htmlFor="user-search" className="sr-only">Search by email or name</label>
        <input id="user-search" type="search" autoFocus autoComplete="off" spellCheck={false} className="ns-admin-input"
          placeholder="Search by email or name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mt-3.5" aria-live="polite" aria-busy={loading}>
        {error ? (
          <div className="ns-admin-panel px-3.5 py-3" role="alert">
            <p className="text-[12px] font-medium text-[#b3341b]">{error}</p>
          </div>
        ) : !ready ? (
          <div className="rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
            <p className="text-[13px] font-medium">Type at least {USER_SEARCH_MIN} characters</p>
            <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">Search by email address or name. Up to 20 people are shown.</p>
          </div>
        ) : !result ? (
          <div className="flex justify-center py-14" role="status" aria-label="Searching">
            <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
          </div>
        ) : result.users.length === 0 ? (
          <div className="rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
            <p className="text-[13px] font-medium">Nobody matches “{result.term}”</p>
            <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">Check the spelling, or try the part of the address before the @.</p>
          </div>
        ) : (
          <>
            <h2 className="mt-6 text-[13.5px] font-semibold">
              {result.users.length} {result.users.length === 1 ? "person" : "people"}{result.more ? ", and more" : ""}
            </h2>
            <ul className={`mt-3.5 flex flex-col gap-3.5 transition-opacity ${loading ? "opacity-60" : ""}`}>
              {result.users.map((u) => (
                <li key={u.id} className="ns-admin-card flex items-center gap-3.5 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13.5px] font-medium">{u.name || u.email || "No name"}</p>
                    <p className="mt-[3px] break-words text-[11px] leading-[1.5] text-[#8a8178]">
                      {[u.name ? u.email : null, `joined ${day(u.createdAt)}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Link href={`/admin/users/${u.id}`} className="ns-admin-btn ns-admin-btn-sm"
                    aria-label={`Open ${u.name || u.email || "this account"}`}>Open</Link>
                </li>
              ))}
            </ul>
            {result.more && (
              <p className="mt-3.5 text-[11.5px] leading-[1.5] text-[#5c534c]">Only the first 20 are shown. Type more of the address to narrow it down.</p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
