/**
 * Replacing a user's North Star plans must never destroy them.
 *
 * The bug (found on staging, 29 Jul 2026): replaceItems ran its DELETE before
 * checking whether it had anything to insert. So locking a North Star whose
 * plan generation came back empty deleted every existing core item — the
 * resources, project briefs, CV phrasing, and any evidence the user had logged
 * against those skills. Silently. Staging was left with 14 target skills and 0
 * plans, which read as a broken page rather than data loss.
 *
 * These tests pin the two halves of the fix: the store refuses to wipe, and the
 * route populates an item for EVERY gap rather than only the ones a slow AI
 * call happened to cover.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { replaceItems } from '@/lib/roadmap-store'

const ROOT = path.resolve(__dirname, '../..')

/** Minimal Supabase-shaped stub that records whether delete() was reached. */
function stubDb(existingRows: Record<string, unknown>[]) {
  const calls = { deleted: false, inserted: false }
  const chain = (result: unknown) => {
    const thenable: Record<string, unknown> = {}
    for (const m of ['delete', 'eq', 'select', 'order', 'is', 'insert']) {
      thenable[m] = (...args: unknown[]) => {
        if (m === 'delete') calls.deleted = true
        if (m === 'insert') { calls.inserted = true; return chain({ data: args[0], error: null }) }
        return chain(result)
      }
    }
    thenable.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
    return thenable
  }
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: () => chain({ data: existingRows, error: null }) as any,
  }
}

describe('replaceItems — never wipes on an empty list', () => {
  it('does not delete anything when given no items', async () => {
    const db = stubDb([
      { skill: 'Stakeholder management', horizon: 'core', status: 'todo', resources: [] },
      { skill: 'Process mining', horizon: 'core', status: 'done', resources: [] },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kept = await replaceItems(db as any, 'user-1', 'roadmap-1', [], 'core')

    expect(db.calls.deleted).toBe(false)
    expect(db.calls.inserted).toBe(false)
    expect(kept.map((k) => k.skill)).toEqual([
      'Stakeholder management', 'Process mining',
    ])
  })

  it('still replaces normally when there are items to write', async () => {
    const db = stubDb([])
    await replaceItems(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any, 'user-1', 'roadmap-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [{ skill: 'dbt', whyItMatters: '', resources: [], projectBrief: '', cvPhrasing: '', status: 'todo' } as any],
      'core',
    )
    expect(db.calls.deleted).toBe(true)
    expect(db.calls.inserted).toBe(true)
  })
})

describe('set-target populates every gap, not just the planned ones', () => {
  const route = readFileSync(path.join(ROOT, 'app/api/career-path/route.ts'), 'utf8')

  it('builds items from all gaps, with the AI plan as enrichment', () => {
    // allGaps drives the items; gaps (capped) only drives the paid call.
    expect(route).toMatch(/const allGaps = roleSkills\.filter\(\(s\) => !s\.have\)/)
    expect(route).toMatch(/items = allGaps\.map\(/)
    expect(route).toMatch(/planBySkill/)
  })

  it('caps enrichment but not which skills appear', () => {
    // The .slice(0, 5) must apply to `gaps` (the AI call), never to allGaps.
    expect(route).toMatch(/const gaps = allGaps\.slice\(0, 5\)/)
    expect(route).not.toMatch(/const allGaps = [^\n]*\.slice\(/)
  })
})
