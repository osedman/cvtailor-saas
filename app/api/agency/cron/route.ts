/**
 * Agency housekeeping cron — THE launch gate for real candidate data.
 *
 * Runs daily (vercel.json, 03:30 UTC):
 *   1. Retention purge: agency.purge_expired() erases candidates whose
 *      retention window lapsed, then this route deletes their CV files from
 *      the agency-cvs bucket (SQL cannot delete storage blobs safely).
 *   2. Candidate notices: sends due Art 14 notices (scheduled_for <= now)
 *      through the single implementation in lib/agency/notices, which
 *      handles suppression, missing contact details, and audit rows. There
 *      is deliberately no configuration read here that can skip a due notice.
 *
 * Machine endpoint: guarded by CRON_SECRET, no user session, no rate limit.
 * Response contains counts only — candidate PII never appears in cron logs.
 */

import { NextRequest, NextResponse } from "next/server"
import { agencyAdmin } from "@/lib/agency/db"
import { sendOneNotice } from "@/lib/agency/notices"

export const maxDuration = 300

const NOTICE_BATCH = 50

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const admin = agencyAdmin()
  const summary = {
    purged: 0,
    files_removed: 0,
    notices_sent: 0,
    notices_suppressed: 0,
    notices_failed: 0,
  }

  // ---- 1. Retention purge -----------------------------------
  const { data: purged, error: purgeError } = await admin.rpc("purge_expired")
  if (purgeError) {
    return NextResponse.json({ error: `purge failed: ${purgeError.message}` }, { status: 500 })
  }
  const purgedRows = (purged ?? []) as Array<{
    candidate_id: string
    ref: string
    storage_path: string | null
  }>
  summary.purged = purgedRows.length

  const paths = purgedRows.map((r) => r.storage_path).filter((p): p is string => !!p)
  if (paths.length > 0) {
    const { data: removed, error: removeError } = await admin.storage
      .from("agency-cvs")
      .remove(paths)
    if (removeError) {
      // Purged rows are already gone from the DB; orphaned files must not be
      // silent. Surface loudly — the next run will NOT retry these paths.
      console.error("[agency-cron] storage removal failed:", removeError.message)
    }
    summary.files_removed = removed?.length ?? 0
  }

  // ---- 2. Due notices ---------------------------------------
  const { data: due, error: dueError } = await admin
    .from("candidate_notices")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .limit(NOTICE_BATCH)
  if (dueError) {
    return NextResponse.json({ error: `notice query failed: ${dueError.message}` }, { status: 500 })
  }

  for (const notice of due ?? []) {
    const outcome = await sendOneNotice(admin, notice.id)
    if (outcome === "sent") summary.notices_sent++
    else if (outcome === "suppressed_list" || outcome === "suppressed_no_contact")
      summary.notices_suppressed++
    else if (outcome === "failed") summary.notices_failed++
  }

  return NextResponse.json(summary)
}
