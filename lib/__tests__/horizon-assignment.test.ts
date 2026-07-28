/**
 * Core means the North Star, and nothing else.
 *
 * This guards the bug that prompted the rule (28 Jul 2026): the
 * `add-skill-for-jd` route called addItems() WITHOUT a horizon, the DB column
 * defaults to 'core', and so skills pulled from a job description silently
 * joined the North Star path and inflated its readiness. Nothing failed — the
 * numbers were just quietly wrong.
 *
 * The rule these tests encode: a writer that has a JD in hand must say
 * 'upskill' explicitly. Never rely on the column default to be correct.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

describe('horizon assignment', () => {
  const careerPath = read('app/api/career-path/route.ts')
  const upskill = read('app/api/upskill/route.ts')

  it('writes JD-derived skills as upskill, never core', () => {
    // add-skill-for-jd: the original offender
    expect(careerPath).toMatch(/horizon: 'upskill' as const, source: 'tailor_run' as const/)
    // upskill capture + explicit accept
    expect(upskill).toMatch(/horizon: 'upskill' as const/)
    expect(upskill).toMatch(/horizon: 'upskill', source: 'tailor_run'/)
  })

  it('never writes core alongside a tailor_run source', () => {
    // A tailor run is a job description by definition — the pairing is a bug.
    for (const src of [careerPath, upskill]) {
      expect(src).not.toMatch(/horizon: 'core'[^\n]*source: 'tailor_run'/)
      expect(src).not.toMatch(/source: 'tailor_run'[^\n]*horizon: 'core'/)
    }
  })

  it('makes add-skill decide by explicit origin, not inference', () => {
    // One endpoint serves the North Star skill map AND the tailor results
    // panel. Guessing server-side is exactly how core got polluted.
    expect(careerPath).toMatch(/body\?\.origin === 'jd'/)
    expect(careerPath).toMatch(/addHorizon/)
    // ...and the JD caller must actually send it.
    expect(read('components/cv-tailor/career-sync-panel.tsx')).toMatch(/origin: "jd"/)
  })

  it('has no path that promotes an upskill item onto the core path', () => {
    // Promotion was removed deliberately (Ose, 28 Jul): core is the North Star
    // only. If this fails, someone reintroduced graduation into core.
    expect(upskill).not.toMatch(/promoteToCore/)
    expect(read('lib/roadmap-store.ts')).not.toMatch(/promoteToCore/)
    expect(upskill).toMatch(/status: 410/)
  })

  it('reads upskill items under the upskill horizon only', () => {
    expect(careerPath).toMatch(/horizon: 'upskill'/)
    expect(careerPath).not.toMatch(/horizon: 'quick'/)
    expect(upskill).not.toMatch(/horizon: 'quick'/)
  })
})
