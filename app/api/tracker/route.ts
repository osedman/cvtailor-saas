import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sessionUser } from "@/lib/supabase/session-user"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 10

async function GET_handler() {
  try {
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data, error } = await supabase
      .from('job_tracker')
      .select('*')
      .eq('user_id', user.id)
      .order('status')
      .order('position')

    if (error) throw error
    return NextResponse.json({ jobs: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function POST_handler(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()

    const { data, error } = await supabase
      .from('job_tracker')
      .insert({ ...body, user_id: user.id, notes: body.notes ?? [] })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ job: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/tracker", "GET", GET_handler)
export const POST = withTiming("/api/tracker", "POST", POST_handler)
