/**
 * Raw control bytes in source are banned.
 *
 * On 16 Aug 2026 the apply path 409'd "stale requirements" forever on a role
 * whose hashes provably agreed. The cause: scan-core's requirementsHash and
 * the publisher's copy of it differed only in their separator bytes — one had
 * literal NUL (0x00) and SOH (0x01) characters inside its template strings,
 * the other had spaces. Every editor, diff, and code review rendered the two
 * functions identically; only a hexdump told them apart. Three SQL
 * recomputations "confirmed" the stored hash because SQL, too, was typed with
 * visible characters.
 *
 * A control character in source is either an accident (an editor or agent
 * mangled the file) or an invisible behaviour difference waiting for a reader.
 * Either way it fails the build. If a string genuinely needs a control
 * character, spell it as an escape sequence (backslash-u0000) so the reader
 * can see it — the ban is on the raw byte, not the character.
 *
 * Tab (0x09), LF (0x0A) and CR (0x0D) are ordinary whitespace and allowed.
 * This file itself must stay clean: every control character below is written
 * as an escape, never as the byte.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const SCAN_DIRS = ['app', 'components', 'lib', 'supabase']

// Everything except tab, LF, CR — plus DEL.
const CONTROL_BYTES = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]'
)

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|jsx?|css|sql)$/.test(entry)) out.push(full)
  }
  return out
}

describe('source control bytes', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))

  it('finds source files to check (guards against a broken scanner)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('contains no raw control bytes anywhere in source', () => {
    const offenders: string[] = []

    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const hit = lines[i].match(CONTROL_BYTES)
        if (hit) {
          const code = hit[0].charCodeAt(0).toString(16).padStart(2, '0')
          offenders.push(
            `${path.relative(ROOT, file)}:${i + 1} contains raw 0x${code}`
          )
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
