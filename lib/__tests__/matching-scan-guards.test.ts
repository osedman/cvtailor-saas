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

  it("no count of any kind reaches the recruiter layer", () => {
    // Decided 15 Aug: the frame promises "until someone applies, you see
    // nobody", and a rounded count is still information about people who
    // never chose to be visible to this agency. matched_bucket is maintained
    // by the scan for operations and stops at the database. Structural, not
    // a UI discipline — the type cannot carry it, so no surface can render it.
    const status = lib.slice(lib.indexOf("export interface MatchingStatus"))
    const body = status.slice(0, status.indexOf("}"))
    expect(body).not.toMatch(/bucket/i)
    expect(body).not.toMatch(/count/i)
    expect(body).not.toMatch(/matched/i)

    // The select's ARGUMENT only — a comment explaining the omission mentions
    // the column by name, and prose must not be able to fail (or pass) this.
    const fn = lib.slice(lib.indexOf("export async function getMatchingStatus"))
    const columns = fn.slice(0, fn.indexOf("maybeSingle")).match(/\.select\("([^"]*)"\)/)?.[1] ?? ""
    expect(columns).toMatch(/enabled/)
    expect(columns).not.toMatch(/matched_bucket/)
    expect(columns).not.toMatch(/user_id/)
  })

  it("still reports liveness, or publishing becomes a black hole", () => {
    // Without these, "found nobody", "found people who haven't applied" and
    // "the scan is broken" are indistinguishable — the 200 {enabled:false}
    // trap. Liveness without disclosure.
    const status = lib.slice(lib.indexOf("export interface MatchingStatus"))
    const body = status.slice(0, status.indexOf("}"))
    expect(body).toMatch(/lastScanAt/)
    expect(body).toMatch(/nextScanAllowedAt/)
  })

  it("the scan still maintains the bucket in the database", () => {
    // Removing it from the recruiter's view must not stop the scan writing
    // it — operations still need to know a scan did something.
    expect(read("lib/matching/scan.ts")).toMatch(/matched_bucket/)
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

describe("the publish control is reachable", () => {
  const page = readFileSync(
    join(process.cwd(), "app/agencies/roles/[roleId]/page.tsx"),
    "utf8"
  )

  it("is not nested inside a step conditional", () => {
    // It was, and that made it unreachable: a role opens on its FURTHEST step
    // (candidates if any exist, else parse if requirements do), while the card
    // lived under step === "intake". So it rendered only in the one state
    // where it says "not yet" and vanished in every state where it could be
    // used — reported as "there's no button that lets me publish it".
    //
    // Publishing is one decision about the ROLE. This asserts the card sits
    // after every step block rather than inside one.
    const cardAt = page.indexOf('<span className="ag-card-title">Publish for Tailr matching')
    expect(cardAt).toBeGreaterThan(-1)

    const stepConditionals = [...page.matchAll(/step === "(\w+)"/g)].map((m) => m.index ?? 0)
    expect(stepConditionals.length).toBeGreaterThan(3)
    expect(Math.max(...stepConditionals)).toBeLessThan(cardAt)
  })

  it("still refuses to offer a button with no requirements", () => {
    const cardAt = page.indexOf('<span className="ag-card-title">Publish for Tailr matching')
    const card = page.slice(cardAt, cardAt + 4000)
    expect(card).toMatch(/requirements\.length === 0/)
    expect(card).toMatch(/Parse requirements first/)
  })
})

describe("the publish response describes the row, not the intention", () => {
  const lib = read("lib/agency/matching.ts")

  it("reads role_matching back before returning", () => {
    // It used to assert what the state ought to be: lastScanAt hardcoded null
    // and nextScanAllowedAt copied from the read taken BEFORE the write. The
    // card then claimed "the first scan runs shortly" after scans had run, and
    // showed a cooldown already spent — reported as the control being stale,
    // which it literally was.
    const finish = lib.slice(lib.indexOf("async function finishPublish"))
    const ret = finish.slice(finish.indexOf("return {"))
    expect(ret).not.toMatch(/lastScanAt: null,/)
    expect(finish).toMatch(/\.from\("role_matching"\)[\s\S]{0,200}last_scan_at/)
  })

  it("still reports whether a scan was queued from this request", () => {
    // That one IS about the intention — no row records it — so it stays local.
    const finish = lib.slice(lib.indexOf("async function finishPublish"))
    expect(finish).toMatch(/scanQueued: queuedJobId != null/)
  })
})

describe("the threshold is not one-way", () => {
  const scan = read("lib/matching/scan.ts")

  it("min_score is part of the skip key", () => {
    // No score is stored for someone who did not match, so the ONLY way to
    // reconsider them at a lower bar is to assess them again. A skip key of
    // (profile, requirements) alone said "already assessed" forever, and a
    // recruiter could raise the threshold but never lower it. Found by
    // lowering it on staging and watching nothing happen.
    const skip = scan.slice(scan.indexOf("skip-on-unchanged"), scan.indexOf("stage 1: the cheap slice"))
    expect(skip).toMatch(/mark\.profile_hash === hash/)
    expect(skip).toMatch(/mark\.requirements_hash === role\.requirements_hash/)
    expect(skip).toMatch(/mark\.min_score === role\.min_score/)
  })

  it("reads min_score back off the mark, or the comparison is always false", () => {
    const skip = scan.slice(scan.indexOf("skip-on-unchanged"), scan.indexOf("stage 1: the cheap slice"))
    expect(skip).toMatch(/\.select\("[^"]*min_score[^"]*"\)/)
  })

  it("writes it when marking, or nothing ever skips again", () => {
    expect(scan).toMatch(/min_score: role\.min_score/)
  })

  it("still stores no score for someone who did not match", () => {
    // The threshold is not the score. Adding min_score to the mark must not
    // become an excuse to store what the person actually scored.
    const markWrite = scan.slice(scan.indexOf('from("match_scan_marks").upsert'))
    const block = markWrite.slice(0, markWrite.indexOf("}"))
    expect(block).not.toMatch(/score\.overall/)
    expect(block).not.toMatch(/breakdown/)
  })
})
