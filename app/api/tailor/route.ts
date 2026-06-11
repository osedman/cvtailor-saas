import { NextRequest, NextResponse } from 'next/server'
import {
  anthropic, SYSTEM_PROMPT, EXTRACT_TOOL, REWRITE_TOOL,
  type ExtractResult, type RequirementMapping,
} from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

// ── Pass 1: extract requirements + evidence map (Haiku — fast) ──────────

async function extractRequirements(cv: string, jobDescription: string): Promise<ExtractResult> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_requirements_map' },
    messages: [{
      role: 'user',
      content: `Extract the requirements from this job description and map each one against the candidate's CV evidence. Judge evidence strength STRICTLY — "strong" needs direct, explicit CV support.\n\nCV:\n\n${cv}\n\n---\n\nJob Description:\n\n${jobDescription}`,
    }],
  })

  const toolUse = message.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Extraction pass returned no result')

  const raw = toolUse.input as Partial<ExtractResult>
  return {
    jobTitle: typeof raw.jobTitle === 'string' ? raw.jobTitle : '',
    companyName: typeof raw.companyName === 'string' ? raw.companyName : '',
    requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
  }
}

// ── Computed match score — arithmetic, not model vibes ──────────────────

const STRENGTH_VALUE: Record<string, number> = { strong: 1, transferable: 0.6, partial: 0.25, none: 0 }

function computeMatchScore(requirements: RequirementMapping[]): number {
  if (requirements.length === 0) return 0
  let earned = 0
  let possible = 0
  for (const r of requirements) {
    const weight = r.type === 'must' ? 2 : 1
    earned += (STRENGTH_VALUE[r.strength] ?? 0) * weight
    possible += weight
  }
  return Math.round((earned / possible) * 100)
}

// ── Deterministic keyword check against the final CV text ───────────────

function checkKeywords(requirements: RequirementMapping[], cvText: string) {
  const cv = cvText.toLowerCase()
  const seen = new Set<string>()
  const present: string[] = []
  const missing: string[] = []
  for (const r of requirements) {
    for (const kw of r.keywords ?? []) {
      const k = kw.trim()
      const key = k.toLowerCase()
      if (!k || seen.has(key)) continue
      seen.add(key)
      // Only flag keywords the CV can truthfully carry — a "none" requirement's
      // keyword being absent is a gap, not an ATS mistake.
      if (cv.includes(key)) present.push(k)
      else if (r.strength !== 'none') missing.push(k)
    }
  }
  return { present, missing }
}

// ── Pass 2: rewrite grounded in the map (Sonnet) ─────────────────────────

async function rewriteCV(cv: string, jobDescription: string, extract: ExtractResult) {
  const mapLines = extract.requirements
    .map((r) => `- [${r.type.toUpperCase()} | ${r.strength}] ${r.requirement} — keywords: ${r.keywords.join(', ')}${r.evidence ? ` — evidence: ${r.evidence}` : ''}`)
    .join('\n')

  const message = await anthropic.messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 5000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [REWRITE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_tailored_result' },
      messages: [{
        role: 'user',
        content: `Tailor this CV for the role of ${extract.jobTitle || 'the target job'}${extract.companyName ? ` at ${extract.companyName}` : ''}.

A requirements analysis has already been done — use it as your ground truth:
${mapLines}

Instructions:
- Lead with the strongest evidence for MUST requirements.
- Work each requirement's exact keywords into the CV wherever the evidence honestly supports it (strength strong/transferable/partial). NEVER add keywords for "none" requirements.
- gaps must reflect the partial/none requirements above, phrased as constructive advice.

CV:

${cv}

---

Job Description:

${jobDescription}`,
      }],
    },
    { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
  )

  const toolUse = message.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Rewrite pass returned no result')
  if (message.stop_reason === 'max_tokens') return { truncated: true as const, raw: null }

  return { truncated: false as const, raw: toolUse.input as Record<string, unknown> }
}

// ── Route ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Validate input
    const { cv, jobDescription, jobUrl } = await req.json()
    if (!cv || !jobDescription) {
      return NextResponse.json({ error: 'Both cv and jobDescription are required' }, { status: 400 })
    }
    if (cv.length > 20_000 || jobDescription.length > 10_000) {
      return NextResponse.json({ error: 'Input too long. CV max 20,000 chars, job description max 10,000.' }, { status: 400 })
    }

    // 3. Pass 1 — extract + map (fast)
    const extract = await extractRequirements(cv, jobDescription)
    const matchScore = computeMatchScore(extract.requirements)

    // 4. Pass 2 — rewrite grounded in the map
    const rewrite = await rewriteCV(cv, jobDescription, extract)
    if (rewrite.truncated) {
      return NextResponse.json(
        { error: 'Your CV is a bit long for one pass — try trimming it slightly and tailoring again.' },
        { status: 422 }
      )
    }
    const raw = rewrite.raw!

    // 5. Normalise + assemble the final result
    const atsNotesRaw = (raw.atsNotes && typeof raw.atsNotes === 'object')
      ? raw.atsNotes as Record<string, unknown>
      : {}
    const tailoredCV = typeof raw.tailoredCV === 'string' ? raw.tailoredCV : ''
    if (!tailoredCV) {
      throw new Error('The tailored CV came back empty. Please try again.')
    }

    // Deterministic keyword coverage on the actual output text
    const keywordCoverage = checkKeywords(extract.requirements, tailoredCV)
    const atsItems = Array.isArray(atsNotesRaw.items) ? [...(atsNotesRaw.items as string[])] : []
    const totalKw = keywordCoverage.present.length + keywordCoverage.missing.length
    if (totalKw > 0) {
      atsItems.unshift(
        keywordCoverage.missing.length === 0
          ? `All ${totalKw} JD keywords present in the CV.`
          : `${keywordCoverage.present.length} of ${totalKw} JD keywords present — missing: ${keywordCoverage.missing.join(', ')}.`
      )
    }

    const result = {
      jobTitle: extract.jobTitle,
      companyName: extract.companyName,
      matchScore,
      tailoredCV,
      keyChanges: Array.isArray(raw.keyChanges) ? raw.keyChanges : [],
      gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
      followUps: Array.isArray(raw.followUps) ? raw.followUps : [],
      atsNotes: {
        status: (atsNotesRaw.status === 'warning' || keywordCoverage.missing.length > 2) ? 'warning' : 'pass',
        items: atsItems,
      },
      requirementsCoverage: extract.requirements,
      keywordCoverage,
    }

    // 6. Track usage + save to history (non-blocking, best-effort)
    const jobSnippet = jobDescription.trim().slice(0, 200)

    Promise.all([
      supabase.rpc('increment_tailors_used', { user_id: user.id }),
      supabase.from('tailor_history').insert({
        user_id:      user.id,
        job_title:    result.jobTitle,
        company_name: result.companyName,
        job_url:      typeof jobUrl === 'string' ? jobUrl.slice(0, 500) : '',
        job_snippet:  jobSnippet,
        match_score:  result.matchScore,
        result,
      }),
    ]).catch((e) => console.error('[tailor] history save failed:', e))

    return NextResponse.json({ result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number })?.status
    console.error('[tailor] error:', status ?? '', msg)

    // Surface common upstream failures with actionable, user-readable messages
    if (status === 401 || /api[_-]?key|authentication/i.test(msg)) {
      return NextResponse.json({ error: 'AI service is misconfigured (API key). Please contact support.' }, { status: 502 })
    }
    if (status === 400 && /credit|billing|balance/i.test(msg)) {
      return NextResponse.json({ error: 'The AI service is temporarily unavailable (billing). Please try again later.' }, { status: 502 })
    }
    if (status === 429) {
      return NextResponse.json({ error: 'Too many requests right now — please wait a moment and try again.' }, { status: 429 })
    }
    if (status === 529 || /overloaded/i.test(msg)) {
      return NextResponse.json({ error: 'The AI service is busy right now — please try again in a few seconds.' }, { status: 503 })
    }
    return NextResponse.json({ error: msg || 'Failed to tailor CV. Please try again.' }, { status: 500 })
  }
}
