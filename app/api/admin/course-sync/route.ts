import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { syncCourseCatalog } from '@/lib/course-sync'
import { errMessage } from '@/lib/err'

export const maxDuration = 300

/**
 * Manual, browser-friendly sync for the owner. The scheduled route remains
 * CRON_SECRET-only; this endpoint requires a real signed-in admin session and
 * an explicit confirmation query so merely visiting the path cannot write.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
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
