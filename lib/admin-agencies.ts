/**
 * Admin operations on agencies — the pure rules (14 Nov 2026).
 *
 * Safe to import from client components. The server half is
 * lib/admin-agency-server.ts; the database half is
 * supabase/migrations/20261114120000_admin_agency_ops.sql, whose checks are
 * the backstop for everything validated here.
 */
import { NOTICE_MAX, NOTICE_MIN, RETENTION_MAX, RETENTION_MIN } from "@/lib/agency/settings-limits"
import { MIN_REASON_LENGTH } from "@/lib/admin-roles"

export const AGENCY_MEMBER_ROLES = ["owner", "recruiter", "viewer"] as const
export type AgencyMemberRole = (typeof AGENCY_MEMBER_ROLES)[number]

export const AGENCY_MEMBER_STATUSES = ["active", "suspended"] as const
export type AgencyMemberStatus = (typeof AGENCY_MEMBER_STATUSES)[number]

export const AGENCY_ROLE_LABELS: Record<AgencyMemberRole, string> = {
  owner: "Owner",
  recruiter: "Recruiter",
  viewer: "Viewer",
}

export function isAgencyMemberRole(v: unknown): v is AgencyMemberRole {
  return typeof v === "string" && (AGENCY_MEMBER_ROLES as readonly string[]).includes(v)
}

export function isAgencyMemberStatus(v: unknown): v is AgencyMemberStatus {
  return typeof v === "string" && (AGENCY_MEMBER_STATUSES as readonly string[]).includes(v)
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v)
}

/** "Halcyon Search Ltd." → "halcyon-search-ltd". */
export function slugifyAgencyName(name: string): string {
  return name
    // Letters NFKD does not split into a base letter plus an accent.
    .replace(/[øØ]/g, "o").replace(/[æÆ]/g, "ae").replace(/ß/g, "ss").replace(/[łŁ]/g, "l").replace(/[đĐ]/g, "d")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "")
}

export function normaliseEmail(v: unknown): string | null {
  if (typeof v !== "string") return null
  const email = v.trim().toLowerCase()
  return EMAIL_RE.test(email) && email.length <= 320 ? email : null
}

export function validReason(v: unknown): v is string {
  return typeof v === "string" && v.trim().length >= MIN_REASON_LENGTH && v.length <= 300
}

export interface NewAgencyInput {
  name: string
  slug: string
  ownerEmail: string
  reason: string
}

/** A validated create-agency request, or the sentence to show. */
export function parseNewAgency(body: Record<string, unknown> | null): NewAgencyInput | { error: string } {
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (name.length < 2 || name.length > 120) return { error: "Enter the agency's name (2 to 120 characters)." }
  const slug = typeof body?.slug === "string" && body.slug.trim() ? body.slug.trim().toLowerCase() : slugifyAgencyName(name)
  if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 60) {
    return { error: "The short name can use lowercase letters, numbers and hyphens (3 to 60 characters)." }
  }
  const ownerEmail = normaliseEmail(body?.ownerEmail)
  if (!ownerEmail) return { error: "Enter the first owner's email address." }
  if (!validReason(body?.reason)) return { error: "Give a short reason for this change." }
  return { name, slug, ownerEmail, reason: (body!.reason as string).trim() }
}

export interface AgencySettingsInput {
  name: string | null
  retentionDays: number | null
  noticeDelayDays: number | null
  reason: string
}

function wholeNumber(v: unknown): number | null | "bad" {
  if (v === undefined || v === null || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isInteger(n) ? n : "bad"
}

export function parseAgencySettings(body: Record<string, unknown> | null): AgencySettingsInput | { error: string } {
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null
  if (name !== null && (name.length < 2 || name.length > 120)) {
    return { error: "The agency's name must be 2 to 120 characters." }
  }
  const retention = wholeNumber(body?.retentionDays)
  if (retention === "bad" || (retention !== null && (retention < RETENTION_MIN || retention > RETENTION_MAX))) {
    return { error: `Retention must be between ${RETENTION_MIN} and ${RETENTION_MAX} days.` }
  }
  const notice = wholeNumber(body?.noticeDelayDays)
  if (notice === "bad" || (notice !== null && (notice < NOTICE_MIN || notice > NOTICE_MAX))) {
    return { error: `The notice delay must be between ${NOTICE_MIN} and ${NOTICE_MAX} days. The cap is not adjustable.` }
  }
  if (name === null && retention === null && notice === null) return { error: "Nothing to change." }
  if (!validReason(body?.reason)) return { error: "Give a short reason for this change." }
  return { name, retentionDays: retention, noticeDelayDays: notice, reason: (body!.reason as string).trim() }
}

/** What the database functions raise, as sentences and statuses. */
export const AGENCY_RPC_ERRORS: Record<string, { message: string; status: number }> = {
  slug_taken: { message: "Another agency already uses that short name. Choose a different one.", status: 409 },
  invalid_slug: { message: "The short name can use lowercase letters, numbers and hyphens (3 to 60 characters).", status: 400 },
  invalid_name: { message: "The agency's name must be 2 to 120 characters.", status: 400 },
  reason_required: { message: "Give a short reason for this change.", status: 400 },
  invalid_role: { message: "Choose Owner, Recruiter or Viewer.", status: 400 },
  invalid_status: { message: "Choose active or suspended.", status: 400 },
  role_required: { message: "Choose a role for the new member.", status: 400 },
  agency_not_found: { message: "That agency no longer exists.", status: 404 },
  no_change: { message: "Nothing changed: it is already set that way.", status: 409 },
  last_owner: {
    message: "An agency needs at least one active owner. Make someone else an owner first.",
    status: 409,
  },
  invalid_retention: { message: `Retention must be between ${RETENTION_MIN} and ${RETENTION_MAX} days.`, status: 400 },
  invalid_notice: { message: `The notice delay must be between ${NOTICE_MIN} and ${NOTICE_MAX} days.`, status: 400 },
}

export function agencyRpcError(message: string | undefined | null): { message: string; status: number } | null {
  if (!message) return null
  // Longest code first so "invalid_role" can never be read out of a longer one.
  const code = Object.keys(AGENCY_RPC_ERRORS)
    .sort((a, b) => b.length - a.length)
    .find((k) => message.includes(k))
  return code ? AGENCY_RPC_ERRORS[code] : null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** The email a person gets when Tailr adds them to an agency. */
export function agencyAccessEmail(input: {
  agencyName: string
  role: AgencyMemberRole
  signInUrl: string
  /** True when the link also confirms a brand-new account. */
  isInvite: boolean
}): { subject: string; html: string } {
  const name = escapeHtml(input.agencyName)
  const role = AGENCY_ROLE_LABELS[input.role].toLowerCase()
  const how = input.isInvite
    ? "Use the button below to confirm this address and sign in. After that, sign in with this email address and a login link arrives in your inbox."
    : "Sign in with this email address and a login link arrives in your inbox."
  return {
    subject: `You have been added to ${input.agencyName} on Tailr`,
    html: `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e1813;padding:32px 28px;"><p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#dc4f33;font-weight:700;">Tailr for Agencies</p><h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">You are on the team.</h1><p style="margin:0 0 16px;line-height:1.6;">Tailr has added you to ${name} as ${role === "owner" ? "an" : "a"} ${role}. There is no password. ${how}</p><p style="margin:0 0 16px;"><a href="${escapeHtml(input.signInUrl)}" style="display:inline-block;background:#1e1813;color:#fffdfa;border-radius:8px;padding:10px 16px;font-weight:600;text-decoration:none;">Sign in to Tailr</a></p></div>`,
  }
}

// ── Jobs that need attention ──────────────────────────────────────────────

/** A job is "stuck" once it has waited or run this long. Far above any
 * route's maxDuration, so a job this old is not still genuinely running. */
export const JOB_STALE_MINUTES = 15

export const JOB_KIND_LABELS: Record<string, string> = {
  jd_parse: "Job description read",
  cv_parse: "CV read",
  score: "Scoring",
  match_scan: "Match scan",
  transcribe: "Transcription",
}

/** Kinds that sit in a queue and can be run again without the person who
 * started them. The others run inside a recruiter's own request, with a file
 * or form only that request holds, so the only fix is for them to try again. */
const QUEUE_KINDS = new Set(["match_scan", "transcribe"])

export type JobState = "waiting" | "stuck" | "failed"
export type JobAction = "run" | "mark_failed"

export interface JobFacts {
  kind: string
  status: string
  createdAt: string
  startedAt: string | null
}

/**
 * Whether a job needs attention, and what an admin may do about it.
 *
 *   queued too long        → run it now (the cron only sweeps once a day)
 *   running too long       → the process died: run it again if it is a queue
 *                            job, otherwise mark it failed so the agency's
 *                            screen stops waiting on it
 *   failed match scan      → run it again
 *   failed transcription   → nothing here: the recruiter asks again, which
 *                            re-checks that there is consented audio
 *   failed read or scoring → nothing here: the recruiter retries with the file
 */
export function jobAttention(job: JobFacts, now: number): { state: JobState; actions: JobAction[] } | null {
  const stale = (iso: string | null) => !!iso && now - new Date(iso).getTime() >= JOB_STALE_MINUTES * 60_000
  const queue = QUEUE_KINDS.has(job.kind)
  if (job.status === "queued") {
    return stale(job.createdAt) ? { state: "waiting", actions: queue ? ["run"] : ["mark_failed"] } : null
  }
  if (job.status === "running") {
    if (!stale(job.startedAt ?? job.createdAt)) return null
    return { state: "stuck", actions: queue ? ["run", "mark_failed"] : ["mark_failed"] }
  }
  if (job.status === "failed") {
    return { state: "failed", actions: job.kind === "match_scan" ? ["run"] : [] }
  }
  return null
}

export function isJobAction(v: unknown): v is JobAction {
  return v === "run" || v === "mark_failed"
}

export type ClientAccessAction = "resend_invite" | "unlink"

export function isClientAccessAction(v: unknown): v is ClientAccessAction {
  return v === "resend_invite" || v === "unlink"
}
