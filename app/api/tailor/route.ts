import { NextRequest, NextResponse } from 'next/server'
import { anthropic, SYSTEM_PROMPT, TAILOR_TOOL } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Validate input
    const { cv, jobDescription, jobUrl } = await req.json()
    if (!cv || !jobDescription) {
      return NextResponse.json({ error: 'Both cv and jobDescription are required' }, { status: 400 })
    }
    if (cv.length > 20_000 || jobDescription.length > 10_000) {
      return NextResponse.json({ error: 'Input too long. CV max 20,000 chars, job description max 10,000.' }, { status: 400 })
    }

    // 3. Call Claude — core tailoring only (fast: ~15-25s)
    const message = await anthropic.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 5000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: [TAILOR_TOOL],
        tool_choice: { type: 'tool', name: 'submit_tailored_result' },
        messages: [{
          role: 'user',
          content: `CV:\n\n${cv}\n\n---\n\nJob Description:\n\n${jobDescription}`,
        }],
      },
      { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
    )

    // 4. Extract tool result
    const toolUse = message.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error(`Claude did not use the tool. Stop reason: ${message.stop_reason}. Content: ${JSON.stringify(message.content).slice(0, 200)}`)
    }

    // Guard against truncated tool input (hit the token ceiling mid-JSON) — the
    // SDK returns a partial object with arrays missing, which crashes the UI.
    if (message.stop_reason === 'max_tokens') {
      return NextResponse.json(
        { error: 'Your CV is a bit long for one pass — try trimming it slightly and tailoring again.' },
        { status: 422 }
      )
    }

    // Normalise so required arrays always exist, even if the model omitted one.
    const raw = toolUse.input as Record<string, unknown>
    const result = {
      jobTitle:    typeof raw.jobTitle === 'string' ? raw.jobTitle : '',
      companyName: typeof raw.companyName === 'string' ? raw.companyName : '',
      matchScore:  typeof raw.matchScore === 'number' ? raw.matchScore : 0,
      tailoredCV:  typeof raw.tailoredCV === 'string' ? raw.tailoredCV : '',
      keyChanges:  Array.isArray(raw.keyChanges) ? raw.keyChanges : [],
      gaps:        Array.isArray(raw.gaps) ? raw.gaps : [],
      followUps:   Array.isArray(raw.followUps) ? raw.followUps : [],
      atsNotes: (raw.atsNotes && typeof raw.atsNotes === 'object')
        ? {
            status: (raw.atsNotes as Record<string, unknown>).status === 'warning' ? 'warning' : 'pass',
            items: Array.isArray((raw.atsNotes as Record<string, unknown>).items)
              ? (raw.atsNotes as Record<string, unknown>).items
              : [],
          }
        : { status: 'pass', items: [] },
    }

    // If the core CV text never came back, treat as a hard failure rather than
    // rendering an empty shell.
    if (!result.tailoredCV) {
      throw new Error('The tailored CV came back empty. Please try again.')
    }

    // 5. Track usage + save to history (non-blocking, best-effort)
    const jobSnippet = jobDescription.trim().slice(0, 200)

    Promise.all([
      supabase.rpc('increment_tailors_used', { user_id: user.id }),
      supabase.from('tailor_history').insert({
        user_id:      user.id,
        job_title:    result.jobTitle,
        company_name: result.companyName,
        job_url:      typeof jobUrl === 'string' ? jobUrl.slice(0, 500) : '',
        job_snippet:  jobSnippet,
        match_score:  result.matchScore,
        result,
      }),
    ]).catch((e) => console.error('[tailor] history save failed:', e))

    return NextResponse.json({ result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number })?.status
    console.error('[tailor] error:', status ?? '', msg)

    // Surface common upstream failures with actionable, user-readable messages
    if (status === 401 || /api[_-]?key|authentication/i.test(msg)) {
      return NextResponse.json({ error: 'AI service is misconfigured (API key). Please contact support.' }, { status: 502 })
    }
    if (status === 400 && /credit|billing|balance/i.test(msg)) {
      return NextResponse.json({ error: 'The AI service is temporarily unavailable (billing). Please try again later.' }, { status: 502 })
    }
    if (status === 429) {
      return NextResponse.json({ error: 'Too many requests right now — please wait a moment and try again.' }, { status: 429 })
    }
    if (status === 529 || /overloaded/i.test(msg)) {
      return NextResponse.json({ error: 'The AI service is busy right now — please try again in a few seconds.' }, { status: 503 })
    }
    return NextResponse.json({ error: msg || 'Failed to tailor CV. Please try again.' }, { status: 500 })
  }
}
