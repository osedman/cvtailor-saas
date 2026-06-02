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
    const { cv, jobDescription } = await req.json()
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
        max_tokens: 4000,
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

    const result = toolUse.input

    // 5. Track usage (non-blocking)
    supabase.rpc('increment_tailors_used', { user_id: user.id }).then(() => {})

    return NextResponse.json({ result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[tailor] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
