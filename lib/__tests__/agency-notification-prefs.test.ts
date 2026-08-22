/**
 * Reading and writing notification preferences.
 *
 * The behaviour most worth guarding is the one that is easiest to get wrong:
 * "follow the agency again" must DELETE this person's row, not write today's
 * resolved value into it. Writing the resolved value looks identical on screen
 * and is a different feature — the owner later changes the default and this
 * person, who explicitly asked to follow the agency, silently does not.
 *
 * The others: an owner setting a default must never touch somebody's own row,
 * and only an owner may set one at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = { agency_id: string; user_id: string | null; event_kind: string; enabled: boolean }

const store = vi.hoisted(() => ({
  rows: [] as Row[],
  audit: [] as Record<string, unknown>[],
  deletes: [] as Record<string, unknown>[],
}))

const admin = vi.hoisted(() => ({
  from(table: string) {
    if (table !== "notification_prefs") throw new Error(`unexpected table ${table}`)
    const filters: Record<string, unknown> = {}
    const chain: Record<string, unknown> = {}
    let mode: "select" | "delete" | "insert" = "select"

    chain.select = () => { mode = "select"; return chain }
    chain.eq = (col: string, v: unknown) => { filters[col] = v; return chain }
    chain.is = (col: string, v: unknown) => { filters[col] = v; return chain }
    chain.delete = () => { mode = "delete"; return chain }
    chain.insert = (payload: Row) => {
      mode = "insert"
      store.rows.push(payload)
      return chain
    }

    const settle = () => {
      if (mode === "delete") {
        store.deletes.push({ ...filters })
        store.rows = store.rows.filter((r) => {
          const matches = Object.entries(filters).every(([k, v]) => (r as never as Record<string, unknown>)[k] === v)
          return !matches
        })
        return { data: null, error: null }
      }
      if (mode === "insert") return { data: null, error: null }
      const data = store.rows.filter((r) =>
        Object.entries(filters).every(([k, v]) => (r as never as Record<string, unknown>)[k] === v)
      )
      return { data, error: null }
    }
    chain.then = (resolve: (v: unknown) => unknown) => resolve(settle())
    return chain
  },
}))

vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return {
    ...actual,
    agencyAdmin: () => admin,
    writeAudit: async (_a: unknown, entry: Record<string, unknown>) => {
      store.audit.push(entry)
    },
  }
})

import { getNotificationPrefs, setMyPreference, setAgencyDefault } from "../agency/notification-prefs"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext } from "../agency/types"

const OWNER: AgencyContext = { agencyId: "a1", userId: "owner-1", role: "owner" }
const REC: AgencyContext = { agencyId: "a1", userId: "rec-1", role: "recruiter" }

beforeEach(() => {
  store.rows = []
  store.audit = []
  store.deletes = []
})

describe("reading", () => {
  it("absent rows read as following the agency, and on", async () => {
    const view = await getNotificationPrefs(REC)
    expect(view.mine.brief_filed).toBe("agency")
    expect(view.defaults.brief_filed).toBe(true)
    expect(view.effective.brief_filed).toBe(true)
  })

  it("shows the agency default behind an inherited switch", async () => {
    store.rows.push({ agency_id: "a1", user_id: null, event_kind: "brief_filed", enabled: false })
    const view = await getNotificationPrefs(REC)
    expect(view.mine.brief_filed).toBe("agency")
    expect(view.defaults.brief_filed).toBe(false)
    expect(view.effective.brief_filed).toBe(false)
  })

  it("a personal choice shows as mine and wins over the default", async () => {
    store.rows.push({ agency_id: "a1", user_id: null, event_kind: "brief_filed", enabled: false })
    store.rows.push({ agency_id: "a1", user_id: "rec-1", event_kind: "brief_filed", enabled: true })
    const view = await getNotificationPrefs(REC)
    expect(view.mine.brief_filed).toBe("on")
    expect(view.defaults.brief_filed).toBe(false)
    expect(view.effective.brief_filed).toBe(true)
  })

  it("does not mistake a colleague's row for mine", async () => {
    store.rows.push({ agency_id: "a1", user_id: "rec-2", event_kind: "brief_filed", enabled: false })
    const view = await getNotificationPrefs(REC)
    expect(view.mine.brief_filed).toBe("agency")
    expect(view.effective.brief_filed).toBe(true)
  })

  it("only an owner is told they may edit the defaults", async () => {
    expect((await getNotificationPrefs(OWNER)).canEditDefaults).toBe(true)
    expect((await getNotificationPrefs(REC)).canEditDefaults).toBe(false)
  })
})

describe("writing my own", () => {
  it("stores my choice", async () => {
    const view = await setMyPreference(REC, "brief_filed", "off")
    expect(view.mine.brief_filed).toBe("off")
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({ user_id: "rec-1", enabled: false })
  })

  it("'follow the agency' DELETES my row rather than freezing today's value", async () => {
    store.rows.push({ agency_id: "a1", user_id: null, event_kind: "brief_filed", enabled: false })
    store.rows.push({ agency_id: "a1", user_id: "rec-1", event_kind: "brief_filed", enabled: true })

    const view = await setMyPreference(REC, "brief_filed", "agency")

    // No row of my own left...
    expect(store.rows.filter((r) => r.user_id === "rec-1")).toHaveLength(0)
    // ...the agency's row untouched...
    expect(store.rows.filter((r) => r.user_id === null)).toHaveLength(1)
    // ...and I now follow it, rather than being stuck on the 'true' I had.
    expect(view.mine.brief_filed).toBe("agency")
    expect(view.effective.brief_filed).toBe(false)
  })

  it("replaces rather than duplicates when I change my mind", async () => {
    await setMyPreference(REC, "brief_filed", "on")
    await setMyPreference(REC, "brief_filed", "off")
    const mine = store.rows.filter((r) => r.user_id === "rec-1" && r.event_kind === "brief_filed")
    expect(mine).toHaveLength(1)
    expect(mine[0]!.enabled).toBe(false)
  })

  it("audits the change", async () => {
    await setMyPreference(REC, "brief_filed", "off")
    expect(store.audit).toHaveLength(1)
    expect(store.audit[0]).toMatchObject({
      entityType: "notification",
      entityRef: "brief_filed",
      action: "preference_set",
      actorId: "rec-1",
    })
  })
})

describe("writing the agency default", () => {
  it("only an owner may", async () => {
    await expect(setAgencyDefault(REC, "brief_filed", false)).rejects.toBeInstanceOf(AgencyAccessError)
    expect(store.rows).toHaveLength(0)
    expect(store.audit).toHaveLength(0)
  })

  it("never overwrites somebody's own choice", async () => {
    store.rows.push({ agency_id: "a1", user_id: "rec-1", event_kind: "brief_filed", enabled: true })
    await setAgencyDefault(OWNER, "brief_filed", false)

    const personal = store.rows.filter((r) => r.user_id === "rec-1")
    expect(personal).toHaveLength(1)
    expect(personal[0]!.enabled).toBe(true)

    // And that person still gets it, because their own choice wins.
    expect((await getNotificationPrefs(REC)).effective.brief_filed).toBe(true)
    // While somebody who never chose now follows the new default.
    expect((await getNotificationPrefs(OWNER)).effective.brief_filed).toBe(false)
  })

  it("replaces the previous default rather than stacking a second one", async () => {
    await setAgencyDefault(OWNER, "brief_filed", false)
    await setAgencyDefault(OWNER, "brief_filed", true)
    const defaults = store.rows.filter((r) => r.user_id === null && r.event_kind === "brief_filed")
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.enabled).toBe(true)
  })
})
