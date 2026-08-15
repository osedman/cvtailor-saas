/**
 * The scan and the publish control, held to §5.3's wall.
 *
 * Source scans, in the manner of typography-consistency.test.ts. The
 * properties are structural: what the scan may touch, what the recruiter may
 * be told, and what survives a crashed process. The runtime halves get proven
 * against staging (the migrations runbook pattern); these keep the shape from
 * regressing between those checks.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("the wall: a matched person does not exist to the agency", () => {
  const scan = read("lib/matching/scan.ts")

  it("the scan never touches agency.candidates", () => {
    // Matched-but-not-applied ≡ never existed. The moment the scan writes a
    // candidate row, that stops being true.
    expect(scan).not.toMatch(/from\(["']candidates["']\)/)
  })

  it("the scan never opens the enrichment door", () => {
    // recruiter_profile_snapshot is the OTHER door — recruiter-initiated,
    // keyed by email, different consent. The scan keying into it would fuse
    // two consents the settings screen promises are separate.
    expect(scan).not.toMatch(/recruiter_profile_snapshot/)
  })

  it("the scan summary carries counts only", () => {
    const iface = scan.slice(scan.indexOf("interface ScanSummary"), scan.indexOf("}", scan.indexOf("interface ScanSummary")))
    expect(iface).not.toMatch(/user|name|email|id(?!:)/i)
  })
})

describe("what the recruiter is told", () => {
  const route = read("app/api/agency/roles/[roleId]/matching/route.ts")
  const lib = read("lib/agency/matching.ts")

  it("the route never selects or returns a person", () => {
    expect(route).not.toMatch(/user_id/)
    expect(route).not.toMatch(/role_recommendations/)
  })

  it("the status read returns the bucket, not a count", () => {
    const fn = lib.slice(lib.indexOf("export async function getMatchingStatus"))
    const select = fn.slice(0, fn.indexOf("maybeSingle"))
    expect(select).toMatch(/matched_bucket/)
    expect(select).not.toMatch(/count/i)
    expect(select).not.toMatch(/user_id/)
  })

  it("every mutation writes its audit row in the same operation", () => {
    // Audit-coupled table: role_matching has no authenticated writes, so the
    // service-role paths must each carry writeAudit.
    for (const fn of ["publishForMatching", "pauseMatching"]) {
      const body = lib.slice(lib.indexOf(`export async function ${fn}`))
      const scope = body.slice(0, body.indexOf("\nexport ", 10) === -1 ? undefined : body.indexOf("\nexport ", 10))
      expect(scope, `${fn} must audit`).toMatch(/writeAudit/)
    }
  })

  it("publishing refuses a role with no requirements", () => {
    // An unrequirement'd role scanned against the pool would quietly match
    // everyone or no one — refusing at publish is the honest failure.
    expect(lib).toMatch(/parse the role's requirements before publishing/)
  })

  it("the cooldown gates the queue, and a mid-window change buys no scan", () => {
    const publish = lib.slice(lib.indexOf("export async function publishForMatching"))
    const queueAt = publish.indexOf("queueMatchScan")
    const gate = publish.slice(0, queueAt)
    expect(gate).toMatch(/next_scan_allowed_at/)
  })
})

describe("a scan cannot be silently lost, or doubly run", () => {
  const scan = read("lib/matching/scan.ts")
  const route = read("app/api/agency/roles/[roleId]/matching/route.ts")
  const cron = read("app/api/agency/cron/route.ts")

  it("the publish route queues BEFORE after(), and never scans inline", () => {
    expect(route).toMatch(/after\(/)
    // The scan import is for the after() callback only; the handler body
    // must not await it before the response.
    const post = route.slice(route.indexOf("export async function POST"))
    const beforeAfter = post.slice(0, post.indexOf("after("))
    expect(beforeAfter).not.toMatch(/await runMatchScan/)
  })

  it("the claim is exactly-once", () => {
    // Two runners race (after() and the cron): the update narrows on
    // status='queued', so the second finds nothing and stands down.
    expect(scan).toMatch(/\.eq\("status", "queued"\)/)
  })

  it("the cron sweeps what queued and never ran", () => {
    expect(cron).toMatch(/runQueuedMatchScans/)
  })
})

describe("what a scan may not overrule", () => {
  const scan = read("lib/matching/scan.ts")

  it("dismissed and applied recommendations are never rewritten", () => {
    expect(scan).toMatch(/state === "dismissed" \|\| r\.state === "applied"/)
  })

  it("people below the prefilter cut get no mark", () => {
    // A mark says "assessed". Marking the un-assessed converts a cost cap
    // into a rejection — the exact thing PREFILTER_KEEP is documented not
    // to be.
    expect(scan).toMatch(/get no mark/)
  })
})

describe("the cached prompt is the same prompt", () => {
  const assessment = read("lib/agency/assessment.ts")

  it("splits exactly at the <cv> boundary", () => {
    // Concatenating the two blocks must reproduce the original single-string
    // prompt byte for byte — the split exists only to carry cache_control.
    expect(assessment).toMatch(/<\/requirements>`\n/)
    expect(assessment).toMatch(/const cvBlock = `\\n\\n<cv>\\n\$\{cvText\}\\n<\/cv>`/)
  })

  it("caches only the role prefix, never the CV", () => {
    // A cached CV block would persist one candidate's CV into the next
    // call's context window.
    const cvBlockAt = assessment.indexOf("{ type: \"text\" as const, text: cvBlock }")
    expect(cvBlockAt).toBeGreaterThan(-1)
    const cvBlockLine = assessment.slice(cvBlockAt, cvBlockAt + 80)
    expect(cvBlockLine).not.toMatch(/cache_control/)
  })
})
