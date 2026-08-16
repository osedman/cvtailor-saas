import { NextRequest, NextResponse } from 'next/server'
import { isCareerPathBeta, BETA_LOCKED } from '@/lib/feature-gate'
import {
  anthropic,
  CAREER_REPHRASE_TOOL,
  CAREER_EVIDENCE_CATEGORIES,
  type CareerEvidenceCategory,
} from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeDeep } from '@/lib/sanitize'
import {
  MAX_CLAIM_LENGTH,
  MAX_EVIDENCE_CARDS,
  MIN_CLAIM_LENGTH,
  computeUsageCounts,
  countCvsUsingAny,
  findCvLine,
  isSubstringOfCv,
  resolveStoredCv,
  validateRephrase,
} from '@/lib/career-evidence'
import { errorMessage } from '@/lib/error-message'

export const maxDuration = 300

const MIN_CV_LENGTH = 300 // matches /api/career-profile's seeded-row guard

const EVIDENCE_COLUMNS =
  'id, category, claim, source_role, source_company, source_span, cv_line, pinned, hidden, rephrased_text, sort_order, created_at'

const NO_FREE_TEXT =
  'Evidence cards can only be rephrased, reordered, pinned, hidden, or added from your CV — free-text editing is not supported.'

type EvidenceRow = {
  id: string
  category: string
  claim: string
  source_role: string
  source_company: string
  source_span: string
  cv_line: number | null
  pinned: boolean
  hidden: boolean
  rephrased_text: string | null
  sort_order: number
  created_at: string
}

async function loadEvidence(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<EvidenceRow[]> {
  const { data, error } = await supabase
    .from('career_evidence')
    .select(EVIDENCE_COLUMNS)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as EvidenceRow[]
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!(await isCareerPathBeta(user.email))) return NextResponse.json(BETA_LOCKED, { status: 403 })

    const evidence = await loadEvidence(supabase, user.id)

    // Usage is computed from tailor history at read time, never stored.
    const { data: history, error: histErr } = await supabase
      .from('tailor_history')
      .select('result')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (histErr) throw histErr

    const historyTexts = (history ?? []).map((h) => JSON.stringify(h.result ?? ''))
    const usage = computeUsageCounts(evidence, historyTexts)
    const usedCvCount = countCvsUsingAny(evidence.filter((e) => !e.hidden), historyTexts)

    return NextResponse.json({ evidence, usage, usedCvCount })
  } catch (err) {
    const msg = errorMessage(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!(await isCareerPathBeta(user.email))) return NextResponse.json(BETA_LOCKED, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const action = typeof body?.action === 'string' ? body.action : ''

    switch (action) {
      case 'pin': {
        const row = await ownedRow(supabase, user.id, body?.id)
        if (!row) return NextResponse.json({ error: 'Evidence card not found' }, { status: 404 })
        if (row.pinned) {
          await update(supabase, user.id, row.id, { pinned: false })
        } else {
          // Single pinned card — the "Proudest work" slot.
          const { error } = await supabase.from('career_evidence').update({ pinned: false }).eq('user_id', user.id).eq('pinned', true)
          if (error) throw error
          await update(supabase, user.id, row.id, { pinned: true, hidden: false })
        }
        break
      }

      case 'hide': {
        const row = await ownedRow(supabase, user.id, body?.id)
        if (!row) return NextResponse.json({ error: 'Evidence card not found' }, { status: 404 })
        await update(supabase, user.id, row.id, { hidden: !row.hidden, ...(row.pinned && !row.hidden ? { pinned: false } : {}) })
        break
      }

      case 'reorder': {
        const order = Array.isArray(body?.order) ? body.order.filter((v: unknown): v is string => typeof v === 'string') : []
        if (order.length === 0 || order.length > 100) {
          return NextResponse.json({ error: 'Invalid order' }, { status: 400 })
        }
        const rows = await loadEvidence(supabase, user.id)
        const owned = new Set(rows.map((r) => r.id))
        if (!order.every((id: string) => owned.has(id)) || new Set(order).size !== order.length) {
          return NextResponse.json({ error: 'Order must list your own evidence cards, each once' }, { status: 400 })
        }
        for (let i = 0; i < order.length; i++) {
          await update(supabase, user.id, order[i], { sort_order: i })
        }
        break
      }

      case 'rephrase': {
        const limited = await checkRateLimit(user.id, 'ai')
        if (limited) return limited
        const row = await ownedRow(supabase, user.id, body?.id)
        if (!row) return NextResponse.json({ error: 'Evidence card not found' }, { status: 404 })

        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          tools: [CAREER_REPHRASE_TOOL],
          tool_choice: { type: 'tool', name: 'submit_rephrase' },
          messages: [{
            role: 'user',
            content: `Reword this CV evidence claim. Keep every fact, figure, name, and date exactly; change only the phrasing. Claim:\n${(row.rephrased_text ?? row.claim).slice(0, MAX_CLAIM_LENGTH)}`,
          }],
        })
        const toolUse = message.content.find((b) => b.type === 'tool_use' && b.name === 'submit_rephrase')
        if (!toolUse || toolUse.type !== 'tool_use') {
          throw new Error('Could not rephrase this card. Please try again.')
        }
        const { claim: candidate } = sanitizeDeep(toolUse.input as { claim: string })
        const accepted = validateRephrase(row.claim, candidate)
        if (!accepted) {
          return NextResponse.json({ error: 'The rephrase changed the facts, so it was rejected. Try again.' }, { status: 422 })
        }
        await update(supabase, user.id, row.id, { rephrased_text: accepted })
        break
      }

      case 'add-from-cv': {
        const text = typeof body?.text === 'string' ? body.text.trim() : ''
        if (text.length < MIN_CLAIM_LENGTH || text.length > MAX_CLAIM_LENGTH) {
          return NextResponse.json(
            { error: `Paste a line from your CV between ${MIN_CLAIM_LENGTH} and ${MAX_CLAIM_LENGTH} characters.` },
            { status: 400 },
          )
        }
        const category: CareerEvidenceCategory = (CAREER_EVIDENCE_CATEGORIES as readonly string[]).includes(body?.category)
          ? body.category
          : 'craft'

        const cv = await resolveStoredCv(supabase, user.id, MIN_CV_LENGTH)
        if (!cv) {
          return NextResponse.json({ error: 'No stored CV to check against yet — run a tailor first.', needsCv: true }, { status: 400 })
        }
        // The moat rule: only text already in the CV can become a card.
        if (!isSubstringOfCv(cv, text)) {
          return NextResponse.json(
            { error: "That text isn't in your CV, so it can't become an evidence card. Paste the exact line from your CV." },
            { status: 422 },
          )
        }

        const rows = await loadEvidence(supabase, user.id)
        if (rows.length >= MAX_EVIDENCE_CARDS * 2) {
          return NextResponse.json({ error: 'Evidence bank is full — hide or remove a card first.' }, { status: 400 })
        }
        const nextOrder = rows.reduce((max, r) => Math.max(max, r.sort_order + 1), 0)
        const { error } = await supabase.from('career_evidence').insert({
          user_id: user.id,
          category,
          claim: sanitizeDeep({ text }).text,
          cv_line: findCvLine(cv, text),
          sort_order: nextOrder,
        })
        if (error) throw error
        break
      }

      default:
        return NextResponse.json({ error: NO_FREE_TEXT }, { status: 400 })
    }

    const evidence = await loadEvidence(supabase, user.id)
    return NextResponse.json({ evidence })
  } catch (err) {
    const msg = errorMessage(err)
    const status = (err as { status?: number })?.status
    if (status === 429) {
      return NextResponse.json({ error: 'Too many requests right now — please wait a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function ownedRow(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: unknown): Promise<EvidenceRow | null> {
  if (typeof id !== 'string' || !id) return null
  const { data, error } = await supabase
    .from('career_evidence')
    .select(EVIDENCE_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as EvidenceRow) ?? null
}

async function update(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  id: string,
  patch: Partial<Pick<EvidenceRow, 'pinned' | 'hidden' | 'sort_order' | 'rephrased_text'>>,
): Promise<void> {
  const { error } = await supabase.from('career_evidence').update(patch).eq('user_id', userId).eq('id', id)
  if (error) throw error
}
