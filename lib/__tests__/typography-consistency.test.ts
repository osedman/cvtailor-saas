/**
 * Typography guardrail.
 *
 * Users reported the monospace default reading as "robotic" and off-brand
 * wherever their own words appeared — the CV editor, the CV/JD paste boxes,
 * the strengths/weaknesses detail on the career path. Those were fixed once
 * (27 Jul 2026). This test is what stops them coming back: any NEW monospace
 * usage in app/ or components/ fails the build unless it is added to the
 * allowlist below with a reason.
 *
 * The rule is not "mono is banned". The rule is "mono is a deliberate choice
 * that someone has to justify in writing". Machine data — a one-time code, an
 * IP address, tabular numerals — is a fair reason. Human prose never is.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const SCAN_DIRS = ['app', 'components']

/**
 * Every legitimate monospace usage, keyed by `path:token`. Adding a line here
 * is the deliberate act — if you cannot write a one-line reason, use the sans.
 */
const ALLOWLIST: Record<string, string> = {
  'app/layout.tsx:Geist_Mono':
    'Defines the mono face itself; loading it is not using it.',
  'app/layout.tsx:--font-geist-mono':
    'The CSS variable declaration for that same face.',
  'app/api/auth/request-otp/route.ts:font-family:ui-monospace,monospace':
    'Six-digit code in the sign-in email — a machine token, and email clients ' +
    'have no access to the brand webfont anyway.',
  'app/admin/page.tsx:font-mono':
    'IP address column — fixed-width data, aligns down the column.',
  'components/ui/chart.tsx:font-mono':
    'Tabular numerals in chart tooltips so values do not jitter.',
  'components/auth/sign-in-modal.tsx:font-mono':
    'Six-digit one-time code — a machine token, letter-spaced for legibility.',
  'components/career-arc/ledger-view.tsx:font-mono':
    'Career Arc ledger chrome (approved Ledger × Tailr skin, 2 Aug): section ' +
    'labels, source/category chips, the NOTHING INVENTED stamp, year markers. ' +
    'Claims, summaries and all prose stay in the sans.',
  'components/career-arc/share-modal.tsx:font-mono':
    'Share modal chrome (screen 03 of the approved skin): group labels, ' +
    'redaction segments, the share URL (machine data). Prose stays sans.',
  'app/arc/[token]/page.tsx:font-mono':
    'Public arc page chrome (screen 06 of the approved skin): the same ledger ' +
    'labels/chips/stamp as the private page. Claims and prose stay sans.',
}

/** Source files we typeset; ignore build output and vendored code. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full)
  }
  return out
}

/** Anything that pins a monospace face, however it is spelled. */
const MONO_PATTERNS = [
  /\bfont-mono\b/,
  /\bGeist_Mono\b/,
  /--font-geist-mono/,
  /font-family:[^;]*monospace/,
]

describe('typography consistency', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))

  it('finds source files to check (guards against a broken scanner)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('uses monospace only where the allowlist says it is deliberate', () => {
    const offenders: string[] = []

    for (const file of files) {
      const rel = path.relative(ROOT, file)
      const text = readFileSync(file, 'utf8')

      for (const line of text.split('\n')) {
        for (const pattern of MONO_PATTERNS) {
          const hit = line.match(pattern)
          if (!hit) continue
          // globals.css owns the token definitions and the .t-mono utility;
          // consumers of that utility are what this test polices.
          if (rel.endsWith('globals.css')) continue
          const key = `${rel}:${hit[0]}`
          if (!(key in ALLOWLIST)) offenders.push(`${key} → ${line.trim()}`)
        }
      }
    }

    expect(
      offenders,
      `Unapproved monospace usage. If it is machine data (a code, an ID, ` +
        `tabular numerals) add it to ALLOWLIST in this file with a reason. ` +
        `If it is human prose — a CV, a cover letter, a description — use the ` +
        `brand sans, or the selected CV template's face for CV output.`
    ).toEqual([])
  })

  it('keeps the CV editor typeset in the template face, not mono', () => {
    const editor = readFileSync(
      path.join(ROOT, 'components/cv-tailor/results-tabs.tsx'),
      'utf8'
    )
    // The editor must read its face from the template token set, so that what
    // you edit is what you download.
    expect(editor).toContain('fontFamily: t.fontStack')
  })
})
