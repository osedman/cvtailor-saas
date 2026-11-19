"use client"

/**
 * Configuration — off switches, who staging may email, and whether the
 * scheduled jobs ran. Support and up can read; changes need admin, two-step
 * verification and a reason.
 *
 * Laid out to the Figma frame "Admin — Configuration (desktop 1100)"
 * (figma.com/design/PyzSuQcvilrl80EjFrUP73, 21:130). Ose asked on 19 Nov for
 * this phase to be built through without waiting for sign-off on the frame,
 * so the frame and this screen are reviewed together.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AdminPageHeader, TWO_STEP_PATH, adminErrorMessage, useAdmin } from "@/components/admin/admin-shell"
import { ReasonPrompt } from "@/components/admin/reason-prompt"
import { MIN_REASON_LENGTH, roleAllows } from "@/lib/admin-roles"
import { parseAllowlistAddress, type KillKey } from "@/lib/admin-config"

interface Switch {
  key: KillKey; label: string; description: string
  environmentOn: boolean; switchedOff: boolean; by: string | null; at: string | null
}
interface Allowlist {
  production: boolean; environmentCount: number; environmentSet: boolean
  extras: string[]; by: string | null; at: string | null; max: number
}
interface Run {
  id: string; kind: "cron" | "course_sync"; job: string; at: string; ok: boolean
  status?: string; summary: Record<string, number | string | boolean>
}
interface Config { switches: Switch[]; allowlist: Allowlist; runs: Run[] }

type Pending = { type: "switch"; key: KillKey; off: boolean } | { type: "remove"; email: string }

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

const JOB_NAMES: Record<string, string> = {
  "agency-daily": "Agency daily job",
  "weekly:/api/cron/course-sync": "Weekly course sync",
  "weekly:/api/path-digest": "Weekly path digest",
  youtube: "Course sync · YouTube",
  "microsoft-learn": "Course sync · Microsoft Learn",
  curated: "Course sync · Curated list",
}

function switchState(s: Switch): { text: string; warn: boolean } {
  if (s.switchedOff) return { text: `Switched off${s.by ? ` by ${s.by}` : ""}${s.at ? `, ${day(s.at)}` : ""}`, warn: true }
  if (!s.environmentOn) return { text: "Off in this environment’s settings", warn: false }
  return { text: "On", warn: false }
}

/** "notices_sent: 2" → "2 notices sent". Zero counts are left out. */
function runSummary(r: Run): string {
  const parts = Object.entries(r.summary)
    .filter(([, v]) => (typeof v === "number" ? v > 0 : typeof v === "string"))
    .map(([k, v]) => (typeof v === "number" ? `${v} ${k.replace(/_/g, " ")}` : `${k.replace(/_/g, " ")} ${v}`))
  return parts.length ? parts.join(", ") : r.ok ? "nothing to do" : "it stopped early"
}

export default function AdminConfigPage() {
  const { me } = useAdmin()
  const isAdmin = roleAllows(me.role, "admin")
  const canWrite = isAdmin && me.canWrite

  const [config, setConfig] = useState<Config | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [reason, setReason] = useState("")
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [addReason, setAddReason] = useState("")
  const [addError, setAddError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch("/api/admin/config", { cache: "no-store" })
      if (!res.ok) throw new Error(await adminErrorMessage(res, "Could not load the configuration."))
      setConfig((await res.json()) as Config)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the configuration.")
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function send(body: Record<string, unknown>): Promise<string | null> {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
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

  async function confirmPending() {
    if (!pending) return
    setPendingError(null)
    if (reason.trim().length < MIN_REASON_LENGTH) return setPendingError("Give a short reason for this change.")
    const error = pending.type === "switch"
      ? await send({ type: "switch", key: pending.key, off: pending.off, reason })
      : await send({ type: "allowlist", action: "remove", email: pending.email, reason })
    if (error) return setPendingError(error)
    toast.success(pending.type === "switch" ? (pending.off ? "Switched off" : "Switched back on") : "Address removed")
    setPending(null); setReason("")
  }

  async function addAddress(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    const parsed = parseAllowlistAddress(email)
    if ("error" in parsed) return setAddError(parsed.error)
    if (addReason.trim().length < MIN_REASON_LENGTH) return setAddError("Give a short reason for allowing this address.")
    const error = await send({ type: "allowlist", action: "add", email: parsed.email, reason: addReason })
    if (error) return setAddError(error)
    toast.success("Address allowed")
    setEmail(""); setAddReason("")
  }

  const start = (next: Pending) => { setPending(next); setReason(""); setPendingError(null) }
  const twoStep = isAdmin && !me.canWrite && (
    <p className="mt-2 text-[12px] font-medium text-[#b3341b]">
      You need two-step verification to make changes.{" "}
      <Link href={`${TWO_STEP_PATH}?next=${encodeURIComponent("/admin/config")}`} className="underline underline-offset-2">Set it up</Link>
    </p>
  )

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 sm:px-10 sm:pb-11 sm:pt-[34px]">
      <AdminPageHeader
        eyebrow="Admin · Configuration"
        title="Configuration"
        lede="Switch a feature off in an emergency, control who staging may email, and see whether the scheduled jobs ran. Changes take effect within a minute, with no deploy."
      />

      {loadError ? (
        <div className="ns-admin-panel mt-6 flex flex-wrap items-center justify-between gap-3 px-3.5 py-3" role="alert">
          <p className="text-[12px] font-medium text-[#b3341b]">{loadError}</p>
          <button type="button" className="ns-admin-btn ns-admin-btn-sm" onClick={() => void load()}>Try again</button>
        </div>
      ) : !config ? (
        <div className="flex justify-center py-14" role="status" aria-label="Loading configuration">
          <Loader2 className="h-5 w-5 animate-spin text-[#dc4f33]" aria-hidden />
        </div>
      ) : (
        <>
          {/* ── Off switches ─────────────────────────────────────── */}
          <h2 className="mt-7 text-[13.5px] font-semibold">Off switches</h2>
          <ul className="mt-3.5 flex flex-col gap-3.5">
            {config.switches.map((s) => {
              const state = switchState(s)
              const open = pending?.type === "switch" && pending.key === s.key ? pending : null
              // Nothing to offer when the environment already has it off.
              const offer = s.switchedOff ? "Switch back on" : s.environmentOn ? "Switch off" : null
              return (
                <li key={s.key} className="ns-admin-card px-3.5 py-3">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{s.label}</p>
                      <p className="mt-[3px] text-[11.5px] leading-[1.5] text-[#5c534c]">{s.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3.5">
                      <span className={`ns-admin-chip !whitespace-normal ${state.warn ? "ns-admin-chip-warn" : ""}`}>{state.text}</span>
                      <span className="flex-1 sm:hidden" />
                      {offer && isAdmin && (
                        <button type="button" disabled={!canWrite || busy}
                          className={`ns-admin-btn ns-admin-btn-sm ${s.switchedOff ? "" : "ns-admin-btn-danger"}`}
                          onClick={() => start({ type: "switch", key: s.key, off: !s.switchedOff })}>
                          {offer}
                        </button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <ReasonPrompt
                      id={`switch-reason-${s.key}`}
                      label={`Reason for switching ${s.label.toLowerCase()} ${open.off ? "off" : "back on"}`}
                      confirmLabel={open.off ? "Switch off" : "Switch back on"} danger={open.off}
                      value={reason} error={pendingError} busy={busy}
                      onChange={setReason} onConfirm={() => void confirmPending()} onCancel={() => setPending(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-3.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
            A switch here can only turn a feature off, and back to how the environment is set up. It cannot turn on something the environment has not been set up for.
            {!isAdmin && " Only an Admin can change these."}
          </p>
          {twoStep}

          {/* ── Staging email ────────────────────────────────────── */}
          <div className="mt-7 flex items-end justify-between gap-3">
            <h2 className="text-[13.5px] font-semibold">Who staging may email</h2>
            <span className="text-[11.5px] text-[#8a8178]">Staging only</span>
          </div>
          {config.allowlist.production ? (
            <div className="mt-3.5 rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
              <p className="text-[13px] font-medium">Not used in production</p>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">
                This is production, which emails everyone. The list below only limits staging and preview deployments.
              </p>
            </div>
          ) : isAdmin && (
            <form onSubmit={addAddress} className="ns-admin-panel mt-3.5 p-4" aria-labelledby="allow-title" noValidate>
              <h3 id="allow-title" className="text-[13.5px] font-semibold">Allow an address</h3>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 sm:flex-1">
                  <label htmlFor="allow-email" className="ns-admin-label">Email</label>
                  <input id="allow-email" type="email" autoComplete="off" spellCheck={false} className="ns-admin-input"
                    placeholder="tester@example.com" value={email} disabled={!canWrite || busy} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="min-w-0 sm:flex-1">
                  <label htmlFor="allow-reason" className="ns-admin-label">Reason</label>
                  <input id="allow-reason" type="text" autoComplete="off" className="ns-admin-input" maxLength={300}
                    placeholder="Why they need staging email" value={addReason} disabled={!canWrite || busy}
                    onChange={(e) => setAddReason(e.target.value)} />
                </div>
                <button type="submit" className="ns-admin-btn ns-admin-btn-primary" disabled={!canWrite || busy}>Allow</button>
              </div>
              <p role="alert" className="mt-2.5 text-[12px] font-medium text-[#b3341b] empty:hidden">{addError}</p>
              <p className="mt-2.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
                Staging holds real CVs, so it refuses to email anyone not listed. One exact address at a time; whole domains can only be set in the environment. Production is not affected and emails everyone.
              </p>
            </form>
          )}
          <ul className="mt-3.5 flex flex-col gap-3.5">
            <li className="ns-admin-card px-3.5 py-3">
              <p className="text-[13.5px] font-medium">
                {config.allowlist.environmentSet
                  ? `${config.allowlist.environmentCount} ${config.allowlist.environmentCount === 1 ? "entry" : "entries"} set in the environment`
                  : "The built-in default list"}
              </p>
              <p className="mt-[3px] text-[11px] leading-[1.5] text-[#8a8178]">
                {config.allowlist.environmentSet ? "Changed in the hosting settings, not here." : "Used because the environment has no list of its own. Changed in the code, not here."}
              </p>
            </li>
            {config.allowlist.extras.map((address) => {
              const open = pending?.type === "remove" && pending.email === address
              return (
                <li key={address} className="ns-admin-card px-3.5 py-3">
                  <div className="flex items-center gap-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-[13.5px] font-medium">{address}</p>
                      <p className="mt-[3px] text-[11px] leading-[1.5] text-[#8a8178]">Added from this screen</p>
                    </div>
                    {isAdmin && (
                      <button type="button" className="ns-admin-btn ns-admin-btn-sm ns-admin-btn-danger" disabled={!canWrite || busy}
                        onClick={() => start({ type: "remove", email: address })}>Remove</button>
                    )}
                  </div>
                  {open && (
                    <ReasonPrompt
                      id={`allow-reason-${address}`} label={`Reason for removing ${address}`}
                      confirmLabel="Remove" danger value={reason} error={pendingError} busy={busy}
                      onChange={setReason} onConfirm={() => void confirmPending()} onCancel={() => setPending(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>

          {/* ── Scheduled jobs ───────────────────────────────────── */}
          <div className="mt-7 flex items-end justify-between gap-3">
            <h2 className="text-[13.5px] font-semibold">Scheduled jobs</h2>
            <span className="text-[11.5px] text-[#8a8178]">Read only</span>
          </div>
          {config.runs.length === 0 ? (
            <div className="mt-3.5 rounded-[10px] border border-[#eee6da] bg-[#fdfcf9] px-4 py-5">
              <p className="text-[13px] font-medium">No runs recorded yet</p>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-[#5c534c]">The next scheduled run will appear here.</p>
            </div>
          ) : (
            <ul className="ns-admin-card mt-3.5 px-4 py-1">
              {config.runs.map((r, i) => (
                <li key={r.id} className={`flex items-center gap-3.5 py-3 ${i < config.runs.length - 1 ? "border-b border-[#eee6da]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13px] font-medium leading-[1.5]">{JOB_NAMES[r.job] ?? r.job}</p>
                    <p className="mt-[3px] break-words text-[11px] leading-[1.5] text-[#8a8178]">{dayTime(r.at)} · {runSummary(r)}</p>
                  </div>
                  <span className={`ns-admin-chip ${r.ok ? "" : "ns-admin-chip-warn"}`}>
                    {r.status === "running" ? "Running" : r.status === "partial" ? "Partly completed" : r.ok ? "Completed" : "Failed"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3.5 text-[11.5px] leading-[1.5] text-[#5c534c]">
            The latest 15 runs, with counts only. Jobs are recorded from when this screen was introduced, so earlier runs are not listed.
          </p>
        </>
      )}
    </main>
  )
}
