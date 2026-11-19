"use client"

/**
 * Agencies — every agency on Tailr for Agencies, and the form that creates
 * one. Support and up can read; creating needs admin and two-step.
 *
 * No Figma frame: the Figma MCP call limit blocked creating one, and Ose
 * asked (14 Nov 2026) for this to be built to the Phase 0 admin patterns and
 * reviewed in the browser. It reuses the Admins screen's header, panel, card,
 * chip and button styles — nothing new was invented for it.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AdminPageHeader, TWO_STEP_PATH, adminErrorMessage, useAdmin } from "@/components/admin/admin-shell"
import { roleAllows, MIN_REASON_LENGTH } from "@/lib/admin-roles"
import { slugifyAgencyName } from "@/lib/admin-agencies"

interface AgencyRow {
  id: string
  name: string
  slug: string
  createdAt: string
  members: number
  owners: number
  openRoles: number
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

export default function AdminAgenciesPage() {
  const { me } = useAdmin()
  const canCreate = roleAllows(me.role, "admin")
  const [agencies, setAgencies] = useState<AgencyRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [searched, setSearched] = useState("")

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState("")
  const [reason, setReason] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const latest = useRef(0)

  const load = useCallback(async (term: string) => {
    const call = ++latest.current
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/agencies${term ? `?q=${encodeURIComponent(term)}` : ""}`, { cache: "no-store" })
      if (!res.ok) throw new Error(await adminErrorMessage(res, "Could not load agencies."))
      const body = (await res.json()) as { agencies: AgencyRow[] }
      // A slower earlier search must not overwrite a newer one.
      if (call !== latest.current) return
      setAgencies(body.agencies); setSearched(term)
    } catch (e) {
      if (call === latest.current) setLoadError(e instanceof Error ? e.message : "Could not load agencies.")
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(q.trim()), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null); setNotice(null)
    if (name.trim().length < 2) return setFormError("Enter the agency's name.")
    if (!ownerEmail.trim()) return setFormError("Enter the first owner's email address.")
    if (reason.trim().length < MIN_REASON_LENGTH) return setFormError("Give a short reason for setting this agency up.")
    setBusy(true)
    try {
      const res = await fetch("/api/admin/agencies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: slug || slugifyAgencyName(name), ownerEmail, reason }),
      })
      if (!res.ok) return setFormError(await adminErrorMessage(res))
      const body = (await res.json()) as { email: { sent: boolean; skipped: string | null } }
      toast.success("Agency created")
      // Say plainly whether the owner was actually told: on staging most
      // addresses are refused, and "created" alone would hide that.
      setNotice(body.email.sent
        ? `${name.trim()} is set up and the owner has been emailed a sign-in link.`
        : `${name.trim()} is set up, but the email to the owner was not sent (${body.email.skipped ?? "unknown reason"}). Tell them to sign in at the agency login page with that address.`)
      setName(""); setSlug(""); setSlugTouched(false); setOwnerEmail(""); setReason("")
      await load(q.trim())
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  const canWrite = canCreate && me.canWrite
  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 sm:px-10 sm:pb-11 sm:pt-[34px]">
      <AdminPageHeader
        eyebrow="Admin · Agencies"
        title="Agencies"
        lede="Every agency on Tailr for Agencies. Open one to fix its team and settings. You see counts and role titles, never candidates or CVs."
      />

      {canCreate && (
        <form onSubmit={create} className="ns-admin-panel mt-3.5 p-4" aria-labelledby="create-agency-title" noValidate>
          <h2 id="create-agency-title" className="text-[13.5px] font-semibold">Create an agency</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 sm:flex-1">
              <label htmlFor="agency-name" className="ns-admin-label">Agency name</label>
              <input id="agency-name" type="text" autoComplete="off" className="ns-admin-input" maxLength={120}
                placeholder="Halcyon Search" value={name} disabled={!canWrite || busy}
                onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugifyAgencyName(e.target.value)) }} />
            </div>
            <div className="min-w-0 sm:flex-1">
              <label htmlFor="agency-slug" className="ns-admin-label">Short name</label>
              <input id="agency-slug" type="text" autoComplete="off" spellCheck={false} className="ns-admin-input" maxLength={60}
                placeholder="halcyon-search" value={slug} disabled={!canWrite || busy}
                onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true) }} />
            </div>
            <div className="min-w-0 sm:flex-1">
              <label htmlFor="agency-owner" className="ns-admin-label">First owner’s email</label>
              <input id="agency-owner" type="email" autoComplete="off" spellCheck={false} className="ns-admin-input"
                placeholder="name@agency.com" value={ownerEmail} disabled={!canWrite || busy}
                onChange={(e) => setOwnerEmail(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 sm:flex-1">
              <label htmlFor="agency-reason" className="ns-admin-label">Reason</label>
              <input id="agency-reason" type="text" autoComplete="off" className="ns-admin-input" maxLength={300}
                placeholder="Why this agency is being set up" value={reason} disabled={!canWrite || busy}
                onChange={(e) => setReason(e.target.value)} />
            </div>
            <button type="submit" className="ns-admin-btn ns-admin-btn-primary" disabled={!canWrite || busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Create agency
            </button>
          </div>
          <p role="alert" className="mt-2.5 text-[12px] font-medium text-[#b3341b] empty:hidden">{formError}</p>
          <p role="status" className="mt-2.5 text-[12px] font-medium text-[#1e1813] empty:hidden">{notice}</p>
          <p className="mt-2.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
            The short name is filled in from the agency name and must be unique. The owner gets an email with a sign-in link. If they have no Tailr account yet, the link also confirms their address.
          </p>
          {!me.canWrite && (
            <p className="mt-2 text-[12px] font-medium text-[#b3341b]">
              You need two-step verification to create an agency.{" "}
              <Link href={`${TWO_STEP_PATH}?next=${encodeURIComponent("/admin/agencies")}`} className="underline underline-offset-2">Set it up</Link>
            </p>
          )}
        </form>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[13.5px] font-semibold">
          {agencies === null ? "Agencies" : plural(agencies.length, "agency", "agencies")}
          {searched && agencies !== null ? ` matching “${searched}”` : ""}
        </h2>
        <div className="sm:w-[260px]">
          <label htmlFor="agency-search" className="sr-only">Search agencies by name</label>
          <input id="agency-search" type="search" className="ns-admin-input" placeholder="Search by name"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="mt-3.5" aria-live="polite">
        {loadError ? (
          <div className="ns-admin-panel flex flex-wrap items-center justify-between gap-3 px-3.5 py-3" role="alert">
            <p className="text-[12px] font-medium text-[#b3341b]">{loadError}</p>
            <button type="button" className="ns-admin-btn ns-admin-btn-sm" onClick={() => void load(q.trim())}>Try again</button>
          </div>
        ) : agencies === null ? (
          <div className="flex justify-center py-14" role="status" aria-label="Loading agencies">
            <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
          </div>
        ) : agencies.length === 0 ? (
          <div className="rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
            <p className="text-[13px] font-medium">{searched ? "No agencies match that search" : "No agencies yet"}</p>
            <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">
              {searched ? "Check the spelling, or clear the search to see them all." : "The first one you create will appear here."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {agencies.map((a) => (
              <li key={a.id} className="ns-admin-card flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3.5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13.5px] font-medium">{a.name}</p>
                  <p className="mt-[3px] break-words text-[11px] leading-[1.5] text-[#8a8178]">{a.slug} · created {day(a.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ns-admin-chip">{plural(a.members, "member")}</span>
                  <span className={`ns-admin-chip ${a.owners === 0 ? "ns-admin-chip-warn" : ""}`}>
                    {a.owners === 0 ? "No active owner" : plural(a.owners, "owner")}
                  </span>
                  <span className="ns-admin-chip">{plural(a.openRoles, "open role")}</span>
                  <span className="flex-1 sm:hidden" />
                  <Link href={`/admin/agencies/${a.id}`} className="ns-admin-btn ns-admin-btn-sm" aria-label={`Open ${a.name}`}>Open</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
