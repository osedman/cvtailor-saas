/**
 * Cross-wall notifications.
 *
 * Four properties are the whole point:
 *
 *   1. A notification never crosses to the wrong side. consent_answered going
 *      to a hiring manager would break the promise in the consent copy — the
 *      panel interviewing someone is never told what that person chose. The
 *      classification is enumerated here and checked EXHAUSTIVELY against the
 *      union in notify.ts, so a new event kind fails this file until somebody
 *      decides which side it faces. Same mechanism as
 *      audit-entity-types.test.ts, for the same reason: a comment saying "keep
 *      these in step" is advice, a test is enforcement.
 *   2. A notification carries a pointer, never the payload. No names, no
 *      bodies, no answers — email is forwarded to people who were never on
 *      the thread.
 *   3. The actor is never told about their own action.
 *   4. Nothing here throws. A failed notification must never fail the write
 *      it was attached to.
 *
 * The DB-shaped tests below use mocks, which on this codebase have twice
 * agreed with wrong code. They catch wiring regressions, not schema drift —
 * the grants and the real send are verified against the deployed database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"

type SendArgs = { to: string; subject: string; html: string }
const sendEmail = vi.hoisted(() =>
  vi.fn(async (_opts: { to: string; subject: string; html: string }) => ({
    sent: true as boolean,
    error: undefined as string | undefined,
  }))
)
const writeAudit = vi.hoisted(() =>
  vi.fn(async (_admin: unknown, _entry: Record<string, unknown>) => {})
)
const profilesResult = vi.hoisted(() => ({ current: [] as unknown[] }))

vi.mock("@/lib/email", () => ({ sendEmail }))
vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return { ...actual, writeAudit }
})
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "eq"]) chain[m] = () => chain
      // Honours the id filter. A mock that ignored it returned every member
      // for any query, which made "only the role's creator is mailed" pass
      // no matter what the code did.
      chain.in = (_col: string, ids: string[]) =>
        Promise.resolve({
          data: (profilesResult.current as Array<{ id: string }>).filter((r) => ids.includes(r.id)),
        })
      return chain
    },
  }),
}))

import { notify, facesClient, resolvePreference, type NotifyEvent } from "../agency/notify"

/** Every kind, and the side it is allowed to reach. */
const CLASSIFICATION: Record<NotifyEvent["kind"], "agency" | "client"> = {
  brief_filed: "agency",
  brief_answered: "client",
  invite_accepted: "agency",
  debrief_recorded: "agency",
  consent_answered: "agency",
  reference_submitted: "agency",
  booking_answered: "agency",
}

function unionKinds(): string[] {
  const src = readFileSync(join(process.cwd(), "lib/agency/notify.ts"), "utf8")
  const start = src.indexOf("export type NotifyEvent")
  const end = src.indexOf("export type NotifyInput", start)
  return [...src.slice(start, end).matchAll(/kind:\s*"([a-z_]+)"/g)].map((m) => m[1])
}

/** admin.from(table) → whatever this test wants that table to answer. */
function fakeAdmin(tables: Record<string, unknown>) {
  return {
    from: (name: string) => {
      const result = tables[name] ?? { data: null }
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "eq", "in", "is"]) chain[m] = () => chain
      chain.maybeSingle = () => Promise.resolve(result)
      chain.single = () => Promise.resolve(result)
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    },
  } as never
}

const MEMBERS = {
  data: [
    { user_id: "owner-1", role: "owner", status: "active" },
    { user_id: "rec-1", role: "recruiter", status: "active" },
    { user_id: "view-1", role: "viewer", status: "active" },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  sendEmail.mockResolvedValue({ sent: true, error: undefined })
  profilesResult.current = [
    { id: "owner-1", full_name: "Owner One", email: "owner@agency.test" },
    { id: "rec-1", full_name: "Rec One", email: "rec@agency.test" },
    { id: "view-1", full_name: "View One", email: "view@agency.test" },
  ]
})

describe("which side of the wall", () => {
  it("classifies every kind in the union — a new event must be decided", () => {
    const kinds = unionKinds()
    expect(kinds.length).toBeGreaterThan(0)
    const undeclared = kinds.filter((k) => !(k in CLASSIFICATION))
    expect(
      undeclared,
      `notify.ts has kinds this test does not classify: ${undeclared.join(", ")} — decide which side of the wall each faces`
    ).toEqual([])
  })

  it("agrees with facesClient for every kind", () => {
    for (const [kind, side] of Object.entries(CLASSIFICATION)) {
      expect(facesClient(kind as NotifyEvent["kind"]), `${kind}`).toBe(side === "client")
    }
  })

  it("the consent answer NEVER faces the client — the promise in the copy", () => {
    expect(facesClient("consent_answered")).toBe(false)
  })
})

describe("recipients", () => {
  it("the role's OWNER beats its creator — ownership is the relationship", async () => {
    const admin = fakeAdmin({
      job_roles: { data: { owner_id: "rec-1", created_by: "owner-1" } },
      members: MEMBERS,
    })
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("sent")
    expect(sendEmail.mock.calls.map((c) => (c[0] as SendArgs).to)).toEqual(["rec@agency.test"])
  })

  it("prefers the role's creator over the rest of the agency", async () => {
    const admin = fakeAdmin({ job_roles: { data: { created_by: "rec-1" } }, members: MEMBERS })
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("sent")
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail.mock.calls[0]![0] as SendArgs).to).toBe("rec@agency.test")
  })

  it("falls back to owners when created_by is null — an unheard event is the bug", async () => {
    const admin = fakeAdmin({ job_roles: { data: { created_by: null } }, members: MEMBERS })
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("sent")
    expect(sendEmail.mock.calls.map((c) => (c[0] as SendArgs).to)).toEqual(["owner@agency.test"])
  })

  it("never mails a viewer — they cannot act on it", async () => {
    const admin = fakeAdmin({ job_roles: { data: { created_by: "view-1" } }, members: MEMBERS })
    await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    const recipients = sendEmail.mock.calls.map((c) => (c[0] as SendArgs).to)
    expect(recipients).not.toContain("view@agency.test")
  })

  it("does not tell the actor about their own action", async () => {
    const admin = fakeAdmin({ job_roles: { data: { created_by: "rec-1" } }, members: MEMBERS })
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "rec-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("skipped_actor")
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("a client event reaches only that contact", async () => {
    const admin = fakeAdmin({
      client_contacts: { data: { email: "hm@client.test", full_name: "Dana Hall", agency_id: "a1" } },
    })
    const out = await notify(admin, {
      kind: "brief_answered",
      agencyId: "a1",
      actorId: "rec-1",
      contactId: "c1",
      roleTitle: "Senior Engineer",
      accepted: true,
    })
    expect(out).toBe("sent")
    expect(sendEmail.mock.calls.map((c) => (c[0] as SendArgs).to)).toEqual(["hm@client.test"])
  })
})

describe("what the email says", () => {
  it("points at the app rather than carrying the answer", async () => {
    const admin = fakeAdmin({ job_roles: { data: { created_by: "rec-1" } }, members: MEMBERS })
    await notify(admin, {
      kind: "consent_answered",
      agencyId: "a1",
      actorId: null,
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    const html = (sendEmail.mock.calls[0]![0] as SendArgs).html
    // The ref is a pointer the agency already uses in its audit log.
    expect(html).toContain("CAN-02")
    // The decision itself is not in the inbox.
    expect(html.toLowerCase()).not.toContain("consented")
    expect(html.toLowerCase()).not.toContain("declined")
  })

  it("escapes a role title rather than rendering it as markup", async () => {
    const admin = fakeAdmin({
      client_contacts: { data: { email: "hm@client.test", full_name: "Dana", agency_id: "a1" } },
    })
    await notify(admin, {
      kind: "brief_answered",
      agencyId: "a1",
      actorId: "rec-1",
      contactId: "c1",
      roleTitle: '<img src=x onerror="alert(1)">',
      accepted: false,
    })
    const html = (sendEmail.mock.calls[0]![0] as SendArgs).html
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img")
  })
})

describe("failure is never the caller's problem", () => {
  it("returns failed rather than throwing when the send fails", async () => {
    sendEmail.mockResolvedValue({ sent: false, error: "Resend 500" })
    const admin = fakeAdmin({ job_roles: { data: { created_by: "rec-1" } }, members: MEMBERS })
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("failed")
  })

  it("returns failed rather than throwing when the database blows up", async () => {
    const admin = { from: () => { throw new Error("connection reset") } } as never
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("failed")
  })

  it("says so when there is nobody to tell", async () => {
    const admin = fakeAdmin({ job_roles: { data: { created_by: null } }, members: { data: [] } })
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("skipped_no_recipient")
  })

  it("audits every outcome, including the ones that sent nothing", async () => {
    const admin = fakeAdmin({ job_roles: { data: { created_by: null } }, members: { data: [] } })
    await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(writeAudit).toHaveBeenCalledTimes(1)
    const entry = writeAudit.mock.calls[0]![1]
    expect(entry.entityType).toBe("notification")
    // The event kind, never its content.
    expect(entry.entityRef).toBe("debrief_recorded")
    expect(entry.action).toBe("skipped_no_recipient")
  })
})


describe("preference resolution (pure — no mocks, so it cannot agree with wrong code)", () => {
  const AG = (enabled: boolean) => ({ user_id: null, enabled })
  const ME = (enabled: boolean) => ({ user_id: "rec-1", enabled })
  const SOMEONE_ELSE = (enabled: boolean) => ({ user_id: "rec-2", enabled })

  it("absent means ON — an unheard event is the problem this exists to solve", () => {
    expect(resolvePreference([], "rec-1")).toBe(true)
  })

  it("the agency default applies when the person has not chosen", () => {
    expect(resolvePreference([AG(false)], "rec-1")).toBe(false)
    expect(resolvePreference([AG(true)], "rec-1")).toBe(true)
  })

  it("a personal choice beats the agency default, in BOTH directions", () => {
    // The direction that matters most: an owner cannot silence a colleague.
    expect(resolvePreference([AG(false), ME(true)], "rec-1")).toBe(true)
    expect(resolvePreference([AG(true), ME(false)], "rec-1")).toBe(false)
  })

  it("somebody else's override is not mine", () => {
    expect(resolvePreference([AG(true), SOMEONE_ELSE(false)], "rec-1")).toBe(true)
    expect(resolvePreference([AG(false), SOMEONE_ELSE(true)], "rec-1")).toBe(false)
  })

  it("falls to the agency default when there is no person to resolve for", () => {
    expect(resolvePreference([AG(false)], null)).toBe(false)
    expect(resolvePreference([AG(false), ME(true)], null)).toBe(false)
  })
})

describe("preferences, applied", () => {
  it("does not send to somebody who switched it off", async () => {
    const admin = fakeAdmin({
      job_roles: { data: { created_by: "rec-1" } },
      members: MEMBERS,
      notification_prefs: { data: [{ user_id: "rec-1", enabled: false }] },
    })
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("skipped_disabled")
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("still sends when the agency default is off but the person opted back in", async () => {
    const admin = fakeAdmin({
      job_roles: { data: { created_by: "rec-1" } },
      members: MEMBERS,
      notification_prefs: {
        data: [
          { user_id: null, enabled: false },
          { user_id: "rec-1", enabled: true },
        ],
      },
    })
    const out = await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    expect(out).toBe("sent")
    expect((sendEmail.mock.calls[0]![0] as SendArgs).to).toBe("rec@agency.test")
  })

  it("records how many were silenced, so a quiet event is still legible", async () => {
    const admin = fakeAdmin({
      job_roles: { data: { created_by: "rec-1" } },
      members: MEMBERS,
      notification_prefs: { data: [{ user_id: "rec-1", enabled: false }] },
    })
    await notify(admin, {
      kind: "debrief_recorded",
      agencyId: "a1",
      actorId: "hm-1",
      roleId: "role-1",
      candidateRef: "CAN-02",
    })
    const entry = writeAudit.mock.calls[0]![1]
    expect(entry.action).toBe("skipped_disabled")
    expect(entry.toValue).toMatchObject({ of: 1 })
  })

  it("a client-facing notification ignores preferences entirely", async () => {
    // brief_answered is a message to somebody's client about their own brief.
    // If this ever consulted the table it would be letting a recruiter mute
    // their client's reply.
    let prefsQueried = false
    const base = fakeAdmin({
      client_contacts: { data: { email: "hm@client.test", full_name: "Dana", agency_id: "a1" } },
    })
    const admin = {
      from: (name: string) => {
        if (name === "notification_prefs") prefsQueried = true
        return (base as unknown as { from: (n: string) => unknown }).from(name)
      },
    } as never

    const out = await notify(admin, {
      kind: "brief_answered",
      agencyId: "a1",
      actorId: "rec-1",
      contactId: "c1",
      roleTitle: "Staff Platform Engineer",
      accepted: true,
    })
    expect(out).toBe("sent")
    expect(prefsQueried, "brief_answered must never consult the preference table").toBe(false)
  })
})

describe("migration 29 and the event list stay in step", () => {
  it("the preference table stores every agency-bound kind and NOT the client one", () => {
    // The NEWEST migration that defines this constraint, not a named file: it
    // was rebuilt in migration 31 to add booking_answered, and a hardcoded
    // filename would have kept asserting against the stale list while the
    // deployed one moved on. Exactly the trap audit-entity-types.test.ts was
    // written to close.
    const dir = join(process.cwd(), "supabase/migrations")
    const file = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => readFileSync(join(dir, f), "utf8").includes("event_kind in ("))
      .sort()
      .pop()
    expect(file, "no migration defines the event_kind list").toBeTruthy()
    const sql = readFileSync(join(dir, file!), "utf8")
    const body = sql.slice(sql.lastIndexOf("event_kind in ("))
    const constraint = body.slice(0, body.indexOf("))"))

    for (const kind of unionKinds()) {
      if (facesClient(kind as NotifyEvent["kind"])) {
        expect(constraint, `${kind} faces the client and must not be storable as a preference`)
          .not.toContain(`'${kind}'`)
      } else {
        expect(constraint, `${kind} is agency-bound and must be switchable`)
          .toContain(`'${kind}'`)
      }
    }
  })
})
