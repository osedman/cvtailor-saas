/**
 * Waves, scheduled reminders and rescheduling (11 Sep 2026).
 *
 * The three have one thing in common: each could quietly do the wrong thing
 * at scale — invite people into a room with no chairs, mail somebody every
 * hour, or leave a candidate holding nothing. The pure parts are tested as
 * arithmetic; the rest is pinned where the safety actually lives.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode, sqlCode } from "./helpers/source-scan"
import { RELEASE_SENTENCE, planRelease } from "../agency/waves"
import { proposeWindows } from "../calendar/windows"
import { NUDGE_EVERY_HOURS, PRE_REMINDER_HOURS, dueForNudge, dueForPreReminder } from "../agency/interview-reminders"
import { CHASE_AFTER_HOURS } from "../agency/cohort-status"
import { normalise } from "../agency/interview-rules"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const sql = sqlCode(readFileSync(join(process.cwd(), "supabase/migrations/20260911100000_waves_reminders_reschedule.sql"), "utf8"))

describe("planning a wave", () => {
  const base = { reserveSize: 10, awaiting: 0, openWindows: 10, waveSize: 5, waveStillRunning: false }

  it("sends the wave when there is room for it", () => {
    expect(planRelease(base)).toEqual({ release: 5, reason: "wave_full", remaining: 5 })
  })

  it("never invites more people than there are free windows", () => {
    // The whole point: twenty racing for eight is the thing being prevented.
    const p = planRelease({ ...base, openWindows: 3 })
    expect(p.release).toBe(3)
    expect(p.reason).toBe("capacity_capped")
  })

  it("counts people already choosing as holding a window", () => {
    // Four invited and still deciding against six windows leaves two free.
    const p = planRelease({ ...base, awaiting: 4, openWindows: 6, waveStillRunning: false })
    expect(p.release).toBe(2)
  })

  it("waits while a wave is still running, unless nobody is choosing", () => {
    expect(planRelease({ ...base, awaiting: 2, waveStillRunning: true }).reason).toBe("wave_still_running")
    // Nobody left choosing means the wave is effectively over.
    expect(planRelease({ ...base, awaiting: 0, waveStillRunning: true }).release).toBe(5)
  })

  it("with no wave size, sends everyone capacity allows", () => {
    expect(planRelease({ ...base, waveSize: null }).release).toBe(10)
    expect(planRelease({ ...base, waveSize: null, openWindows: 4 }).release).toBe(4)
  })

  it("says nothing rather than inventing a release", () => {
    expect(planRelease({ ...base, reserveSize: 0 }).reason).toBe("nothing_in_reserve")
    expect(planRelease({ ...base, openWindows: 0 }).reason).toBe("no_capacity")
  })

  it("every reason has a sentence a person can read", () => {
    for (const [reason, sentence] of Object.entries(RELEASE_SENTENCE)) {
      expect(sentence.length, reason).toBeGreaterThan(10)
    }
  })
})

describe("waves in the product", () => {
  it("wave one is not a special case — the first invitation is a release", () => {
    expect(read("app/hiring/roles/[roleId]/interviews/page.tsx")).toMatch(/JSON\.stringify\(\{ release: true \}\)/)
  })

  it("hold is never auto-released: the reserve is only the interviewed", () => {
    const src = read("lib/agency/waves.ts")
    expect(src).toMatch(/\.eq\("action", "interview"\)/)
    expect(src).not.toMatch(/\.eq\("action", "hold"\)/)
  })

  it("the recruiter can see a wave but not release one", () => {
    const src = read("app/api/agency/roles/[roleId]/cohort/route.ts")
    expect(src).toMatch(/getWaveState/)
    expect(src).not.toMatch(/releaseWave/)
  })

  it("the wave number is derived, never supplied", () => {
    expect(read("lib/agency/cohort.ts")).toMatch(/const wave = \(\(waves\?\.\[0\]\?\.wave as number\) \?\? 0\) \+ 1/)
  })
})

describe("reminders", () => {
  const NOW = new Date("2030-04-10T12:00:00Z")
  const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
  const ahead = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: "r", agency_id: "a", role_id: "ro", candidate_id: "c", contact_id: "ct",
      slot_id: null, scheduled_at: null, duration_minutes: 45, meeting_url: "",
      status: "scheduled", candidate_response: "pending",
      created_at: ago(CHASE_AFTER_HOURS + 1), last_reminded_at: null, pre_reminded_at: null,
      ...over,
    }) as Parameters<typeof dueForNudge>[0]

  it("nudges only somebody invited, still choosing, and quiet long enough", () => {
    expect(dueForNudge(row(), NOW)).toBe(true)
    expect(dueForNudge(row({ created_at: ago(1) }), NOW)).toBe(false)
    expect(dueForNudge(row({ slot_id: "s" }), NOW)).toBe(false)
    expect(dueForNudge(row({ status: "cancelled" }), NOW)).toBe(false)
  })

  it("measures quiet from the LAST contact, so nudges cannot stack up", () => {
    // Invited long ago but nudged an hour ago: not due again.
    expect(dueForNudge(row({ created_at: ago(500), last_reminded_at: ago(1) }), NOW)).toBe(false)
    expect(dueForNudge(row({ created_at: ago(500), last_reminded_at: ago(NUDGE_EVERY_HOURS + 1) }), NOW)).toBe(true)
  })

  it("reminds before a booked interview, once", () => {
    const booked = { slot_id: "s", candidate_response: "confirmed", scheduled_at: ahead(PRE_REMINDER_HOURS - 2) }
    expect(dueForPreReminder(row(booked), NOW)).toBe(true)
    expect(dueForPreReminder(row({ ...booked, pre_reminded_at: ago(1) }), NOW)).toBe(false)
    // Too far out, and already past, are both "not now".
    expect(dueForPreReminder(row({ ...booked, scheduled_at: ahead(PRE_REMINDER_HOURS + 10) }), NOW)).toBe(false)
    expect(dueForPreReminder(row({ ...booked, scheduled_at: ago(1) }), NOW)).toBe(false)
  })

  it("stamps the round so a job that runs hourly cannot mail hourly", () => {
    const src = read("lib/agency/interview-reminders.ts")
    expect(src).toMatch(/update\(\{ last_reminded_at: now\.toISOString\(\) \}\)/)
    expect(src).toMatch(/update\(\{ pre_reminded_at: now\.toISOString\(\) \}\)/)
  })

  it("one bad address does not stop the rest", () => {
    expect(read("lib/agency/interview-reminders.ts")).toMatch(/catch \{[\s\S]{0,120}run\.skipped \+= 1/)
  })
})

describe("rescheduling", () => {
  it("takes the new window before letting the old one go", () => {
    // The other order can leave a candidate holding nothing at all.
    const src = read("lib/agency/booking.ts")
    const fn = src.slice(src.indexOf("export async function rescheduleBooking"))
    const update = fn.indexOf("slot_id: slotId")
    const guard = fn.indexOf('.eq("slot_id", previousSlot)')
    expect(update).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(update)
  })

  it("counts the moves, so a limit is provable after the fact", () => {
    expect(read("lib/agency/booking.ts")).toMatch(/rescheduled_count: \(\(round\.rescheduled_count as number\) \?\? 0\) \+ 1/)
    expect(sql).toMatch(/rescheduled_count\s+smallint not null default 0/)
  })

  it("every refusal tells the candidate what to do instead", () => {
    // "You cannot" with no explanation is what makes somebody email a
    // recruiter. Each refusal names the next step; only the case where
    // there is nothing to move at all stays silent.
    const fn = (() => {
      const src = read("lib/agency/booking.ts")
      return src.slice(src.indexOf("async function mayReschedule"), src.indexOf("export type RescheduleOutcome"))
    })()
    for (const reason of [
      "cannot be moved online",
      "already moved this interview",
      "too close to the interview",
    ]) {
      expect(fn, reason).toContain(reason)
    }
    // Each of those points somewhere.
    expect((fn.match(/recruiter/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it("honours the notice the candidate was promised", () => {
    expect(read("lib/agency/booking.ts")).toMatch(/settings\.minNoticeHours \* 3_600_000/)
  })
})

describe("the joining link", () => {
  it("passes through a link the client gave, and never invents one", () => {
    // Tailr's calendar consent is read-only, so it cannot mint a Meet or
    // Teams link; a standing link the client pasted is carried instead.
    const src = read("lib/agency/booking.ts")
    expect(src).toMatch(/export function joiningLink/)
    expect(src).toMatch(/\^https:\\\/\\\/\\S\+\$/)
    expect(src).not.toMatch(/meet\.google\.com\/new|teams\.microsoft\.com\/l\/meetup/)
  })
})

describe("the settings", () => {
  it("null wave size survives — it means 'everyone at once'", () => {
    expect(normalise({ waveSize: null }).waveSize).toBeNull()
    expect(normalise({}).waveSize).toBeNull()
    expect(normalise({ waveSize: 99 }).waveSize).toBe(50)
  })
  it("bounds match the migration's checks", () => {
    expect(sql).toMatch(/wave_size is null or wave_size between 1 and 50/)
    expect(sql).toMatch(/wave_release_hours between 1 and 336/)
    expect(sql).toMatch(/reschedule_limit between 0 and 10/)
  })
})

/**
 * The notice period is one setting, and every surface has to read it.
 *
 * 20 Sep 2026: a hiring manager offered tomorrow-morning windows under a
 * 24-hour notice rule and the candidate's booking page showed nothing. Both
 * ends were correct on their own — `listOpenWindows` filters on
 * `starts_at > now + minNotice` — but the PROPOSER did not know about the
 * setting, so it suggested windows that were unbookable the moment they were
 * written, and no screen said why.
 */
describe("proposing windows respects the candidate's notice", () => {
  const base = {
    candidates: 2,
    durationMinutes: 45,
    bufferMinutes: 15,
    busy: [],
    days: 10,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    workingHours: { start: 0, end: 23 },
  }

  it("proposes nothing inside the notice period", () => {
    const noticeHours = 24
    const p = proposeWindows({ ...base, from: new Date(), minNoticeMinutes: noticeHours * 60 })
    const earliest = Date.now() + noticeHours * 3_600_000
    expect(p.windows.length).toBeGreaterThan(0)
    for (const w of p.windows) {
      expect(Date.parse(w.start)).toBeGreaterThan(earliest)
    }
  })

  it("still proposes soon when there is no minimum — the testing path", () => {
    // "No minimum" is a real setting, and the only way to book a window today.
    const p = proposeWindows({ ...base, from: new Date(), minNoticeMinutes: 0 })
    const soonest = Math.min(...p.windows.map((w) => Date.parse(w.start)))
    expect(soonest).toBeLessThan(Date.now() + 24 * 3_600_000)
  })

  it("defaults to no notice when the caller does not say", () => {
    // Back-compatible: an omitted setting must not silently start filtering.
    const p = proposeWindows({ ...base, from: new Date() })
    expect(p.windows.length).toBeGreaterThan(0)
  })
})

describe("offering windows refuses the unbookable ones", () => {
  const src = read("lib/agency/client-shortlist.ts")

  it("filters the batch against the notice period", () => {
    expect(src).toContain("minNoticeHours")
    expect(src).toContain("const bookable = windows.filter")
  })

  it("explains it in terms of the setting, not as a failure", () => {
    const raw = readFileSync(join(process.cwd(), "lib/agency/client-shortlist.ts"), "utf8")
    expect(raw).toMatch(/notice your candidates get/)
    expect(raw).toMatch(/lower the notice period/)
  })

  it("refuses in the client batch, not in the shared primitive", () => {
    // offerSlot is also the recruiter's, and they may seat somebody at short
    // notice deliberately — so the REFUSAL must not live in it.
    //
    // rounds.ts does read minNoticeHours, in listOpenSlots, to LABEL a slot
    // as too soon. That is the same setting used to describe rather than to
    // forbid, and it is correct; the first version of this assertion banned
    // the whole file and failed on it.
    const rounds = read("lib/agency/rounds.ts")
    const start = rounds.indexOf("export async function offerSlot")
    expect(start).toBeGreaterThan(-1)
    const body = rounds.slice(start, rounds.indexOf("export async function", start + 10))
    expect(body).not.toContain("minNoticeHours")
  })
})
