/**
 * /api/hiring/dashboard answers `{ dashboard, alsoRecruiter }`.
 *
 * The rounds, slots, briefs and links all live INSIDE `dashboard`. Reading
 * `body.rounds` gets `undefined`, and because every consumer sensibly guards
 * with `Array.isArray(...)` before using it, the result is not an error: the
 * feature just renders nothing, over a 200, for ever.
 *
 * 20 Sep 2026: shipped exactly that on the hiring manager's shortlist. The
 * round-and-time chip was built, styled, typed, tested and deployed, and it
 * never appeared once, because the fetch read one level too high. Nothing in
 * the build or the suite could see it — it took opening the network response
 * on the deployed screen.
 *
 * This is the "verify the effect, never the status code" rule in CLAUDE.md,
 * in its purest form: the route was healthy, the JSON was valid, and the
 * answer was silently empty.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const ROOT = process.cwd()

/** Every file that fetches the hiring dashboard. */
function consumers(): Array<{ file: string; src: string }> {
  return sourceFiles(join(ROOT, "app"))
    // Comments stripped: the first run of this guard flagged the very
    // comment explaining the bug it exists to prevent, which is the trap
    // source-scan.ts was written for.
    .map((file) => ({ file, src: tsCode(readFileSync(file, "utf8")) }))
    .filter((f) => f.src.includes('"/api/hiring/dashboard"'))
}

describe("the wrapped dashboard payload", () => {
  it("has consumers to check", () => {
    // A scan that matches nothing passes for the wrong reason.
    expect(consumers().length).toBeGreaterThan(0)
  })

  it("the route really does wrap its payload", () => {
    // If the route is ever flattened, this guard becomes wrong rather than
    // merely unnecessary — so it fails and asks to be deleted.
    const route = readFileSync(join(ROOT, "app/api/hiring/dashboard/route.ts"), "utf8")
    expect(route).toMatch(/dashboard:/)
  })

  it("no consumer reads rounds, slots or briefs off the top level", () => {
    const offenders: string[] = []
    for (const { file, src } of consumers()) {
      // `body.rounds` / `payload.slots` etc. — anything that is NOT reached
      // through `.dashboard`.
      for (const m of src.matchAll(/(\w+)\??\.(rounds|slots|briefs|links)\b/g)) {
        const [, holder, field] = m
        // `data` is the unwrapped dashboard object every consumer stores it
        // as; `role` is a locally-built grouping, not the payload.
        if (["dashboard", "data", "d", "role"].includes(holder)) continue
        // Reached correctly as `<anything>.dashboard.<field>`.
        const before = src.slice(Math.max(0, m.index - 12), m.index + holder.length)
        if (before.includes("dashboard")) continue
        offenders.push(`${file.split("/").slice(-3).join("/")}: ${holder}.${field}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
