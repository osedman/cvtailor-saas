import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CAREER_ROADMAP_TOOL, type CareerRoadmapItem, type RequirementMapping } from '@/lib/anthropic'
import {
  deriveTargetRole, rankGapsByUnlock, computeReadiness,
  type HistoryEntry, type TrackerJob,
} from '@/lib/career-path-compute'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'

export const maxDuration = 300

const PROMPT_PREFIX = `You are helping a job seeker close specific skill gaps that keep showing up across their job applications. For EACH skill listed below, search the web and find 2-3 REAL, FREE, reputable learning resources (prefer freeCodeCamp, MIT OpenCourseWare, Khan Academy, official framework/language documentation, Coursera or edX audit-mode courses, or well-known official YouTube channels). Only include resources you actually find via search — never invent a URL or a course that may not exist. For each skill also suggest one concrete, scoped project the candidate could build in their spare time to demonstrate it, and a single CV bullet point they could add once they have completed it.`

const ROADMAP_COLS = 'id, created_at, updated_at, target_role, hours_per_week, current_title, milestones, items'

/**
 * GET returns the roadmap PLUS the living-path intelligence computed from data
 * the app already stores (tailor_history + job_tracker), via the pure compute
 * layer — so the client just renders. No AI here.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const [roadmapRes, histRes, trackRes] = await Promise.all([
      supabase.from('career_roadmaps').select(ROADMAP_COLS).eq('user_id', user.id).maybeSingle(),
      supabase.from('tailor_history').select('id, job_title, created_at, result').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('job_tracker').select('history_id, status, job_title').eq('user_id', user.id),
    ])
    if (roadmapRes.error) throw roadmapRes.error

    const roadmap = roadmapRes.data ?? null

    const history: HistoryEntry[] = (histRes.data ?? []).map((r) => ({
      historyId: r.id as string,
      jobTitle: (r.job_title as string) ?? '',
      createdAt: r.created_at as string,
      coverage: ((r.result as { requirementsCoverage?: RequirementMapping[] } | null)?.requirementsCoverage ?? []),
    }))
    const historyById = new Map(history.map((h) => [h.historyId, h]))
    const tracker: TrackerJob[] = (trackRes.data ?? []).map((t) => ({
      historyId: (t.history_id as string | null) ?? null,
      status: (t.status as TrackerJob['status']) ?? 'saved',
      jobTitle: (t.job_title as string) ?? '',
    }))

    const derivedTarget = deriveTargetRole(history)
    const items = (roadmap?.items as CareerRoadmapItem[] | undefined) ?? []
    const closedSkills = items.filter((i) => i.status === 'done').map((i) => i.skill)
    const openSkills = items.filter((i) => i.status !== 'done').map((i) => i.skill)
    const target = ((roadmap?.target_role as string) || derivedTarget || '').trim()

    const readiness = computeReadiness(target, history, closedSkills)
    const rankedGaps = rankGapsByUnlock(openSkills, tracker, historyById)

    return NextResponse.json({ roadmap, derivedTarget, readiness, rankedGaps })
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

    const body = await req.json()
    const { targetRole, hoursPerWeek, skills } = body

    // Living-profile path: append a single skill to an existing roadmap (or
    // start one) — called from the tailor results panel when a new gap shows up.
    if (body?.mode === 'add-skill') {
      const skill = String(body.skill ?? '').trim().slice(0, 80)
      if (!skill) return NextResponse.json({ error: 'A skill is required' }, { status: 400 })

      const { data: existing, error: fetchErr } = await supabase
        .from('career_roadmaps')
        .select('id, target_role, hours_per_week, items')
        .eq('user_id', user.id)
        .maybeSingle()
      if (fetchErr) throw fetchErr

      const items = (existing?.items as CareerRoadmapItem[] | undefined) ?? []
      if (items.some((i) => i.skill.toLowerCase() === skill.toLowerCase())) {
        return NextResponse.json({ error: 'That skill is already on your career path.' }, { status: 409 })
      }

      const addPrompt = `${PROMPT_PREFIX}

Target role: ${existing?.target_role || 'unspecified'}

Skills to address, most important first:
1. ${skill}`

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as never,
          CAREER_ROADMAP_TOOL,
        ],
        messages: [{ role: 'user', content: addPrompt }],
      })

      const toolUse = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_roadmap')
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('Could not build that skill entry. Please try again.')
      }
      const raw = toolUse.input as { items?: CareerRoadmapItem[] }
      const newItem = (Array.isArray(raw.items) ? raw.items : [])[0]
      if (!newItem) throw new Error('Could not build that skill entry. Please try again.')

      const merged = sanitizeDeep([...items, { ...newItem, status: 'todo' as const }])

      const { data: saved, error } = await supabase
        .from('career_roadmaps')
        .upsert(
          {
            user_id: user.id,
            target_role: existing?.target_role ?? '',
            hours_per_week: existing?.hours_per_week ?? null,
            items: merged,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .select(ROADMAP_COLS)
        .single()
      if (error) throw error
      return NextResponse.json({ roadmap: saved })
    }

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
      .select(ROADMAP_COLS)
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
      .select(ROADMAP_COLS)
      .single()

    if (error) throw error
    return NextResponse.json({ roadmap: saved })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
