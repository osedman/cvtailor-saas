/**
 * One audit-log entry as a sentence a person can read.
 *
 * Pure, so the wording is tested rather than eyeballed. Unknown actions fall
 * back to a plain "actor · action · target" line: a new kind of entry must
 * still be legible before anyone remembers to add its wording here.
 */
import type { AdminRole } from "./admin-roles"

export interface ActivityEntry {
  id: number
  area: string
  action: string
  actorName: string
  targetType: string
  targetName: string
  /** The person an agency-member entry is about, when there is one. */
  subjectName?: string | null
  from: unknown
  to: unknown
  reason: string
  at: string
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  viewer: "Viewer",
  support: "Support",
  admin: "Admin",
}

function roleOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const role = (value as { role?: unknown }).role
  if (typeof role !== "string") return null
  return ROLE_LABELS[role as AdminRole] ?? role
}

const JOB_KIND: Record<string, string> = {
  jd_parse: "job description read", cv_parse: "CV read", score: "scoring job",
  match_scan: "match scan", transcribe: "transcription",
}

const AGENCY_ROLE: Record<string, string> = { owner: "Owner", recruiter: "Recruiter", viewer: "Viewer" }

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined
}

function settingsChanges(from: unknown, to: unknown): string[] {
  const out: string[] = []
  const pairs: Array<[string, string, string]> = [
    ["retention_days", "retention", " days"],
    ["notice_delay_days", "notice delay", " days"],
  ]
  if (field(from, "name") !== field(to, "name") && typeof field(to, "name") === "string") {
    out.push(`renamed from ${String(field(from, "name") ?? "")}`.trim())
  }
  for (const [key, label, unit] of pairs) {
    const a = field(from, key), b = field(to, key)
    if (a !== b && typeof b === "number") out.push(`${label} ${typeof a === "number" ? `${a} to ` : ""}${b}${unit}`)
  }
  return out
}

export function describeActivity(
  e: Pick<ActivityEntry, "area" | "action" | "actorName" | "targetName" | "from" | "to"> & { subjectName?: string | null }
): string {
  const target = e.targetName || "someone"
  if (e.area === "admins") {
    const from = roleOf(e.from)
    const to = roleOf(e.to)
    if (e.action === "added") return `${e.actorName} added ${target}${to ? ` as ${to}` : ""}`
    if (e.action === "role_changed" && from && to) return `${e.actorName} changed ${target} from ${from} to ${to}`
    if (e.action === "removed") return `${e.actorName} removed ${target}`
  }
  if (e.area === "agencies") {
    const who = e.subjectName || "someone"
    const fromRole = AGENCY_ROLE[String(field(e.from, "role"))]
    const toRole = AGENCY_ROLE[String(field(e.to, "role"))]
    const fromStatus = field(e.from, "status")
    const toStatus = field(e.to, "status")
    if (e.action === "agency_created") {
      return `${e.actorName} created ${target}${e.subjectName ? ` with ${e.subjectName} as owner` : ""}`
    }
    if (e.action === "member_invited") return `${e.actorName} added ${who} to ${target}${toRole ? ` as ${toRole}` : ""}`
    if (e.action === "member_suspended") return `${e.actorName} suspended ${who} at ${target}`
    if (e.action === "member_changed") {
      if (fromRole && toRole && fromRole !== toRole) return `${e.actorName} changed ${who} at ${target} from ${fromRole} to ${toRole}`
      if (fromStatus !== "active" && toStatus === "active") return `${e.actorName} reactivated ${who} at ${target}`
    }
    const company = typeof field(e.to, "company") === "string" && field(e.to, "company") ? String(field(e.to, "company")) : "a client contact"
    if (e.action === "client_invite_resent") return `${e.actorName} sent a new client invite for ${company} at ${target}`
    if (e.action === "client_access_removed") return `${e.actorName} removed client access for ${company} at ${target}`
    const jobKind = JOB_KIND[String(field(e.to, "kind"))] ?? "job"
    if (e.action === "job_rerun") return `${e.actorName} ran a ${jobKind} again at ${target}`
    if (e.action === "job_marked_failed") return `${e.actorName} marked a stuck ${jobKind} as failed at ${target}`
    if (e.action === "settings_changed") {
      const changes = settingsChanges(e.from, e.to)
      return `${e.actorName} changed ${target}${changes.length ? `: ${changes.join(", ")}` : " settings"}`
    }
  }
  return `${e.actorName} · ${e.action.replace(/_/g, " ")} · ${target}`
}

export function formatActivityTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}
