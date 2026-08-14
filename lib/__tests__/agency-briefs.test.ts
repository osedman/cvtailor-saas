/**
 * Role briefs — step 1 of the interview loop.
 *
 * agency.role_briefs is audit-coupled and hiring managers hold ZERO RLS grants,
 * so nothing in Postgres will catch a mistake in lib/agency/briefs.ts. The
 * filters and assertions in that file ARE the tenancy boundary. These tests
 * exist to hold four rules that have no second net underneath them:
 *
 *   1. a contact_id from a client is proved against ctx.links BEFORE anything
 *      is written, and the agency_id on the row comes from THAT LINK,
 *   2. every write to role_briefs lands an audit row in the same operation,
 *      and the brief body (mission / must-haves / comp) never enters it,
 *   3. accepting a brief mints EXACTLY ONE role — a retry, a double-click or a
 *      half-finished earlier attempt gets the same role back, never a second,
 *   4. a decline is a status, never a delete: the client keeps the record of
 *      what they asked for.
 *
 * Like agency-client-auth.test.ts, these run against an in-memory stand-in for
 * the service-role client, so the assertions are about what actually reached
 * the database: the rows written, the filters used, and every argument that
 * crossed the boundary.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

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
 * holding NULL — and `role_id is null` would be testing a different thing from
 * what Postgres tests.
 */
const COLUMN_DEFAULTS: Record<string, Row> = {
  role_briefs: { role_id: null, decided_by: null, decided_at: null },
  job_roles: { closed_at: null },
}

/** Every table, every row, and a transcript of every call made against them. */
class FakeDb {
  tables: Record<string, Row[]> = {}
  calls: RecordedCall[] = []
  /** Refs the service-role sequence has handed out, in order. */
  mintedRefs: string[] = []
  private seq = 0
  private refSeq = 0

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

  /**
   * agency.next_role_ref is service-role only and is the ONLY source of a role
   * ref — a vi.fn so a test can count how many times a conversion asked for
   * one. Two refs handed out for one brief is a duplicated role.
   */
  rpc = vi.fn(async (fn: string, args: Row) => {
    this.calls.push({ table: `rpc:${fn}`, method: "rpc", args: [args] })
    this.refSeq += 1
    const ref = `ROL-${String(this.refSeq).padStart(2, "0")}`
    this.mintedRefs.push(ref)
    return { data: ref, error: null }
  })

  /** Everything that crossed the client boundary, as one searchable string. */
  transcript(): string {
    return JSON.stringify({ calls: this.calls, tables: this.tables })
  }

  audit(): Row[] {
    return this.rows("audit_log")
  }

  /** Any destructive call, on any table. Should stay empty in this module. */
  deletes(): RecordedCall[] {
    return this.calls.filter((c) => c.method === "delete")
  }
}

class FakeQuery {
  private op: "select" | "insert" | "update" | "delete" = "select"
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

  /** Present only so a test can prove nothing here ever calls it. */
  delete(): this {
    this.op = "delete"
    return this.record("delete", [])
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
      // conditional claim (`.eq('status', 'submitted')`) mean anything.
      for (const row of matched) Object.assign(row, this.payload[0])
      return { data: matched.map((r) => this.project(r)), error: null }
    }

    if (this.op === "delete") {
      const keep = this.db.rows(this.table).filter((r) => !this.matches(r))
      this.db.tables[this.table] = keep
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

// requireHiringContext() / requireAgencyContext() reach for the request cookies
// at import time of next/headers; nothing below exercises them, so this keeps
// the module loadable outside a Next request scope.
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
  acceptBrief,
  declineBrief,
  listBriefsForAgency,
  listBriefsForHiringManager,
  submitBrief,
} from "@/lib/agency/briefs"
import type { AgencyContext, HiringContext, HiringLink } from "@/lib/agency/types"

// ============================================================
// Fixtures
// ============================================================

const AGENCY = "agency-acme"
const AGENCY_NAME = "Acme Search"
const RIVAL = "agency-rival"
const RIVAL_NAME = "Rival Talent"

const CONTACT = "contact-northwind"
const COMPANY = "Northwind Trading"
const CONTACT_NAME = "Ada Lovelace"

/** The same hiring manager, linked at a SECOND agency. Two live links is the
 * case where "derive agency_id from the link" stops being a formality. */
const RIVAL_CONTACT = "contact-rival"
const RIVAL_COMPANY = "Someone Else Ltd"

/** A contact the hiring manager holds no link to — a guessed uuid. */
const STRANGER_CONTACT = "contact-not-mine"

const RECRUITER = "user-recruiter"
const OTHER_RECRUITER = "user-other-recruiter"
const HM = "user-hiring-manager"

/** Confidential hiring material. None of it may appear in an audit row. */
const BODY = {
  mission: "Replace the Nimbus billing engine before the Q3 renewal cliff",
  mustHaves: "8 years Postgres; has owned a payments migration end to end",
  niceToHaves: "Ex-fintech; has worked with Dhruv Patel's old team",
  comp: "185000 GBP base plus 20 percent",
}

let store: FakeDb

const agencyCtx = (over: Partial<AgencyContext> = {}): AgencyContext => ({
  agencyId: AGENCY,
  userId: RECRUITER,
  role: "recruiter",
  ...over,
})

const link = (over: Partial<HiringLink> = {}): HiringLink => ({
  contactId: CONTACT,
  agencyId: AGENCY,
  agencyName: AGENCY_NAME,
  company: COMPANY,
  fullName: CONTACT_NAME,
  ...over,
})

const rivalLink = (): HiringLink =>
  link({
    contactId: RIVAL_CONTACT,
    agencyId: RIVAL,
    agencyName: RIVAL_NAME,
    company: RIVAL_COMPANY,
  })

const hiringCtx = (links: HiringLink[] = [link()]): HiringContext => ({
  userId: HM,
  email: "ada@example.com",
  links,
})

function putBrief(over: Row = {}): Row {
  const row: Row = {
    id: "brief-live",
    agency_id: AGENCY,
    contact_id: CONTACT,
    role_title: "Staff Platform Engineer",
    team: "Payments",
    mission: BODY.mission,
    must_haves: BODY.mustHaves,
    nice_to_haves: BODY.niceToHaves,
    comp: BODY.comp,
    location: "London / hybrid",
    status: "submitted",
    role_id: null,
    decided_by: null,
    decided_at: null,
    created_at: new Date().toISOString(),
    ...over,
  }
  store.rows("role_briefs").push(row)
  return row
}

const briefRow = (id = "brief-live") => store.rows("role_briefs").find((b) => b.id === id)!
const roleRows = () => store.rows("job_roles")

beforeEach(() => {
  store = new FakeDb()
  store.tables.client_contacts = [
    {
      id: CONTACT,
      agency_id: AGENCY,
      company: COMPANY,
      email: "ada@example.com",
      full_name: CONTACT_NAME,
      user_id: HM,
    },
    {
      id: RIVAL_CONTACT,
      agency_id: RIVAL,
      company: RIVAL_COMPANY,
      email: "ada.work@example.com",
      full_name: CONTACT_NAME,
      user_id: HM,
    },
    {
      id: STRANGER_CONTACT,
      agency_id: AGENCY,
      company: "Not Yours Ltd",
      email: "someone@else.test",
      full_name: "Grace H",
      user_id: null,
    },
  ]
  store.tables.role_briefs = []
  store.tables.job_roles = []
  store.tables.audit_log = []
  holder.client = store
})

// ============================================================
// submitBrief — the contact is proved before anything is written
// ============================================================

describe("submitBrief — a client-supplied contactId is never trusted", () => {
  it("refuses a contact the session did not resolve, and writes nothing at all", async () => {
    await expect(
      submitBrief(hiringCtx(), { contactId: STRANGER_CONTACT, roleTitle: "Staff Engineer" })
    ).rejects.toBeInstanceOf(AgencyAccessError)

    // Not "no row for that agency" — no INSERT was attempted in the first
    // place. The check happens before the client is even reached for.
    expect(store.rows("role_briefs")).toHaveLength(0)
    expect(store.calls.filter((c) => c.method === "insert")).toHaveLength(0)
    expect(store.audit()).toHaveLength(0)
  })

  it("gives an unknown contact the same answer as someone else's contact", async () => {
    const guessed = submitBrief(hiringCtx(), {
      contactId: "no-such-contact-at-all",
      roleTitle: "Staff Engineer",
    })
    const stolen = submitBrief(hiringCtx(), {
      contactId: STRANGER_CONTACT,
      roleTitle: "Staff Engineer",
    })

    await expect(guessed).rejects.toBeInstanceOf(AgencyAccessError)
    await expect(stolen).rejects.toBeInstanceOf(AgencyAccessError)
    expect(store.rows("role_briefs")).toHaveLength(0)
  })

  it("derives agency_id from the matching link, not from the request", async () => {
    // One person, two agencies. Filing against the rival contact must land in
    // the RIVAL agency — and an agencyId smuggled into the payload is ignored,
    // because the function never reads one.
    const ctx = hiringCtx([link(), rivalLink()])

    const { briefId } = await submitBrief(ctx, {
      contactId: RIVAL_CONTACT,
      roleTitle: "Head of Data",
      // A hostile client sending the field it wishes existed.
      ...({ agencyId: AGENCY, agency_id: AGENCY } as Record<string, string>),
    })

    const row = briefRow(briefId)
    expect(row.agency_id).toBe(RIVAL)
    expect(row.contact_id).toBe(RIVAL_CONTACT)
    expect(row.status).toBe("submitted")

    // ...and the audit row is filed against the same agency, not the caller's
    // first link.
    expect(store.audit()).toHaveLength(1)
    expect(store.audit()[0]).toMatchObject({ agency_id: RIVAL, actor_id: HM })
  })

  it("files against the one link when there is only one, as 'submitted'", async () => {
    const { briefId } = await submitBrief(hiringCtx(), {
      contactId: CONTACT,
      roleTitle: "  Staff Platform Engineer  ",
      team: "Payments",
      mission: BODY.mission,
    })

    const row = briefRow(briefId)
    expect(row.agency_id).toBe(AGENCY)
    expect(row.contact_id).toBe(CONTACT)
    expect(row.role_title).toBe("Staff Platform Engineer")
    expect(row.status).toBe("submitted")
    // A client may only ever create 'submitted' — the decision columns are the
    // recruiter's and start empty.
    expect(row.decided_by).toBeNull()
    expect(row.decided_at).toBeNull()
    expect(row.role_id).toBeNull()
  })
})

describe("submitBrief — the audit row, and what it must not carry", () => {
  it("writes exactly one audit row, in the same operation as the insert", async () => {
    const { briefId } = await submitBrief(hiringCtx(), {
      contactId: CONTACT,
      roleTitle: "Staff Platform Engineer",
      ...BODY,
    })

    expect(store.audit()).toHaveLength(1)
    expect(store.audit()[0]).toMatchObject({
      agency_id: AGENCY,
      actor_id: HM,
      entity_type: "brief",
      entity_ref: "Staff Platform Engineer",
      action: "created",
      to_value: { brief_id: briefId, contact_id: CONTACT },
    })
  })

  it("keeps the brief body out of the audit log entirely", async () => {
    await submitBrief(hiringCtx(), {
      contactId: CONTACT,
      roleTitle: "Staff Platform Engineer",
      team: "Payments",
      ...BODY,
      location: "London / hybrid",
    })

    const log = JSON.stringify(store.audit())
    expect(log).not.toContain(BODY.mission)
    expect(log).not.toContain(BODY.mustHaves)
    expect(log).not.toContain(BODY.niceToHaves)
    expect(log).not.toContain(BODY.comp)
    // The named third party inside nice-to-haves is the reason this rule
    // exists.
    expect(log).not.toContain("Dhruv Patel")
    // No client identity either — the contact travels as a uuid.
    expect(log).not.toContain(CONTACT_NAME)
    expect(log).not.toContain("@")

    // ...and the row is not empty, so this cannot pass vacuously.
    expect(store.audit()).toHaveLength(1)
    expect(store.audit()[0].entity_ref).toBe("Staff Platform Engineer")

    // The body DID reach the table it belongs in — otherwise the assertions
    // above would be proving only that nothing was stored anywhere.
    expect(store.rows("role_briefs")[0].mission).toBe(BODY.mission)
  })

  it("caps a paste-bomb before it reaches the database", async () => {
    const { briefId } = await submitBrief(hiringCtx(), {
      contactId: CONTACT,
      roleTitle: "T".repeat(500),
      mission: "M".repeat(10_000),
    })

    const row = briefRow(briefId)
    expect(row.role_title).toHaveLength(200)
    expect(row.mission).toHaveLength(4000)
  })

  it("refuses a blank title as a bug, not a permission decision", async () => {
    const err = await submitBrief(hiringCtx(), {
      contactId: CONTACT,
      roleTitle: "   ",
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(AgencyAccessError)
    expect(store.rows("role_briefs")).toHaveLength(0)
  })
})

// ============================================================
// listBriefsForHiringManager
// ============================================================

describe("listBriefsForHiringManager", () => {
  it("returns an empty list and issues no query when the session holds no links", async () => {
    putBrief()
    store.calls = []

    const rows = await listBriefsForHiringManager(hiringCtx([]))

    expect(rows).toEqual([])
    // A hiring manager with no links is not an error and not a query — the
    // service role bypasses RLS, so an unfiltered read here would be a leak.
    expect(store.calls).toHaveLength(0)
  })

  it("returns only the caller's own briefs, newest first, in list shape", async () => {
    putBrief({ id: "brief-old", created_at: "2026-01-01T00:00:00.000Z" })
    putBrief({ id: "brief-new", created_at: "2026-06-01T00:00:00.000Z" })
    putBrief({ id: "brief-elsewhere", agency_id: RIVAL, contact_id: RIVAL_CONTACT })

    const rows = await listBriefsForHiringManager(hiringCtx())

    expect(rows.map((r) => r.id)).toEqual(["brief-new", "brief-old"])
    // The body fields are a detail read; they must not appear in the list
    // payload at all.
    expect(JSON.stringify(rows)).not.toContain(BODY.mission)
    expect(JSON.stringify(rows)).not.toContain(BODY.mustHaves)
    expect(rows[0]).not.toHaveProperty("decided_by")
  })
})

// ============================================================
// acceptBrief — exactly one role, ever
// ============================================================

describe("acceptBrief — the happy path", () => {
  it("claims the brief, mints one ref, inserts the role and stamps it back", async () => {
    putBrief()

    const result = await acceptBrief(agencyCtx(), "brief-live")

    // The claim.
    const brief = briefRow()
    expect(brief.status).toBe("accepted")
    expect(brief.decided_by).toBe(RECRUITER)
    expect(typeof brief.decided_at).toBe("string")

    // Exactly one ref, from the service-role sequence, for this agency.
    expect(store.rpc).toHaveBeenCalledTimes(1)
    expect(store.rpc).toHaveBeenCalledWith("next_role_ref", { p_agency: AGENCY })
    expect(store.mintedRefs).toEqual(["ROL-01"])

    // The role. It lands as a draft — accepting starts the work, it does not
    // open a role — with the CLIENT's company off the agency's contact row.
    expect(roleRows()).toHaveLength(1)
    const role = roleRows()[0]
    expect(role).toMatchObject({
      agency_id: AGENCY,
      ref: "ROL-01",
      title: "Staff Platform Engineer",
      company: COMPANY,
      company_context: "Payments",
      salary_band: BODY.comp,
      location: "London / hybrid",
      status: "draft",
      created_by: RECRUITER,
    })

    // The body is composed into jd_raw under headings step 02's parse can read.
    expect(role.jd_raw).toContain("Mission\n" + BODY.mission)
    expect(role.jd_raw).toContain("Must-haves\n" + BODY.mustHaves)
    expect(role.jd_raw).toContain("Nice-to-haves\n" + BODY.niceToHaves)

    // The stamp — this is what makes a retry idempotent.
    expect(brief.role_id).toBe(role.id)
    expect(result).toEqual({ roleId: role.id, ref: "ROL-01" })
  })

  it("writes BOTH audit rows — the role's creation and the brief's decision", async () => {
    putBrief()

    const { roleId } = await acceptBrief(agencyCtx(), "brief-live")

    expect(store.audit()).toHaveLength(2)
    expect(store.audit()[0]).toMatchObject({
      agency_id: AGENCY,
      role_id: roleId,
      actor_id: RECRUITER,
      entity_type: "role",
      entity_ref: "ROL-01",
      action: "created",
      to_value: { title: "Staff Platform Engineer", brief_id: "brief-live" },
      reason: "brief_accepted",
    })
    expect(store.audit()[1]).toMatchObject({
      agency_id: AGENCY,
      role_id: roleId,
      actor_id: RECRUITER,
      entity_type: "brief",
      entity_ref: "Staff Platform Engineer",
      action: "accepted",
      to_value: { brief_id: "brief-live", role_id: roleId, ref: "ROL-01" },
    })

    // Titles and refs only — the brief body stays out of the trail from both
    // ends.
    const log = JSON.stringify(store.audit())
    expect(log).not.toContain(BODY.mission)
    expect(log).not.toContain(BODY.mustHaves)
    expect(log).not.toContain(BODY.comp)
    expect(log).not.toContain("Dhruv Patel")
    expect(log).not.toContain(CONTACT_NAME)
  })

  it("converts a brief whose contact has since been removed, leaving company blank", async () => {
    putBrief({ contact_id: "deleted-contact" })

    const { roleId } = await acceptBrief(agencyCtx(), "brief-live")

    expect(roleRows()).toHaveLength(1)
    expect(roleRows()[0].company).toBe("")
    expect(briefRow().role_id).toBe(roleId)
  })

  it("refuses a viewer, and decides nothing", async () => {
    putBrief()

    await expect(acceptBrief(agencyCtx({ role: "viewer" }), "brief-live")).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(briefRow().status).toBe("submitted")
    expect(store.rpc).not.toHaveBeenCalled()
    expect(roleRows()).toHaveLength(0)
  })
})

describe("acceptBrief — a retry can never mint a second role", () => {
  it("hands back the existing role for an accepted brief without asking for a ref", async () => {
    putBrief()
    const first = await acceptBrief(agencyCtx(), "brief-live")
    store.rpc.mockClear()

    // The double-click, the retried request, the second recruiter.
    const second = await acceptBrief(agencyCtx({ userId: OTHER_RECRUITER }), "brief-live")

    expect(second).toEqual(first)
    // The load-bearing assertion: no ref was requested, so no role could have
    // been minted.
    expect(store.rpc).toHaveBeenCalledTimes(0)
    expect(roleRows()).toHaveLength(1)
    expect(store.mintedRefs).toEqual(["ROL-01"])
    // ...and the original decision is untouched.
    expect(briefRow().decided_by).toBe(RECRUITER)
  })

  it("adds no further audit rows when resuming an already-converted brief", async () => {
    putBrief()
    await acceptBrief(agencyCtx(), "brief-live")
    store.tables.audit_log = []

    await acceptBrief(agencyCtx(), "brief-live")

    expect(store.audit()).toHaveLength(0)
  })

  it("finishes a half-done conversion: accepted with role_id null mints once", async () => {
    // The one accepted failure mode — the process died between the claim and
    // the insert. The next call must complete it, not abandon it.
    putBrief({
      status: "accepted",
      role_id: null,
      decided_by: RECRUITER,
      decided_at: new Date().toISOString(),
    })

    const result = await acceptBrief(agencyCtx(), "brief-live")

    expect(store.rpc).toHaveBeenCalledTimes(1)
    expect(store.mintedRefs).toEqual(["ROL-01"])
    expect(roleRows()).toHaveLength(1)
    expect(briefRow().role_id).toBe(result.roleId)
    expect(result.ref).toBe("ROL-01")

    // And running it once more now takes the resume path — still one role.
    store.rpc.mockClear()
    const again = await acceptBrief(agencyCtx(), "brief-live")
    expect(again).toEqual(result)
    expect(store.rpc).toHaveBeenCalledTimes(0)
    expect(roleRows()).toHaveLength(1)
  })

  /**
   * The boundary of the guarantee, pinned deliberately.
   *
   * The claim protects SEQUENTIAL retries — the case the UI actually produces
   * (a double-click is two round trips, a retry follows a completed request).
   * Two accepts genuinely IN FLIGHT AT ONCE are a different story: the loser of
   * the claim re-reads, finds 'accepted' with role_id still null, cannot tell
   * "the winner is mid-flight" from "the winner died", and — by design, because
   * the alternative is abandoning a half-done conversion forever — finishes the
   * job itself. Both mint.
   *
   * This is not a passing test dressed up as a caveat: it is the assertion that
   * fails the day someone changes that trade-off. If a future version closes
   * the window (a claim token, an rpc that mints and stamps in one statement,
   * a unique index on role_briefs.role_id), this test SHOULD fail — and the
   * right fix is to change it to expect one role, not to widen it.
   */
  it("two accepts genuinely in flight at once both mint — the documented window", async () => {
    putBrief()

    const [a, b] = await Promise.all([
      acceptBrief(agencyCtx(), "brief-live"),
      acceptBrief(agencyCtx({ userId: OTHER_RECRUITER }), "brief-live"),
    ])

    expect(roleRows()).toHaveLength(2)
    expect(a.roleId).not.toBe(b.roleId)
    expect(store.mintedRefs).toEqual(["ROL-01", "ROL-02"])

    // The brief still ends up pointing at exactly one of them...
    const stamped = briefRow().role_id
    expect([a.roleId, b.roleId]).toContain(stamped)

    // ...and from here on the answer is stable: every later call resumes that
    // one role and mints nothing further. The damage is bounded to one orphan
    // draft, which is why the trade-off was taken.
    store.rpc.mockClear()
    const later = await acceptBrief(agencyCtx(), "brief-live")
    expect(later.roleId).toBe(stamped)
    expect(store.rpc).toHaveBeenCalledTimes(0)
    expect(roleRows()).toHaveLength(2)
  })

  it("never overturns a decline", async () => {
    putBrief({ status: "declined", decided_by: RECRUITER, decided_at: new Date().toISOString() })

    await expect(acceptBrief(agencyCtx(), "brief-live")).rejects.toBeInstanceOf(AgencyAccessError)
    expect(briefRow().status).toBe("declined")
    expect(store.rpc).not.toHaveBeenCalled()
    expect(roleRows()).toHaveLength(0)
  })
})

// ============================================================
// Cross-tenant: a brief id from another agency is a non-event
// ============================================================

describe("another agency's brief is invisible to both decisions", () => {
  it("acceptBrief refuses it, mints nothing, and says nothing about it", async () => {
    putBrief({ agency_id: RIVAL, contact_id: RIVAL_CONTACT })

    const err = await acceptBrief(agencyCtx(), "brief-live").catch((e: unknown) => e)

    expect(err).toBeInstanceOf(AgencyAccessError)
    // Same message a nonexistent id gets — a probe learns nothing either way.
    const missing = await acceptBrief(agencyCtx(), "no-such-brief").catch((e: unknown) => e)
    expect((err as Error).message).toBe((missing as Error).message)

    expect(briefRow().status).toBe("submitted")
    expect(store.rpc).not.toHaveBeenCalled()
    expect(roleRows()).toHaveLength(0)
    expect(store.audit()).toHaveLength(0)
  })

  it("declineBrief refuses it and leaves the row exactly as it was", async () => {
    putBrief({ agency_id: RIVAL, contact_id: RIVAL_CONTACT })

    await expect(declineBrief(agencyCtx(), "brief-live")).rejects.toBeInstanceOf(AgencyAccessError)

    expect(briefRow().status).toBe("submitted")
    expect(briefRow().decided_by).toBeNull()
    expect(briefRow().decided_at).toBeNull()
    expect(store.audit()).toHaveLength(0)
  })
})

// ============================================================
// declineBrief — an answer, not a disappearance
// ============================================================

describe("declineBrief", () => {
  it("sets a status and never deletes the client's record", async () => {
    putBrief()

    await declineBrief(agencyCtx(), "brief-live", "Head count paused until Q4")

    // The row is still there, and still readable by its author.
    expect(store.rows("role_briefs")).toHaveLength(1)
    expect(store.deletes()).toEqual([])
    expect(store.transcript()).not.toContain('"method":"delete"')

    const row = briefRow()
    expect(row.status).toBe("declined")
    expect(row.decided_by).toBe(RECRUITER)
    expect(typeof row.decided_at).toBe("string")
    // The brief the client wrote is untouched.
    expect(row.mission).toBe(BODY.mission)
    expect(row.role_id).toBeNull()

    // And the hiring manager still sees it — as a decision.
    const seen = await listBriefsForHiringManager(hiringCtx())
    expect(seen.map((b) => b.status)).toEqual(["declined"])
  })

  it("audits the decline with the reason, and no brief body", async () => {
    putBrief()

    await declineBrief(agencyCtx(), "brief-live", "  Head count paused until Q4  ")

    expect(store.audit()).toHaveLength(1)
    expect(store.audit()[0]).toMatchObject({
      agency_id: AGENCY,
      actor_id: RECRUITER,
      entity_type: "brief",
      entity_ref: "Staff Platform Engineer",
      action: "declined",
      to_value: { brief_id: "brief-live" },
      reason: "Head count paused until Q4",
    })

    const log = JSON.stringify(store.audit())
    expect(log).not.toContain(BODY.mission)
    expect(log).not.toContain(BODY.mustHaves)
    expect(log).not.toContain(BODY.comp)
    expect(log).not.toContain(CONTACT_NAME)
  })

  it("takes no reason without complaint", async () => {
    putBrief()
    await declineBrief(agencyCtx(), "brief-live")
    expect(store.audit()[0].reason).toBeNull()
    expect(briefRow().status).toBe("declined")
  })

  it("cannot decide the same brief twice, and cannot un-accept one", async () => {
    putBrief()
    await declineBrief(agencyCtx(), "brief-live")
    store.tables.audit_log = []

    await expect(declineBrief(agencyCtx(), "brief-live")).rejects.toBeInstanceOf(AgencyAccessError)
    expect(store.audit()).toHaveLength(0)

    putBrief({ id: "brief-accepted", status: "accepted", role_id: "role-1" })
    await expect(declineBrief(agencyCtx(), "brief-accepted")).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(briefRow("brief-accepted").status).toBe("accepted")
    expect(store.rows("role_briefs")).toHaveLength(2)
  })

  it("refuses a viewer before touching the row", async () => {
    putBrief()
    await expect(declineBrief(agencyCtx({ role: "viewer" }), "brief-live")).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(briefRow().status).toBe("submitted")
    expect(store.calls.filter((c) => c.method === "update")).toHaveLength(0)
  })
})

// ============================================================
// listBriefsForAgency — the recruiter's triage queue
// ============================================================

describe("listBriefsForAgency", () => {
  it("returns only this agency's briefs, newest first, with company and ref", async () => {
    putBrief({ id: "brief-old", created_at: "2026-01-01T00:00:00.000Z" })
    putBrief({ id: "brief-new", created_at: "2026-06-01T00:00:00.000Z" })
    putBrief({ id: "brief-elsewhere", agency_id: RIVAL, contact_id: RIVAL_CONTACT })

    const rows = await listBriefsForAgency(agencyCtx())

    expect(rows.map((r) => r.id)).toEqual(["brief-new", "brief-old"])
    expect(rows[0]).toMatchObject({
      company: COMPANY,
      contactName: CONTACT_NAME,
      status: "submitted",
      roleId: null,
      roleRef: null,
    })
    // The recruiter's queue is still a list, not a body dump.
    expect(JSON.stringify(rows)).not.toContain(BODY.mission)
  })

  it("resolves the minted ref once a brief has been converted", async () => {
    putBrief()
    const { roleId } = await acceptBrief(agencyCtx(), "brief-live")

    const rows = await listBriefsForAgency(agencyCtx())

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "accepted", roleId, roleRef: "ROL-01" })
  })

  it("narrows to a status when asked", async () => {
    putBrief({ id: "brief-a" })
    putBrief({ id: "brief-b" })
    await declineBrief(agencyCtx(), "brief-b")

    expect((await listBriefsForAgency(agencyCtx(), { status: "submitted" })).map((r) => r.id)).toEqual(
      ["brief-a"]
    )
    expect((await listBriefsForAgency(agencyCtx(), { status: "declined" })).map((r) => r.id)).toEqual(
      ["brief-b"]
    )
  })

  it("is an empty list, not an error, for an agency with no briefs", async () => {
    expect(await listBriefsForAgency(agencyCtx())).toEqual([])
  })
})

// ============================================================
// The standing rule
// ============================================================

describe("a full brief lifecycle leaves no body text and no PII in the log", () => {
  it("survives submit → accept and submit → decline with a clean audit trail", async () => {
    const filed = await submitBrief(hiringCtx(), {
      contactId: CONTACT,
      roleTitle: "Staff Platform Engineer",
      team: "Payments",
      ...BODY,
      location: "London / hybrid",
    })
    const rejected = await submitBrief(hiringCtx(), {
      contactId: CONTACT,
      roleTitle: "Head of Data",
      ...BODY,
    })

    await acceptBrief(agencyCtx(), filed.briefId)
    await declineBrief(agencyCtx(), rejected.briefId, "Head count paused")

    const log = JSON.stringify(store.audit())
    expect(log).not.toContain(BODY.mission)
    expect(log).not.toContain(BODY.mustHaves)
    expect(log).not.toContain(BODY.niceToHaves)
    expect(log).not.toContain(BODY.comp)
    expect(log).not.toContain("Dhruv Patel")
    expect(log).not.toContain(CONTACT_NAME)
    expect(log).not.toContain("@")

    // Not vacuous: the trail is complete, in order, and joins up.
    expect(store.audit().map((a) => `${a.entity_type}:${a.action}`)).toEqual([
      "brief:created",
      "brief:created",
      "role:created",
      "brief:accepted",
      "brief:declined",
    ])
    expect(roleRows()).toHaveLength(1)
    expect(store.rows("role_briefs")).toHaveLength(2)
  })
})
