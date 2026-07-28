import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CAREER_ROADMAP_TOOL, buildRoadmapPrompt, type CareerRoadmapItem, type CareerItemStatus } from '@/lib/anthropic'
import { validateItemResources } from '@/lib/course-validation'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'
import { splitByEffort } from '@/lib/career-path-compute'
import { addItems, setItemStatus, loadItems, promoteToCore, type StoredRoadmapItem } from '@/lib/roadmap-store'

export const maxDuration = 300

/**
 * Quick wins — closing the gaps a single tailor run surfaced.
 *
 * This used to write a plan onto tailor_history.upskill, where nothing else in
 * the product could see it: closing a skill there ticked a box and changed
 * nothing. Items now go to career_roadmap_items alongside the career path, so a
 * gap closed here reaches the evidence edge, the digest and the CV — which is
 * what a user already assumes "done" means.
 *
 * Capture is deliberately not a silent merge: only genuinely small skills land
 * automatically, as `quick`. Anything larger comes back for the user to accept
 * onto their core path, so a run for an off-target job can never quietly
 * reshape a deliberately chosen North Star.
 */

/** The user's market, grounding region-aware course sourcing. Defaults to GB. */
async function loadRegion(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  try {
    const { data } = await supabase.from('profiles').select('country').eq('id', userId).maybeSingle()
    return (data?.country as string | undefined)?.trim() || 'GB'
  } catch { return 'GB' }
}

async function loadRoadmapId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('career_roadmaps').select('id').eq('user_id', userId).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** Validate a client-supplied item before it is written to the path. */
function coerceItem(raw: unknown): CareerRoadmapItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const skill = String(r.skill ?? '').trim().slice(0, 80)
  if (!skill) return null
  return {
    skill,
    whyItMatters: String(r.whyItMatters ?? '').slice(0, 400),
    resources: Array.isArray(r.resources) ? (r.resources as CareerRoadmapItem['resources']).slice(0, 3) : [],
    projectBrief: String(r.projectBrief ?? '').slice(0, 800),
    cvPhrasing: String(r.cvPhrasing ?? '').slice(0, 400),
    status: 'todo',
    effortHours: typeof r.effortHours === 'number' ? r.effortHours : undefined,
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()

    // ── Promote an existing quick win onto the core path (user's click) ──
    if (body?.mode === 'promote') {
      const skill = String(body.skill ?? '').trim().slice(0, 80)
      if (!skill) return NextResponse.json({ error: 'A skill is required' }, { status: 400 })
      const items = await promoteToCore(supabase, user.id, skill)
      return NextResponse.json({ items })
    }

    // ── Accept a larger skill onto the core path (explicit user consent) ──
    if (body?.mode === 'accept') {
      const item = coerceItem(body.item)
      if (!item) return NextResponse.json({ error: 'That skill could not be read.' }, { status: 400 })
      const roadmapId = await loadRoadmapId(supabase, user.id)
      const items = await addItems(
        supabase, user.id, roadmapId,
        [sanitizeDeep({ ...item, horizon: 'core', source: 'tailor_run' }) as StoredRoadmapItem],
      )
      return NextResponse.json({ items })
    }

    // ── Generate + capture ────────────────────────────────────────────────
    const limited = await checkRateLimit(user.id, 'ai')
    if (limited) return limited

    const { historyId, skills, jobTitle } = body
    if (typeof historyId !== 'string' || !historyId) {
      return NextResponse.json({ error: 'historyId is required' }, { status: 400 })
    }
    if (!Array.isArray(skills) || skills.length === 0) {
      return NextResponse.json({ error: 'At least one gap is required' }, { status: 400 })
    }
    const gaps = skills.slice(0, 6).map((s: unknown) => String(s).trim().slice(0, 80)).filter(Boolean)

    // Provenance: the run's role family is what lets the forecast ignore quick
    // wins captured while tailoring for something off-target.
    const { data: run } = await supabase
      .from('tailor_history').select('result').eq('id', historyId).eq('user_id', user.id).maybeSingle()
    const roleFamily = ((run?.result as { roleFamily?: string } | null)?.roleFamily ?? '').slice(0, 40) || null

    const region = await loadRegion(supabase, user.id)
    const userPrompt = buildRoadmapPrompt({
      skills: gaps,
      targetRole: jobTitle ? String(jobTitle).slice(0, 120) : undefined,
      region,
      intro: 'You are helping a candidate close the specific gaps flagged when they tailored their CV to ONE job, so they can raise their match for that exact role. Keep everything tightly relevant to the target role.',
    })

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
    const generated = await validateItemResources(
      (((toolUse.input as { items?: CareerRoadmapItem[] }).items) ?? [])
        .map((it) => ({ ...it, status: 'todo' as const }))
    )
    if (generated.length === 0) throw new Error('The suggestions came back empty. Please try again.')

    const { quick, candidates } = splitByEffort(generated)

    // Only the small ones are written. addItems dedupes on skill, so a gap
    // surfaced by several runs increments its count rather than duplicating.
    let captured: StoredRoadmapItem[] = []
    if (quick.length > 0) {
      const roadmapId = await loadRoadmapId(supabase, user.id)
      await addItems(
        supabase, user.id, roadmapId,
        sanitizeDeep(quick.map((it) => ({
          ...it,
          horizon: 'quick' as const,
          source: 'tailor_run' as const,
          sourceRunId: historyId,
          roleFamilyAtCapture: roleFamily,
          effortEstimateHours: it.effortHours ?? null,
        }))) as StoredRoadmapItem[],
      )
      const all = await loadItems(supabase, user.id, { horizon: 'quick' })
      const wanted = new Set(quick.map((q) => q.skill.toLowerCase()))
      captured = all.filter((i) => wanted.has(i.skill.toLowerCase()))
    }

    return NextResponse.json({
      captured,
      candidates: sanitizeDeep(candidates),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number })?.status
    if (status === 429) {
      return NextResponse.json({ error: 'Too many requests right now — please wait a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Cycle a quick win's status. Shares one store with the career path, so a
 *  skill closed here is closed everywhere. */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { skill, status } = await req.json()
    if (typeof skill !== 'string' || !['todo', 'in_progress', 'done'].includes(status)) {
      return NextResponse.json({ error: 'Invalid skill or status' }, { status: 400 })
    }

    const items = await setItemStatus(supabase, user.id, skill, status as CareerItemStatus)
    return NextResponse.json({ items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
