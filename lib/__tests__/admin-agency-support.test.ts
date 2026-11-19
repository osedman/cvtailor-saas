/**
 * Admin area, rest of Phase 1 (14 Nov 2026): client (hiring-manager) access
 * and background jobs that need attention.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { JOB_STALE_MINUTES, isClientAccessAction, isJobAction, jobAttention } from "@/lib/admin-agencies"
import { describeActivity } from "@/lib/admin-activity-text"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => readFileSync(join(__dirname, "../..", p), "utf-8")
const NOW = Date.parse("2026-11-14T12:00:00Z")
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()
const job = (kind: string, status: string, createdMin: number, startedMin: number | null = null) =>
  jobAttention({ kind, status, createdAt: ago(createdMin), startedAt: startedMin === null ? null : ago(startedMin) }, NOW)

describe("which jobs need attention, and what may be done", () => {
  it("a job that is simply in progress is left alone", () => {
    expect(job("match_scan", "queued", JOB_STALE_MINUTES - 1)).toBeNull()
    expect(job("cv_parse", "running", 5, 5)).toBeNull()
    expect(job("transcribe", "running", 600, JOB_STALE_MINUTES - 1)).toBeNull()
    expect(job("score", "succeeded", 600, 600)).toBeNull()
  })

  it("a queue job waiting too long can be run now", () => {
    expect(job("match_scan", "queued", JOB_STALE_MINUTES)).toEqual({ state: "waiting", actions: ["run"] })
    expect(job("transcribe", "queued", 900)).toEqual({ state: "waiting", actions: ["run"] })
  })

  it("a queue job that stopped responding can be run again or marked failed", () => {
    expect(job("match_scan", "running", 60, 60)).toEqual({ state: "stuck", actions: ["run", "mark_failed"] })
    expect(job("transcribe", "running", 60, 60)).toEqual({ state: "stuck", actions: ["run", "mark_failed"] })
  })

  it("a read or scoring job that stopped responding can only be marked failed", () => {
    for (const kind of ["jd_parse", "cv_parse", "score"]) {
      expect(job(kind, "running", 60, 60)).toEqual({ state: "stuck", actions: ["mark_failed"] })
    }
  })

  it("staleness of a running job is measured from when it started, not when it was queued", () => {
    expect(job("match_scan", "running", 1000, 2)).toBeNull()
  })

  it("only a failed match scan can be run again from here", () => {
    expect(job("match_scan", "failed", 60, 60)).toEqual({ state: "failed", actions: ["run"] })
    // A failed transcription is re-requested by the recruiter, which re-checks
    // that consented audio still exists. Never rerun from the admin area.
    expect(job("transcribe", "failed", 60, 60)).toEqual({ state: "failed", actions: [] })
    expect(job("cv_parse", "failed", 60, 60)).toEqual({ state: "failed", actions: [] })
  })

  it("only the two known actions are actions", () => {
    expect(isJobAction("run")).toBe(true)
    expect(isJobAction("mark_failed")).toBe(true)
    expect(isJobAction("delete")).toBe(false)
    expect(isClientAccessAction("resend_invite")).toBe(true)
    expect(isClientAccessAction("unlink")).toBe(true)
    expect(isClientAccessAction("link")).toBe(false)
  })
})

describe("the jobs route", () => {
  const src = read("app/api/admin/agencies/[id]/jobs/route.ts")
  const code = tsCode(src)

  it("reading is support; changing needs two-step", () => {
    expect(src).toContain('requireAdmin("support")')
    expect(src).toContain('requireAdmin("support", { twoStep: true })')
  })

  it("never sends the error detail, which can quote the document", () => {
    expect(code).not.toMatch(/select\([^)]*error_detail/)
    expect(code).not.toMatch(/errorDetail/)
  })

  it("a job is looked up inside the agency in the URL", () => {
    expect(code).toMatch(/\.eq\("id", jobId\)\s*\.eq\("agency_id", id\)/)
  })

  it("re-checks what is allowed on the server, with the same rule the list uses", () => {
    expect(code).toContain("allowed.actions.includes(action)")
  })

  it("every state change is guarded by the state the admin saw", () => {
    expect(code.match(/\.eq\("status", row\.status\)/g)?.length).toBe(2)
  })

  it("runs through the cron's own runners, after the response", () => {
    expect(code).toContain("after(async () => {")
    expect(code).toContain("runTranscription(row.id)")
    expect(code).toContain("runMatchScan(row.role_id, row.id)")
  })

  it("never deletes a job", () => {
    expect(code).not.toMatch(/\.delete\(/)
  })
})

describe("the client-access route", () => {
  const src = read("app/api/admin/agencies/[id]/clients/route.ts")
  const code = tsCode(src)

  it("reading is support; changing needs two-step", () => {
    expect(src).toContain('requireAdmin("support")')
    expect(src).toContain('requireAdmin("support", { twoStep: true })')
  })

  it("uses the recruiter's own functions, marked as a support action", () => {
    expect(code).toContain("createClientInvite(ctx, contactId, { reason })")
    expect(code).toContain("unlinkClientContact(ctx, contactId, { reason })")
  })

  it("cannot link a person: invite acceptance stays the only way in", () => {
    expect(code).not.toMatch(/user_id:/)
    expect(code).not.toMatch(/acceptInvite|\.update\(|\.insert\(/)
  })

  it("never returns the invite link or token", () => {
    const post = code.slice(code.indexOf("async function POST_handler"))
    expect(post).not.toMatch(/json\([^)]*rawToken/)
    expect(post).not.toMatch(/json\(\s*\{[^}]*\burl\b/)
  })

  it("checks the contact belongs to the agency in the URL", () => {
    expect(code).toMatch(/\.eq\("id", contactId\)\.eq\("agency_id", id\)/)
  })

  it("keeps the recruiter route's per-contact resend limit, before minting", () => {
    expect(code).toContain("checkRateLimit(anonRateLimitId(`client-invite:${contactId}`), \"auth\")")
    expect(code.indexOf("checkRateLimit(")).toBeLessThan(code.indexOf("createClientInvite("))
  })

  it("logs to the admin activity log after each action", () => {
    expect(code.match(/logAgencyAdminAction\(/g)?.length).toBe(2)
  })
})

describe("support actions in the agency's own audit log", () => {
  const src = read("lib/agency/client-auth.ts")

  it("carry no actor and say Tailr support", () => {
    expect(src).toContain("support ? { actorId: null, reason: `Tailr support: ${support.reason.trim()}` } : { actorId: ctx.userId }")
  })

  it("a recruiter's own invite and unlink are unchanged by default", () => {
    expect(src).toContain('reason: support ? "Tailr support: superseded by a new invite" : "superseded_by_reinvite"')
    expect(src).toMatch(/export async function createClientInvite\(\s*ctx: AgencyContext,\s*contactId: string,\s*support\?: SupportAction/)
  })
})

describe("activity wording", () => {
  const base = { area: "agencies", actorName: "Amara Okoye", targetName: "Halcyon Search", from: null }

  it("reads as a sentence for client access and jobs", () => {
    expect(describeActivity({ ...base, action: "client_invite_resent", to: { company: "Meridian Health", emailed: true } }))
      .toBe("Amara Okoye sent a new client invite for Meridian Health at Halcyon Search")
    expect(describeActivity({ ...base, action: "client_access_removed", to: { company: "Meridian Health" } }))
      .toBe("Amara Okoye removed client access for Meridian Health at Halcyon Search")
    expect(describeActivity({ ...base, action: "job_rerun", to: { kind: "match_scan", status: "queued" } }))
      .toBe("Amara Okoye ran a match scan again at Halcyon Search")
    expect(describeActivity({ ...base, action: "job_marked_failed", to: { kind: "cv_parse", status: "failed" } }))
      .toBe("Amara Okoye marked a stuck CV read as failed at Halcyon Search")
  })
})

describe("the screen sections", () => {
  const src = read("components/admin/agency-support-sections.tsx")

  it("are on the agency page", () => {
    const page = read("app/admin/agencies/[id]/page.tsx")
    expect(page).toContain("<ClientAccessSection agencyId={id} canWrite={canWrite} />")
    expect(page).toContain("<JobsSection agencyId={id} canWrite={canWrite} />")
  })

  it("every change sends a reason and is off without two-step", () => {
    expect(src).toContain("action: pending.action, reason })")
    expect(src.match(/disabled=\{!canWrite \|\| busy\}/g)?.length).toBe(4)
  })

  it("does not claim a rerun finished, or an email went, when it is not known", () => {
    expect(src).toContain("refresh this list to see whether it finished")
    expect(src).toContain("the email was not sent")
  })

  it("uses no mono", () => {
    expect(src).not.toMatch(/font-mono|monospace/)
  })
})
