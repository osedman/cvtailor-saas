/**
 * The candidate's CV, to the hiring manager who was sent them.
 *
 * New on 22 Sep 2026 — see lib/agency/cv-disclosure.ts for the rule that
 * changed and the four lines that did not. This route is the only door, and
 * it refuses in five ways before it opens:
 *
 *   1. no session, or no hiring link            → 401 / 403
 *   2. no submission on this role addressed to  → 404
 *      one of THIS caller's contacts
 *   3. this ref is not on that submission       → 404  (refs repeat across
 *                                                 roles — the scope is the
 *                                                 submission, never the ref)
 *   4. the recruiter froze the `cv` switch off  → 403, and says so in words
 *   5. the candidate asked to be withheld       → 403, and says so
 *
 * Only then: the text, live from `candidates.cv_text`, with every way of
 * reaching the candidate stripped out of it, and an audit row written in the
 * same operation. The audit row is not optional and not best-effort — if it
 * cannot be written, the CV does not go.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { getClientShortlist } from "@/lib/agency/client-shortlist"
import { agencyAdmin, writeAudit } from "@/lib/agency/db"
import { redactContactDetails, anythingRemoved, CV_REDACTION_VERSION } from "@/lib/agency/cv-disclosure"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string; candidateRef: string }> }
) {
  try {
    const { roleId, candidateRef } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)

    // (2) The submission is the permission. Same loader the shortlist uses,
    // so there is one definition of "addressed to me" rather than two.
    const shortlist = await getClientShortlist(auth.ctx, roleId)
    if (!shortlist) return NextResponse.json({ error: "No shortlist on this role for you" }, { status: 404 })

    // (3) Scoped to the submission, not to the ref. CAN-04 exists on other
    // roles and belongs to other people there.
    const ref = String(candidateRef || "").trim()
    const entry = shortlist.entries.find((e) => e.ref === ref)
    if (!entry) return NextResponse.json({ error: "Not on this shortlist" }, { status: 404 })

    // (4) The recruiter's frozen choice.
    if (!shortlist.disclosure.cv) {
      return NextResponse.json(
        { error: "Your recruiter did not include the CV in this submission. Withheld, not missing — ask them." },
        { status: 403 }
      )
    }

    // (5) The candidate's own choice outranks it.
    if (entry.redacted) {
      return NextResponse.json(
        { error: "This candidate asked to be considered without their details being shared." },
        { status: 403 }
      )
    }

    const admin = agencyAdmin()
    const { data: candidate, error } = await admin
      .from("candidates")
      .select("id, ref, cv_text, redacted, retention_expires_at")
      .eq("agency_id", shortlist.agencyId)
      .eq("role_id", roleId)
      .eq("ref", ref)
      .maybeSingle()
    if (error) throw error
    // A failed lookup is not an empty CV. Say which it is.
    if (!candidate) return NextResponse.json({ error: "Not on this shortlist" }, { status: 404 })
    // The row's own flag, read again at serve time: a candidate who asked to
    // be withheld AFTER the snapshot was frozen is withheld now.
    if (candidate.redacted === true) {
      return NextResponse.json(
        { error: "This candidate asked to be considered without their details being shared." },
        { status: 403 }
      )
    }

    const redacted = redactContactDetails(candidate.cv_text as string | null)
    if (!redacted.text.trim()) {
      return NextResponse.json(
        { error: "There is no CV text on file for this candidate — their recruiter may have sent a document instead." },
        { status: 404 }
      )
    }

    // The audit row, in the same operation. A CV disclosure nobody can
    // reconstruct afterwards is the thing the DPIA will ask about first.
    await writeAudit(admin, {
      agencyId: shortlist.agencyId,
      roleId,
      candidateId: candidate.id as string,
      actorId: auth.ctx.userId,
      entityType: "candidate",
      entityRef: ref,
      action: "cv_viewed_by_client",
      toValue: `contact:${shortlist.contactId} submission:${shortlist.submissionId} redaction:${CV_REDACTION_VERSION}`,
      reason: "Hiring manager opened the CV",
    })

    return NextResponse.json({
      cv: {
        ref,
        fullName: entry.fullName,
        currentTitle: entry.currentTitle,
        text: redacted.text,
        /** Counts only — the UI says what was taken out, never what it was. */
        removed: redacted.removed,
        anythingRemoved: anythingRemoved(redacted),
        sharedBy: shortlist.generatedAt,
        redactionVersion: CV_REDACTION_VERSION,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
