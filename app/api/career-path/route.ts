import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CAREER_ROADMAP_TOOL, type CareerRoadmapItem, type RequirementMapping } from '@/lib/anthropic'
import {
  deriveTargetRole, rankGapsByUnlock, computeReadiness, skillMatches,
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

    // ── Stage 3: living-path update actions ───────────────────────────────

    // "I got the job" — the reached role becomes a milestone + the new "you are
    // here"; optionally set the next rung. Best-effort: also append the role to
    // the Arc timeline so the two surfaces stay in sync (never blocks the path).
    if (body?.mode === 'got-job') {
      const reachedRole = String(body.role ?? '').trim().slice(0, 120)
      const nextTarget = String(body.nextTarget ?? '').trim().slice(0, 120)
      if (!reachedRole) return NextResponse.json({ error: 'Which role did you land?' }, { status: 400 })

      const { data: existing } = await supabase
        .from('career_roadmaps')
        .select('target_role, hours_per_week, current_title, milestones, items')
        .eq('user_id', user.id).maybeSingle()

      const priorMilestones = Array.isArray(existing?.milestones) ? existing!.milestones as Array<{ role: string; reachedAt: string }> : []
      const milestones = [...priorMilestones, { role: reachedRole, reachedAt: new Date().toISOString() }]

      const { data: saved, error } = await supabase
        .from('career_roadmaps')
        .upsert({
          user_id: user.id,
          target_role: nextTarget || (existing?.target_role ?? ''),
          hours_per_week: existing?.hours_per_week ?? null,
          current_title: reachedRole,
          milestones,
          items: existing?.items ?? [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select(ROADMAP_COLS).single()
      if (error) throw error

      // Best-effort Arc sync — never let this fail the action.
      try {
        const { data: prof } = await supabase.from('career_profiles').select('sections').eq('user_id', user.id).maybeSingle()
        const sections = (prof?.sections ?? null) as Record<string, unknown> | null
        if (sections && Array.isArray(sections.timeline)) {
          const year = String(new Date().getFullYear())
          const timeline = sections.timeline as Array<Record<string, unknown>>
          sections.timeline = [...timeline, { company: '', title: reachedRole, start: year, end: 'Present', highlights: [] }]
          await supabase.from('career_profiles').update({ sections: sanitizeDeep(sections), updated_at: new Date().toISOString() }).eq('user_id', user.id)
        }
      } catch { /* Arc sync is a nice-to-have */ }

      return NextResponse.json({ roadmap: saved })
    }

    // "Add a project" from current work — Haiku turns raw text into a clean CV
    // project and appends it to the Arc's projects (its natural home).
    if (body?.mode === 'add-project') {
      const text = String(body.text ?? '').trim().slice(0, 2000)
      if (!text) return NextResponse.json({ error: 'Describe the project first.' }, { status: 400 })

      const projectTool = {
        name: 'submit_project',
        description: 'Turn a raw project description into a clean, factual CV project. Never invent details not in the text.',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'A short project name' },
            summary: { type: 'string', description: '1-2 sentences describing it, only from the text provided' },
          },
          required: ['title', 'summary'],
        },
      } as const

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        tools: [projectTool as never],
        tool_choice: { type: 'tool', name: 'submit_project' },
        messages: [{ role: 'user', content: `Turn this into a clean project entry for a CV. Use ONLY facts stated in the text — never invent numbers, tools, or outcomes.\n\n${text}` }],
      })
      const tu = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_project')
      if (!tu || tu.type !== 'tool_use') throw new Error('Could not save that project. Please try again.')
      const project = sanitizeDeep({ ...(tu.input as { title: string; summary: string }), featured: false })

      const { data: prof } = await supabase.from('career_profiles').select('sections').eq('user_id', user.id).maybeSingle()
      const sections = (prof?.sections ?? {}) as Record<string, unknown>
      const projects = Array.isArray(sections.projects) ? sections.projects as unknown[] : []
      sections.projects = [...projects, project]
      const { error } = await supabase
        .from('career_profiles')
        .upsert({ user_id: user.id, sections, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error

      return NextResponse.json({ ok: true, project })
    }

    // "Add skills for a job" — paste a JD, Haiku names its concrete requirements,
    // the ones not already on the path get generated onto it (up to 3).
    if (body?.mode === 'add-skill-for-jd') {
      const jd = String(body.jobDescription ?? '').trim().slice(0, 8000)
      if (!jd) return NextResponse.json({ error: 'Paste the job description first.' }, { status: 400 })

      const { data: existing } = await supabase
        .from('career_roadmaps')
        .select('target_role, hours_per_week, items')
        .eq('user_id', user.id).maybeSingle()
      const existingItems = (existing?.items as CareerRoadmapItem[] | undefined) ?? []
      const existingSkills = existingItems.map((i) => i.skill)

      const skillsTool = {
        name: 'submit_skills',
        description: 'List the concrete skills, tools, and requirements the job asks for. Only what the text actually names.',
        input_schema: {
          type: 'object',
          properties: { skills: { type: 'array', items: { type: 'string' }, description: 'up to 6 concrete skills/tools/requirements named in the JD' } },
          required: ['skills'],
        },
      } as const
      const extractMsg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        tools: [skillsTool as never],
        tool_choice: { type: 'tool', name: 'submit_skills' },
        messages: [{ role: 'user', content: `List the concrete skills, tools and requirements this job asks for. Only what is named in the text.\n\n${jd}` }],
      })
      const etu = extractMsg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_skills')
      if (!etu || etu.type !== 'tool_use') throw new Error('Could not read that job description. Please try again.')
      const named = (((etu.input as { skills?: unknown[] }).skills ?? []) as unknown[]).map((s) => String(s).trim().slice(0, 80)).filter(Boolean)
      const toAdd = named.filter((s) => !existingSkills.some((e) => skillMatches(e, s))).slice(0, 3)

      if (toAdd.length === 0) {
        return NextResponse.json({ added: 0, message: 'Your path already covers what this job needs.' })
      }

      const genPrompt = `${PROMPT_PREFIX}

Target role: ${existing?.target_role || 'unspecified'}

Skills to address, most important first:
${toAdd.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      const genMsg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as never, CAREER_ROADMAP_TOOL],
        messages: [{ role: 'user', content: genPrompt }],
      })
      const gtu = genMsg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_roadmap')
      if (!gtu || gtu.type !== 'tool_use') throw new Error('Could not build the new skills. Please try again.')
      const newItems = ((gtu.input as { items?: CareerRoadmapItem[] }).items ?? []).map((it) => ({ ...it, status: 'todo' as const }))
      if (newItems.length === 0) return NextResponse.json({ added: 0, message: 'Nothing new to add.' })

      const merged = sanitizeDeep([...existingItems, ...newItems])
      const { error } = await supabase
        .from('career_roadmaps')
        .upsert({
          user_id: user.id,
          target_role: existing?.target_role ?? '',
          hours_per_week: existing?.hours_per_week ?? null,
          items: merged,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      if (error) throw error

      return NextResponse.json({ added: newItems.length })
    }


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
