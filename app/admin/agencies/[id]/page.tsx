"use client"

/**
 * One agency — settings, team, and a read-only list of its roles. Support
 * and up can read and fix the team; settings need admin. Every change needs
 * two-step verification and a reason.
 *
 * No Figma frame: built to the Phase 0 admin patterns at Ose's request
 * (14 Nov 2026) and reviewed in the browser. Same header, panel, card, chip,
 * button and "reason under the row" patterns as the Admins screen.
 *
 * What is deliberately not here: candidates, CVs, job descriptions, notes —
 * and any way to close or discard a role, or to delete a member.
 */
import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { TWO_STEP_PATH, adminErrorMessage, useAdmin } from "@/components/admin/admin-shell"
import { ClientAccessSection, JobsSection } from "@/components/admin/agency-support-sections"
import { MIN_REASON_LENGTH, roleAllows } from "@/lib/admin-roles"
import { AGENCY_MEMBER_ROLES, AGENCY_ROLE_LABELS, type AgencyMemberRole } from "@/lib/admin-agencies"
import { NOTICE_MAX, NOTICE_MIN, RETENTION_MAX, RETENTION_MIN } from "@/lib/agency/settings-limits"

interface Agency { id: string; name: string; slug: string; retentionDays: number; noticeDelayDays: number; createdAt: string }
interface Member {
  userId: string; name: string | null; email: string | null
  role: AgencyMemberRole; status: "invited" | "active" | "suspended"; addedAt: string; signedIn: boolean
}
interface Role { id: string; ref: string; title: string; company: string; status: string; createdAt: string }
interface Detail { agency: Agency; members: Member[]; roles: Role[] }

type Pending =
  | { userId: string; kind: "role"; role: AgencyMemberRole }
  | { userId: string; kind: "status"; status: "active" | "suspended" }

const day = (iso: string, year = false) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) })

const ROLE_STATUS: Record<string, string> = { draft: "Draft", open: "Open", submitted: "Submitted", closed: "Closed" }

function memberChip(m: Member): { text: string; warn: boolean } {
  if (m.status === "suspended") return { text: "Suspended", warn: true }
  if (!m.signedIn) return { text: "Never signed in", warn: true }
  return { text: "Active", warn: false }
}

export default function AdminAgencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { me } = useAdmin()
  const canWrite = me.canWrite
  const canEditSettings = roleAllows(me.role, "admin")

  const [data, setData] = useState<Detail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState("")
  const [retention, setRetention] = useState("")
  const [notice, setNotice] = useState("")
  const [settingsReason, setSettingsReason] = useState("")
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AgencyMemberRole>("recruiter")
  const [addReason, setAddReason] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [addNotice, setAddNotice] = useState<string | null>(null)

  const [pending, setPending] = useState<Pending | null>(null)
  const [pendingReason, setPendingReason] = useState("")
  const [pendingError, setPendingError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/agencies/${id}`, { cache: "no-store" })
      if (res.status === 404) throw new Error("That agency doesn't exist.")
      if (!res.ok) throw new Error(await adminErrorMessage(res, "Could not load this agency."))
      const body = (await res.json()) as Detail
      setData(body)
      setName(body.agency.name)
      setRetention(String(body.agency.retentionDays))
      setNotice(String(body.agency.noticeDelayDays))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load this agency.")
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function send(url: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<{ error: string } | { body: Record<string, unknown> }> {
    setBusy(true)
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) return { error: await adminErrorMessage(res) }
      const json = (await res.json()) as Record<string, unknown>
      await load()
      return { body: json }
    } catch {
      return { error: "Could not reach the server. Check your connection and try again." }
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setSettingsError(null)
    const patch: Record<string, unknown> = {}
    if (name.trim() !== data.agency.name) patch.name = name.trim()
    if (Number(retention) !== data.agency.retentionDays) patch.retentionDays = retention
    if (Number(notice) !== data.agency.noticeDelayDays) patch.noticeDelayDays = notice
    if (Object.keys(patch).length === 0) return setSettingsError("Nothing has changed.")
    if (settingsReason.trim().length < MIN_REASON_LENGTH) return setSettingsError("Give a short reason for this change.")
    const result = await send(`/api/admin/agencies/${id}`, "PATCH", { ...patch, reason: settingsReason })
    if ("error" in result) return setSettingsError(result.error)
    toast.success("Settings saved")
    setSettingsReason("")
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null); setAddNotice(null)
    if (!email.trim()) return setAddError("Enter their email address.")
    if (addReason.trim().length < MIN_REASON_LENGTH) return setAddError("Give a short reason for adding them.")
    const result = await send(`/api/admin/agencies/${id}/members`, "POST", { email: email.trim(), role, reason: addReason })
    if ("error" in result) return setAddError(result.error)
    const mail = result.body.email as { sent: boolean; skipped: string | null } | undefined
    toast.success(`Added as ${AGENCY_ROLE_LABELS[role]}`)
    setAddNotice(mail?.sent
      ? "They have been emailed a sign-in link."
      : `They have access, but the email was not sent (${mail?.skipped ?? "unknown reason"}). Tell them to sign in with that address.`)
    setEmail(""); setAddReason(""); setRole("recruiter")
  }

  async function confirmPending(m: Member) {
    if (!pending) return
    setPendingError(null)
    if (pendingReason.trim().length < MIN_REASON_LENGTH) return setPendingError("Give a short reason for this change.")
    const body = pending.kind === "role"
      ? { userId: m.userId, role: pending.role, reason: pendingReason }
      : { userId: m.userId, status: pending.status, reason: pendingReason }
    const result = await send(`/api/admin/agencies/${id}/members`, "PATCH", body)
    if ("error" in result) return setPendingError(result.error)
    toast.success(pending.kind === "role" ? `Now ${AGENCY_ROLE_LABELS[pending.role]}` : pending.status === "suspended" ? "Suspended" : "Reactivated")
    setPending(null); setPendingReason("")
  }

  const startPending = (next: Pending) => { setPending(next); setPendingReason(""); setPendingError(null) }

  const back = (
    <Link href="/admin/agencies" className="inline-flex min-h-[40px] items-center text-[12px] font-medium text-[#5c534c] hover:text-[#1e1813] sm:min-h-0">
      ← Agencies
    </Link>
  )

  if (loadError && !data) {
    return (
      <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 sm:px-10 sm:pt-[34px]">
        {back}
        <div className="ns-admin-panel mt-3.5 flex flex-wrap items-center justify-between gap-3 px-3.5 py-3" role="alert">
          <p className="text-[12px] font-medium text-[#b3341b]">{loadError}</p>
          <button type="button" className="ns-admin-btn ns-admin-btn-sm" onClick={() => void load()}>Try again</button>
        </div>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="flex justify-center py-24" role="status" aria-label="Loading agency">
        <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
      </main>
    )
  }

  const { agency, members, roles } = data
  const twoStepLink = (
    <p className="mt-2 text-[12px] font-medium text-[#b3341b]">
      You need two-step verification to make changes.{" "}
      <Link href={`${TWO_STEP_PATH}?next=${encodeURIComponent(`/admin/agencies/${id}`)}`} className="underline underline-offset-2">Set it up</Link>
    </p>
  )

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 sm:px-10 sm:pb-11 sm:pt-[34px]">
      {back}
      <div className="t-eyebrow mt-3.5" style={{ fontSize: 10.5 }}>Admin · Agency</div>
      <h1 className="t-title mt-3.5 break-words text-[26px]">
        {agency.name}<span style={{ color: "var(--ns-coral)" }}>.</span>
      </h1>
      <p className="mt-3.5 break-words text-[12.5px] leading-[1.5] text-[#5c534c]">{agency.slug} · created {day(agency.createdAt, true)}</p>

      {/* ── Settings ─────────────────────────────────────────────── */}
      <h2 className="mt-7 text-[13.5px] font-semibold">Settings</h2>
      <form onSubmit={saveSettings} className="ns-admin-card mt-3.5 p-4" noValidate>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 sm:flex-1">
            <label htmlFor="set-name" className="ns-admin-label">Agency name</label>
            <input id="set-name" type="text" autoComplete="off" className="ns-admin-input" maxLength={120}
              value={name} disabled={!canEditSettings || !canWrite || busy} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="sm:w-[200px]">
            <label htmlFor="set-retention" className="ns-admin-label">Keep candidate data (days)</label>
            <input id="set-retention" type="number" inputMode="numeric" min={RETENTION_MIN} max={RETENTION_MAX} className="ns-admin-input"
              value={retention} disabled={!canEditSettings || !canWrite || busy} onChange={(e) => setRetention(e.target.value)} />
          </div>
          <div className="sm:w-[160px]">
            <label htmlFor="set-notice" className="ns-admin-label">Notice delay (days)</label>
            <input id="set-notice" type="number" inputMode="numeric" min={NOTICE_MIN} max={NOTICE_MAX} className="ns-admin-input"
              value={notice} disabled={!canEditSettings || !canWrite || busy} onChange={(e) => setNotice(e.target.value)} />
          </div>
        </div>
        {canEditSettings && (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 sm:flex-1">
              <label htmlFor="set-reason" className="ns-admin-label">Reason</label>
              <input id="set-reason" type="text" autoComplete="off" className="ns-admin-input" maxLength={300}
                placeholder="Why this is changing" value={settingsReason} disabled={!canWrite || busy}
                onChange={(e) => setSettingsReason(e.target.value)} />
            </div>
            <button type="submit" className="ns-admin-btn ns-admin-btn-primary" disabled={!canWrite || busy}>Save settings</button>
          </div>
        )}
        <p role="alert" className="mt-2.5 text-[12px] font-medium text-[#b3341b] empty:hidden">{settingsError}</p>
        <p className="mt-2.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
          Candidate data is kept for this many days after a role closes, then removed. The notice delay is how long before candidates are told the agency holds their data; it cannot go above {NOTICE_MAX} days. The agency sees a change here in its own audit log as “Tailr support”.
          {!canEditSettings && " Only an Admin can change these."}
        </p>
        {canEditSettings && !canWrite && twoStepLink}
      </form>

      {/* ── Team ─────────────────────────────────────────────────── */}
      <div className="mt-7 flex items-end justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold">Team</h2>
        <span className="text-[11.5px] text-[#8a8178]">{members.length} {members.length === 1 ? "person" : "people"}</span>
      </div>
      <form onSubmit={addMember} className="ns-admin-panel mt-3.5 p-4" aria-labelledby="add-member-title" noValidate>
        <h3 id="add-member-title" className="text-[13.5px] font-semibold">Add a member</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 sm:flex-1">
            <label htmlFor="member-email" className="ns-admin-label">Email</label>
            <input id="member-email" type="email" autoComplete="off" spellCheck={false} className="ns-admin-input"
              placeholder="name@agency.com" value={email} disabled={!canWrite || busy} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:w-[150px]">
            <label htmlFor="member-role" className="ns-admin-label">Role</label>
            <select id="member-role" className="ns-admin-input" value={role} disabled={!canWrite || busy}
              onChange={(e) => setRole(e.target.value as AgencyMemberRole)}>
              {AGENCY_MEMBER_ROLES.map((r) => <option key={r} value={r}>{AGENCY_ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="min-w-0 sm:flex-1">
            <label htmlFor="member-reason" className="ns-admin-label">Reason</label>
            <input id="member-reason" type="text" autoComplete="off" className="ns-admin-input" maxLength={300}
              placeholder="Why they need access" value={addReason} disabled={!canWrite || busy}
              onChange={(e) => setAddReason(e.target.value)} />
          </div>
          <button type="submit" className="ns-admin-btn ns-admin-btn-primary" disabled={!canWrite || busy}>Add member</button>
        </div>
        <p role="alert" className="mt-2.5 text-[12px] font-medium text-[#b3341b] empty:hidden">{addError}</p>
        <p role="status" className="mt-2.5 text-[12px] font-medium text-[#1e1813] empty:hidden">{addNotice}</p>
        {!canWrite && twoStepLink}
      </form>

      <ul className="mt-3.5 flex flex-col gap-3.5">
        {members.map((m) => {
          const chip = memberChip(m)
          const open = pending?.userId === m.userId ? pending : null
          const label = m.name || m.email || "Unknown"
          const suspended = m.status === "suspended"
          return (
            <li key={m.userId} className="ns-admin-card px-3.5 py-3">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3.5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13.5px] font-medium">{label}</p>
                  <p className="mt-[3px] break-words text-[11px] leading-[1.5] text-[#8a8178]">
                    {m.name ? `${m.email ?? "No email on file"} · ` : ""}added {day(m.addedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3.5">
                  <label className="sr-only" htmlFor={`role-${m.userId}`}>Role for {label}</label>
                  <select id={`role-${m.userId}`}
                    className="ns-admin-input !w-auto !min-h-[40px] !py-1.5 text-[11.5px] font-medium sm:!min-h-[32px]"
                    value={open?.kind === "role" ? open.role : m.role} disabled={!canWrite || busy}
                    onChange={(e) => {
                      const next = e.target.value as AgencyMemberRole
                      if (next === m.role) setPending(null)
                      else startPending({ userId: m.userId, kind: "role", role: next })
                    }}>
                    {AGENCY_MEMBER_ROLES.map((r) => <option key={r} value={r}>{AGENCY_ROLE_LABELS[r]}</option>)}
                  </select>
                  <span className={`ns-admin-chip ${chip.warn ? "ns-admin-chip-warn" : ""}`}>{chip.text}</span>
                  <span className="flex-1 sm:hidden" />
                  <button type="button" disabled={!canWrite || busy}
                    className={`ns-admin-btn ns-admin-btn-sm ${suspended ? "" : "ns-admin-btn-danger"}`}
                    onClick={() => startPending({ userId: m.userId, kind: "status", status: suspended ? "active" : "suspended" })}>
                    {suspended ? "Reactivate" : "Suspend"}
                  </button>
                </div>
              </div>

              {open && (
                <div className="mt-3 border-t border-[#eee6da] pt-3">
                  <label htmlFor={`reason-${m.userId}`} className="ns-admin-label">
                    {open.kind === "role"
                      ? `Reason for changing ${label} to ${AGENCY_ROLE_LABELS[open.role]}`
                      : open.status === "suspended" ? `Reason for suspending ${label}` : `Reason for reactivating ${label}`}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input id={`reason-${m.userId}`} type="text" autoFocus autoComplete="off" maxLength={300}
                      className="ns-admin-input sm:flex-1" placeholder="Shown in the activity log and the agency’s audit log"
                      value={pendingReason} disabled={busy} onChange={(e) => setPendingReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void confirmPending(m)
                        if (e.key === "Escape") setPending(null)
                      }} />
                    <button type="button" disabled={busy} onClick={() => void confirmPending(m)}
                      className={`ns-admin-btn ${open.kind === "status" && open.status === "suspended" ? "ns-admin-btn-danger" : "ns-admin-btn-primary"}`}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      {open.kind === "role" ? "Change role" : open.status === "suspended" ? "Suspend member" : "Reactivate member"}
                    </button>
                    <button type="button" className="ns-admin-btn" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
                  </div>
                  <p role="alert" className="mt-2 text-[12px] font-medium text-[#b3341b] empty:hidden">{pendingError}</p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-3.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
        Suspending removes access straight away and keeps the person’s history. Members are never deleted, and an agency always keeps at least one active owner.
      </p>

      <ClientAccessSection agencyId={id} canWrite={canWrite} />

      {/* ── Roles ────────────────────────────────────────────────── */}
      <div className="mt-7 flex items-end justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold">Roles</h2>
        <span className="text-[11.5px] text-[#8a8178]">Read only</span>
      </div>
      {roles.length === 0 ? (
        <div className="mt-3.5 rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
          <p className="text-[13px] font-medium">No roles yet</p>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">Roles the agency creates will be listed here.</p>
        </div>
      ) : (
        <ul className="ns-admin-card mt-3.5 px-4 py-1">
          {roles.map((r, i) => (
            <li key={r.id} className={`flex items-center gap-3.5 py-3 ${i < roles.length - 1 ? "border-b border-[#eee6da]" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[13px] font-medium leading-[1.5]">{r.title || "Untitled role"}</p>
                <p className="mt-[3px] break-words text-[11px] leading-[1.5] text-[#8a8178]">{r.ref}{r.company ? ` · ${r.company}` : ""}</p>
              </div>
              <span className="ns-admin-chip">{ROLE_STATUS[r.status] ?? r.status}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
        Titles and status only{roles.length === 50 ? ", latest 50" : ""}. Roles are opened, closed and discarded by the agency: closing one starts the clock on removing its candidates’ data.
      </p>

      <JobsSection agencyId={id} canWrite={canWrite} />
    </main>
  )
}
