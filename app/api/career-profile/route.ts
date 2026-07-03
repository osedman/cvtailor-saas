import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CAREER_PROFILE_TOOL, type CareerProfileSections } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'

export const maxDuration = 300

const PROMPT_PREFIX = `You are building a factual "career highlight reel" from a candidate's CV — a timeline, skills, growth signal, key projects, and a short list of inferred professional qualities. Every fact must come directly from the CV text below. Never invent dates, numbers, achievements, or traits that aren't grounded in the text. If a section can't be confidently filled from the CV, leave it sparse rather than guessing.`

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

    let cv = pastedCv
    if (!cv) {
      const { data: lastTailor, error: historyErr } = await supabase
        .from('tailor_history')
        .select('original_cv')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (historyErr) throw historyErr
      cv = lastTailor?.original_cv ?? ''
    }

    if (!cv) {
      return NextResponse.json(
        { error: 'No CV found yet. Paste your CV to build your Career Arc.', needsCv: true },
        { status: 400 },
      )
    }

    const userPrompt = `${PROMPT_PREFIX}\n\nCV:\n${cv.slice(0, 20_000)}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      tools: [CAREER_PROFILE_TOOL],
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
