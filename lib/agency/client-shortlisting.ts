/**
 * The shortlist while it is still being built, as the hiring manager sees it.
 *
 * DECISION (Ose, 28 Sep 2026): "the hiring manager should be able to see the
 * names of the candidates, as soon as they are shortlisted." Until then a
 * name reached the client only through a submission (docs/DPIA-DECISIONS.md,
 * 22 Sep entry), gated by right-to-represent and by candidates.redacted. This
 * file moves the NAME — and only the name — earlier, under the same two
 * gates:
 *
 *   - declined / withdrawn   never appears at all. The candidate said no.
 *   - redacted               shown as their ref: "asked to be withheld".
 *                            Outranks every other state below.
 *   - unanswered             shown as their ref: "awaiting permission",
 *                            unless SHOW_NAMES_BEFORE_PERMISSION is on (it is, since 28 Sep).
 *   - agreed                 full name.
 *
 * NAMES ONLY. Before a submission the client gets a ref, a name (or the
 * reason it is withheld) and when the recruiter added them. Never the CV,
 * evidence, scores, email, phone, links, the candidate id or a storage path:
 * the select below reads none of those except the id, and the id is used
 * only on the server to check open rights requests — it is not in
 * ShortlistingRow or ShortlistingEntry, so it cannot be returned.
 *
 * LIVE, NEVER FROZEN. Read from the recruiter's decisions on every request.
 * Taking someone off the shortlist removes them. A PENDING erasure or
 * objection request (agency.rights_requests) removes them at once — the
 * candidate row keeps its name until the recruiter completes the request and
 * purge_candidate runs, and an automatic disclosure must not name someone to
 * a new third party while an Art 17 / Art 21 request is open. Completion
 * purges the row, which removes them for good. Anyone already in the
 * caller's latest submission is left to the submission view (which shows the
 * frozen snapshot), so this list is "added since" once a submission exists.
 *
 * The right-to-represent reading lives in represent.ts
 * (representClientVisibility), beside the submission gate, not here.
 */

import { agencyAdmin } from "./db"
import { listClientRoles } from "./client-header"
import { getClientShortlist } from "./client-shortlist"
import { representClientVisibility } from "./represent"
import type { HiringContext } from "./types"

/**
 * The one switch Ose may flip: show the names of candidates who have not yet
 * answered the right-to-represent request.
 *
 * TRUE since 28 Sep 2026 — Ose: "show names for unanswered too". An
 * unanswered candidate is named to the client at shortlist, before they
 * have agreed to be represented to them. Recorded in docs/DPIA-DECISIONS.md
 * (28 Sep entry) in the same change. Declined and withdrawn still never
 * appear, and asked-to-be-withheld still shows as the ref: this switch
 * reaches the unanswered only. Turning it back to false restores the ref
 * with "Name shown once they agree to be put forward".
 */
export const SHOW_NAMES_BEFORE_PERMISSION = true

export type ShortlistingWithheld = "asked_to_be_withheld" | "awaiting_permission"

/** One candidate row as read for this view — the only columns it may see. */
export interface ShortlistingRow {
  ref: string
  full_name: string | null
  redacted: boolean | null
  represent_status: string | null
  added_at: string | null
}

export interface ShortlistingEntry {
  ref: string
  /** Null whenever `withheld` is set; the name never leaves the server then. */
  name: string | null
  withheld: ShortlistingWithheld | null
  addedAt: string
}

export interface ShortlistingOptions {
  /** Defaults to SHOW_NAMES_BEFORE_PERMISSION. Tests pass it explicitly. */
  showNamesBeforePermission?: boolean
}

/**
 * Pure: shape candidate rows into what the hiring manager may see. Rows
 * whose ref is in `submittedRefs` are dropped — the submission view shows
 * them. An unknown represent_status is dropped too: fail closed.
 */
export function shapeShortlisting(
  rows: ShortlistingRow[],
  submittedRefs: Iterable<string>,
  opts: ShortlistingOptions = {}
): ShortlistingEntry[] {
  const showUnanswered = opts.showNamesBeforePermission ?? SHOW_NAMES_BEFORE_PERMISSION
  const submitted = new Set(submittedRefs)
  const out: ShortlistingEntry[] = []
  for (const row of rows) {
    const ref = typeof row.ref === "string" ? row.ref : ""
    if (!ref || submitted.has(ref)) continue
    // Declined / withdrawn / unknown never appear — even when redacted.
    const visibility = representClientVisibility(row.represent_status, showUnanswered)
    if (visibility === "hidden") continue
    const addedAt = row.added_at ?? ""
    if (row.redacted === true) {
      out.push({ ref, name: null, withheld: "asked_to_be_withheld", addedAt })
      continue
    }
    if (visibility === "awaiting_permission") {
      out.push({ ref, name: null, withheld: "awaiting_permission", addedAt })
      continue
    }
    const name = typeof row.full_name === "string" ? row.full_name.trim() : ""
    // A shortlisted candidate with no name on file is still on the shortlist;
    // show the ref rather than an empty string.
    out.push({ ref, name: name || null, withheld: null, addedAt })
  }
  out.sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.ref.localeCompare(b.ref))
  return out
}

export interface ClientShortlisting {
  entries: ShortlistingEntry[]
  /** True when the caller has already received a submission on this role. */
  submitted: boolean
}

/**
 * The live shortlist for one role the caller is tied to, or null when the
 * role is not theirs (the route answers "not found", never "forbidden").
 */
export async function getShortlisting(ctx: HiringContext, roleId: string): Promise<ClientShortlisting | null> {
  const tie = (await listClientRoles(ctx)).find((t) => t.roleId === roleId)
  if (!tie) return null

  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("candidates")
    // `id` is read for the rights-request check below and never leaves this
    // function: ShortlistingRow has no id field.
    .select("id, ref, full_name, redacted, represent_status, recruiter_reviews!inner(decision, decided_at)")
    .eq("role_id", roleId)
    .eq("agency_id", tie.agencyId)
    // Belt and braces only: nothing writes this column today. The live
    // erasure guard is the pending rights_requests check below.
    .is("erasure_requested_at", null)
    .eq("recruiter_reviews.decision", "shortlist")
  // A failed read must not become "nobody shortlisted yet".
  if (error) throw error

  const candidates = ((data ?? []) as Array<Record<string, unknown>>).filter(
    (r) => typeof r.id === "string" && r.id !== ""
  )

  // A pending erasure or objection request hides the candidate at once. A
  // failed read throws: better a 500 than naming someone who asked to be
  // erased.
  const blocked = new Set<string>()
  const ids = candidates.map((r) => r.id as string)
  if (ids.length > 0) {
    const { data: pending, error: rightsError } = await admin
      .from("rights_requests")
      .select("candidate_id")
      .eq("agency_id", tie.agencyId)
      .eq("status", "pending")
      .in("kind", ["erasure", "objection"])
      .in("candidate_id", ids)
    if (rightsError) throw rightsError
    for (const p of (pending ?? []) as Array<{ candidate_id?: unknown }>) {
      if (typeof p.candidate_id === "string") blocked.add(p.candidate_id)
    }
  }

  type Review = { decision?: string | null; decided_at?: string | null }
  const rows: ShortlistingRow[] = []
  for (const r of candidates) {
    if (blocked.has(r.id as string)) continue
    const embed = r.recruiter_reviews as Review | Review[] | null | undefined
    const review = Array.isArray(embed) ? embed[0] : embed
    if (!review || review.decision !== "shortlist") continue
    rows.push({
      ref: String(r.ref ?? ""),
      full_name: typeof r.full_name === "string" ? r.full_name : null,
      redacted: r.redacted === true,
      represent_status: typeof r.represent_status === "string" ? r.represent_status : null,
      added_at: typeof review.decided_at === "string" ? review.decided_at : null,
    })
  }

  const shortlist = await getClientShortlist(ctx, roleId)
  const submittedRefs = shortlist ? shortlist.entries.map((e) => e.ref).filter(Boolean) : []
  return { entries: shapeShortlisting(rows, submittedRefs), submitted: shortlist !== null }
}
