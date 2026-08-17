/**
 * Light/dark on the agency surface holds only while two things stay true.
 *
 * Dark used to be one screen (`:has(.agd-main)`), so gaps were invisible:
 * `--ag-coral-text` and `--ag-warn-mark` had no dark values at all and it
 * never showed, because the dashboard didn't use them. The moment dark
 * became a MODE covering the dossier and the round delta, both would have
 * rendered a dark-on-light hue on a dark ground. `--ag-sage` was worse — a
 * token that never existed, so `var(--ag-sage, #5d6e50)` silently resolved
 * to its hardcoded fallback forever.
 *
 * So: every colour token defined for light needs a dark value, and no
 * component may name a colour the themes cannot swap.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import path from "path"

const ROOT = path.resolve(__dirname, "../..")
const CSS = readFileSync(path.join(ROOT, "app/agencies/agencies.css"), "utf8")
const DARK_SELECTOR = '[data-ag-theme="dark"] .ag-app.ag-themed {'

/** Tokens that are the same in both themes by nature — type, not colour. */
const THEME_INDEPENDENT = new Set(["--ag-sans", "--ag-mono", "--ag-display"])

function tokensIn(block: string): Set<string> {
  return new Set([...block.matchAll(/(--ag-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
}

describe("agency theme tokens", () => {
  const darkStart = CSS.indexOf(DARK_SELECTOR)

  it("the dark block is scoped to opted-in surfaces, not to a screen", () => {
    // `.ag-themed` is what keeps the /portal and /rights doorways light: a
    // candidate opening a rights link never chose a theme.
    expect(darkStart).toBeGreaterThan(-1)
    expect(CSS).not.toMatch(/\.ag-app:has\(\.agd-main\)\s*\{/)
  })

  it("every colour token has a dark value", () => {
    const light = tokensIn(CSS.slice(0, darkStart))
    const dark = tokensIn(CSS.slice(darkStart, CSS.indexOf("}", darkStart)))
    const missing = [...light].filter((t) => !dark.has(t) && !THEME_INDEPENDENT.has(t))
    expect(missing, `no dark value for: ${missing.join(", ")}`).toEqual([])
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe("agency components name colours the theme can swap", () => {
  const files = [
    ...walk(path.join(ROOT, "app/agencies")),
    ...walk(path.join(ROOT, "app/hiring")),
  ]

  it("finds files to check (guards against a broken scanner)", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it("uses no hardcoded hex colours", () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      text.split("\n").forEach((line, i) => {
        // Ignore comment lines: the token docs quote the values they replaced.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        const hit = line.match(/#[0-9a-fA-F]{6}\b/)
        if (hit) offenders.push(`${path.relative(ROOT, file)}:${i + 1} ${hit[0]}`)
      })
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("references no token the stylesheet does not define", () => {
    const defined = tokensIn(CSS)
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      for (const m of text.matchAll(/var\((--ag-[a-z0-9-]+)/g)) {
        if (!defined.has(m[1])) offenders.push(`${path.relative(ROOT, file)} → ${m[1]}`)
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })
})
