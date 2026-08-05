/**
 * Weekly cron dispatcher. Vercel's Hobby plan allows two cron jobs per
 * project; the agency housekeeping cron needs the daily slot, so the two
 * weekly jobs share this one. Runs Sunday and Monday at 09:00 UTC:
 *
 *   Sunday  -> /api/cron/course-sync   (was Sunday 03:00; time moved)
 *   Monday  -> /api/path-digest        (unchanged: Monday 09:00)
 *
 * The Authorization header Vercel sends (Bearer CRON_SECRET) is forwarded
 * verbatim, so the target routes keep their own auth checks unchanged.
 */

import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 300

const JOBS: Record<number, string> = {
  0: "/api/cron/course-sync",
  1: "/api/path-digest",
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const day = new Date().getUTCDay()
  const path = JOBS[day]
  if (!path) {
    return NextResponse.json({ ran: null, reason: `no job scheduled for weekday ${day}` })
  }

  const target = new URL(path, req.nextUrl.origin)
  const res = await fetch(target, {
    headers: { authorization: req.headers.get("authorization") ?? "" },
    signal: AbortSignal.timeout(290_000),
  })
  const body = await res.json().catch(() => ({}))
  return NextResponse.json({ ran: path, status: res.status, result: body }, { status: res.ok ? 200 : 502 })
}
