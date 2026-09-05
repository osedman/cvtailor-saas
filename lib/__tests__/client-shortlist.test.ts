/**
 * Submission starts the interview workflow: the client's shortlist in their
 * workspace, their decisions written as the portal writes them, and windows
 * offered in a batch that goes through offerSlot. Source scans pin the
 * disclosure and attribution lines; the window maths has its own tests.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

describe("the client's shortlist", () => {
  const src = read("lib/agency/client-shortlist.ts")

  it("reads only a submission addressed to one of the caller's own contacts, and never a revoked one", () => {
    expect(src).toMatch(/from\("submission_recipients"\)[\s\S]{0,300}\.in\("contact_id", contactIds\)[\s\S]{0,60}\.is\("revoked_at", null\)/)
    expect(src).toMatch(/ctx\.links\.find\(\(l\) => l\.contactId === r\.contact_id && l\.agencyId === r\.agency_id\)/)
  })

  it("writes decisions against the recipient row, audit coupled, exactly as the portal does", () => {
    expect(src).toMatch(/from\("client_actions"\)\.insert\(\{[\s\S]{0,200}recipient_id: shortlist\.recipientId/)
    expect(src).toMatch(/writeAudit\(admin, \{[\s\S]{0,200}action: `client_\$\{d\.action\}`/)
  })

  it("never overwrites a decision already taken", () => {
    expect(src).toMatch(/if \(entry\.action\) \{\s*skipped\.push\(d\.ref\)/)
  })

  it("only interview and decline reach the table — a decline is a signal, never a removal", () => {
    expect(src).toMatch(/d\.action !== "interview" && d\.action !== "decline"/)
    expect(src).not.toMatch(/\.delete\(\)/)
    expect(src).not.toMatch(/from\("candidates"\)\.update/)
  })

  it("offers windows one by one through offerSlot, so the batch has every validation the single path has", () => {
    expect(src).toMatch(/offerSlot\(ctx, \{ contactId, startsAt: w\.start, endsAt: w\.end, roleId \}\)/)
    expect(src).not.toMatch(/from\("availability_slots"\)/)
  })
})

describe("the routes", () => {
  it("the shortlist route strips the ids the client has no use for", () => {
    const src = read("app/api/hiring/roles/[roleId]/shortlist/route.ts")
    expect(src).toMatch(/const \{ agencyId, contactId, recipientId, submissionId, \.\.\.rest \} = shortlist/)
    expect(src).toMatch(/NextResponse\.json\(\{ shortlist: rest \}\)/)
  })
  it("the decisions route accepts only interview and decline, capped", () => {
    const src = read("app/api/hiring/roles/[roleId]/decisions/route.ts")
    expect(src).toMatch(/d\.action === "interview" \|\| d\.action === "decline"/)
    expect(src).toMatch(/\.slice\(0, 50\)/)
  })
  it("the windows route goes through the batch, not the table", () => {
    const src = read("app/api/hiring/roles/[roleId]/windows/route.ts")
    expect(src).toMatch(/offerWindows\(auth\.ctx, roleId, windows\)/)
  })
})

describe("the calendar", () => {
  it("tokens are sealed at rest and the key is required, never optional", () => {
    const src = read("lib/calendar/tokens.ts")
    expect(src).toMatch(/aes-256-gcm/)
    expect(src).toMatch(/buf\.length !== 32/)
  })
  it("providers read busy time only", () => {
    const src = read("lib/calendar/providers.ts")
    expect(src).toMatch(/calendar\.readonly/)
    expect(src).toMatch(/Calendars\.Read/)
    expect(src).toMatch(/\$select: "start,end,showAs"/)
    // No event content in either request: Google freeBusy has none to give; the Graph select is pinned above.
    expect(src).not.toMatch(/attendees|bodyPreview|"subject"/)
  })
  it("the busy route caps the horizon", () => {
    const src = read("app/api/hiring/calendar/busy/route.ts")
    expect(src).toMatch(/MAX_DAYS = 31/)
  })
  it("the callback verifies the nonce and the signed-in user before exchanging the code", () => {
    const src = read("app/api/hiring/calendar/callback/[provider]/route.ts")
    const nonceAt = src.indexOf("nonce !== state.n")
    const userAt = src.indexOf("auth.ctx.userId !== state.u")
    const exchangeAt = src.indexOf(".exchange(code)")
    expect(nonceAt).toBeGreaterThan(-1)
    expect(userAt).toBeGreaterThan(nonceAt)
    expect(exchangeAt).toBeGreaterThan(userAt)
  })
  it("the connections table has no authenticated grants", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260905090000_calendar_connections.sql"), "utf8")
    expect(sql).toMatch(/revoke all on public\.calendar_connections from anon, authenticated/)
    expect(sql).toMatch(/enable row level security/)
    expect(sql).not.toMatch(/create policy/)
  })
})

describe("the ladder names the task", () => {
  const src = read("lib/agency/next-action.ts")
  it("after submission the client's one task is to choose who to interview, on the setup screen", () => {
    expect(src).toMatch(/Choose who to interview/)
    expect(src).toMatch(/clientSetup = `\/hiring\/roles\/\$\{roleId\}\/interviews`/)
  })
  it("the recruiter's chip says the role is ready for interviews", () => {
    expect(src).toMatch(/READY FOR INTERVIEWS · WITH THE CLIENT/)
  })
})
