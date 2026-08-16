/**
 * The client portal — the only anonymous surface in the agency product.
 *
 * The raw token in the URL is never stored: it is hashed and matched against
 * submission_recipients.token_hash, so a leaked database cannot mint working
 * links, and each named recipient is individually revocable. The response is
 * ONLY the immutable submission snapshot — no internal state (recruiter
 * notes, rejected candidates, overrides, audit) is reachable from here.
 *
 * POST records a client action (interview / approve / decline / question).
 * Actions are signals to the recruiter and never change shortlist state —
 * a decline flags for attention; it cannot remove or hide a candidate.
 */

import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { agencyAdmin, writeAudit } from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

const MAX_ACTIONS_PER_RECIPIENT = 50

async function resolveRecipient(token: string) {
  if (!token || token.length < 16 || token.length > 64) return null
  const admin = agencyAdmin()
  const hash = createHash("sha256").update(token).digest("hex")
  const { data } = await admin
    .from("submission_recipients")
    .select("id, agency_id, submission_id, contact_id, expires_at, revoked_at, first_opened_at")
    .eq("token_hash", hash)
    .maybeSingle()
  if (!data) return null
  if (data.revoked_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null
  return { admin, recipient: data }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const resolved = await resolveRecipient(token)
    if (!resolved) {
      return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })
    }
    const { admin, recipient } = resolved

    const [{ data: submission }, { data: agency }, { data: contact }] = await Promise.all([
      admin
        .from("submissions")
        .select("snapshot, generated_at, role_id")
        .eq("id", recipient.submission_id)
        .single(),
      admin.from("agencies").select("name").eq("id", recipient.agency_id).single(),
      admin.from("client_contacts").select("full_name, company").eq("id", recipient.contact_id).single(),
    ])

    const now = new Date().toISOString()
    await admin
      .from("submission_recipients")
      .update({
        last_opened_at: now,
        ...(recipient.first_opened_at ? {} : { first_opened_at: now }),
      })
      .eq("id", recipient.id)

    return NextResponse.json({
      snapshot: submission?.snapshot ?? null,
      generated_at: submission?.generated_at,
      agency: agency?.name ?? "",
      viewer: { name: contact?.full_name ?? "", company: contact?.company ?? "" },
    })
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const resolved = await resolveRecipient(token)
    if (!resolved) {
      return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })
    }
    const { admin, recipient } = resolved

    const body = await req.json()
    const action = body?.action
    if (!["interview", "approve", "decline", "question"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
    const candidateRef = typeof body?.candidate_ref === "string" ? body.candidate_ref.slice(0, 20) : ""
    if (!candidateRef) {
      return NextResponse.json({ error: "candidate_ref required" }, { status: 400 })
    }
    const message = typeof body?.message === "string" ? body.message.slice(0, 2000) : ""

    const { count } = await admin
      .from("client_actions")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", recipient.id)
    if ((count ?? 0) >= MAX_ACTIONS_PER_RECIPIENT) {
      return NextResponse.json({ error: "Action limit reached for this link" }, { status: 429 })
    }

    // Resolve the live candidate row when it still exists; the denormalised
    // ref keeps the record meaningful after purge.
    const { data: submission } = await admin
      .from("submissions")
      .select("role_id")
      .eq("id", recipient.submission_id)
      .single()
    const { data: candidate } = submission
      ? await admin
          .from("candidates")
          .select("id")
          .eq("role_id", submission.role_id)
          .eq("ref", candidateRef)
          .maybeSingle()
      : { data: null }

    const { error } = await admin.from("client_actions").insert({
      agency_id: recipient.agency_id,
      recipient_id: recipient.id,
      candidate_id: candidate?.id ?? null,
      candidate_ref: candidateRef,
      action,
      message,
    })
    if (error) throw error

    await writeAudit(admin, {
      agencyId: recipient.agency_id,
      roleId: submission?.role_id ?? null,
      candidateId: candidate?.id ?? null,
      entityType: "submission",
      entityRef: candidateRef,
      action: `client_${action}`,
      toValue: message ? { message } : undefined,
    })

    return NextResponse.json({ recorded: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}
