import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sessionUser } from "@/lib/supabase/session-user"
import { withTiming } from "@/lib/server-timing"
import { withoutOwnership } from "@/lib/tracker-body"

export const maxDuration = 10

type Ctx = { params: Promise<{ id: string }> }

async function PATCH_handler(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = withoutOwnership(await req.json())
    const { data, error } = await supabase
      .from('job_tracker')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ job: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function DELETE_handler(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { error } = await supabase
      .from('job_tracker')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const PATCH = withTiming("/api/tracker/[id]", "PATCH", PATCH_handler)
export const DELETE = withTiming("/api/tracker/[id]", "DELETE", DELETE_handler)
