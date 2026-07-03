import { NextRequest, NextResponse } from 'next/server'
import {
  anthropic,
  CAREER_PROFILE_TOOL,
  CAREER_QUESTIONS_TOOL,
  type CareerProfileSections,
  type CareerQuestion,
} from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'

export const maxDuration = 300

const NO_INVENTION = `Every fact must come directly from the CV text provided. Never invent dates, numbers, achievements, or traits. If something can't be confidently filled from the CV, leave it empty rather than guessing.`

const BUILD_PROMPT = `You are building a factual "career highlight reel" from a candidate's CV — identity, headline stats, quantified achievements, timeline, organisations, skills, growth milestones, key projects, and inferred professional qualities. ${NO_INVENTION}

The candidate may also have answered a few personal questions about their career story. Their answers are the ONLY source for the story fields (origin, turningPoint, ambition) — keep their voice and first person, fixing only typos and grammar. If they named a proudest project, mark the matching project as featured. Unanswered questions mean empty story fields.`

const QUESTIONS_PROMPT = `Read this CV, then write 4 short, warm, personalised questions for the candidate — one each for: how their career started (reference their actual first role by name), their turning point (reference their actual title change), their proudest project, and where they want to go next. ${NO_INVENTION}`

async function resolveCv(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, pastedCv: string): Promise<string> {
  if (pastedCv) return pastedCv
  const { data: lastTailor, error } = await supabase
    .from('tailor_history')
    .select('original_cv')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return lastTailor?.original_cv ?? ''
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

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
      return NextResponse.json({ questions })
    }

    // Pass 2: full build (Sonnet), weaving in any answers
    const answers = Array.isArray(body?.answers) ? body.answers : []
    const answersText = answers
      .filter((a: { question?: string; answer?: string }) => a?.answer?.trim())
      .map((a: { question: string; answer: string }) => `Q: ${String(a.question).slice(0, 300)}\nA: ${String(a.answer).slice(0, 1_000)}`)
      .join('\n\n')

    const userPrompt = `${BUILD_PROMPT}\n\nCV:\n${cv.slice(0, 20_000)}${answersText ? `\n\nThe candidate's own answers:\n${answersText}` : '\n\nThe candidate answered no questions — leave all story fields empty and all projects unfeatured.'}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      tools: [CAREER_PROFILE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_career_profile' },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_career_profile')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Could not build your Career Arc. Please try again.')
    }

    const sections = sanitizeDeep(toolUse.input as CareerProfileSections)

    const { data: saved, error } = await supabase
      .from('career_profiles')
      .upsert({ user_id: user.id, source: 'single_cv', sections, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('id, created_at, updated_at, source, sections')
      .single()

    if (error) throw error
    return NextResponse.json({ profile: saved })
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
