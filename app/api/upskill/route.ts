import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CAREER_ROADMAP_TOOL, type CareerRoadmapItem } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'

export const maxDuration = 300

const PROMPT = `You are helping a candidate close the specific gaps flagged when they tailored their CV to ONE job, so they can raise their match for that exact role. For EACH skill/requirement listed below, search the web and find 2-3 REAL, FREE, reputable learning resources (prefer freeCodeCamp, MIT OpenCourseWare, Khan Academy, official framework/language documentation, Coursera or edX audit-mode courses, or well-known official YouTube channels). Only include resources you actually find via search — never invent a URL or a course that may not exist. For each skill also suggest one concrete, scoped project the candidate could build to demonstrate it, and a single CV bullet point they could add once completed. Keep everything tightly relevant to the target role.`

// POST — generate an upskill plan for a tailor run's gaps and store it on the run.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const limited = await checkRateLimit(user.id, 'ai')
    if (limited) return limited

    const { historyId, skills, jobTitle } = await req.json()
    if (typeof historyId !== 'string' || !historyId) {
      return NextResponse.json({ error: 'historyId is required' }, { status: 400 })
    }
    if (!Array.isArray(skills) || skills.length === 0) {
      return NextResponse.json({ error: 'At least one gap is required' }, { status: 400 })
    }
    const gaps = skills.slice(0, 6).map((s: unknown) => String(s).trim().slice(0, 80)).filter(Boolean)

    const userPrompt = `${PROMPT}

Target role: ${jobTitle ? String(jobTitle).slice(0, 120) : 'unspecified'}

Gaps to close for THIS job, most important first:
${gaps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as never,
        CAREER_ROADMAP_TOOL,
      ],
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_roadmap')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No suggestions generated. Please try again.')
    const items = (((toolUse.input as { items?: CareerRoadmapItem[] }).items) ?? []).map((it) => ({ ...it, status: 'todo' as const }))
    if (items.length === 0) throw new Error('The suggestions came back empty. Please try again.')

    const clean = sanitizeDeep(items)
    const { error } = await supabase
      .from('tailor_history')
      .update({ upskill: clean })
      .eq('id', historyId)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ items: clean })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number })?.status
    if (status === 429) {
      return NextResponse.json({ error: 'Too many requests right now — please wait a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH — cycle an upskill item's status (todo/in_progress/done) on the run.
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { historyId, skill, status } = await req.json()
    if (typeof historyId !== 'string' || typeof skill !== 'string' || !['todo', 'in_progress', 'done'].includes(status)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { data: row, error: fetchErr } = await supabase
      .from('tailor_history')
      .select('upskill')
      .eq('id', historyId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!row) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

    const items = ((row.upskill as CareerRoadmapItem[]) ?? []).map((it) =>
      it.skill === skill ? { ...it, status } : it
    )
    const { error } = await supabase
      .from('tailor_history')
      .update({ upskill: items })
      .eq('id', historyId)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
