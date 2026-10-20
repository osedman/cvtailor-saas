import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { syncCourseCatalog } from '@/lib/course-sync'
import { errMessage } from '@/lib/err'
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 300

/**
 * Refresh Tailr's trusted course repository. Vercel sends CRON_SECRET in the
 * Authorization header; the dry mode exercises providers without writing.
 */
async function GET_handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const result = await syncCourseCatalog(createAdminClient(), {
      dryRun: req.nextUrl.searchParams.get('dry') === '1',
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    console.error('[course-sync] failed:', errMessage(error))
    return NextResponse.json(
      { error: 'Course sync failed', detail: errMessage(error) },
      { status: 500 },
    )
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/cron/course-sync", "GET", GET_handler)
