/**
 * The invite logic is the whole security boundary for the hiring-manager hat.
 *
 * Hiring managers have ZERO RLS grants (docs/AGENCIES_SCHEMA.md §5.4), so
 * nothing in Postgres will catch a mistake here. acceptInvite() is the only
 * place in the codebase that binds agency.client_contacts.user_id, and the four
 * rules it enforces are the only things standing between a forwarded email and
 * a stranger sitting inside an agency's client portal:
 *
 *   1. invites are found BY HASH — the raw token is never stored, never logged,
 *      never compared in JS,
 *   2. the signed-in mailbox must match the invited contact's, case- and
 *      whitespace-insensitively and nothing looser,
 *   3. expired / revoked / already-accepted are all the same answer to whoever
 *      holds the link — 'invalid' — so a probe learns nothing,
 *   4. no audit row ever carries a raw token or an email address.
 *
 * These tests run against an in-memory stand-in for the service-role client, so
 * they assert what actually reached the database: the rows written, the filters
 * used, and every argument that crossed the boundary.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { createHash } from "crypto"

// ============================================================
// An in-memory Supabase stand-in
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any -- a stand-in for the
   Supabase query builder is dynamic by nature. The assertions further down are
   where the type discipline lives. */

type Row = Record<string, any>

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

type FilterKind = "eq" | "is" | "in" | "gt"
interface Filter {
  kind: FilterKind
  col: string
  value: any
}

/**
 * Nullable columns the migrations declare but an INSERT does not name. Without
 * these an inserted row would be missing the column entirely rather than
 * holding NULL, and `revoked_at is null` would be testing a different thing
 * from what Postgres tests.
 */
const COLUMN_DEFAULTS: Record<string, Row> = {
  client_invites: { accepted_at: null, accepted_by: null, revoked_at: null },
  client_contacts: { user_id: null },
}

/** Every table, every row, and a transcript of every call made against them. */
class FakeDb {
  tables: Record<string, Row[]> = {}
  calls: RecordedCall[] = []
  private seq = 0

  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = []
    return this.tables[table]
  }

  nextId(table: string): string {
    this.seq += 1
    return `${table}-${this.seq}`
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table)
  }

  /** Everything that crossed the client boundary, as one searchable string. */
  transcript(): string {
    return JSON.stringify({ calls: this.calls, tables: this.tables })
  }

  audit(): Row[] {
    return this.rows("audit_log")
  }
}

class FakeQuery {
  private op: "select" | "insert" | "update" = "select"
  private columns = "*"
  private payload: Row[] = []
  private filters: Filter[] = []
  private sorts: Array<{ col: string; ascending: boolean }> = []
  private limitN: number | null = null

  constructor(private db: FakeDb, private table: string) {}

  private record(method: string, args: unknown[]): this {
    this.db.calls.push({ table: this.table, method, args })
    return this
  }

  select(cols = "*"): this {
    this.columns = cols
    return this.record("select", [cols])
  }

  insert(payload: Row | Row[]): this {
    this.op = "insert"
    this.payload = Array.isArray(payload) ? payload : [payload]
    return this.record("insert", [payload])
  }

  update(patch: Row): this {
    this.op = "update"
    this.payload = [patch]
    return this.record("update", [patch])
  }

  eq(col: string, value: any): this {
    this.filters.push({ kind: "eq", col, value })
    return this.record("eq", [col, value])
  }

  is(col: string, value: any): this {
    this.filters.push({ kind: "is", col, value })
    return this.record("is", [col, value])
  }

  in(col: string, value: any[]): this {
    this.filters.push({ kind: "in", col, value })
    return this.record("in", [col, value])
  }

  gt(col: string, value: any): this {
    this.filters.push({ kind: "gt", col, value })
    return this.record("gt", [col, value])
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.sorts.push({ col, ascending: opts?.ascending ?? true })
    return this.record("order", [col, opts])
  }

  limit(n: number): this {
    this.limitN = n
    return this.record("limit", [n])
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    this.record("maybeSingle", [])
    const { data } = this.run()
    return { data: data[0] ?? null, error: null }
  }

  async single(): Promise<{ data: Row | null; error: unknown }> {
    this.record("single", [])
    const { data } = this.run()
    if (data.length === 0) return { data: null, error: { message: "no rows returned" } }
    return { data: data[0], error: null }
  }

  then<TResult1 = unknown, TResult2 = never>(
    onFulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected)
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const value = row[f.col]
      switch (f.kind) {
        case "eq":
          return value === f.value
        case "is":
          return f.value === null ? value === null || value === undefined : value === f.value
        case "in":
          return (f.value as unknown[]).includes(value)
        case "gt":
          return value != null && String(value) > String(f.value)
      }
    })
  }

  /** Only the selected columns come back — so a widened select() shows up in a
   * test as new data appearing, exactly as it would in production. */
  private project(row: Row): Row {
    if (this.columns.trim() === "*") return { ...row }
    const out: Row = {}
    for (const col of this.columns.split(",").map((c) => c.trim()).filter(Boolean)) {
      out[col] = row[col] ?? null
    }
    return out
  }

  private run(): { data: Row[]; error: null } {
    if (this.op === "insert") {
      const defaults = COLUMN_DEFAULTS[this.table] ?? {}
      const inserted = this.payload.map((p) => ({
        id: this.db.nextId(this.table),
        created_at: new Date().toISOString(),
        ...defaults,
        ...p,
      }))
      this.db.rows(this.table).push(...inserted)
      return { data: inserted.map((r) => this.project(r)), error: null }
    }

    const matched = this.db.rows(this.table).filter((r) => this.matches(r))

    if (this.op === "update") {
      // Filters are evaluated BEFORE the patch lands — that is what makes a
      // conditional claim (`.is('accepted_at', null)`) mean anything.
      for (const row of matched) Object.assign(row, this.payload[0])
      return { data: matched.map((r) => this.project(r)), error: null }
    }

    const sorted = [...matched]
    for (const sort of [...this.sorts].reverse()) {
      sorted.sort((a, b) => {
        const av = String(a[sort.col] ?? "")
        const bv = String(b[sort.col] ?? "")
        return sort.ascending ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    const limited = this.limitN === null ? sorted : sorted.slice(0, this.limitN)
    return { data: limited.map((r) => this.project(r)), error: null }
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any -- harness ends here; the
   tests themselves are typed. */

// ============================================================
// Wiring: the module under test gets the fake service-role client
// ============================================================

const holder = vi.hoisted(() => ({ client: null as unknown }))

// requireHiringContext() reaches for the request cookies at import time of
// next/headers; nothing below exercises it, so this keeps the module loadable
// outside a Next request scope.
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined }),
}))

// Only agencyAdmin() is faked. writeAudit(), assertWriter() and
// AgencyAccessError stay REAL, so the audit assertions below are checking the
// row that genuinely reaches audit_log rather than a spy's arguments.
vi.mock("@/lib/agency/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agency/db")>()
  return { ...actual, agencyAdmin: () => holder.client }
})

import { AgencyAccessError } from "@/lib/agency/db"
import {
  INVITE_TTL_DAYS,
  acceptInvite,
  createClientInvite,
  listClientAccess,
  peekInvite,
  revokeClientInvite,
  unlinkClientContact,
} from "@/lib/agency/client-auth"
import type { AgencyContext } from "@/lib/agency/types"

// ============================================================
// Fixtures
// ============================================================

const AGENCY = "agency-acme"
const AGENCY_NAME = "Acme Search"
const RIVAL = "agency-rival"

const CONTACT = "contact-northwind"
const COMPANY = "Northwind Trading"
const CONTACT_EMAIL = "ada@example.com"
const RIVAL_CONTACT = "contact-rival"

const RECRUITER = "user-recruiter"
const HM = "user-hiring-manager"
const STRANGER = "user-stranger"
const STRANGER_EMAIL = "mallory@elsewhere.test"

/** 24 raw bytes base64url, same shape createClientInvite mints. */
const RAW = "kQ7xR2mN8pL4vT6yB0zA9cD3fG5hJ8kM"

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex")
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

let store: FakeDb

const ctx = (over: Partial<AgencyContext> = {}): AgencyContext => ({
  agencyId: AGENCY,
  userId: RECRUITER,
  role: "recruiter",
  ...over,
})

function putInvite(rawToken: string, over: Row = {}): Row {
  const row: Row = {
    id: "invite-live",
    agency_id: AGENCY,
    contact_id: CONTACT,
    token_hash: sha256(rawToken),
    invited_by: RECRUITER,
    expires_at: inDays(7),
    accepted_at: null,
    accepted_by: null,
    revoked_at: null,
    created_at: new Date().toISOString(),
    ...over,
  }
  store.rows("client_invites").push(row)
  return row
}

const contactRow = () => store.rows("client_contacts").find((c) => c.id === CONTACT)!
const inviteRow = (id = "invite-live") => store.rows("client_invites").find((i) => i.id === id)!

beforeEach(() => {
  store = new FakeDb()
  store.tables.agencies = [
    { id: AGENCY, name: AGENCY_NAME },
    { id: RIVAL, name: "Rival Talent" },
  ]
  store.tables.client_contacts = [
    {
      id: CONTACT,
      agency_id: AGENCY,
      company: COMPANY,
      email: CONTACT_EMAIL,
      full_name: "Ada Lovelace",
      user_id: null,
    },
    {
      id: RIVAL_CONTACT,
      agency_id: RIVAL,
      company: "Someone Else Ltd",
      email: "grace@rival.test",
      full_name: "Grace H",
      user_id: null,
    },
  ]
  store.tables.client_invites = []
  store.tables.audit_log = []
  holder.client = store
})

// ============================================================
// acceptInvite — the happy path
// ============================================================

describe("acceptInvite — binding a hiring manager", () => {
  it("binds user_id, stamps the invite, and writes one audit row", async () => {
    putInvite(RAW)

    const result = await acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL })

    expect(result).toEqual({ ok: true, agencyName: AGENCY_NAME })

    // The bind — the one write that grants access.
    expect(contactRow().user_id).toBe(HM)

    // The invite is spent, with attribution.
    const invite = inviteRow()
    expect(invite.accepted_by).toBe(HM)
    expect(typeof invite.accepted_at).toBe("string")
    expect(new Date(invite.accepted_at as string).getTime()).toBeLessThanOrEqual(Date.now())
    expect(invite.revoked_at).toBeNull()

    // The audit row: company as the ref, the acting user as the actor, uuids
    // only in the payload.
    expect(store.audit()).toHaveLength(1)
    expect(store.audit()[0]).toMatchObject({
      agency_id: AGENCY,
      actor_id: HM,
      entity_type: "client_invite",
      entity_ref: COMPANY,
      action: "accepted",
      to_value: { invite_id: "invite-live", contact_id: CONTACT },
    })
  })

  it("treats case and surrounding whitespace as the same mailbox", async () => {
    putInvite(RAW)

    const result = await acceptInvite(RAW, { id: HM, email: "  Ada@Example.com " })

    expect(result).toEqual({ ok: true, agencyName: AGENCY_NAME })
    expect(contactRow().user_id).toBe(HM)
  })

  it("normalises the stored contact address too, not just the session one", async () => {
    contactRow().email = "  ADA@Example.COM  "
    putInvite(RAW)

    const result = await acceptInvite(RAW, { id: HM, email: "ada@example.com" })

    expect(result).toEqual({ ok: true, agencyName: AGENCY_NAME })
    expect(contactRow().user_id).toBe(HM)
  })

  it("does not match on anything looser than case and whitespace", async () => {
    // Plus-addressing and dot-folding are provider-specific guesses; guessing
    // wrong hands a seat to the wrong mailbox, so neither is treated as equal.
    putInvite(RAW)

    const plus = await acceptInvite(RAW, { id: STRANGER, email: "ada+recruiting@example.com" })
    expect(plus).toEqual({ ok: false, reason: "email_mismatch" })
    expect(contactRow().user_id).toBeNull()
  })
})

// ============================================================
// acceptInvite — the anti-hijack rule
// ============================================================

describe("acceptInvite — a leaked link is useless to anyone else", () => {
  it("rejects a signed-in user whose email is not the invited one", async () => {
    putInvite(RAW)

    const result = await acceptInvite(RAW, { id: STRANGER, email: STRANGER_EMAIL })

    expect(result).toEqual({ ok: false, reason: "email_mismatch" })
    // Nothing was granted and nothing was spent: the invite is still live for
    // the person it was actually addressed to.
    expect(contactRow().user_id).toBeNull()
    expect(inviteRow().accepted_at).toBeNull()
    expect(inviteRow().accepted_by).toBeNull()
  })

  it("audits the failed claim without recording either address", async () => {
    putInvite(RAW)

    await acceptInvite(RAW, { id: STRANGER, email: STRANGER_EMAIL })

    expect(store.audit()).toHaveLength(1)
    expect(store.audit()[0]).toMatchObject({
      agency_id: AGENCY,
      actor_id: STRANGER,
      entity_type: "client_invite",
      entity_ref: COMPANY,
      action: "rejected",
      reason: "email_mismatch",
    })
    const row = JSON.stringify(store.audit()[0])
    expect(row).not.toContain(STRANGER_EMAIL)
    expect(row).not.toContain(CONTACT_EMAIL)
    expect(row).not.toContain("@")
  })

  it("rejects a session with no email at all, even against a blank contact", async () => {
    contactRow().email = ""
    putInvite(RAW)

    const result = await acceptInvite(RAW, { id: STRANGER, email: "" })

    expect(result).toEqual({ ok: false, reason: "email_mismatch" })
    expect(contactRow().user_id).toBeNull()
  })

  it("leaves a live invite claimable by the right person after a failed attempt", async () => {
    putInvite(RAW)

    await acceptInvite(RAW, { id: STRANGER, email: STRANGER_EMAIL })
    const result = await acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL })

    expect(result).toEqual({ ok: true, agencyName: AGENCY_NAME })
    expect(contactRow().user_id).toBe(HM)
  })
})

// ============================================================
// acceptInvite — every dead invite answers identically
// ============================================================

describe("acceptInvite — dead invites are indistinguishable", () => {
  const cases: Array<[string, Row]> = [
    ["expired", { expires_at: inDays(-1) }],
    ["revoked", { revoked_at: new Date().toISOString() }],
    ["already accepted", { accepted_at: new Date().toISOString(), accepted_by: "someone-else" }],
  ]

  for (const [label, over] of cases) {
    it(`answers 'invalid' for an ${label} invite, and grants nothing`, async () => {
      putInvite(RAW, over)

      const result = await acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL })

      expect(result).toEqual({ ok: false, reason: "invalid" })
      expect(contactRow().user_id).toBeNull()
      // No audit row: a dead token is a non-event, not an attempted hijack.
      expect(store.audit()).toHaveLength(0)
    })
  }

  it("answers 'invalid' for an unknown token", async () => {
    putInvite(RAW)
    const result = await acceptInvite("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", {
      id: HM,
      email: CONTACT_EMAIL,
    })
    expect(result).toEqual({ ok: false, reason: "invalid" })
    expect(contactRow().user_id).toBeNull()
  })

  it("answers 'invalid' for an implausible token without touching the database", async () => {
    putInvite(RAW)
    store.calls = []

    expect(await acceptInvite("short", { id: HM, email: CONTACT_EMAIL })).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(await acceptInvite("x".repeat(500), { id: HM, email: CONTACT_EMAIL })).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(store.calls).toHaveLength(0)
  })

  it("gives an expired, a revoked and an unknown token the exact same answer", async () => {
    const answers: unknown[] = []
    for (const over of [{ expires_at: inDays(-1) }, { revoked_at: inDays(-1) }, null]) {
      store.tables.client_invites = []
      if (over) putInvite(RAW, over)
      answers.push(await acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL }))
    }
    expect(answers[0]).toEqual(answers[1])
    expect(answers[1]).toEqual(answers[2])
  })

  it("an already-accepted invite cannot re-bind the contact to a new person", async () => {
    contactRow().user_id = HM
    putInvite(RAW, { accepted_at: inDays(-2), accepted_by: HM })

    // The stranger's own mailbox would still fail the email check, but the
    // 'already accepted' guard fires first — this is the takeover path that
    // must never reopen.
    const result = await acceptInvite(RAW, { id: STRANGER, email: CONTACT_EMAIL })

    expect(result).toEqual({ ok: false, reason: "invalid" })
    expect(contactRow().user_id).toBe(HM)
  })

  it("rejects an invite whose contact belongs to another agency", async () => {
    putInvite(RAW, { agency_id: RIVAL })

    const result = await acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL })

    expect(result).toEqual({ ok: false, reason: "invalid" })
    expect(contactRow().user_id).toBeNull()
  })

  it("only one of two concurrent accepts can bind", async () => {
    putInvite(RAW)

    const results = await Promise.all([
      acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL }),
      acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL }),
    ])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "invalid" }])
    expect(contactRow().user_id).toBe(HM)
  })
})

// ============================================================
// Lookup is by hash, and the raw token never travels
// ============================================================

describe("invite lookup is by hash, never by raw token", () => {
  it("acceptInvite filters on token_hash with the sha256 of the token", async () => {
    putInvite(RAW)

    await acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL })

    const lookup = store.calls.find(
      (c) => c.table === "client_invites" && c.method === "eq" && c.args[0] === "token_hash"
    )
    expect(lookup).toBeDefined()
    expect(lookup!.args[1]).toBe(sha256(RAW))
    expect(lookup!.args[1]).toMatch(/^[0-9a-f]{64}$/)
  })

  it("peekInvite filters on token_hash too — never fetch-and-compare", async () => {
    putInvite(RAW)

    await peekInvite(RAW)

    const inviteReads = store.calls.filter(
      (c) => c.table === "client_invites" && c.method === "eq"
    )
    expect(inviteReads.map((c) => c.args[0])).toContain("token_hash")
    // No unfiltered sweep of the invite table.
    const selects = store.calls.filter(
      (c) => c.table === "client_invites" && c.method === "select"
    )
    expect(selects).toHaveLength(1)
  })

  it("(harness self-check) the leak detector actually detects a leak", async () => {
    // Without this, "the transcript does not contain the token" could pass
    // simply because the transcript is not recording what it claims to.
    await store.from("client_invites").insert({ token_hash: RAW })
    expect(store.transcript()).toContain(RAW)
  })

  it("never passes the raw token to the database or into an audit row", async () => {
    putInvite(RAW)

    await peekInvite(RAW)
    await acceptInvite(RAW, { id: STRANGER, email: STRANGER_EMAIL })
    await acceptInvite(RAW, { id: HM, email: CONTACT_EMAIL })

    // Every argument of every call, plus every row that landed in a table.
    expect(store.transcript()).not.toContain(RAW)
    expect(JSON.stringify(store.audit())).not.toContain(RAW)
  })
})

// ============================================================
// createClientInvite
// ============================================================

describe("createClientInvite", () => {
  it("stores only the sha256 of a token it returns exactly once", async () => {
    const { inviteId, rawToken, expiresAt } = await createClientInvite(ctx(), CONTACT)

    const stored = inviteRow(inviteId)
    expect(stored.token_hash).toBe(sha256(rawToken))
    expect(stored.token_hash).not.toBe(rawToken)
    // The raw value appears nowhere in the row, under any column.
    expect(JSON.stringify(stored)).not.toContain(rawToken)
    // ...nor anywhere else the client was asked to write.
    expect(store.transcript()).not.toContain(rawToken)

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(stored.invited_by).toBe(RECRUITER)
    expect(stored.agency_id).toBe(AGENCY)
    expect(stored.contact_id).toBe(CONTACT)

    const ttlMs = new Date(expiresAt).getTime() - Date.now()
    expect(ttlMs).toBeGreaterThan(INVITE_TTL_DAYS * 86_400_000 - 60_000)
    expect(ttlMs).toBeLessThanOrEqual(INVITE_TTL_DAYS * 86_400_000)
  })

  it("mints a different token every time", async () => {
    const a = await createClientInvite(ctx(), CONTACT)
    const b = await createClientInvite(ctx(), CONTACT)
    expect(a.rawToken).not.toBe(b.rawToken)
    expect(a.inviteId).not.toBe(b.inviteId)
  })

  it("returns a token that actually works end to end", async () => {
    const { rawToken } = await createClientInvite(ctx(), CONTACT)

    const peeked = await peekInvite(rawToken)
    expect(peeked).toEqual({
      agencyName: AGENCY_NAME,
      company: COMPANY,
      contactEmail: CONTACT_EMAIL,
    })

    expect(await acceptInvite(rawToken, { id: HM, email: CONTACT_EMAIL })).toEqual({
      ok: true,
      agencyName: AGENCY_NAME,
    })
  })

  it("supersedes the prior live invite so two links never work at once", async () => {
    const first = await createClientInvite(ctx(), CONTACT)
    const second = await createClientInvite(ctx(), CONTACT)

    expect(inviteRow(first.inviteId).revoked_at).not.toBeNull()
    expect(inviteRow(second.inviteId).revoked_at).toBeNull()

    const live = store
      .rows("client_invites")
      .filter((i) => i.revoked_at === null && i.accepted_at === null)
    expect(live).toHaveLength(1)

    // The superseded link is dead in the inbox it was sent to.
    expect(await acceptInvite(first.rawToken, { id: HM, email: CONTACT_EMAIL })).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(await acceptInvite(second.rawToken, { id: HM, email: CONTACT_EMAIL })).toEqual({
      ok: true,
      agencyName: AGENCY_NAME,
    })
  })

  it("audits the supersede and the creation, in that order", async () => {
    await createClientInvite(ctx(), CONTACT)
    store.tables.audit_log = []
    await createClientInvite(ctx(), CONTACT)

    expect(store.audit()).toHaveLength(2)
    expect(store.audit()[0]).toMatchObject({
      entity_type: "client_invite",
      entity_ref: COMPANY,
      action: "revoked",
      reason: "superseded_by_reinvite",
    })
    expect(store.audit()[1]).toMatchObject({
      entity_type: "client_invite",
      entity_ref: COMPANY,
      action: "created",
    })
  })

  it("leaves an already-accepted invite alone when re-inviting", async () => {
    const accepted = putInvite(RAW, { accepted_at: inDays(-1), accepted_by: HM })

    await createClientInvite(ctx(), CONTACT)

    expect(accepted.revoked_at).toBeNull()
    // No supersede audit row — nothing live was cancelled.
    expect(store.audit().map((a) => a.action)).toEqual(["created"])
  })

  it("refuses a viewer", async () => {
    await expect(createClientInvite(ctx({ role: "viewer" }), CONTACT)).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(store.rows("client_invites")).toHaveLength(0)
  })

  it("refuses a contact belonging to another agency, and says nothing about it", async () => {
    await expect(createClientInvite(ctx(), RIVAL_CONTACT)).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    await expect(createClientInvite(ctx(), "no-such-contact")).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(store.rows("client_invites")).toHaveLength(0)
    expect(store.audit()).toHaveLength(0)
  })
})

// ============================================================
// peekInvite
// ============================================================

describe("peekInvite", () => {
  it("describes a live invite to the token holder", async () => {
    putInvite(RAW)
    expect(await peekInvite(RAW)).toEqual({
      agencyName: AGENCY_NAME,
      company: COMPANY,
      contactEmail: CONTACT_EMAIL,
    })
  })

  const deadCases: Array<[string, Row | null]> = [
    ["expired", { expires_at: inDays(-1) }],
    ["revoked", { revoked_at: inDays(-1) }],
    ["already accepted", { accepted_at: inDays(-1), accepted_by: HM }],
    ["unknown", null],
  ]

  for (const [label, over] of deadCases) {
    it(`returns null for an ${label} invite`, async () => {
      if (over) putInvite(RAW, over)
      expect(await peekInvite(RAW)).toBeNull()
    })
  }

  it("returns null for an implausible token without touching the database", async () => {
    putInvite(RAW)
    store.calls = []
    expect(await peekInvite("short")).toBeNull()
    expect(await peekInvite("")).toBeNull()
    expect(await peekInvite("y".repeat(200))).toBeNull()
    expect(store.calls).toHaveLength(0)
  })

  it("returns null when the contact behind the invite is gone", async () => {
    putInvite(RAW, { contact_id: "deleted-contact" })
    expect(await peekInvite(RAW)).toBeNull()
  })

  it("binds nothing and audits nothing", async () => {
    putInvite(RAW)
    await peekInvite(RAW)
    expect(contactRow().user_id).toBeNull()
    expect(inviteRow().accepted_at).toBeNull()
    expect(store.audit()).toHaveLength(0)
  })
})

// ============================================================
// revoke / unlink
// ============================================================

describe("revokeClientInvite", () => {
  it("kills a live invite, audits it, and the link stops working", async () => {
    const { inviteId, rawToken } = await createClientInvite(ctx(), CONTACT)
    store.tables.audit_log = []

    await revokeClientInvite(ctx(), inviteId)

    expect(inviteRow(inviteId).revoked_at).not.toBeNull()
    expect(store.audit()).toHaveLength(1)
    expect(store.audit()[0]).toMatchObject({
      entity_type: "client_invite",
      entity_ref: COMPANY,
      action: "revoked",
    })
    expect(await acceptInvite(rawToken, { id: HM, email: CONTACT_EMAIL })).toEqual({
      ok: false,
      reason: "invalid",
    })
  })

  it("is idempotent — a second revoke adds no second audit row", async () => {
    const { inviteId } = await createClientInvite(ctx(), CONTACT)
    await revokeClientInvite(ctx(), inviteId)
    store.tables.audit_log = []

    await expect(revokeClientInvite(ctx(), inviteId)).resolves.toBeUndefined()
    expect(store.audit()).toHaveLength(0)
  })

  it("refuses to revoke an accepted invite — that is unlink's job", async () => {
    putInvite(RAW, { accepted_at: inDays(-1), accepted_by: HM })
    await expect(revokeClientInvite(ctx(), "invite-live")).rejects.toThrow(
      /unlink the contact/
    )
  })

  it("refuses an invite outside the caller's agency, and viewers outright", async () => {
    putInvite(RAW, { agency_id: RIVAL })
    await expect(revokeClientInvite(ctx(), "invite-live")).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    await expect(revokeClientInvite(ctx({ role: "viewer" }), "invite-live")).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(inviteRow().revoked_at).toBeNull()
  })
})

describe("unlinkClientContact", () => {
  it("drops the binding and burns any invite still sitting in an inbox", async () => {
    const { rawToken } = await createClientInvite(ctx(), CONTACT)
    await acceptInvite(rawToken, { id: HM, email: CONTACT_EMAIL })
    const { rawToken: reissued } = await createClientInvite(ctx(), CONTACT)
    store.tables.audit_log = []

    await unlinkClientContact(ctx(), CONTACT)

    expect(contactRow().user_id).toBeNull()
    expect(await acceptInvite(reissued, { id: HM, email: CONTACT_EMAIL })).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(store.audit()).toHaveLength(1)
    expect(store.audit()[0]).toMatchObject({
      entity_type: "client_invite",
      entity_ref: COMPANY,
      action: "unlinked",
      to_value: { contact_id: CONTACT, user_id: null },
    })
  })

  it("no-ops on a contact that was never linked", async () => {
    await unlinkClientContact(ctx(), CONTACT)
    expect(store.audit()).toHaveLength(0)
  })

  it("refuses viewers and other agencies' contacts", async () => {
    contactRow().user_id = HM
    await expect(unlinkClientContact(ctx({ role: "viewer" }), CONTACT)).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    await expect(unlinkClientContact(ctx(), RIVAL_CONTACT)).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(contactRow().user_id).toBe(HM)
  })
})

// ============================================================
// listClientAccess — the state the recruiter sees
// ============================================================

describe("listClientAccess", () => {
  it("tracks a contact through none → invited → linked → none", async () => {
    const before = await listClientAccess(ctx())
    expect(before.find((r) => r.contactId === CONTACT)).toMatchObject({
      state: "none",
      inviteId: null,
      expiresAt: null,
    })

    const { inviteId, rawToken } = await createClientInvite(ctx(), CONTACT)
    const invited = await listClientAccess(ctx())
    expect(invited.find((r) => r.contactId === CONTACT)).toMatchObject({
      state: "invited",
      inviteId,
    })

    await acceptInvite(rawToken, { id: HM, email: CONTACT_EMAIL })
    const linked = await listClientAccess(ctx())
    expect(linked.find((r) => r.contactId === CONTACT)).toMatchObject({ state: "linked" })

    await unlinkClientContact(ctx(), CONTACT)
    const unlinked = await listClientAccess(ctx())
    expect(unlinked.find((r) => r.contactId === CONTACT)).toMatchObject({ state: "none" })
  })

  it("reports a stale invite as expired", async () => {
    putInvite(RAW, { expires_at: inDays(-1) })
    const rows = await listClientAccess(ctx())
    expect(rows.find((r) => r.contactId === CONTACT)).toMatchObject({
      state: "expired",
      inviteId: "invite-live",
    })
  })

  it("never returns another agency's contacts", async () => {
    const rows = await listClientAccess(ctx())
    expect(rows.map((r) => r.contactId)).toEqual([CONTACT])
  })
})

// ============================================================
// The standing rule
// ============================================================

describe("the audit log never carries a secret or an address", () => {
  it("survives a full lifecycle with no token and no email in any row", async () => {
    const first = await createClientInvite(ctx(), CONTACT)
    const second = await createClientInvite(ctx(), CONTACT)
    await acceptInvite(second.rawToken, { id: STRANGER, email: STRANGER_EMAIL })
    await acceptInvite(second.rawToken, { id: HM, email: CONTACT_EMAIL })
    await unlinkClientContact(ctx(), CONTACT)

    const log = JSON.stringify(store.audit())
    expect(log).not.toContain(first.rawToken)
    expect(log).not.toContain(second.rawToken)
    expect(log).not.toContain(CONTACT_EMAIL)
    expect(log).not.toContain(STRANGER_EMAIL)
    expect(log).not.toContain("Ada Lovelace")
    // No address of any kind, on any row, ever.
    expect(log).not.toContain("@")

    // And the log is not empty — this test would otherwise pass vacuously.
    expect(store.audit().map((a) => a.action)).toEqual([
      "created",
      "revoked",
      "created",
      "rejected",
      "accepted",
      "unlinked",
    ])
  })
})
