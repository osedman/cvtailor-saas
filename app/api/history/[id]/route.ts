import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 10

/** Attach feedback to a tailoring run: { rating: 'up' | 'down', comment?: string } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()
    const rating = body?.feedback?.rating
    if (rating !== 'up' && rating !== 'down') {
      return NextResponse.json({ error: 'feedback.rating must be "up" or "down"' }, { status: 400 })
    }
    const feedback = {
      rating,
      comment: typeof body.feedback.comment === 'string' ? body.feedback.comment.slice(0, 1000) : '',
      created_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('tailor_history')
      .update({ feedback })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { error } = await supabase
      .from('tailor_history')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)   // RLS guard — can only delete own rows

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
