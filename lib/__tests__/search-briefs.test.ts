/**
 * The brief's server half — the promises the code has to keep that a mock
 * would only agree with (23 Sep 2026, frame 25). Scans by function body,
 * never by character count (the vacuous-slice lesson of 22 Sep).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const sql = (src: string) => src.replace(/^\s*--.*$/gm, "")
const lib = code(read("lib/agency/search-briefs.ts"))
const migration = sql(read("supabase/migrations/20260923120000_search_briefs.sql"))
const hmRoute = code(read("app/api/hiring/briefs/[briefId]/route.ts"))
const fnBody = (src: string, marker: string): string => {
  const start = src.indexOf(marker)
  if (start === -1) throw new Error(`not found: ${marker}`)
  const next = src.indexOf("\nexport ", start + marker.length)
  return src.slice(start, next === -1 ? src.length : next)
}

describe("approved means both signatures on one version", () => {
  it("a role connects only to an approved brief", () => {
    const fn = fnBody(lib, "export async function connectRoleToBrief")
    expect(fn).toMatch(/view\.state !== "approved"/)
    expect(fn).toMatch(/AgencyAccessError/)
  })
  it("approving is for the CURRENT version only, on both sides", () => {
    for (const m of ["export async function recruiterApprove", "export async function clientApprove"]) {
      expect(fnBody(lib, m)).toMatch(/version !== view\.currentVersion/)
    }
  })
  it("an amendment is a NEW row signed by its author only — nothing is un-signed", () => {
    const r = fnBody(lib, "export async function recruiterAmend")
    expect(r).toMatch(/\.insert\(/)
    expect(r).toMatch(/recruiter_approved_at: now/)
    expect(r).not.toMatch(/client_approved_at: null/)
    const c = fnBody(lib, "export async function clientAmend")
    expect(c).toMatch(/\.insert\(/)
    expect(c).toMatch(/client_approved_at: now/)
    expect(c).not.toMatch(/recruiter_approved_at: null/)
  })
  it("the database refuses a signature on an unsent draft", () => {
    expect(migration).toMatch(/search_brief_versions_signed_means_sent[\s\S]{0,200}sent_at is not null\s+or \(recruiter_approved_at is null and client_approved_at is null\)/)
  })
})

describe("the client's side is scoped and tiered", () => {
  it("reads only briefs addressed to the caller's own contact ids", () => {
    const fn = fnBody(lib, "export async function getBriefForClient")
    expect(fn).toMatch(/clientContactIds\(ctx/)
    expect(fn).toMatch(/return null/)
  })
  it("never shows a draft to the client", () => {
    expect(fnBody(lib, "export async function getBriefForClient")).toMatch(/view\.state === "draft"\) return null/)
    expect(fnBody(lib, "export async function listBriefsForClient")).toMatch(/!v\.sent_at\) continue/)
  })
  it("a client amendment goes through applyClientAmendment, so tier-2 keys cannot move", () => {
    expect(fnBody(lib, "export async function clientAmend")).toMatch(/applyClientAmendment\(view\.latest\.config, proposed\)/)
  })
  it("the agency's internal ids stay on the agency's side", () => {
    expect(hmRoute).toMatch(/const \{ agencyId, contactId, connectedRoles, \.\.\.rest \} = brief/)
  })
})

describe("connecting copies; nothing reads the brief live", () => {
  it("writes the whole config and the version onto the role together", () => {
    const fn = fnBody(lib, "export async function connectRoleToBrief")
    for (const k of ["brief_id: briefId", "brief_version: view.currentVersion", "brief_config: c", "brief_connected_at: now"]) expect(fn).toContain(k)
  })
  it("the database refuses half a connection", () => {
    expect(migration).toMatch(/job_roles_brief_connection_whole/)
    expect(migration).toMatch(/brief_id is not null and brief_version is not null and brief_config is not null and brief_connected_at is not null/)
  })
  it("divergence is computed from the COPY, on read", () => {
    const fn = fnBody(lib, "export async function roleBriefStatus")
    expect(fn).toMatch(/normaliseBrief\(role\.brief_config\)/)
    expect(fn).not.toMatch(/differences_stored|divergence_flag/)
  })
  it("does not map the brief's time-of-day windows onto the settings' date windows", () => {
    const fn = fnBody(lib, "export async function connectRoleToBrief")
    expect(fn).not.toMatch(/windowFrom: c\.windowFrom|windowTo: c\.windowTo/)
  })
})

describe("the tables are audit-coupled", () => {
  it("grants the browser SELECT only and the service role the writes", () => {
    for (const t of ["search_briefs", "search_brief_versions"]) {
      expect(migration).toMatch(new RegExp(`grant select on agency\\.${t} to authenticated`))
      expect(migration).toMatch(new RegExp(`grant select, insert, update, delete on agency\\.${t} to service_role`))
      expect(migration).not.toMatch(new RegExp(`grant (insert|update|delete)[^;]*agency\\.${t} to authenticated`))
    }
  })
  it("every write in the module writes an audit row", () => {
    for (const m of ["createBrief", "sendBrief", "recruiterAmend", "recruiterApprove", "discardDraft", "clientAmend", "clientApprove", "connectRoleToBrief"]) {
      expect(fnBody(lib, `export async function ${m}`), m).toMatch(/writeAudit\(/)
    }
  })
  it("the client-facing notification kinds are NOT storable as preferences", () => {
    const list = migration.slice(migration.lastIndexOf("event_kind in ("))
    for (const k of ["brief_sent", "brief_changed", "brief_approved'"]) expect(list).not.toContain(`'${k}`)
    for (const k of ["brief_amended_by_client", "brief_approved_by_client"]) expect(list).toContain(`'${k}'`)
  })
})
