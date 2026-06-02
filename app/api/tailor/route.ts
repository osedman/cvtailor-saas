import { NextRequest, NextResponse } from 'next/server'
import { anthropic, SYSTEM_PROMPT, TAILOR_TOOL, TailorResult } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Parse + validate input
    const { cv, jobDescription } = await req.json()

    if (!cv || !jobDescription) {
      return NextResponse.json({ error: 'Both cv and jobDescription are required' }, { status: 400 })
    }

    if (cv.length > 20_000 || jobDescription.length > 10_000) {
      return NextResponse.json(
        { error: 'Input too long. CV max 20,000 chars, job description max 10,000.' },
        { status: 400 }
      )
    }

    // 3. Call Claude with forced tool use for structured output
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [TAILOR_TOOL],
      tool_choice: { type: 'tool', name: 'submit_tailored_result' },
      messages: [
        {
          role: 'user',
          content: `Here is my current CV:\n\n${cv}\n\n---\n\nHere is the job description I'm targeting:\n\n${jobDescription}`,
        },
      ],
    })

    // 4. Extract structured result from tool call
    const toolUse = message.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Claude did not return a tool_use block')
    }

    const result = toolUse.input as TailorResult

    // 5. Increment usage counter (best-effort, non-blocking)
    supabase.rpc('increment_tailors_used', { user_id: user.id }).then(() => {})

    return NextResponse.json({ result })
  } catch (err) {
    console.error('[tailor] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
