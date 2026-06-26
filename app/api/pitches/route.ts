import { NextRequest, NextResponse } from 'next/server'
import { anthropic, PITCHES_TOOL } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { sanitizeDeep } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const limited = await checkRateLimit(user.id, 'ai')
    if (limited) return limited

    const { cv, jobDescription } = await req.json()
    if (!cv || !jobDescription) return NextResponse.json({ error: 'Missing inputs' }, { status: 400 })

    const message = await anthropic.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        tools: [PITCHES_TOOL],
        tool_choice: { type: 'tool', name: 'submit_interview_pitches' },
        messages: [{
          role: 'user',
          content: `Generate 2-3 STAR interview pitches for this candidate applying to this role. Use ONLY real experience from their CV.\n\nCV:\n${cv}\n\n---\n\nJob Description:\n${jobDescription}`,
        }],
      },
      { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
    )

    const toolUse = message.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool result returned')

    return NextResponse.json(sanitizeDeep(toolUse.input))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pitches] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
