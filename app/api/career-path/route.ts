import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CAREER_ROADMAP_TOOL, type CareerRoadmapItem } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'

export const maxDuration = 300

const PROMPT_PREFIX = `You are helping a job seeker close specific skill gaps that keep showing up across their job applications. For EACH skill listed below, search the web and find 2-3 REAL, FREE, reputable learning resources (prefer freeCodeCamp, MIT OpenCourseWare, Khan Academy, official framework/language documentation, Coursera or edX audit-mode courses, or well-known official YouTube channels). Only include resources you actually find via search — never invent a URL or a course that may not exist. For each skill also suggest one concrete, scoped project the candidate could build in their spare time to demonstrate it, and a single CV bullet point they could add once they have completed it.`

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data, error } = await supabase
      .from('career_roadmaps')
      .select('id, created_at, updated_at, target_role, hours_per_week, items')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ roadmap: data ?? null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const limited = await checkRateLimit(user.id, 'ai')
    if (limited) return limited

    const { targetRole, hoursPerWeek, skills } = await req.json()
    if (!Array.isArray(skills) || skills.length === 0) {
      return NextResponse.json({ error: 'At least one skill is required' }, { status: 400 })
    }
    const trimmedSkills = skills.slice(0, 5).map((s: unknown) => String(s).slice(0, 80))

    const userPrompt = `${PROMPT_PREFIX}

Target role: ${targetRole || 'unspecified'}
Time available: ${hoursPerWeek ? `${hoursPerWeek} hours/week` : 'unspecified'}

Skills to address, most important first:
${trimmedSkills.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 8 } as never,
        CAREER_ROADMAP_TOOL,
      ],
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_roadmap')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('No roadmap generated. Please try again.')
    }

    const raw = toolUse.input as { items?: CareerRoadmapItem[] }
    const items = (Array.isArray(raw.items) ? raw.items : []).map((item) => ({
      ...item,
      status: 'todo' as const,
    }))
    if (items.length === 0) throw new Error('The roadmap came back empty. Please try again.')

    const clean = sanitizeDeep({ target_role: targetRole || '', hours_per_week: hoursPerWeek || null, items })

    const { data: saved, error } = await supabase
      .from('career_roadmaps')
      .upsert({ user_id: user.id, ...clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('id, created_at, updated_at, target_role, hours_per_week, items')
      .single()

    if (error) throw error
    return NextResponse.json({ roadmap: saved })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number })?.status
    if (status === 429) {
      return NextResponse.json({ error: 'Too many requests right now — please wait a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { skill, status } = await req.json()
    if (typeof skill !== 'string' || !['todo', 'in_progress', 'done'].includes(status)) {
      return NextResponse.json({ error: 'Invalid skill or status' }, { status: 400 })
    }

    const { data: row, error: fetchErr } = await supabase
      .from('career_roadmaps')
      .select('items')
      .eq('user_id', user.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!row) return NextResponse.json({ error: 'No roadmap found' }, { status: 404 })

    const items = (row.items as CareerRoadmapItem[]).map((item) =>
      item.skill === skill ? { ...item, status } : item
    )

    const { data: saved, error } = await supabase
      .from('career_roadmaps')
      .update({ items, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .select('id, created_at, updated_at, target_role, hours_per_week, items')
      .single()

    if (error) throw error
    return NextResponse.json({ roadmap: saved })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
