import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorMessage } from '@/lib/error-message'
import { sessionUser } from "@/lib/supabase/session-user"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 10

async function GET_handler() {
  try {
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data, error } = await supabase
      .from('tailor_history')
      .select('id, created_at, job_title, company_name, job_url, job_snippet, job_description, match_score, result, original_cv, feedback, cover_letter')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return NextResponse.json({ history: data ?? [] })
  } catch (err) {
    const msg = errorMessage(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/history", "GET", GET_handler)
