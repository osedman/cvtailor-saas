"use client"

/**
 * One consumer account, for support. Support and up; changes need two-step
 * verification and a reason.
 *
 * Built to the Figma frame "Admin — User detail (desktop 1100)"
 * (figma.com/design/PyzSuQcvilrl80EjFrUP73, 18:173). The frame is desktop
 * only; on a phone the tiles go two-up and each action's button drops under
 * its description, as on the other admin screens.
 *
 * Which actions are offered is decided by userActionRefusal — the same rule
 * the server applies — so a button is never shown that would be refused.
 */
import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { TWO_STEP_PATH, adminErrorMessage, useAdmin } from "@/components/admin/admin-shell"
import { ReasonPrompt } from "@/components/admin/reason-prompt"
import { MIN_REASON_LENGTH, type AdminRole } from "@/lib/admin-roles"
import { ROLE_LABELS } from "@/lib/admin-activity-text"
import { AGENCY_ROLE_LABELS, type AgencyMemberRole } from "@/lib/admin-agencies"
import { userActionRefusal, type UserAction } from "@/lib/admin-users"

interface Detail {
  user: {
    id: string; email: string | null; name: string | null; plan: string; tailorsUsed: number; createdAt: string
    lastSignInAt: string | null; emailConfirmed: boolean; suspended: boolean; subscribed: boolean | null
    adminRole: AdminRole | null; isYou: boolean
  }
  activity: { tailors: number; trackedJobs: number; recentSignIns: string[] }
  limits: Array<{ key: string; count: number; since: string }>
  hats: {
    memberships: Array<{ agencyId: string; agency: string; role: string; status: string }>
    clientOf: Array<{ agencyId: string; agency: string; company: string }>
  }
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

const DONE: Record<UserAction, string> = {
  reset_limits: "Limits reset",
  reset_usage: "Usage count reset",
  suspend: "Account suspended",
  reinstate: "Account reinstated",
  unsubscribe: "Removed from the mailing list",
}

export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { me } = useAdmin()
  const canWrite = me.canWrite
  const [data, setData] = useState<Detail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<UserAction | null>(null)
  const [reason, setReason] = useState("")
  const [pendingError, setPendingError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`, { cache: "no-store" })
      if (res.status === 404) throw new Error("That account doesn't exist.")
      if (!res.ok) throw new Error(await adminErrorMessage(res, "Could not load this account."))
      setData((await res.json()) as Detail)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load this account.")
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function confirm() {
    if (!pending) return
    setPendingError(null)
    if (reason.trim().length < MIN_REASON_LENGTH) return setPendingError("Give a short reason for this change.")
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pending, reason }),
      })
      if (!res.ok) return setPendingError(await adminErrorMessage(res))
      toast.success(DONE[pending])
      setPending(null); setReason("")
      await load()
    } catch {
      setPendingError("Could not reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link href="/admin/users" className="inline-flex min-h-[40px] items-center text-[12px] font-medium text-[#5c534c] hover:text-[#1e1813] sm:min-h-0">
      ← Users
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
      <main className="flex justify-center py-24" role="status" aria-label="Loading account">
        <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
      </main>
    )
  }

  const { user, activity, limits, hats } = data
  const label = user.name || user.email || "This person"
  const refusal = (action: UserAction) =>
    userActionRefusal({
      action, actorId: user.isYou ? user.id : "", targetId: user.id, targetAdminRole: user.adminRole,
      suspended: user.suspended, subscribed: user.subscribed, tailorsUsed: user.tailorsUsed,
      activeLimitCounters: limits.length,
    })

  const actions: Array<{ action: UserAction; title: string; body: string; button: string; danger?: boolean }> = [
    {
      action: "reset_limits", title: "Reset limits", button: "Reset limits",
      body: `Clears the counters that stop too many AI requests or sign-in codes in a short time. Use when someone is told to wait and should not have to. ${limits.length} ${limits.length === 1 ? "counter" : "counters"} active.`,
    },
    {
      action: "reset_usage", title: "Reset usage count", button: "Reset usage",
      body: "Sets the number of tailors counted against this account back to zero. Their history is not touched.",
    },
    {
      action: "unsubscribe", title: "Remove from mailing list", button: "Remove",
      body: "Stops marketing email to this address. Sign-in and account emails still arrive.",
    },
    user.suspended
      ? { action: "reinstate", title: "Reinstate account", button: "Reinstate", body: "Lets this person sign in again. Nothing was deleted while they were suspended." }
      : { action: "suspend", title: "Suspend account", button: "Suspend", danger: true, body: "Stops this person signing in. A session that is already open can last up to an hour. Nothing is deleted, and it can be undone." },
  ]

  const chips: Array<{ text: string; warn?: boolean; href?: string }> = [
    user.suspended ? { text: "Suspended", warn: true } : { text: "Active" },
    ...(user.emailConfirmed ? [] : [{ text: "Email not confirmed", warn: true }]),
    { text: user.plan === "pro" ? "Pro plan" : "Free plan" },
    { text: user.subscribed === null ? "Not on the mailing list" : user.subscribed ? "On the mailing list" : "Unsubscribed" },
    ...(user.adminRole ? [{ text: `Tailr admin: ${ROLE_LABELS[user.adminRole]}` }] : []),
    ...hats.memberships.map((m) => ({
      text: `${AGENCY_ROLE_LABELS[m.role as AgencyMemberRole] ?? m.role} at ${m.agency}${m.status === "active" ? "" : ` (${m.status})`}`,
      href: `/admin/agencies/${m.agencyId}`,
    })),
    ...hats.clientOf.map((c) => ({ text: `Client of ${c.agency}${c.company ? ` (${c.company})` : ""}`, href: `/admin/agencies/${c.agencyId}` })),
  ]

  const facts: Array<[string, string]> = [
    ["Tailors run", String(activity.tailors)],
    ["Jobs tracked", String(activity.trackedJobs)],
    ["Usage count", String(user.tailorsUsed)],
    ["Limit counters", limits.length === 0 ? "None" : `${limits.length} active`],
  ]

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 sm:px-10 sm:pb-11 sm:pt-[34px]">
      {back}
      <div className="t-eyebrow mt-3.5" style={{ fontSize: 10.5 }}>Admin · User</div>
      <h1 className="t-title mt-3.5 break-words text-[26px]">
        {label}<span style={{ color: "var(--ns-coral)" }}>.</span>
      </h1>
      <p className="mt-3.5 break-words text-[12.5px] leading-[1.5] text-[#5c534c]">
        {[user.name ? user.email : null, `joined ${day(user.createdAt)}`,
          user.lastSignInAt ? `last signed in ${dayTime(user.lastSignInAt)}` : "never signed in"].filter(Boolean).join(" · ")}
      </p>
      <ul className="mt-3.5 flex flex-wrap gap-2" aria-label="Account status">
        {chips.map((c) => (
          <li key={c.text}>
            {c.href
              ? <Link href={c.href} className="ns-admin-chip hover:border-[#1e1813]/40">{c.text}</Link>
              : <span className={`ns-admin-chip ${c.warn ? "ns-admin-chip-warn" : ""}`}>{c.text}</span>}
          </li>
        ))}
      </ul>

      <h2 className="mt-7 text-[13.5px] font-semibold">Account</h2>
      <dl className="mt-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="ns-admin-card px-4 py-3.5">
            <dt className="text-[11.5px] font-medium text-[#5c534c]">{k}</dt>
            <dd className="mt-1 text-[20px] font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-7 text-[13.5px] font-semibold">Fix something</h2>
      <ul className="mt-3.5 flex flex-col gap-3.5">
        {actions.map((a) => {
          const why = refusal(a.action)
          return (
            <li key={a.action} className="ns-admin-card px-3.5 py-3">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{a.title}</p>
                  <p className="mt-[3px] text-[11.5px] leading-[1.5] text-[#5c534c]">{a.body}</p>
                  {why && <p className="mt-1 text-[11.5px] font-medium leading-[1.5] text-[#8a8178]">{why}</p>}
                </div>
                <button type="button" disabled={!canWrite || busy || !!why}
                  className={`ns-admin-btn ns-admin-btn-sm self-start sm:self-auto ${a.danger ? "ns-admin-btn-danger" : ""}`}
                  onClick={() => { setPending(a.action); setReason(""); setPendingError(null) }}>
                  {a.button}
                </button>
              </div>
              {pending === a.action && (
                <ReasonPrompt
                  id={`user-reason-${a.action}`}
                  label={`Reason: ${a.title.toLowerCase()} for ${label}`}
                  confirmLabel={a.button}
                  danger={a.danger}
                  value={reason} error={pendingError} busy={busy}
                  onChange={setReason} onConfirm={() => void confirm()} onCancel={() => setPending(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-3.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
        Each action asks for a reason first. An action that does not apply is shown disabled with why.
      </p>
      {!canWrite && (
        <p className="mt-2 text-[12px] font-medium text-[#b3341b]">
          You need two-step verification to make changes.{" "}
          <Link href={`${TWO_STEP_PATH}?next=${encodeURIComponent(`/admin/users/${id}`)}`} className="underline underline-offset-2">Set it up</Link>
        </p>
      )}

      <div className="mt-7 flex items-end justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold">Recent sign-ins</h2>
        <span className="text-[11.5px] text-[#8a8178]">Times only</span>
      </div>
      {activity.recentSignIns.length === 0 ? (
        <div className="mt-3.5 rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
          <p className="text-[13px] font-medium">No sign-ins recorded</p>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">They may never have completed sign-in, or signed in before sign-ins were recorded.</p>
        </div>
      ) : (
        <ul className="ns-admin-card mt-3.5 px-4 py-1">
          {activity.recentSignIns.map((t, i) => (
            <li key={`${t}-${i}`} className={`py-2.5 text-[12.5px] ${i < activity.recentSignIns.length - 1 ? "border-b border-[#eee6da]" : ""}`}>
              <time dateTime={t}>{dayTime(t)}</time>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
