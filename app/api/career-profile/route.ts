import { NextRequest, NextResponse } from 'next/server'
import { isCareerPathBeta, BETA_LOCKED } from '@/lib/feature-gate'
import {
  anthropic,
  CAREER_PROFILE_TOOL,
  CAREER_QUESTIONS_TOOL,
  CAREER_EVIDENCE_TOOL,
  type CareerEvidenceCard,
  type CareerProfileSections,
  type CareerQuestion,
} from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'
import { auditEvidenceCards, normalizeForMatch, resolveStoredCv } from '@/lib/career-evidence'
import { remapClaimRedactions } from '@/lib/career-arc-share'

export const maxDuration = 300

const NO_INVENTION = `Every fact must come directly from the CV text provided. Never invent dates, numbers, achievements, or traits. If something can't be confidently filled from the CV, leave it empty rather than guessing.`

const BUILD_PROMPT = `You are building a factual "career highlight reel" from a candidate's CV — identity, headline stats, quantified achievements, timeline, organisations, skills, growth milestones, key projects, and inferred professional qualities. ${NO_INVENTION}

The candidate may also have answered a few personal questions about their career story. Their answers are the ONLY source for the story fields (origin, turningPoint, ambition) — keep their voice and first person, fixing only typos and grammar. If they named a proudest project, mark the matching project as featured. Unanswered questions mean empty story fields.

Also extract the evidence bank: the CV's strongest reusable proof statements, each traceable to a single CV bullet or line, with its source role, company, span, and line number. These are the claims the candidate will reuse across tailored CVs, so each must stand alone and stay strictly within what that one CV line says.`

const QUESTIONS_PROMPT = `Read this CV, then write 4 short, warm, personalised questions for the candidate — one each for: how their career started (reference their actual first role by name), their turning point (reference their actual title change), their proudest project, and where they want to go next. ${NO_INVENTION}`

const EVIDENCE_PROMPT = `Extract this candidate's evidence bank: their strongest reusable proof statements, each traceable to one CV bullet or line. Each CV line below is prefixed with its line number as "N| " — use it for cvLine and never copy the prefix into a claim. Attribute every card to the role and company whose section it sits under. Include every quantified achievement as a quant card, keeping each figure exactly as written. ${NO_INVENTION}`

/** Prefix each CV line with "N| " so the model can cite line numbers precisely. */
function numberCvLines(cv: string): string {
  return cv.split('\n').map((line, i) => `${i + 1}| ${line}`).join('\n')
}

const MIN_CV_LENGTH = 300 // anything shorter can't be a real CV (seeded/test rows, fragments)

async function resolveCv(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, pastedCv: string): Promise<string> {
  if (pastedCv.trim().length >= MIN_CV_LENGTH) return pastedCv
  return resolveStoredCv(supabase, userId, MIN_CV_LENGTH)
}

const FALLBACK_QUESTIONS: CareerQuestion[] = [
  { key: 'origin', question: 'How did your career start — what drew you to your first role?' },
  { key: 'turning_point', question: 'What was the turning point that changed how you work?' },
  { key: 'proudest', question: 'Which project are you proudest of, and why that one?' },
  { key: 'ambition', question: 'Where do you want this career to go next?' },
]

/** Guard against placeholder/empty output ever reaching the form */
function validateQuestions(raw: CareerQuestion[]): CareerQuestion[] {
  const isGood = (q: CareerQuestion | undefined): q is CareerQuestion =>
    !!q && typeof q.question === 'string' && q.question.trim().length >= 10 &&
    !/[<>]/.test(q.question) && !/unknown/i.test(q.question)
  return FALLBACK_QUESTIONS.map((fb) => {
    const match = raw.find((q) => q?.key === fb.key)
    return isGood(match) ? match : fb
  })
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!(await isCareerPathBeta(user.email))) return NextResponse.json(BETA_LOCKED, { status: 403 })

    const { data, error } = await supabase
      .from('career_profiles')
      .select('id, created_at, updated_at, source, sections')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ profile: data ?? null })
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
    if (!(await isCareerPathBeta(user.email))) return NextResponse.json(BETA_LOCKED, { status: 403 })

    const limited = await checkRateLimit(user.id, 'ai')
    if (limited) return limited

    const body = await req.json().catch(() => ({}))
    const pastedCv = typeof body?.cv === 'string' ? body.cv : ''
    const mode = body?.mode === 'questions' ? 'questions' : 'build'

    const cv = await resolveCv(supabase, user.id, pastedCv)
    if (!cv) {
      return NextResponse.json(
        { error: 'No CV found yet. Paste your CV to build your Career Arc.', needsCv: true },
        { status: 400 },
      )
    }

    // Pass 1: fast, cheap question generation (Haiku)
    if (mode === 'questions') {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        tools: [CAREER_QUESTIONS_TOOL],
        tool_choice: { type: 'tool', name: 'submit_career_questions' },
        messages: [{ role: 'user', content: `${QUESTIONS_PROMPT}\n\nCV:\n${cv.slice(0, 20_000)}` }],
      })
      const toolUse = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_questions')
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('Could not prepare your questions. Please try again.')
      }
      const { questions } = sanitizeDeep(toolUse.input as { questions: CareerQuestion[] })
      return NextResponse.json({ questions: validateQuestions(Array.isArray(questions) ? questions : []) })
    }

    // Pass 2: full build (Sonnet), weaving in any answers
    const answers = Array.isArray(body?.answers) ? body.answers : []
    const answersText = answers
      .filter((a: { question?: string; answer?: string }) => a?.answer?.trim())
      .map((a: { question: string; answer: string }) => `Q: ${String(a.question).slice(0, 300)}\nA: ${String(a.answer).slice(0, 1_000)}`)
      .join('\n\n')

    const userPrompt = `${BUILD_PROMPT}\n\nCV:\n${cv.slice(0, 20_000)}${answersText ? `\n\nThe candidate's own answers:\n${answersText}` : '\n\nThe candidate answered no questions — leave all story fields empty and all projects unfeatured.'}`

    // Profile build and evidence extraction run as parallel focused passes —
    // a single pass starved the evidence section (5 thin cards, empty sources).
    const [message, evidenceMessage] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [CAREER_PROFILE_TOOL],
        tool_choice: { type: 'tool', name: 'submit_career_profile' },
        messages: [{ role: 'user', content: userPrompt }],
      }),
      anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        tools: [CAREER_EVIDENCE_TOOL],
        tool_choice: { type: 'tool', name: 'submit_career_evidence' },
        messages: [{ role: 'user', content: `${EVIDENCE_PROMPT}\n\nCV:\n${numberCvLines(cv.slice(0, 20_000))}` }],
      }),
    ])

    const toolUse = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_profile')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Could not build your Career Arc. Please try again.')
    }
    const profileSections = sanitizeDeep(toolUse.input as CareerProfileSections)

    const evidenceUse = evidenceMessage.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_evidence')
    const rawEvidence = evidenceUse && evidenceUse.type === 'tool_use'
      ? sanitizeDeep(evidenceUse.input as { cards: CareerEvidenceCard[] }).cards
      : []
    const { cards, outcomes } = auditEvidenceCards(rawEvidence, cv)

    // Aggregate observability only — counts and categories, never content.
    const rawList = Array.isArray(rawEvidence) ? rawEvidence : []
    console.log('[career-profile] evidence', JSON.stringify({
      raw: rawList.length,
      kept: cards.length,
      outcomes,
      rawCats: rawList.reduce<Record<string, number>>((m, c) => {
        const k = String((c as { category?: unknown })?.category ?? '?')
        m[k] = (m[k] ?? 0) + 1
        return m
      }, {}),
      rawWithSource: rawList.filter((c) => (c as { sourceRole?: string })?.sourceRole || (c as { sourceCompany?: string })?.sourceCompany).length,
      rawWithLine: rawList.filter((c) => typeof (c as { cvLine?: unknown })?.cvLine === 'number').length,
      stopReason: evidenceMessage.stop_reason,
      outputTokens: evidenceMessage.usage?.output_tokens,
    }))

    const { data: saved, error } = await supabase
      .from('career_profiles')
      .upsert({ user_id: user.id, source: 'single_cv', sections: profileSections, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('id, created_at, updated_at, source, sections')
      .single()

    if (error) throw error

    // Replace extracted evidence, but never wipe rows the user has invested in
    // (pinned or rephrased) — a rebuild must not silently destroy their edits.
    const { data: kept, error: keptErr } = await supabase
      .from('career_evidence')
      .select('id, claim, pinned, rephrased_text, sort_order')
      .eq('user_id', user.id)
    if (keptErr) throw keptErr

    const keepRows = (kept ?? []).filter((r) => r.pinned || r.rephrased_text)
    const dropIds = (kept ?? []).filter((r) => !r.pinned && !r.rephrased_text).map((r) => r.id)
    if (dropIds.length > 0) {
      const { error: delErr } = await supabase.from('career_evidence').delete().in('id', dropIds)
      if (delErr) throw delErr
    }

    const keptClaims = new Set(keepRows.map((r) => normalizeForMatch(r.claim)))
    const baseOrder = keepRows.reduce((max, r) => Math.max(max, r.sort_order + 1), 0)
    const freshRows = cards
      .filter((c) => !keptClaims.has(normalizeForMatch(c.claim)))
      .map((c, i) => ({
        user_id: user.id,
        profile_id: saved.id,
        category: c.category,
        claim: c.claim,
        source_role: c.sourceRole,
        source_company: c.sourceCompany,
        source_span: c.sourceSpan,
        cv_line: c.cvLine,
        sort_order: baseOrder + i,
      }))
    if (freshRows.length > 0) {
      const { error: insErr } = await supabase.from('career_evidence').insert(freshRows)
      if (insErr) throw insErr
    }

    const { data: evidence, error: evErr } = await supabase
      .from('career_evidence')
      .select('id, category, claim, source_role, source_company, source_span, cv_line, pinned, hidden, rephrased_text, sort_order, created_at')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
    if (evErr) throw evErr

    // Replaced rows get new ids, so the share link's per-claim redactions must
    // follow their claims or the public page silently un-redacts on rebuild.
    // Best-effort: a failure here logs but never fails the rebuild itself.
    try {
      const { data: share } = await supabase
        .from('career_arc_shares')
        .select('id, claim_redactions')
        .eq('user_id', user.id)
        .maybeSingle()
      const redactions = (share?.claim_redactions ?? {}) as Record<string, 'full' | 'band' | 'mask' | 'hide'>
      if (share && Object.keys(redactions).length > 0) {
        const oldCards = (kept ?? []).map((r) => ({ id: r.id, claim: r.claim, rephrased_text: r.rephrased_text ?? null }))
        const newCards = (evidence ?? []).map((r) => ({ id: r.id, claim: r.claim, rephrased_text: r.rephrased_text ?? null }))
        const { remapped, changed } = remapClaimRedactions(oldCards, newCards, redactions)
        if (changed) {
          await supabase
            .from('career_arc_shares')
            .update({ claim_redactions: remapped, updated_at: new Date().toISOString() })
            .eq('id', share.id)
        }
      }
    } catch (e) {
      console.error('[career-profile] redaction remap failed:', e)
    }

    return NextResponse.json({ profile: saved, evidence: evidence ?? [] })
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
    if (!(await isCareerPathBeta(user.email))) return NextResponse.json(BETA_LOCKED, { status: 403 })

    const { sections: patch } = await req.json()
    if (!patch || typeof patch !== 'object') {
      return NextResponse.json({ error: 'Invalid sections patch' }, { status: 400 })
    }

    const { data: row, error: fetchErr } = await supabase
      .from('career_profiles')
      .select('sections')
      .eq('user_id', user.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!row) return NextResponse.json({ error: 'No career profile found' }, { status: 404 })

    const merged = sanitizeDeep({ ...(row.sections as object), ...patch })

    const { data: saved, error } = await supabase
      .from('career_profiles')
      .update({ sections: merged, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .select('id, created_at, updated_at, source, sections')
      .single()

    if (error) throw error
    return NextResponse.json({ profile: saved })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
