import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-access'
import { createAdminClient } from '@/lib/supabase/server'
import { syncCourseCatalog } from '@/lib/course-sync'
import { errMessage } from '@/lib/err'
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 300

/**
 * Manual, browser-friendly sync for the owner. The scheduled route remains
 * CRON_SECRET-only; this endpoint requires a real signed-in admin session and
 * an explicit confirmation query so merely visiting the path cannot write.
 */
async function GET_handler(req: NextRequest) {
  // This GET writes (it runs the sync), so it needs two-step verification.
    const gate = await requireAdmin('admin', { twoStep: true })
  if (!gate.ok) return gate.response
  if (req.nextUrl.searchParams.get('confirm') !== '1') {
    return NextResponse.json(
      { error: 'Add ?confirm=1 to run the course sync.' },
      { status: 400 },
    )
  }

  try {
    const result = await syncCourseCatalog(createAdminClient())
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    console.error('[admin/course-sync] failed:', errMessage(error))
    return NextResponse.json(
      { error: 'Course sync failed', detail: errMessage(error) },
      { status: 500 },
    )
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/admin/course-sync", "GET", GET_handler)
