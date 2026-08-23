/**
 * Closing the loop.
 *
 * The decision under test is WHO: only people the loop was opened with —
 * their considered-notice was sent, or they were interviewed. A suppressed
 * candidate has never heard from Tailr about this role, and a closure email
 * would be the first contact, worse than none. The placed candidate's news
 * arrived differently. And the stamp makes it idempotent: close, reopen,
 * close again emails nobody twice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = Record<string, unknown>
const store = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  updates: [] as Row[],
  audit: [] as Row[],
  mail: [] as { to: string; subject: string; html: string }[],
  mailOk: true,
}))

const admin = vi.hoisted(() => ({
  from(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let mode: "select" | "update" = "select"
    let patch: Row = {}
    const chain: Record<string, unknown> = {}
    chain.select = () => { mode = "select"; return chain }
    chain.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return chain }
    chain.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return chain }
    chain.limit = () => chain
    chain.update = (p: Row) => { mode = "update"; patch = p; return chain }
    const rows = () => (store.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
    const settle = () => {
      if (mode === "update") {
        const hit = rows()
        store.updates.push({ table, patch, matched: hit.length })
        hit.forEach((r) => Object.assign(r, patch))
        return { data: null, error: null }
      }
      return { data: rows(), error: null }
    }
    chain.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    chain.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    chain.then = (resolve: (v: unknown) => unknown) => resolve(settle())
    return chain
  },
}))

vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return { ...actual, writeAudit: async (_a: unknown, e: Row) => { store.audit.push(e) } }
})
vi.mock("@/lib/email", () => ({
  sendEmail: async (opts: { to: string; subject: string; html: string }) => {
    store.mail.push(opts)
    return store.mailOk ? { sent: true } : { sent: false, error: "Resend 500" }
  },
}))

import { sendClosureNotices, closureHtml } from "../agency/closure"

function seed() {
  store.tables = {
    job_roles: [{ id: "role-1", agency_id: "a1", title: "Senior Data Engineer" }],
    agencies: [{ id: "a1", name: "Halcyon Search", notice_from_name: "", notice_reply_to: "", retention_days: 180 }],
    candidates: [
      // Interviewed, notice sent — the archetype.
      { id: "c1", agency_id: "a1", role_id: "role-1", ref: "CAN-01", full_name: "Amara Okafor", email: "amara@x.test", rights_token: "tok1", closure_notified_at: null },
      // Notice sent, never interviewed — still told, the loop was opened.
      { id: "c2", agency_id: "a1", role_id: "role-1", ref: "CAN-02", full_name: "Jonas Berg", email: "jonas@x.test", rights_token: null, closure_notified_at: null },
      // Notice SUPPRESSED, never interviewed — first contact would be closure. No.
      { id: "c3", agency_id: "a1", role_id: "role-1", ref: "CAN-03", full_name: "Priya Nair", email: "priya@x.test", rights_token: null, closure_notified_at: null },
      // Placed (accepted) — their news arrived differently.
      { id: "c4", agency_id: "a1", role_id: "role-1", ref: "CAN-04", full_name: "Dan Kovac", email: "dan@x.test", rights_token: null, closure_notified_at: null },
      // Interviewed but no email on file.
      { id: "c5", agency_id: "a1", role_id: "role-1", ref: "CAN-05", full_name: "Lena Ode", email: null, rights_token: null, closure_notified_at: null },
    ],
    interview_rounds: [
      { role_id: "role-1", candidate_id: "c1" },
      { role_id: "role-1", candidate_id: "c4" },
      { role_id: "role-1", candidate_id: "c5" },
    ],
    placements: [{ role_id: "role-1", candidate_id: "c4", status: "accepted" }],
    candidate_notices: [
      { candidate_id: "c1", status: "sent" },
      { candidate_id: "c2", status: "sent" },
      { candidate_id: "c3", status: "suppressed" },
    ],
    candidate_identities: [],
    notice_suppressions: [],
  }
  store.updates = []; store.audit = []; store.mail = []; store.mailOk = true
}

beforeEach(seed)

describe("who is told", () => {
  it("tells exactly the people the loop was opened with", async () => {
    const result = await sendClosureNotices(admin as never, "role-1")
    expect(result.sent).toBe(2)
    expect(store.mail.map((m) => m.to).sort()).toEqual(["amara@x.test", "jonas@x.test"])
  })

  it("a suppressed-notice candidate is never contacted — closure cannot be the first email", async () => {
    await sendClosureNotices(admin as never, "role-1")
    expect(store.mail.map((m) => m.to)).not.toContain("priya@x.test")
  })

  it("the placed candidate is excluded, but a fallen-through one is back in", async () => {
    store.tables.placements![0]!.status = "fell_through"
    // c4 was interviewed, so with the placement no longer live they qualify.
    const result = await sendClosureNotices(admin as never, "role-1")
    expect(store.mail.map((m) => m.to)).toContain("dan@x.test")
    expect(result.sent).toBe(3)
  })

  it("no email on file is an audited skip, not a silent one", async () => {
    await sendClosureNotices(admin as never, "role-1")
    const skip = store.audit.find((a) => a.action === "closure_skipped")
    expect(skip).toMatchObject({ entityRef: "CAN-05", reason: "no_contact_details" })
  })

  it("a late suppression wins at send time", async () => {
    store.tables.candidate_identities = [{ candidate_id: "c1", identity_hash: "h1" }]
    store.tables.notice_suppressions = [{ agency_id: "a1", identity_hash: "h1" }]
    const result = await sendClosureNotices(admin as never, "role-1")
    expect(store.mail.map((m) => m.to)).not.toContain("amara@x.test")
    expect(result.suppressed).toBe(1)
  })
})

describe("idempotency", () => {
  it("closing twice emails nobody twice", async () => {
    await sendClosureNotices(admin as never, "role-1")
    const firstMail = store.mail.length
    const again = await sendClosureNotices(admin as never, "role-1")
    expect(store.mail.length).toBe(firstMail)
    expect(again.sent).toBe(0)
    expect(again.alreadyTold).toBe(2)
  })

  it("a FAILED send is not stamped, so a re-close retries it", async () => {
    store.mailOk = false
    await sendClosureNotices(admin as never, "role-1")
    expect(store.tables.candidates!.find((c) => c.id === "c1")!.closure_notified_at).toBeNull()
    store.mailOk = true
    const retry = await sendClosureNotices(admin as never, "role-1")
    expect(retry.sent).toBe(2)
  })
})

describe("what it says", () => {
  it("names no winner and gives no reason — the role ended, full stop", async () => {
    await sendClosureNotices(admin as never, "role-1")
    const html = store.mail[0]!.html.toLowerCase()
    expect(html).not.toContain("another candidate")
    expect(html).not.toContain("successful")
    expect(html).not.toContain("unfortunately")
  })

  it("keeps the retention promise out loud, with the rights link when one exists", () => {
    const html = closureHtml({
      candidateName: "Amara Okafor",
      agencyName: "Halcyon Search",
      roleTitle: "Senior <Data> Engineer",
      retentionDays: 90,
      rightsUrl: "https://app.test/rights/tok1",
    })
    expect(html).toContain("90 days")
    expect(html).toContain("https://app.test/rights/tok1")
    expect(html).toContain("&lt;Data&gt;")
  })
})

describe("volume", () => {
  /** N eligible people: notice sent, no interview, never told. */
  function seedMany(n: number) {
    store.tables.candidates = Array.from({ length: n }, (_, i) => ({
      id: `c${i}`, agency_id: "a1", role_id: "role-1", ref: `CAN-${i}`,
      full_name: `Person ${i}`, email: `p${i}@x.test`, rights_token: null,
      closure_notified_at: null,
    }))
    store.tables.candidate_notices = store.tables.candidates!.map((c) => ({
      candidate_id: c.id, status: "sent",
    }))
    store.tables.interview_rounds = []
    store.tables.placements = []
  }

  it("stops at the batch ceiling rather than firing a burst", async () => {
    seedMany(63)
    const result = await sendClosureNotices(admin as never, "role-1", { spacingMs: 0 })
    // The notice cron batches at 50 for the same reason; closure had no bound
    // at all, which a pool cap of 10 was hiding.
    expect(result.sent).toBe(50)
    expect(result.deferred).toBe(13)
    expect(store.mail).toHaveLength(50)
  })

  it("the deferred are NOT stamped, so the next close reaches them", async () => {
    seedMany(63)
    await sendClosureNotices(admin as never, "role-1", { spacingMs: 0 })
    const untold = store.tables.candidates!.filter((c) => !c.closure_notified_at)
    expect(untold).toHaveLength(13)

    // Closing again finishes the job and tells nobody twice.
    store.mail = []
    const second = await sendClosureNotices(admin as never, "role-1", { spacingMs: 0 })
    expect(second.sent).toBe(13)
    expect(second.alreadyTold).toBe(50)
    expect(store.mail).toHaveLength(13)
  })

  it("skips do not consume the batch budget", async () => {
    seedMany(60)
    // Forty were told on an earlier close; they must not eat the ceiling.
    for (const c of store.tables.candidates!.slice(0, 40)) {
      c.closure_notified_at = "2026-08-22T10:00:00.000Z"
    }
    const result = await sendClosureNotices(admin as never, "role-1", { spacingMs: 0 })
    expect(result.alreadyTold).toBe(40)
    expect(result.sent).toBe(20)
    expect(result.deferred).toBe(0)
  })

  it("paces by default — the burst is what trips a provider's rate limit", async () => {
    seedMany(4)
    const started = Date.now()
    await sendClosureNotices(admin as never, "role-1")
    const elapsed = Date.now() - started
    // Four sends means three gaps. Asserting a floor, not a duration, so this
    // does not become a flaky timing test.
    expect(elapsed).toBeGreaterThanOrEqual(3 * 100)
  })
})
