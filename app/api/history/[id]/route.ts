import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorMessage } from '@/lib/error-message'

export const maxDuration = 10

/** A CV comfortably longer than anything the pipeline produces, so a runaway
 *  paste can't be used to bloat the row. */
const MAX_CV_CHARS = 60_000
const MAX_LETTER_CHARS = 20_000

/**
 * Update a tailoring run. Three independent operations, any combination:
 *   { feedback: { rating, comment? } }  — thumbs up/down on the run
 *   { tailoredCV: string }              — the user's hand-edited CV
 *   { coverLetter: string }             — generated or hand-edited cover letter
 *
 * The edited CV is written back into the `result` jsonb rather than a parallel
 * column, so every existing reader of `result.tailoredCV` (history list, Word
 * download, tracker sync) sees the edit without changes. The AI's original is
 * stashed under `result.tailoredCVOriginal` the first time an edit lands.
 */
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
    const hasFeedback = body?.feedback !== undefined
    const hasCV = typeof body?.tailoredCV === 'string'
    const hasLetter = typeof body?.coverLetter === 'string'

    if (!hasFeedback && !hasCV && !hasLetter) {
      return NextResponse.json(
        { error: 'Nothing to update — send feedback, tailoredCV or coverLetter' },
        { status: 400 }
      )
    }

    const update: Record<string, unknown> = {}

    if (hasFeedback) {
      const rating = body.feedback?.rating
      if (rating !== 'up' && rating !== 'down') {
        return NextResponse.json({ error: 'feedback.rating must be "up" or "down"' }, { status: 400 })
      }
      update.feedback = {
        rating,
        comment: typeof body.feedback.comment === 'string' ? body.feedback.comment.slice(0, 1000) : '',
        created_at: new Date().toISOString(),
      }
    }

    if (hasCV) {
      const tailoredCV = body.tailoredCV as string
      if (!tailoredCV.trim()) {
        return NextResponse.json({ error: 'The CV cannot be empty' }, { status: 400 })
      }
      if (tailoredCV.length > MAX_CV_CHARS) {
        return NextResponse.json({ error: 'That CV is too long to save' }, { status: 413 })
      }

      // Read-modify-write the result jsonb. Scoped by user_id so another user's
      // row can never be read here, even if RLS were misconfigured.
      const { data: row, error: readErr } = await supabase
        .from('tailor_history')
        .select('result')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (readErr) throw readErr
      if (!row?.result) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

      const result = row.result as Record<string, unknown>
      update.result = {
        ...result,
        // Preserve the AI version once, on the first edit only
        tailoredCVOriginal: result.tailoredCVOriginal ?? result.tailoredCV,
        tailoredCV,
      }
      update.edited_at = new Date().toISOString()
    }

    if (hasLetter) {
      const coverLetter = body.coverLetter as string
      if (coverLetter.length > MAX_LETTER_CHARS) {
        return NextResponse.json({ error: 'That cover letter is too long to save' }, { status: 413 })
      }
      update.cover_letter = coverLetter
      // Only a hand-edit counts as an edit; storing a freshly generated letter
      // shouldn't mark the run as user-edited.
      if (body.edited === true) update.edited_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('tailor_history')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = errorMessage(err)
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
    const msg = errorMessage(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
