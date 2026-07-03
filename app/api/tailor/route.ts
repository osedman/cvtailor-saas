import { NextRequest, NextResponse } from 'next/server'
import {
  anthropic, SYSTEM_PROMPT, EXTRACT_TOOL, REWRITE_TOOL, ROLE_GUIDANCE,
  type ExtractResult, type RequirementMapping, type RoleFamily,
} from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { sanitizeDeep } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 300

const CV_RAW_LIMIT = 30_000
const CV_COMPRESS_THRESHOLD = 12_000
const JD_RAW_LIMIT = 20_000
const JD_COMPRESS_THRESHOLD = 6_000

// ── Pass 0: strip formatting noise from long inputs (Haiku — fast) ──────

async function compressCV(cv: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are preparing a CV for AI processing. Strip formatting noise without losing any career content.

REMOVE: page headers/footers repeated across pages, page numbers ("Page 1 of 2", "1 | Name"), "Curriculum Vitae" title decorations, repeated contact lines (keep one at the top), decorative separators (====, ----, • • •, ___), "References available on request", redundant blank lines (max two in a row).

KEEP: every work experience bullet, every role and date, all skills, education, certifications, projects, and achievements. Preserve structure and section headings — only remove noise.

Return ONLY the cleaned CV text. No commentary, no preamble.

CV:
${cv}`,
    }],
  })

  const block = message.content.find((b) => b.type === 'text')
  const cleaned = block?.type === 'text' ? block.text.trim() : ''
  return cleaned && cleaned.length < cv.length ? cleaned : cv
}

async function compressJD(jd: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `You are preparing a job description for AI processing. Strip boilerplate without losing anything that matters for tailoring a CV to this role.

REMOVE: equal-opportunity/diversity statements, benefits and perks lists, generic company marketing paragraphs, application instructions, cookie/privacy notices, repeated legal disclaimers, "about our culture" fluff that names no skills.

KEEP: the job title, the hiring company's name, every responsibility, every requirement (must-have and nice-to-have), all named skills/tools/technologies, seniority signals, team context, and anything about what the role actually does day to day.

Return ONLY the cleaned job description text. No commentary, no preamble.

Job description:
${jd}`,
    }],
  })

  const block = message.content.find((b) => b.type === 'text')
  const cleaned = block?.type === 'text' ? block.text.trim() : ''
  return cleaned && cleaned.length < jd.length ? cleaned : jd
}

// ── Pass 1: extract requirements + evidence map (Haiku — fast) ──────────

async function extractRequirements(cv: string, jobDescription: string): Promise<ExtractResult> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_requirements_map' },
    messages: [{
      role: 'user',
      content: `Extract the requirements from this job description and map each one against the candidate's CV evidence. Judge evidence strength STRICTLY — "strong" needs direct, explicit CV support. The companyName is the company HIRING for this role and must come ONLY from the Job Description below — never from the candidate's CV or employment history.\n\nCV:\n\n${cv}\n\n---\n\nJob Description:\n\n${jobDescription}`,
    }],
  })

  const toolUse = message.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Extraction pass returned no result')

  const raw = toolUse.input as Partial<ExtractResult>
  return {
    jobTitle: typeof raw.jobTitle === 'string' ? raw.jobTitle : '',
    companyName: typeof raw.companyName === 'string' ? raw.companyName : '',
    roleFamily: (raw.roleFamily ?? 'other') as RoleFamily,
    seniority: raw.seniority ?? 'mid',
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
      max_tokens: 8000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [REWRITE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_tailored_result' },
      messages: [{
        role: 'user',
        content: `Tailor this CV for the role of ${extract.jobTitle || 'the target job'}${extract.companyName ? ` at ${extract.companyName}` : ''} (${extract.seniority} ${extract.roleFamily} role).

Role-family guidance: ${ROLE_GUIDANCE[extract.roleFamily] ?? ROLE_GUIDANCE.other}

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

    // 1b. Rate limit (protects against runaway Claude API cost / abuse)
    const limited = await checkRateLimit(user.id, 'tailor')
    if (limited) return limited

    // 2. Validate input
    const { cv, jobDescription, jobUrl } = await req.json()
    if (!cv || !jobDescription) {
      return NextResponse.json({ error: 'Both cv and jobDescription are required' }, { status: 400 })
    }
    if (cv.length > CV_RAW_LIMIT || jobDescription.length > JD_RAW_LIMIT) {
      return NextResponse.json({ error: 'Input too long. CV max 30,000 chars, job description max 20,000.' }, { status: 400 })
    }

    // 3. Pass 0 — compress long inputs (strips noise, preserves all content).
    // Both compressions are independent Haiku calls, so run them in parallel.
    const [processedCv, processedJd] = await Promise.all([
      cv.length > CV_COMPRESS_THRESHOLD ? compressCV(cv) : Promise.resolve(cv),
      jobDescription.length > JD_COMPRESS_THRESHOLD ? compressJD(jobDescription) : Promise.resolve(jobDescription),
    ])
    const compressed = processedCv !== cv || processedJd !== jobDescription

    // 4. Pass 1 — extract + map (fast)
    const extract = await extractRequirements(processedCv, processedJd)
    const matchScore = computeMatchScore(extract.requirements)

    // 5. Pass 2 — rewrite grounded in the map
    const rewrite = await rewriteCV(processedCv, processedJd, extract)
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

    const result = sanitizeDeep({
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
      roleFamily: extract.roleFamily,
      seniority: extract.seniority,
    })

    // 6. Track usage (fire-and-forget) + save to history (blocking — we need
    // the row id back so the client can attach feedback to this run)
    const jobSnippet = jobDescription.trim().slice(0, 200)

    supabase.rpc('increment_tailors_used', { user_id: user.id }).then(() => {})

    let historyId: string | null = null
    try {
      const { data: row } = await supabase
        .from('tailor_history')
        .insert({
          user_id:      user.id,
          job_title:    result.jobTitle,
          company_name: result.companyName,
          job_url:      typeof jobUrl === 'string' ? jobUrl.slice(0, 500) : '',
          job_snippet:  jobSnippet,
          job_description: jobDescription,
          match_score:  result.matchScore,
          original_cv:  processedCv,
          result,
        })
        .select('id')
        .single()
      historyId = row?.id ?? null
    } catch (e) {
      console.error('[tailor] history save failed:', e)
    }

    return NextResponse.json({ result, historyId, compressed })
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
