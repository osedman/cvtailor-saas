/**
 * `String(error)` is banned in app code.
 *
 * Supabase errors are plain objects — `{ message, details, hint, code }` —
 * not Error instances. The idiom
 *
 *     error instanceof Error ? error.message : String(error)
 *
 * fails the instanceof check on every one of them and renders the literal
 * text "[object Object]", which is what a recruiter saw when publishing a
 * role failed with a stale PostgREST schema cache: the real cause was on the
 * wire and thrown away at the last step. `lib/error-message.ts` exists for
 * this; 48 routes were swept onto it on 16 Aug 2026 and this test is what
 * stops the 49th being written.
 *
 * The rule is about the FALLBACK, not about touching errors. Reading
 * `error.name`, `error.code`, or building a deliberately field-limited log
 * line (app/api/hiring/me/route.ts, which must not log Postgres messages
 * because they can quote a row value — on this schema, an email address) is
 * fine and deliberately not matched here.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const SCAN_DIRS = ['app', 'components']

/** The banned fallback, however it is spaced. */
const BANNED = /instanceof\s+Error\s*\?[^:]*:\s*String\(/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('error message handling', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))

  it('finds source files to check (guards against a broken scanner)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('nothing falls back to String(error) — use errorMessage()', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (BANNED.test(line)) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}`)
        }
      })
    }
    expect(
      offenders,
      `Use errorMessage() from @/lib/error-message instead:\n${offenders.join('\n')}`
    ).toEqual([])
  })

  it('every file calling errorMessage imports it', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (!/\berrorMessage\s*\(/.test(text)) continue
      if (!/from ['"]@\/lib\/error-message['"]/.test(text)) {
        offenders.push(path.relative(ROOT, file))
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
