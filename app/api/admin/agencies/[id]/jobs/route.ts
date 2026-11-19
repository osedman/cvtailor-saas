import { NextRequest, NextResponse, after } from "next/server"
import { agencyAdmin } from "@/lib/agency/db"
import { runTranscription } from "@/lib/agency/transcription"
import { runMatchScan } from "@/lib/matching/scan"
import { requireAdmin } from "@/lib/admin-access"
import { JOB_STALE_MINUTES, isJobAction, isUuid, jobAttention, validReason } from "@/lib/admin-agencies"
import { logAgencyAdminAction } from "@/lib/admin-agency-server"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

const LOOKBACK_DAYS = 14

interface JobRow {
  id: string
  role_id: string
  kind: string
  status: string
  attempts: number
  error_code: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

/**
 * An agency's background jobs that need attention, from the admin area.
 *
 * GET  — jobs from the last 14 days that are waiting too long, stuck running,
 *        or failed, with what can be done about each (lib/admin-agencies.ts
 *        jobAttention is the one rule). Support and up. The error CODE is
 *        shown; the error detail is not — a model or parser error can quote
 *        the document it choked on.
 * POST — run a queue job again, or mark a dead one failed. Support, two-step,
 *        reason.
 *
 * "Run" puts the job back to queued and hands it to the same runner the
 * daily cron uses, after the response is sent. Each transition is a guarded
 * update (`.eq("status", …)`), so a job that moved on between the list and
 * the click is left alone and reported as such.
 */
async function GET_handler(_req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support")
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const db = agencyAdmin()
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
    const { data, error } = await db
      .from("ingestion_jobs")
      .select("id, role_id, kind, status, attempts, error_code, created_at, started_at, finished_at")
      .eq("agency_id", id)
      .in("status", ["queued", "running", "failed"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) throw error

    const now = Date.now()
    const attention = ((data ?? []) as JobRow[])
      .map((j) => ({ j, a: jobAttention({ kind: j.kind, status: j.status, createdAt: j.created_at, startedAt: j.started_at }, now) }))
      .filter((x): x is { j: JobRow; a: NonNullable<ReturnType<typeof jobAttention>> } => x.a !== null)
      .slice(0, 50)

    const roleIds = [...new Set(attention.map((x) => x.j.role_id))]
    const { data: roles } = roleIds.length
      ? await db.from("job_roles").select("id, ref, title").in("id", roleIds)
      : { data: [] }
    const roleById = new Map(((roles ?? []) as Array<{ id: string; ref: string; title: string }>).map((r) => [r.id, r]))

    return NextResponse.json({
      jobs: attention.map(({ j, a }) => ({
        id: j.id,
        kind: j.kind,
        state: a.state,
        actions: a.actions,
        roleRef: roleById.get(j.role_id)?.ref ?? "",
        roleTitle: roleById.get(j.role_id)?.title ?? "",
        errorCode: j.error_code,
        createdAt: j.created_at,
        startedAt: j.started_at,
      })),
      staleMinutes: JOB_STALE_MINUTES,
      lookbackDays: LOOKBACK_DAYS,
    })
  } catch (err) {
    console.error("[admin/agencies/[id]/jobs GET]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

async function POST_handler(req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support", { twoStep: true })
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isUuid(body?.jobId) || !isJobAction(body?.action)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }
    if (!validReason(body?.reason)) {
      return NextResponse.json({ error: "Give a short reason for this change." }, { status: 400 })
    }
    const jobId = body.jobId
    const action = body.action

    const db = agencyAdmin()
    const { data: job, error } = await db
      .from("ingestion_jobs")
      .select("id, role_id, kind, status, attempts, error_code, created_at, started_at, finished_at")
      .eq("id", jobId)
      .eq("agency_id", id)
      .maybeSingle()
    if (error) throw error
    if (!job) return NextResponse.json({ error: "That job is not in this agency." }, { status: 404 })
    const row = job as JobRow

    const allowed = jobAttention(
      { kind: row.kind, status: row.status, createdAt: row.created_at, startedAt: row.started_at },
      Date.now()
    )
    if (!allowed || !allowed.actions.includes(action)) {
      return NextResponse.json(
        { error: "That job has moved on since this list was loaded. Refresh to see where it stands." },
        { status: 409 }
      )
    }

    const moved = NextResponse.json(
      { error: "That job has moved on since this list was loaded. Refresh to see where it stands." },
      { status: 409 }
    )
    const from = { job_id: row.id, kind: row.kind, status: row.status }

    if (action === "mark_failed") {
      const { data: updated, error: upErr } = await db
        .from("ingestion_jobs")
        .update({
          status: "failed",
          error_code: "timeout",
          error_detail: "Marked failed by Tailr support after it stopped responding.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", row.status) // only from the state the admin saw
        .select("id")
      if (upErr) throw upErr
      if (!updated?.length) return moved
      await logAgencyAdminAction({
        actorId: gate.admin.userId, agencyId: id, action: "job_marked_failed", reason: body.reason,
        from, to: { job_id: row.id, kind: row.kind, status: "failed" },
      })
      return NextResponse.json({ ok: true, status: "failed" })
    }

    // Run again: back to queued (unless it already is), then the same runner
    // the cron uses. Its own claim (`queued` → `running`, exactly once) makes
    // this safe against the cron picking the job up at the same moment.
    if (row.status !== "queued") {
      const { data: requeued, error: reErr } = await db
        .from("ingestion_jobs")
        .update({ status: "queued", error_code: null, error_detail: null, started_at: null, finished_at: null })
        .eq("id", row.id)
        .eq("status", row.status)
        .select("id")
      if (reErr) throw reErr
      if (!requeued?.length) return moved
    }
    await logAgencyAdminAction({
      actorId: gate.admin.userId, agencyId: id, action: "job_rerun", reason: body.reason,
      from, to: { job_id: row.id, kind: row.kind, status: "queued" },
    })
    after(async () => {
      try {
        if (row.kind === "transcribe") await runTranscription(row.id)
        else await runMatchScan(row.role_id, row.id)
      } catch (e) {
        // The runners record their own failure on the job row.
        console.error("[admin/agencies/[id]/jobs] rerun threw:", errorMessage(e))
      }
    })
    return NextResponse.json({ ok: true, status: "queued", started: true }, { status: 202 })
  } catch (err) {
    console.error("[admin/agencies/[id]/jobs POST]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const GET = withTiming("/api/admin/agencies/[id]/jobs", "GET", GET_handler)
export const POST = withTiming("/api/admin/agencies/[id]/jobs", "POST", POST_handler)
