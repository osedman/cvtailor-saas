/**
 * Provider diversity in course shortlists.
 *
 * One provider can dominate the catalogue by sheer volume — Microsoft Learn's
 * open API supplied 2,000 of the first 2,012 rows. Pure relevance ranking then
 * fills every slot with the same source, so someone closing a UiPath or
 * Salesforce gap gets five Microsoft modules and misses the rarer, better match.
 */
import { describe, it, expect } from 'vitest'
import { diversifyByProvider } from '@/lib/course-catalog'

const c = (provider: string, id: string) => ({ provider, id })

describe('diversifyByProvider', () => {
  it('stops one provider taking every slot', () => {
    // The property that matters: the rarer, better-matched providers get in.
    // 8 Microsoft entries would otherwise fill all 5 on relevance alone.
    const ranked = [
      c('microsoft-learn', 'm1'), c('microsoft-learn', 'm2'), c('microsoft-learn', 'm3'),
      c('microsoft-learn', 'm4'), c('microsoft-learn', 'm5'), c('microsoft-learn', 'm6'),
      c('microsoft-learn', 'm7'), c('microsoft-learn', 'm8'),
      c('youtube', 'y1'), c('curated', 'k1'), c('freecodecamp', 'f1'),
    ]
    const out = diversifyByProvider(ranked, 5, 2)
    expect(out).toHaveLength(5)
    expect(out.filter((x) => x.provider === 'microsoft-learn')).toHaveLength(2)
    expect(out.map((x) => x.id)).toEqual(expect.arrayContaining(['y1', 'k1', 'f1']))
  })

  it('exceeds the cap only when there is nothing else to fill with', () => {
    // 4 Microsoft + 2 others, limit 5: the cap picks 2+2, then backfill takes a
    // third Microsoft rather than returning 4. Deliberate — see the fn comment.
    const ranked = [
      c('microsoft-learn', 'm1'), c('microsoft-learn', 'm2'), c('microsoft-learn', 'm3'),
      c('microsoft-learn', 'm4'), c('youtube', 'y1'), c('curated', 'k1'),
    ]
    const out = diversifyByProvider(ranked, 5, 2)
    expect(out).toHaveLength(5)
    expect(out.map((x) => x.id)).toEqual(expect.arrayContaining(['y1', 'k1']))
    expect(out.filter((x) => x.provider === 'microsoft-learn')).toHaveLength(3)
  })

  it('preserves rank order within what it picks', () => {
    const ranked = [
      c('microsoft-learn', 'm1'), c('youtube', 'y1'),
      c('microsoft-learn', 'm2'), c('youtube', 'y2'),
    ]
    expect(diversifyByProvider(ranked, 4, 2).map((x) => x.id))
      .toEqual(['m1', 'y1', 'm2', 'y2'])
  })

  it('backfills rather than returning fewer results', () => {
    // A niche skill only one provider covers must still fill the shortlist —
    // showing 2 results because of a quota is worse than 5 from one place.
    const ranked = [
      c('microsoft-learn', 'm1'), c('microsoft-learn', 'm2'),
      c('microsoft-learn', 'm3'), c('microsoft-learn', 'm4'),
    ]
    const out = diversifyByProvider(ranked, 4, 2)
    expect(out).toHaveLength(4)
    expect(out.map((x) => x.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
  })

  it('never returns duplicates when backfilling', () => {
    const ranked = [c('a', '1'), c('a', '2'), c('a', '3')]
    const out = diversifyByProvider(ranked, 3, 1)
    expect(new Set(out.map((x) => x.id)).size).toBe(out.length)
  })

  it('respects the limit and handles an empty list', () => {
    const ranked = [c('a', '1'), c('b', '2'), c('c', '3')]
    expect(diversifyByProvider(ranked, 2, 2)).toHaveLength(2)
    expect(diversifyByProvider([], 5, 2)).toEqual([])
  })
})
