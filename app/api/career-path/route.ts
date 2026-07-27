import { NextRequest, NextResponse } from 'next/server'
import {
  anthropic, CAREER_ROADMAP_TOOL, CV_FINDINGS_TOOL, SUGGEST_TARGETS_TOOL, ROLE_SKILLS_TOOL,
  buildRoadmapPrompt, type CareerRoadmapItem, type RequirementMapping, type RoleSkillJudged,
} from '@/lib/anthropic'
import {
  deriveTargetRole, rankGapsByUnlock, computeReadiness, readinessFromTargetSkills, skillMatches,
  type HistoryEntry, type TrackerJob, type TargetSkill,
} from '@/lib/career-path-compute'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'
import { errMessage } from '@/lib/err'
import {
  loadItems, replaceItems, addItems, setItemStatus, removeSkill as storeRemoveSkill,
  type StoredRoadmapItem,
} from '@/lib/roadmap-store'

export const maxDuration = 300

const ROADMAP_COLS = 'id, created_at, updated_at, target_role, hours_per_week, current_title, milestones, intention, target_skills, findings'

/**
 * Attach items from career_roadmap_items to a roadmap row.
 *
 * Items no longer live on the row (migration 016), but every client reads
 * `roadmap.items`, so the API contract is preserved here rather than in the UI.
 * Core-only by default: quick wins are surfaced separately and must never
 * silently join the North Star path or its forecast.
 */
async function withItems<T extends object>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  row: T | null,
  horizon: 'core' | 'quick' | undefined = 'core',
): Promise<(T & { items: StoredRoadmapItem[] }) | null> {
  if (!row) return null
  const items = await loadItems(supabase, userId, { horizon })
  return { ...row, items }
}

/** The user's market, grounding region-aware course sourcing. Defaults to GB. */
async function loadRegion(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  try {
    const { data } = await supabase.from('profiles').select('country').eq('id', userId).maybeSingle()
    return (data?.country as string | undefined)?.trim() || 'GB'
  } catch { return 'GB' }
}

const MIN_CV = 300

/** Most recent substantial CV, for calibrating generation to the real candidate. */
async function loadCandidateCv(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  try {
    const { data } = await supabase.from('tailor_history').select('original_cv').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
    const cv = (data ?? []).map((r) => (r.original_cv as string) ?? '').find((c) => c.trim().length >= MIN_CV) ?? ''
    return cv.slice(0, 12_000)
  } catch { return '' }
}

/** Ground generation in who the candidate is (CV) and where they're going (intention). */
function calibration(cv: string, intention: string): string {
  let out = ''
  if (cv) out += `\n\nThe candidate's CV — CALIBRATE to it: skip beginner material they are clearly past, pitch projects that build on this real experience, and phrase everything relative to their actual background. Never invent anything about them:\n${cv}`
  if (intention) out += `\n\nThe candidate's stated goal: "${intention.slice(0, 400)}". Bias the resources and projects toward this direction.`
  return out
}

/**
 * GET returns the roadmap PLUS the living-path intelligence computed from data
 * the app already stores (tailor_history + job_tracker), via the pure compute
 * layer — so the client just renders. No AI here.
 */

/** Surface real messages from Supabase/Postgrest errors, which are plain
 * objects (not Error instances) — otherwise String(err) yields "[object Object]". */

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const [roadmapRes, histRes, trackRes, arcRes] = await Promise.all([
      supabase.from('career_roadmaps').select(ROADMAP_COLS).eq('user_id', user.id).maybeSingle(),
      supabase.from('tailor_history').select('id, job_title, created_at, result').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('job_tracker').select('history_id, status, job_title').eq('user_id', user.id),
      supabase.from('career_profiles').select('sections').eq('user_id', user.id).maybeSingle(),
    ])
    if (roadmapRes.error) throw roadmapRes.error

    const roadmap = await withItems(supabase, user.id, roadmapRes.data ?? null)

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
    // NB: core-only, per withItems — quick wins never move the readiness number.
    const closedSkills = items.filter((i) => i.status === 'done').map((i) => i.skill)
    const openSkills = items.filter((i) => i.status !== 'done').map((i) => i.skill)
    const target = ((roadmap?.target_role as string) || derivedTarget || '').trim()

    // Readiness against the chosen North Star (its market skill set) when we have
    // one; otherwise fall back to what tailor history reveals about the target.
    const targetSkills = (roadmap?.target_skills as TargetSkill[] | undefined) ?? []
    const readiness = targetSkills.length > 0
      ? readinessFromTargetSkills(targetSkills, closedSkills)
      : computeReadiness(target, history, closedSkills)
    const rankedGaps = rankGapsByUnlock(openSkills, tracker, historyById)

    const arcAmbition = ((arcRes.data?.sections as { story?: { ambition?: string } } | null)?.story?.ambition ?? '').trim()

    // Quick wins ride alongside the roadmap, never inside it: roadmap.items is
    // core-only by contract (readiness and the forecast are computed from it),
    // so run-surfaced items get their own field and their own section in the UI.
    const quickWins = await loadItems(supabase, user.id, { horizon: 'quick' })

    return NextResponse.json({ roadmap, derivedTarget, readiness, rankedGaps, arcAmbition, quickWins })
  } catch (err) {
    const msg = errMessage(err)
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
    const { targetRole, hoursPerWeek, skills, intention } = body

    // Set the weekly learning pace — drives the forecast, never a deadline.
    if (body?.mode === 'set-pace') {
      const hours = Number(body.hoursPerWeek)
      if (!Number.isFinite(hours) || hours < 1 || hours > 40) {
        return NextResponse.json({ error: 'Pace must be between 1 and 40 hours a week.' }, { status: 400 })
      }
      const { data: saved, error } = await supabase
        .from('career_roadmaps')
        .upsert({ user_id: user.id, hours_per_week: Math.round(hours), updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select(ROADMAP_COLS).single()
      if (error) throw error
      return NextResponse.json({ roadmap: await withItems(supabase, user.id, saved) })
    }

    // Set/update the stated intention (goal) on its own.
    if (body?.mode === 'set-intention') {
      const value = String(body.intention ?? '').slice(0, 400)
      const { data: saved, error } = await supabase
        .from('career_roadmaps')
        .upsert({ user_id: user.id, intention: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select(ROADMAP_COLS).single()
      if (error) throw error
      return NextResponse.json({ roadmap: await withItems(supabase, user.id, saved) })
    }

    // ── Stage 1 of the North Star journey: scan the CV → career-coach findings.
    // Strengths first, then gaps, in Tailr's evidence voice. No web. Cached on
    // the roadmap row so the scan screen is instant on return.
    if (body?.mode === 'scan-cv') {
      const cv = await loadCandidateCv(supabase, user.id)
      if (!cv) return NextResponse.json({ error: "We couldn't find a CV to scan yet — tailor a CV first, or paste one." }, { status: 400 })

      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        tools: [CV_FINDINGS_TOOL],
        tool_choice: { type: 'tool', name: 'submit_cv_findings' },
        messages: [{ role: 'user', content: `Read this candidate's CV as a career coach. Name their standout strengths FIRST (evidence-backed), then their honest development gaps. Use ONLY what the CV supports — never invent experience.\n\n${cv}` }],
      })
      const tu = msg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_cv_findings')
      if (!tu || tu.type !== 'tool_use') throw new Error('Could not read your CV. Please try again.')
      const findings = sanitizeDeep(tu.input as Record<string, unknown>)

      // Best-effort cache; never block returning the findings.
      try {
        await supabase.from('career_roadmaps').upsert(
          { user_id: user.id, findings, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
      } catch { /* caching is a nice-to-have */ }

      return NextResponse.json({ findings })
    }

    // ── Stage 2: suggest North Stars from the CV + stated ambition. No web.
    if (body?.mode === 'suggest-targets') {
      const cv = await loadCandidateCv(supabase, user.id)
      const { data: prof } = await supabase.from('career_profiles').select('sections').eq('user_id', user.id).maybeSingle()
      const ambition = ((prof?.sections as { story?: { ambition?: string } } | null)?.story?.ambition ?? '').trim()
      const steer = String(body.intention ?? '').trim() || ambition

      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        tools: [SUGGEST_TARGETS_TOOL],
        tool_choice: { type: 'tool', name: 'submit_target_suggestions' },
        messages: [{ role: 'user', content: `Suggest 3-4 realistic 1-2 year target roles ("North Stars") for this candidate, grounded in their CV${steer ? ` and their stated goal: "${steer.slice(0, 300)}"` : ''}. Best-fit first, with one sentence each on why it fits them and an honest, differentiated CV-fit percentage per role.${cv ? `\n\nCV:\n${cv}` : '\n\n(No CV available — suggest broadly sensible starting roles and say they can search their own.)'}` }],
      })
      const tu = msg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_target_suggestions')
      if (!tu || tu.type !== 'tool_use') throw new Error('Could not suggest roles. Please try again.')
      const targets = ((tu.input as { targets?: unknown[] }).targets ?? [])
      return NextResponse.json({ targets })
    }

    // ── Stage 3: lock in a North Star → pull the role's UK-market skill set,
    // judge each against the CV (the transparent "60"), then generate a plan for
    // the gaps. This drives the readiness % against the CHOSEN target.
    if (body?.mode === 'set-target') {
      const role = String(body.role ?? '').trim().slice(0, 120)
      if (!role) return NextResponse.json({ error: 'Which role are you aiming at?' }, { status: 400 })

      const [cv, region] = await Promise.all([loadCandidateCv(supabase, user.id), loadRegion(supabase, user.id)])
      const { data: existing } = await supabase
        .from('career_roadmaps').select('intention, hours_per_week').eq('user_id', user.id).maybeSingle()
      const intention = (existing?.intention as string) || ''
      const regionName = region.toUpperCase() === 'GB' ? 'the UK' : 'their country'

      // 1) The role's market-demanded skills, judged have/missing against the CV.
      const skillsMsg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as never, ROLE_SKILLS_TOOL],
        messages: [{ role: 'user', content: `Research what the "${role}" role demands in ${regionName} job market today (search real, current job postings). Then list the 8-14 skills/requirements that role asks for — core ones first — and for EACH, judge whether this candidate's CV already gives clear evidence of it (have=true) or not. Include skills they HAVE and skills they LACK, so they see the full picture.${cv ? `\n\nCandidate CV:\n${cv}` : '\n\n(No CV provided — mark have=false unless clearly implied.)'}` }],
      })
      const stu = skillsMsg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_role_skills')
      if (!stu || stu.type !== 'tool_use') throw new Error('Could not research that role. Please try again.')
      const roleSkills = (((stu.input as { skills?: RoleSkillJudged[] }).skills ?? []) as RoleSkillJudged[])
        .filter((s) => s && typeof s.skill === 'string' && s.skill.trim())
        .map((s) => ({ skill: s.skill.trim().slice(0, 80), have: !!s.have, importance: s.importance || 'common' }))
      if (roleSkills.length === 0) throw new Error('That role came back empty. Please try again.')

      // 2) A learning plan for the gaps (the skills they lack), UK-sourced.
      const gaps = roleSkills.filter((s) => !s.have).map((s) => s.skill).slice(0, 5)
      let items: CareerRoadmapItem[] = []
      if (gaps.length > 0) {
        const planMsg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 } as never, CAREER_ROADMAP_TOOL],
          messages: [{ role: 'user', content: buildRoadmapPrompt({ skills: gaps, targetRole: role, hoursPerWeek: (existing?.hours_per_week as number) ?? null, region, calibration: calibration(cv, intention) }) }],
        })
        const ptu = planMsg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_roadmap')
        if (ptu && ptu.type === 'tool_use') {
          items = ((ptu.input as { items?: CareerRoadmapItem[] }).items ?? []).map((it) => ({ ...it, status: 'todo' as const }))
        }
      }

      const clean = sanitizeDeep({ target_role: role, target_skills: roleSkills })
      const { data: savedRow, error } = await supabase
        .from('career_roadmaps')
        .upsert({ user_id: user.id, ...clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select(ROADMAP_COLS).single()
      if (error) throw error
      // Replaces the core plan only, so locking a new North Star can never wipe
      // quick wins the user is part-way through.
      const savedItems = await replaceItems(
        supabase, user.id, savedRow.id as string,
        sanitizeDeep(items) as StoredRoadmapItem[], 'core',
      )
      const saved = { ...savedRow, items: savedItems }

      const closed = savedItems.filter((i) => i.status === 'done').map((i) => i.skill)
      const readiness = readinessFromTargetSkills(roleSkills as TargetSkill[], closed)
      return NextResponse.json({ roadmap: saved, readiness })
    }

    // Remove a skill from the path and remember it so it's never re-added.
    if (body?.mode === 'remove-skill') {
      const skill = String(body.skill ?? '').trim()
      if (!skill) return NextResponse.json({ error: 'A skill is required' }, { status: 400 })
      const { data: existing, error: fErr } = await supabase
        .from('career_roadmaps').select('removed_skills').eq('user_id', user.id).maybeSingle()
      if (fErr) throw fErr
      if (!existing) return NextResponse.json({ error: 'No path found' }, { status: 404 })
      await storeRemoveSkill(supabase, user.id, skill)
      const removed = Array.from(new Set([...(((existing.removed_skills as string[]) ?? [])), skill.toLowerCase()])).slice(-100)
      const { data: saved, error } = await supabase
        .from('career_roadmaps')
        .update({ removed_skills: removed, updated_at: new Date().toISOString() })
        .eq('user_id', user.id).select(ROADMAP_COLS).single()
      if (error) throw error
      return NextResponse.json({ roadmap: await withItems(supabase, user.id, saved) })
    }

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
        .select('target_role, hours_per_week, current_title, milestones')
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
        .select('target_role, hours_per_week, intention, removed_skills')
        .eq('user_id', user.id).maybeSingle()
      const existingItems = await loadItems(supabase, user.id)
      const existingSkills = existingItems.map((i) => i.skill)
      const removedForJd = ((existing?.removed_skills as string[] | undefined) ?? [])
      const jdCv = await loadCandidateCv(supabase, user.id)

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
      const toAdd = named.filter((s) => !existingSkills.some((e) => skillMatches(e, s)) && !removedForJd.some((r) => skillMatches(r, s))).slice(0, 3)

      if (toAdd.length === 0) {
        return NextResponse.json({ added: 0, message: 'Your path already covers what this job needs.' })
      }

      const jdRegion = await loadRegion(supabase, user.id)
      const genPrompt = buildRoadmapPrompt({
        skills: toAdd,
        targetRole: (existing?.target_role as string) || undefined,
        region: jdRegion,
        calibration: calibration(jdCv, (existing?.intention as string) || ''),
      })
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

      // addItems dedupes on skill: a skill already on the path has its
      // surfaced_count incremented rather than being duplicated.
      await addItems(supabase, user.id, null, sanitizeDeep(newItems) as StoredRoadmapItem[])

      return NextResponse.json({ added: newItems.length })
    }


    // Living-profile path: append a single skill to an existing roadmap (or
    // start one) — called from the tailor results panel when a new gap shows up.
    if (body?.mode === 'add-skill') {
      const skill = String(body.skill ?? '').trim().slice(0, 80)
      if (!skill) return NextResponse.json({ error: 'A skill is required' }, { status: 400 })

      const { data: existing, error: fetchErr } = await supabase
        .from('career_roadmaps')
        .select('id, target_role, hours_per_week, intention')
        .eq('user_id', user.id)
        .maybeSingle()
      if (fetchErr) throw fetchErr

      const items = await loadItems(supabase, user.id, { includeArchived: true })
      if (items.some((i) => i.skill.toLowerCase() === skill.toLowerCase())) {
        return NextResponse.json({ error: 'That skill is already on your career path.' }, { status: 409 })
      }

      const addCv = await loadCandidateCv(supabase, user.id)
      const addRegion = await loadRegion(supabase, user.id)
      const addPrompt = buildRoadmapPrompt({
        skills: [skill],
        targetRole: (existing?.target_role as string) || undefined,
        region: addRegion,
        calibration: calibration(addCv, (existing?.intention as string) || ''),
      })

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

      const { data: saved, error } = await supabase
        .from('career_roadmaps')
        .upsert(
          {
            user_id: user.id,
            target_role: existing?.target_role ?? '',
            hours_per_week: existing?.hours_per_week ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .select(ROADMAP_COLS)
        .single()
      if (error) throw error
      await addItems(
        supabase, user.id, saved.id as string,
        sanitizeDeep([{ ...newItem, status: 'todo' as const }]) as StoredRoadmapItem[],
      )
      return NextResponse.json({ roadmap: await withItems(supabase, user.id, saved) })
    }

    if (!Array.isArray(skills) || skills.length === 0) {
      return NextResponse.json({ error: 'At least one skill is required' }, { status: 400 })
    }
    const trimmedSkills = skills.slice(0, 5).map((s: unknown) => String(s).slice(0, 80))

    const genCv = await loadCandidateCv(supabase, user.id)
    const genRegion = await loadRegion(supabase, user.id)
    const userPrompt = buildRoadmapPrompt({
      skills: trimmedSkills,
      targetRole: targetRole || undefined,
      hoursPerWeek: hoursPerWeek || null,
      region: genRegion,
      calibration: calibration(genCv, String(intention ?? '')),
    })

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

    const clean = sanitizeDeep({ target_role: targetRole || '', hours_per_week: hoursPerWeek || null, intention: String(intention ?? '') })

    const { data: saved, error } = await supabase
      .from('career_roadmaps')
      .upsert({ user_id: user.id, ...clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select(ROADMAP_COLS)
      .single()

    if (error) throw error
    await replaceItems(
      supabase, user.id, saved.id as string,
      sanitizeDeep(items) as StoredRoadmapItem[], 'core',
    )
    return NextResponse.json({ roadmap: await withItems(supabase, user.id, saved) })
  } catch (err) {
    const msg = errMessage(err)
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
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!row) return NextResponse.json({ error: 'No roadmap found' }, { status: 404 })

    await setItemStatus(supabase, user.id, skill, status)

    const { data: saved, error } = await supabase
      .from('career_roadmaps')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .select(ROADMAP_COLS)
      .single()

    if (error) throw error
    return NextResponse.json({ roadmap: await withItems(supabase, user.id, saved) })
  } catch (err) {
    const msg = errMessage(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
