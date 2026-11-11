/**
 * Agency settings.
 *
 * These two numbers decide how long a stranger's CV survives and how long
 * before they are told it exists, so the rules worth testing are the ones that
 * stop them being set carelessly: only an owner may change them, the notice
 * cap is not negotiable, and a change is answerable afterwards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const admin = vi.hoisted(() => ({ from: vi.fn() }))
const writeAudit = vi.hoisted(() => vi.fn())

vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return { ...actual, agencyAdmin: () => admin, writeAudit }
})

import { getAgencySettings, updateAgencySettings, NOTICE_MAX } from "../agency/settings"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext } from "../agency/types"

const OWNER: AgencyContext = { agencyId: "agency-1", userId: "owner-1", role: "owner" }
const RECRUITER: AgencyContext = { ...OWNER, userId: "rec-1", role: "recruiter" }

const CURRENT = { name: "Halcyon Search", retention_days: 180, notice_delay_days: 7 }

/**
 * updateAgencySettings reads BEFORE and returns AFTER, through two different
 * terminals: maybeSingle() for the read, single() for the update's .select().
 * The stub honours that distinction so a from → to assertion is meaningful
 * rather than comparing a value with itself.
 */
function table(
  before: unknown,
  after: unknown = before,
  capture?: (p: unknown) => void
) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) chain[m] = () => chain
  chain.update = (p: unknown) => {
    capture?.(p)
    return chain
  }
  chain.maybeSingle = () => Promise.resolve(before)
  chain.single = () => Promise.resolve(after)
  chain.then = (r: (v: unknown) => unknown) => r(before)
  return chain
}

beforeEach(() => vi.clearAllMocks())

describe("who may change them", () => {
  it("tells a recruiter they can look but not change", async () => {
    admin.from.mockImplementation(() => table({ data: CURRENT, error: null }))
    const s = await getAgencySettings(RECRUITER)
    expect(s.canEdit).toBe(false)
    expect(s.retentionDays).toBe(180)
  })

  it("refuses a recruiter's write before touching the database", async () => {
    admin.from.mockImplementation(() => table({ data: CURRENT, error: null }))
    await expect(
      updateAgencySettings(RECRUITER, { retentionDays: 30 })
    ).rejects.toBeInstanceOf(AgencyAccessError)
    expect(admin.from).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe("the limits", () => {
  beforeEach(() => {
    admin.from.mockImplementation(() => table({ data: CURRENT, error: null }))
  })

  it("refuses a notice delay past the cap, and says the cap is not adjustable", async () => {
    await expect(
      updateAgencySettings(OWNER, { noticeDelayDays: NOTICE_MAX + 1 })
    ).rejects.toThrow(/not adjustable/)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("accepts zero — telling them the same day is a legitimate choice", async () => {
    let patch: Record<string, unknown> = {}
    admin.from.mockImplementation(() =>
      table(
        { data: CURRENT, error: null },
        { data: { ...CURRENT, notice_delay_days: 0 }, error: null },
        (p) => (patch = p as Record<string, unknown>)
      )
    )
    const s = await updateAgencySettings(OWNER, { noticeDelayDays: 0 })
    expect(patch.notice_delay_days).toBe(0)
    expect(s.noticeDelayDays).toBe(0)
  })

  it("refuses retention outside the schema's own range", async () => {
    await expect(updateAgencySettings(OWNER, { retentionDays: 0 })).rejects.toThrow(/between/)
    await expect(updateAgencySettings(OWNER, { retentionDays: 99999 })).rejects.toThrow(/between/)
  })

  it("truncates rather than storing a fractional day", async () => {
    let patch: Record<string, unknown> = {}
    admin.from.mockImplementation(() =>
      table(
        { data: CURRENT, error: null },
        { data: { ...CURRENT, retention_days: 90 }, error: null },
        (p) => (patch = p as Record<string, unknown>)
      )
    )
    await updateAgencySettings(OWNER, { retentionDays: 90.7 })
    expect(patch.retention_days).toBe(90)
  })
})

describe("answerability", () => {
  it("logs the change with what it was before", async () => {
    admin.from.mockImplementation(() =>
      table({ data: CURRENT, error: null }, { data: { ...CURRENT, retention_days: 90 }, error: null })
    )
    await updateAgencySettings(OWNER, { retentionDays: 90 })
    const entry = writeAudit.mock.calls[0]?.[1] as {
      fromValue: Record<string, number>
      toValue: Record<string, number>
      actorId: string
      action: string
    }
    expect(entry.action).toBe("settings_changed")
    expect(entry.actorId).toBe("owner-1")
    // "Who shortened retention, and from what" has to be answerable.
    expect(entry.fromValue.retention_days).toBe(180)
    expect(entry.toValue.retention_days).toBe(90)
  })

  it("writes nothing at all when nothing changed", async () => {
    admin.from.mockImplementation(() => table({ data: CURRENT, error: null }))
    const s = await updateAgencySettings(OWNER, {})
    expect(s.retentionDays).toBe(180)
    expect(writeAudit).not.toHaveBeenCalled()
  })
})
