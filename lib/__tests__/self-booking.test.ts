/**
 * Self-booking (11 Sep 2026, Ose: "candidates self-book, the recruiter just
 * has visibility"). Source scans, because the race and the disclosure are
 * both structural rather than arithmetical.
 *
 * This reverses §5.4/§5.5, where the recruiter booked rounds. What did NOT
 * change is the mechanism: the partial unique index on (slot_id) was always
 * what prevented double-booking, so moving the actor does not weaken it.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

describe("claiming a window", () => {
  const src = read("lib/agency/booking.ts")

  it("lets the database settle the race rather than checking first", () => {
    // Checking availability before writing narrows the window for a race,
    // never closes it. The claim writes and reads the constraint's answer.
    expect(src).toMatch(/\.is\("slot_id", null\)/)
    expect(src).toMatch(/code === "23505"\) return "taken"/)
  })

  it("only offers windows that obey the role's own rules", () => {
    const fn = src.slice(src.indexOf("async function listOpenWindows"))
    expect(fn).toMatch(/getInterviewSettings\(agencyId, roleId\)/)
    // Notice period, already held, revoked, and long enough for the interview.
    expect(fn).toMatch(/minNoticeHours/)
    expect(fn).toMatch(/\.is\("revoked_at", null\)/)
    expect(fn).toMatch(/held\.has/)
    expect(fn).toMatch(/>= duration/)
  })

  it("a window offered against another role is not on offer here", () => {
    const fn = src.slice(src.indexOf("async function listOpenWindows"))
    expect(fn).toMatch(/!s\.role_id \|\| s\.role_id === roleId/)
  })

  it("shows nothing to choose once a time is held, declined or cancelled", () => {
    expect(src).toMatch(/const needsChoice = state === "invited" && !round\.slot_id/)
  })

  it("still withholds the joining link until it is confirmed", () => {
    expect(src).toMatch(/meetingUrl: confirmed \?/)
  })

  it("audits the candidate as the actor, never a user", () => {
    const claim = src.slice(src.indexOf("export async function claimBookingSlot"))
    expect(claim).toMatch(/actorId: null/)
    expect(claim).toMatch(/action: "booking_self_booked"/)
  })
})

describe("the cohort", () => {
  const src = read("lib/agency/cohort.ts")

  it("creates the invitation as a round with no time on it", () => {
    expect(src).toMatch(/slot_id: null/)
    expect(src).toMatch(/scheduled_at: null/)
    expect(src).toMatch(/candidate_response: "pending"/)
  })

  it("derives the round number and never accepts one", () => {
    expect(src).toMatch(/const roundNumber = \(\(existing\?\.\[0\]\?\.round_number as number\) \?\? 0\) \+ 1/)
  })

  it("does not invite the same person twice", () => {
    expect(src).toMatch(/already invited/)
  })

  it("only touches candidates actually on the role", () => {
    expect(src).toMatch(/\.eq\("role_id", roleId\)[\s\S]{0,60}\.in\("ref", refs\)/)
  })
})

describe("the self-booking invitation", () => {
  const src = read("lib/agency/booking.ts")
  it("attaches no calendar file, because there is no time yet", () => {
    const fn = src.slice(src.indexOf("export async function sendSelfBookingInvite"))
    const body = fn.slice(0, fn.indexOf("export function selfBookingHtml"))
    expect(body).not.toMatch(/attachments/)
    expect(body).not.toMatch(/buildIcs/)
  })
  it("the fixed-time invitation still refuses without a time", () => {
    expect(src).toMatch(/if \(!round\?\.scheduled_at\) return \{ sent: false, reason: "no_time" \}/)
  })
})

describe("the doorway", () => {
  const src = read("app/booking/[token]/page.tsx")
  it("offers the open windows in the candidate's own timezone", () => {
    expect(src).toMatch(/booking\.needsChoice/)
    expect(src).toMatch(/toLocaleTimeString\(undefined,/)
  })
  it("says plainly when somebody was quicker", () => {
    expect(src).toMatch(/Somebody took that time a moment before you/)
  })
  it("keeps a way to say none of them work", () => {
    expect(src).toMatch(/None of these work/)
  })
})
