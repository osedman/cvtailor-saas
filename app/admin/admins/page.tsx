"use client"

/**
 * Admins — who can open the admin area and what they can change. Admin only.
 *
 * Built to the Figma frames "Admin — Admins (desktop 1100)" and
 * "(mobile 390)" (figma.com/design/PyzSuQcvilrl80EjFrUP73, 13:32 / 13:219).
 *
 * Every change asks for a reason before it is sent — the add form has the
 * field inline; a role change or removal opens it under the row. The server
 * refuses a change without one, and without two-step verification.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AdminPageHeader, TWO_STEP_PATH, adminErrorMessage, useAdmin } from "@/components/admin/admin-shell"
import { ADMIN_ROLES, MIN_REASON_LENGTH, type AdminRole } from "@/lib/admin-roles"
import { ROLE_LABELS, describeActivity, formatActivityTime, type ActivityEntry } from "@/lib/admin-activity-text"

interface AdminPerson {
  userId: string
  name: string | null
  email: string | null
  role: AdminRole
  source: "owner" | "list" | "code"
  addedAt: string | null
  addedByName: string | null
  twoStep: boolean | null
  needsTwoStep: boolean
  isYou: boolean
}

type Pending = { userId: string; kind: "role"; role: AdminRole } | { userId: string; kind: "remove" }

function metaLine(p: AdminPerson): string {
  const parts = [p.email ?? "No email on file"]
  if (p.source === "owner") parts.push("owner account, kept as the emergency way in")
  else if (p.source === "code") parts.push("viewer from the original setup")
  else if (p.addedAt) {
    const when = new Date(p.addedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    parts.push(`added ${when}${p.addedByName ? ` by ${p.addedByName}` : ""}`)
  }
  return parts.join(" · ")
}

function twoStepChip(p: AdminPerson): { text: string; warn: boolean } {
  if (!p.needsTwoStep) return { text: "Read only", warn: false }
  if (p.twoStep === true) return { text: "Two-step on", warn: false }
  if (p.twoStep === false) return { text: "Two-step not set · read only", warn: true }
  return { text: "Two-step unknown", warn: false }
}

export default function AdminsPage() {
  const { me } = useAdmin()
  const [people, setPeople] = useState<AdminPerson[] | null>(null)
  const [recent, setRecent] = useState<ActivityEntry[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AdminRole>("support")
  const [reason, setReason] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const [pending, setPending] = useState<Pending | null>(null)
  const [pendingReason, setPendingReason] = useState("")
  const [pendingError, setPendingError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [adminsRes, activityRes] = await Promise.all([
        fetch("/api/admin/admins", { cache: "no-store" }),
        fetch("/api/admin/activity?area=admins", { cache: "no-store" }),
      ])
      if (!adminsRes.ok) throw new Error(await adminErrorMessage(adminsRes, "Could not load the admin list."))
      setPeople(((await adminsRes.json()) as { admins: AdminPerson[] }).admins)
      // The list is the page; the log is context. A failed log read must not
      // blank the list.
      setRecent(activityRes.ok ? ((await activityRes.json()) as { entries: ActivityEntry[] }).entries.slice(0, 5) : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the admin list.")
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>): Promise<string | null> {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/admins", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) return await adminErrorMessage(res)
      await load()
      return null
    } catch {
      return "Could not reach the server. Check your connection and try again."
    } finally {
      setBusy(false)
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!email.trim()) return setFormError("Enter their email address.")
    if (reason.trim().length < MIN_REASON_LENGTH) return setFormError("Give a short reason for adding them.")
    const error = await send("POST", { email: email.trim(), role, reason })
    if (error) return setFormError(error)
    toast.success(`Added as ${ROLE_LABELS[role]}`)
    setEmail(""); setReason(""); setRole("support")
  }

  async function confirmPending(person: AdminPerson) {
    if (!pending) return
    setPendingError(null)
    if (pendingReason.trim().length < MIN_REASON_LENGTH) return setPendingError("Give a short reason for this change.")
    const error = pending.kind === "remove"
      ? await send("DELETE", { userId: person.userId, reason: pendingReason })
      : await send("PATCH", { userId: person.userId, role: pending.role, reason: pendingReason })
    if (error) return setPendingError(error)
    toast.success(pending.kind === "remove" ? "Removed" : `Now ${ROLE_LABELS[pending.role]}`)
    setPending(null); setPendingReason("")
  }

  function startPending(next: Pending) {
    setPending(next); setPendingReason(""); setPendingError(null)
  }

  const canWrite = me.canWrite
  const twoStepHref = `${TWO_STEP_PATH}?next=${encodeURIComponent("/admin/admins")}`

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 sm:px-10 sm:pb-11 sm:pt-[34px]">
      <AdminPageHeader
        eyebrow="Admin · Admins"
        title="Admins"
        lede="Who can open this area and what they can change. Viewer reads the dashboards. Support fixes access and resets limits. Admin also creates agencies, changes configuration and manages this list."
      />

      <form onSubmit={add} className="ns-admin-panel mt-3.5 p-4" aria-labelledby="add-admin-title" noValidate>
        <h2 id="add-admin-title" className="text-[13.5px] font-semibold">Add an admin</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 sm:flex-1">
            <label htmlFor="admin-email" className="ns-admin-label">Email</label>
            <input id="admin-email" type="email" autoComplete="off" spellCheck={false} className="ns-admin-input"
              placeholder="name@example.com" value={email} disabled={!canWrite || busy}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:w-[150px]">
            <label htmlFor="admin-role" className="ns-admin-label">Role</label>
            <select id="admin-role" className="ns-admin-input" value={role} disabled={!canWrite || busy}
              onChange={(e) => setRole(e.target.value as AdminRole)}>
              {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="min-w-0 sm:flex-1">
            <label htmlFor="admin-reason" className="ns-admin-label">Reason</label>
            <input id="admin-reason" type="text" autoComplete="off" className="ns-admin-input"
              placeholder="Why they need access" value={reason} disabled={!canWrite || busy} maxLength={300}
              onChange={(e) => setReason(e.target.value)} />
          </div>
          <button type="submit" className="ns-admin-btn ns-admin-btn-primary" disabled={!canWrite || busy}>
            {busy && !pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Add admin
          </button>
        </div>
        <p role="alert" className="mt-2.5 text-[12px] font-medium text-[#b3341b] empty:hidden">{formError}</p>
        <p className="mt-2.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
          They must already have a Tailr account. Support and Admin stay read only until they turn on two-step verification.
        </p>
        {!canWrite && (
          <p className="mt-2 text-[12px] font-medium text-[#b3341b]">
            You need two-step verification to change this list.{" "}
            <Link href={twoStepHref} className="underline underline-offset-2">Set it up</Link>
          </p>
        )}
      </form>

      {loadError ? (
        <div className="ns-admin-panel mt-6 flex flex-wrap items-center justify-between gap-3 px-3.5 py-3" role="alert">
          <p className="text-[12px] font-medium text-[#b3341b]">{loadError}</p>
          <button type="button" className="ns-admin-btn ns-admin-btn-sm" onClick={() => void load()}>Try again</button>
        </div>
      ) : people === null ? (
        <div className="flex justify-center py-14" role="status" aria-label="Loading admins">
          <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
        </div>
      ) : (
        <>
          <h2 className="mt-6 text-[13.5px] font-semibold">
            {people.length} {people.length === 1 ? "person" : "people"}
          </h2>
          <ul className="mt-3.5 flex flex-col gap-3.5">
            {people.map((p) => {
              const chip = twoStepChip(p)
              const locked = p.source !== "list"
              const editable = canWrite && p.source !== "owner" && !p.isYou
              const open = pending?.userId === p.userId ? pending : null
              const name = p.name || p.email || "Unknown"
              return (
                <li key={p.userId} className="ns-admin-card px-3.5 py-3">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">
                        {name}{p.isYou && <span className="font-normal text-[#8a8178]"> (you)</span>}
                      </p>
                      <p className="mt-[3px] break-words text-[11px] leading-[1.5] text-[#8a8178]">{metaLine(p)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3.5">
                      <label className="sr-only" htmlFor={`role-${p.userId}`}>Role for {name}</label>
                      <select id={`role-${p.userId}`} className="ns-admin-input !w-auto !min-h-[40px] !py-1.5 text-[11.5px] font-medium sm:!min-h-[32px]"
                        value={open?.kind === "role" ? open.role : p.role} disabled={!editable || busy}
                        onChange={(e) => {
                          const next = e.target.value as AdminRole
                          if (next === p.role) setPending(null)
                          else startPending({ userId: p.userId, kind: "role", role: next })
                        }}>
                        {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <span className={`ns-admin-chip ${chip.warn ? "ns-admin-chip-warn" : ""}`}>{chip.text}</span>
                      <span className="flex-1 sm:hidden" />
                      {locked || p.isYou ? (
                        <span className="text-[11px] font-medium text-[#8a8178]">
                          {p.isYou && !locked ? "Ask another admin" : "Can’t be removed"}
                        </span>
                      ) : (
                        <button type="button" className="ns-admin-btn ns-admin-btn-sm ns-admin-btn-danger"
                          disabled={!editable || busy} onClick={() => startPending({ userId: p.userId, kind: "remove" })}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 border-t border-[#eee6da] pt-3">
                      <label htmlFor={`reason-${p.userId}`} className="ns-admin-label">
                        {open.kind === "remove"
                          ? `Reason for removing ${name}`
                          : `Reason for changing ${name} to ${ROLE_LABELS[open.role]}`}
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input id={`reason-${p.userId}`} type="text" autoFocus autoComplete="off" maxLength={300}
                          className="ns-admin-input sm:flex-1" placeholder="Shown in the activity log"
                          value={pendingReason} disabled={busy}
                          onChange={(e) => setPendingReason(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void confirmPending(p)
                            if (e.key === "Escape") setPending(null)
                          }} />
                        <button type="button" disabled={busy} onClick={() => void confirmPending(p)}
                          className={`ns-admin-btn ${open.kind === "remove" ? "ns-admin-btn-danger" : "ns-admin-btn-primary"}`}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                          {open.kind === "remove" ? "Remove admin" : "Change role"}
                        </button>
                        <button type="button" className="ns-admin-btn" disabled={busy} onClick={() => setPending(null)}>
                          Cancel
                        </button>
                      </div>
                      <p role="alert" className="mt-2 text-[12px] font-medium text-[#b3341b] empty:hidden">{pendingError}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-8 flex items-end justify-between gap-3">
            <h2 className="text-[13.5px] font-semibold">Recent changes to this list</h2>
            <Link href="/admin/activity" className="-my-3 inline-flex min-h-[40px] items-center text-[11.5px] font-medium text-[#b3341b] hover:underline sm:my-0 sm:min-h-0">
              All activity →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 text-[11.5px] text-[#5c534c]">No changes recorded yet.</p>
          ) : (
            <ul className="mt-1">
              {recent.map((e) => (
                <li key={e.id} className="flex items-start gap-4 border-b border-[#eee6da] py-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13px] font-medium leading-[1.5]">{describeActivity(e)}</p>
                    <p className="mt-[3px] break-words text-[11.5px] leading-[1.5] text-[#5c534c]">Reason: {e.reason}</p>
                  </div>
                  <time dateTime={e.at} className="shrink-0 text-[11px] leading-[1.5] text-[#8a8178]">{formatActivityTime(e.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
