import { NextRequest, NextResponse } from 'next/server'
import { anthropic, COVER_LETTER_TOOL } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { sanitizeDeep } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'
import { errorMessage } from '@/lib/error-message'

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
        max_tokens: 1500,
        tools: [COVER_LETTER_TOOL],
        tool_choice: { type: 'tool', name: 'submit_cover_letter' },
        messages: [{
          role: 'user',
          content: `Write a tailored cover letter for this candidate applying to this role.\n\nCV:\n${cv}\n\n---\n\nJob Description:\n${jobDescription}\n\nRules: 3 short paragraphs, professional tone, only use evidence from the CV.`,
        }],
      },
      { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
    )

    const toolUse = message.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool result returned')

    return NextResponse.json(sanitizeDeep(toolUse.input))
  } catch (err) {
    const msg = errorMessage(err)
    console.error('[cover-letter] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
