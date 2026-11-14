"use client"

/**
 * The two support sections on an agency's admin page: client (hiring-manager)
 * access, and background jobs that need attention.
 *
 * No Figma frame — built to the Phase 0 admin patterns at Ose's request
 * (14 Nov 2026), reviewed in the browser. Each section loads on its own, so
 * one failing never blanks the other or the page above it.
 */
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { adminErrorMessage } from "@/components/admin/admin-shell"
import { ReasonPrompt } from "@/components/admin/reason-prompt"
import { MIN_REASON_LENGTH } from "@/lib/admin-roles"
import { JOB_KIND_LABELS, type ClientAccessAction, type JobAction, type JobState } from "@/lib/admin-agencies"

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

function SectionError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="ns-admin-panel mt-3.5 flex flex-wrap items-center justify-between gap-3 px-3.5 py-3" role="alert">
      <p className="text-[12px] font-medium text-[#b3341b]">{message}</p>
      <button type="button" className="ns-admin-btn ns-admin-btn-sm" onClick={retry}>Try again</button>
    </div>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-8" role="status" aria-label={label}>
      <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-3.5 rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">{body}</p>
    </div>
  )
}

// ── Client access ─────────────────────────────────────────────────────────

interface Contact {
  contactId: string
  company: string
  name: string
  email: string
  state: "linked" | "invited" | "expired" | "none"
  expiresAt: string | null
  alsoMember: boolean
}

function contactChip(c: Contact): { text: string; warn: boolean } {
  if (c.state === "linked") return { text: "Has access", warn: false }
  if (c.state === "invited") return { text: c.expiresAt ? `Invited · expires ${day(c.expiresAt)}` : "Invited", warn: false }
  if (c.state === "expired") return { text: "Invite expired", warn: true }
  return { text: "Not invited", warn: false }
}

export function ClientAccessSection({ agencyId, canWrite }: { agencyId: string; canWrite: boolean }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ contactId: string; action: ClientAccessAction } | null>(null)
  const [reason, setReason] = useState("")
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ contactId: string; text: string } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}/clients`, { cache: "no-store" })
      if (!res.ok) throw new Error(await adminErrorMessage(res, "Could not load client access."))
      setContacts(((await res.json()) as { contacts: Contact[] }).contacts)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load client access.")
    }
  }, [agencyId])

  useEffect(() => { void load() }, [load])

  const start = (contactId: string, action: ClientAccessAction) => {
    setPending({ contactId, action }); setReason(""); setPendingError(null); setNotice(null)
  }

  async function confirm(c: Contact) {
    if (!pending) return
    setPendingError(null)
    if (reason.trim().length < MIN_REASON_LENGTH) return setPendingError("Give a short reason for this change.")
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}/clients`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: c.contactId, action: pending.action, reason }),
      })
      if (!res.ok) return setPendingError(await adminErrorMessage(res))
      const body = (await res.json()) as { email?: { sent: boolean; skipped: string | null } }
      if (pending.action === "resend_invite") {
        toast.success("New invite created")
        // Say whether it was actually delivered — staging refuses most addresses.
        setNotice({
          contactId: c.contactId,
          text: body.email?.sent
            ? "A new invite has been emailed. Any earlier link no longer works."
            : `A new invite was created but the email was not sent (${body.email?.skipped ?? "unknown reason"}). The recruiter can resend it from their Clients screen to get the link.`,
        })
      } else {
        toast.success("Access removed")
        setNotice({
          contactId: c.contactId,
          text: c.alsoMember
            ? "Their client access is removed. They are also a member of this agency, and that login is unchanged."
            : "Their client access is removed. Resend the invite to let them back in.",
        })
      }
      setPending(null); setReason("")
      await load()
    } catch {
      setPendingError("Could not reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="client-access-title">
      <div className="mt-7 flex items-end justify-between gap-3">
        <h2 id="client-access-title" className="text-[13.5px] font-semibold">Client access</h2>
        {contacts && <span className="text-[11.5px] text-[#8a8178]">{contacts.length} {contacts.length === 1 ? "contact" : "contacts"}</span>}
      </div>
      {error ? <SectionError message={error} retry={() => void load()} />
        : contacts === null ? <Spinner label="Loading client access" />
        : contacts.length === 0 ? <Empty title="No client contacts yet" body="Hiring managers the agency adds will be listed here." />
        : (
          <ul className="mt-3.5 flex flex-col gap-3.5">
            {contacts.map((c) => {
              const chip = contactChip(c)
              const open = pending?.contactId === c.contactId ? pending : null
              const label = c.name || c.email
              return (
                <li key={c.contactId} className="ns-admin-card px-3.5 py-3">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13.5px] font-medium">{label}</p>
                      <p className="mt-[3px] break-words text-[11px] leading-[1.5] text-[#8a8178]">
                        {[c.company, c.name ? c.email : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3.5">
                      <span className={`ns-admin-chip ${chip.warn ? "ns-admin-chip-warn" : ""}`}>{chip.text}</span>
                      <span className="flex-1 sm:hidden" />
                      {c.state === "linked" ? (
                        <button type="button" className="ns-admin-btn ns-admin-btn-sm ns-admin-btn-danger"
                          disabled={!canWrite || busy} onClick={() => start(c.contactId, "unlink")}>Remove access</button>
                      ) : (
                        <button type="button" className="ns-admin-btn ns-admin-btn-sm"
                          disabled={!canWrite || busy} onClick={() => start(c.contactId, "resend_invite")}>
                          {c.state === "none" ? "Send invite" : "Resend invite"}
                        </button>
                      )}
                    </div>
                  </div>
                  {notice?.contactId === c.contactId && (
                    <p role="status" className="mt-2.5 text-[12px] font-medium leading-[1.5] text-[#1e1813]">{notice.text}</p>
                  )}
                  {open && (
                    <ReasonPrompt
                      id={`client-reason-${c.contactId}`}
                      label={open.action === "unlink" ? `Reason for removing ${label}’s access` : `Reason for sending ${label} a new invite`}
                      confirmLabel={open.action === "unlink" ? "Remove access" : "Send invite"}
                      danger={open.action === "unlink"}
                      value={reason} error={pendingError} busy={busy}
                      onChange={setReason} onConfirm={() => void confirm(c)} onCancel={() => setPending(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      <p className="mt-3.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
        A hiring manager gets access only by accepting an invite while signed in as the invited address, so nobody can be linked from here. To move someone to a new login, remove their access and send a new invite. Sending a new invite cancels any earlier link.
      </p>
    </section>
  )
}

// ── Jobs needing attention ────────────────────────────────────────────────

interface Job {
  id: string
  kind: string
  state: JobState
  actions: JobAction[]
  roleRef: string
  roleTitle: string
  errorCode: string | null
  createdAt: string
  startedAt: string | null
}

const JOB_STATE: Record<JobState, { text: string; warn: boolean }> = {
  waiting: { text: "Waiting to run", warn: false },
  stuck: { text: "Stopped responding", warn: true },
  failed: { text: "Failed", warn: true },
}

const ERROR_LABELS: Record<string, string> = {
  unreadable_file: "the file could not be read",
  model_error: "the AI service returned an error",
  rate_limited: "the AI service was busy",
  timeout: "it ran out of time",
}

function jobHelp(job: Job): string | null {
  if (job.actions.length > 0) return null
  return job.kind === "transcribe"
    ? "The recruiter asks for the transcription again from the interview."
    : "The recruiter tries again from the role, with the file."
}

export function JobsSection({ agencyId, canWrite }: { agencyId: string; canWrite: boolean }) {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [meta, setMeta] = useState({ staleMinutes: 15, lookbackDays: 14 })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ jobId: string; action: JobAction } | null>(null)
  const [reason, setReason] = useState("")
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}/jobs`, { cache: "no-store" })
      if (!res.ok) throw new Error(await adminErrorMessage(res, "Could not load jobs."))
      const body = (await res.json()) as { jobs: Job[]; staleMinutes: number; lookbackDays: number }
      setJobs(body.jobs); setMeta({ staleMinutes: body.staleMinutes, lookbackDays: body.lookbackDays })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs.")
    }
  }, [agencyId])

  useEffect(() => { void load() }, [load])

  async function confirm(job: Job) {
    if (!pending) return
    setPendingError(null)
    if (reason.trim().length < MIN_REASON_LENGTH) return setPendingError("Give a short reason for this change.")
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}/jobs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action: pending.action, reason }),
      })
      if (!res.ok) return setPendingError(await adminErrorMessage(res))
      if (pending.action === "run") {
        toast.success("Started")
        // It runs after the response. Do not claim an outcome that is not known yet.
        setNotice("The job has been started again. It can take a minute: refresh this list to see whether it finished. If it fails it will come back here.")
      } else {
        toast.success("Marked as failed")
        setNotice(null)
      }
      setPending(null); setReason("")
      await load()
    } catch {
      setPendingError("Could not reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="jobs-title">
      <div className="mt-7 flex items-end justify-between gap-3">
        <h2 id="jobs-title" className="text-[13.5px] font-semibold">Jobs needing attention</h2>
        <button type="button" className="ns-admin-btn ns-admin-btn-sm" onClick={() => { setNotice(null); void load() }}>Refresh</button>
      </div>
      {notice && <p role="status" className="mt-3 text-[12px] font-medium leading-[1.5] text-[#1e1813]">{notice}</p>}
      {error ? <SectionError message={error} retry={() => void load()} />
        : jobs === null ? <Spinner label="Loading jobs" />
        : jobs.length === 0 ? (
          <Empty title="Nothing needs attention"
            body={`No job has failed in the last ${meta.lookbackDays} days, and none has been waiting or running for more than ${meta.staleMinutes} minutes.`} />
        ) : (
          <ul className="mt-3.5 flex flex-col gap-3.5">
            {jobs.map((job) => {
              const chip = JOB_STATE[job.state]
              const open = pending?.jobId === job.id ? pending : null
              const kind = JOB_KIND_LABELS[job.kind] ?? job.kind
              const help = jobHelp(job)
              // "CV read" must not become "cv read" mid-sentence.
              const lowerKind = kind.toLowerCase().replace(/\bcv\b/, "CV")
              return (
                <li key={job.id} className="ns-admin-card px-3.5 py-3">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13.5px] font-medium">{kind}</p>
                      <p className="mt-[3px] break-words text-[11px] leading-[1.5] text-[#8a8178]">
                        {[job.roleRef, job.roleTitle, `started ${dayTime(job.startedAt ?? job.createdAt)}`,
                          job.state === "failed" && job.errorCode ? ERROR_LABELS[job.errorCode] ?? "it hit an error" : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                      {help && <p className="mt-1 text-[11px] leading-[1.5] text-[#5c534c]">{help}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3.5">
                      <span className={`ns-admin-chip ${chip.warn ? "ns-admin-chip-warn" : ""}`}>{chip.text}</span>
                      <span className="flex-1 sm:hidden" />
                      {job.actions.includes("run") && (
                        <button type="button" className="ns-admin-btn ns-admin-btn-sm" disabled={!canWrite || busy}
                          onClick={() => { setPending({ jobId: job.id, action: "run" }); setReason(""); setPendingError(null) }}>
                          Run again
                        </button>
                      )}
                      {job.actions.includes("mark_failed") && (
                        <button type="button" className="ns-admin-btn ns-admin-btn-sm ns-admin-btn-danger" disabled={!canWrite || busy}
                          onClick={() => { setPending({ jobId: job.id, action: "mark_failed" }); setReason(""); setPendingError(null) }}>
                          Mark failed
                        </button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <ReasonPrompt
                      id={`job-reason-${job.id}`}
                      label={open.action === "run" ? `Reason for running this ${lowerKind} again` : `Reason for marking this ${lowerKind} as failed`}
                      confirmLabel={open.action === "run" ? "Run again" : "Mark failed"}
                      danger={open.action === "mark_failed"}
                      value={reason} error={pendingError} busy={busy}
                      onChange={setReason} onConfirm={() => void confirm(job)} onCancel={() => setPending(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      <p className="mt-3.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
        Match scans and transcriptions wait in a queue that is otherwise only swept once a day, so they can be run again here. Reading a job description or CV, and scoring, happen while the recruiter waits: if one stops responding it can only be marked failed, and the recruiter tries again.
      </p>
    </section>
  )
}
