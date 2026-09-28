/**
 * The recruiter dashboard must not ship data nobody reads.
 *
 * On 10 September 2026 the "Desk health" band was deleted from
 * `app/agencies/page.tsx` (e007e61, from Ose's walk of staging) together with
 * the Reports nav item. The route went on computing six timing measures for
 * it — three averages, two breach sentences and a percentage, each over its
 * own pass across submissions, recipients and client actions — and shipping
 * them to a client that had stopped reading them. It ran that way for five
 * days and nothing noticed, because nothing was watching: no test pinned
 * `health`, so removing it on 15 Sep broke nothing either.
 *
 * That is the failure this guards. Not "health specifically" — the CLASS.
 * A key that leaves the route and is read by nobody is latency the whole desk
 * pays on every load, and it is invisible in code review because both halves
 * look perfectly reasonable on their own.
 *
 * WHY A SOURCE SCAN AND NOT A TYPE. The payload is assembled inline in a
 * `NextResponse.json({...})` and consumed through a hand-written interface on
 * the page, so there is no shared symbol to make the compiler check. Until
 * there is one, the names have to be compared as text.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

const ROUTE = "app/api/agency/dashboard/route.ts"
const PAGE = "app/agencies/page.tsx"

/**
 * Top-level keys of the response object the route returns.
 *
 * Deliberately only the FINAL `NextResponse.json({...})` — the early returns
 * are error shapes (`{ error }`), which no dashboard band renders and which
 * must not be dragged into this.
 */
function payloadKeys(src: string): string[] {
  const start = src.lastIndexOf("return NextResponse.json({")
  expect(start).toBeGreaterThan(-1)
  const body = src.slice(start)
  // Keys at exactly one indent level inside the object literal. Nested
  // objects sit deeper and are not part of the contract this checks.
  return [...body.matchAll(/^ {6}([a-z_][a-z0-9_]*)\s*[,:]/gm)].map((m) => m[1])
}

describe("the dashboard route ships nothing the dashboard ignores", () => {
  const route = read(ROUTE)
  const page = read(PAGE)
  const keys = payloadKeys(route)

  it("finds a real payload to check", () => {
    // If the response is ever restructured this scan could silently match
    // nothing and pass forever, which is the other way a guard dies.
    expect(keys.length).toBeGreaterThan(8)
    expect(keys).toContain("roles")
  })

  it.each(payloadKeys(read(ROUTE)))("`%s` is read by the dashboard", (key) => {
    expect(page).toMatch(new RegExp(`\\b${key}\\b`))
  })

  it("and the struck Desk health measures have not crept back", () => {
    // Each was its own pass over the data. Named individually so a partial
    // revival is caught too, not just a wholesale one.
    for (const dead of ["brief_to_shortlist", "shortlist_to_reply", "positive_response"]) {
      expect(route).not.toMatch(new RegExp(`\\b${dead}\\b`))
      expect(page).not.toMatch(new RegExp(`\\b${dead}\\b`))
    }
  })
})
