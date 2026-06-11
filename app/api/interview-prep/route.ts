import { NextRequest, NextResponse } from 'next/server'
import { anthropic, INTERVIEW_PREP_TOOL } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { cv, jobDescription } = await req.json()
    if (!cv || !jobDescription) return NextResponse.json({ error: 'Missing inputs' }, { status: 400 })

    const message = await anthropic.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [INTERVIEW_PREP_TOOL],
        tool_choice: { type: 'tool', name: 'submit_interview_prep' },
        messages: [{
          role: 'user',
          content: `You are an experienced interview coach. Generate 8-10 interview questions this candidate is LIKELY to face for this specific role, with answer frameworks.

Rules:
- Questions must be specific to this JD and this CV — not generic "tell me about yourself" filler (one opener is fine, no more).
- Include at least 2 "gap-probing" questions: where the CV is weakest against the JD, that's exactly what a good interviewer will dig into.
- pointsToHit must reference REAL experience from this CV — name the actual projects, employers, metrics.
- watchOut should flag a pitfall specific to this candidate (e.g. rambling about an irrelevant role, underselling a metric).
- Mix categories: behavioural, technical, role-specific, motivation, gap-probing.

CV:
${cv}

---

Job Description:
${jobDescription}`,
        }],
      },
      { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
    )

    const toolUse = message.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool result returned')

    return NextResponse.json(toolUse.input)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[interview-prep] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
