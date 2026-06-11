import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const PROMPT_SUFFIX = `Structure the answer in plain text with these exact section headings, each section 2-4 concise bullet points (lines starting with "- "):

WHAT THEY DO
RECENT DEVELOPMENTS
CULTURE & VALUES
WHY IT MATTERS FOR THIS ROLE
SMART QUESTIONS TO ASK

Keep it factual and useful for an interview candidate. No preamble, no closing remarks — start directly with the first heading.`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { companyName, jobTitle, jobDescription } = await req.json()
    if (!companyName || typeof companyName !== 'string') {
      return NextResponse.json({ error: 'No company name available — tailor a CV first so we can identify the company.' }, { status: 400 })
    }

    const userPrompt = `Research the company "${companyName}" in the context of this role: ${jobTitle || 'unspecified role'}.

Job description excerpt for context:
${(jobDescription ?? '').slice(0, 2000)}

${PROMPT_SUFFIX}`

    let text = ''

    // Preferred: live web search for current information
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as never],
        messages: [{ role: 'user', content: userPrompt }],
      })
      text = message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
        .trim()
    } catch (searchErr) {
      console.error('[company-analysis] web search unavailable, falling back:', searchErr)
    }

    // Fallback: model knowledge + JD only, clearly flagged
    if (!text) {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `${userPrompt}\n\nNote: answer from your general knowledge and the job description only. If you are not confident about a fact, omit it rather than guess.`,
        }],
      })
      text = message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
        .trim()
      if (text) text += '\n\n(Compiled from general knowledge — verify recent developments before the interview.)'
    }

    if (!text) throw new Error('No analysis generated. Please try again.')

    return NextResponse.json({ companyAnalysis: text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[company-analysis] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
