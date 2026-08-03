import { describe, expect, it } from 'vitest'
import type { RequirementMapping } from '@/lib/anthropic'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import { matchEvidenceToRequirements, scoreCardAgainstRequirement } from '@/lib/career-arc-tailor-match'

const req = (requirement: string, over: Partial<RequirementMapping> = {}): RequirementMapping => ({
  requirement, type: 'must', keywords: [], strength: 'strong', evidence: '', ...over,
})

const card = (id: string, claim: string, over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id, category: 'quant', claim, source_role: '', source_company: '', source_span: '',
  cv_line: null, pinned: false, hidden: false, rephrased_text: null, sort_order: 0, ...over,
})

const wms = card('a', 'Rolled a warehouse management system across four sites, cutting supplier onboarding from six weeks to nine days', { sort_order: 0 })
const automation = card('b', 'Saved £1.2m per annum through process automation', { sort_order: 1 })
const teams = card('c', 'Led three teams — 34 people — through a single unified workflow', { sort_order: 2 })

describe('scoreCardAgainstRequirement', () => {
  it('scores keyword phrase hits above loose token overlap', () => {
    const r = req('Process automation with measurable cost impact', { keywords: ['process automation'] })
    expect(scoreCardAgainstRequirement(r, automation)).toBeGreaterThanOrEqual(3)
    expect(scoreCardAgainstRequirement(r, teams)).toBeLessThan(3)
  })
})

describe('matchEvidenceToRequirements', () => {
  const requirements = [
    req('Warehouse management system rollout experience', { keywords: ['warehouse management system'] }),
    req('Process automation with cost savings', { keywords: ['process automation'] }),
    req('Stakeholder communication', { strength: 'transferable', keywords: ['stakeholder management'] }),
    req('Multi-site P&L ownership', { strength: 'none', keywords: ['P&L ownership'] }),
    req('Cold-chain fulfilment', { strength: 'partial', type: 'nice', keywords: [] }),
  ]

  it('traces covered requirements to the right cards with stable EV labels', () => {
    const out = matchEvidenceToRequirements(requirements, [wms, automation, teams])
    expect(out.rows[0].matches[0]).toMatchObject({ id: 'a', label: 'EV·01' })
    expect(out.rows[1].matches[0]).toMatchObject({ id: 'b', label: 'EV·02' })
    expect(out.rows[0].matches[0].snippet.length).toBeLessThanOrEqual(44)
  })

  it('computes the meter: covered, pulled, implied, gaps', () => {
    const out = matchEvidenceToRequirements(requirements, [wms, automation, teams])
    expect(out.total).toBe(5)
    expect(out.covered).toBe(3)
    expect(out.pulled).toBe(2)
    expect(out.implied).toBe(1)
    expect(out.gaps).toHaveLength(2)
  })

  it('names gaps with the primary JD keyword as the skill', () => {
    const out = matchEvidenceToRequirements(requirements, [])
    expect(out.gaps[0]).toEqual({ requirement: 'Multi-site P&L ownership', skill: 'P&L ownership', isMust: true })
    expect(out.gaps[1].skill).toBe('Cold-chain fulfilment')
    expect(out.gaps[1].isMust).toBe(false)
  })

  it('never matches hidden cards and never crosses the threshold on noise', () => {
    const hidden = card('h', 'Warehouse management system experience across sites', { hidden: true })
    const out = matchEvidenceToRequirements([requirements[0]], [hidden, teams])
    expect(out.rows[0].matches).toHaveLength(0)
  })

  it('handles empty banks and empty requirement lists', () => {
    expect(matchEvidenceToRequirements([], [wms]).total).toBe(0)
    const out = matchEvidenceToRequirements(requirements, [])
    expect(out.rows.every((r) => r.matches.length === 0)).toBe(true)
  })
})
