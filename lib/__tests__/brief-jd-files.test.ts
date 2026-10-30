/**
 * The job description on the brief — the promises that a mock would only
 * agree with (26 Sep 2026). Source scans by function body and SQL reads,
 * never a character window (the vacuous-slice lesson of 22 Sep).
 *
 * What each one protects:
 *   · the row is the pointer that makes the blob erasable — written in the
 *     same function as the upload, and the blob removed when it cannot be
 *   · the browser holds nothing on the table; the bucket is private with
 *     no policies (the CV pointer lesson of 19 Sep, applied first)
 *   · the four routes scope by agency (recruiter) or contact (client)
 *   · nobody but the two sides ever imports the module — not a candidate,
 *     not a referee, not a token doorway
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

// The behavioural half runs the module against a stub admin client, the way
// agency-artifacts.test.ts does — no network, no bucket.
const admin = vi.hoisted(() => ({ from: vi.fn(), storage: { from: vi.fn() } }))
const writeAudit = vi.hoisted(() => vi.fn())
vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return { ...actual, agencyAdmin: () => admin, writeAudit }
})
import { briefJdContentType, storeBriefJd, assertJdOnBrief, BRIEF_JD_MAX_FILES, BRIEF_JD_TYPES } from "../agency/brief-files"
import { AgencyAccessError } from "../agency/db"

/** A query chain that answers `result` when awaited, whatever was chained. */
function table(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "is", "insert", "delete", "maybeSingle", "single"]) chain[m] = () => chain
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return chain
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const sql = (src: string) => src.replace(/^\s*--.*$/gm, "")
const fnBody = (src: string, marker: string): string => {
  const start = src.indexOf(marker)
  if (start === -1) throw new Error(`not found: ${marker}`)
  const next = src.indexOf("\nexport ", start + marker.length)
  return src.slice(start, next === -1 ? src.length : next)
}

const files = code(read("lib/agency/brief-files.ts"))
const briefs = code(read("lib/agency/search-briefs.ts"))
const migration = sql(read("supabase/migrations/20260926120000_brief_jd_files.sql"))
const ROUTES = {
  recruiterUpload: "app/api/agency/briefs/[briefId]/jd/route.ts",
  recruiterDownload: "app/api/agency/briefs/[briefId]/jd/[fileId]/route.ts",
  clientUpload: "app/api/hiring/briefs/[briefId]/jd/route.ts",
  clientDownload: "app/api/hiring/briefs/[briefId]/jd/[fileId]/route.ts",
} as const
const route = (k: keyof typeof ROUTES) => code(read(ROUTES[k]))

describe("the row is the pointer that makes the blob erasable", () => {
  const store = fnBody(files, "export async function storeBriefJd")

  it("uploads and inserts the pointer in the SAME function, upload first", () => {
    const upload = store.indexOf(".upload(")
    const insert = store.indexOf(".insert(")
    expect(upload).toBeGreaterThan(-1)
    expect(insert).toBeGreaterThan(upload)
    expect(store.slice(0, insert)).toMatch(/\.from\("search_brief_files"\)\s*$/) // the insert is on that table
    expect(store).toMatch(/storage_path: path/)
  })

  it("removes the blob at once when the pointer cannot be written, and throws", () => {
    const onFail = store.slice(store.indexOf("if (pointerError"))
    expect(onFail).toMatch(/\.remove\(\[path\]\)/)
    expect(onFail).toMatch(/ORPHANED JD/)
    expect(onFail).toMatch(/throw pointerError/)
  })

  it("stores the text capped, the hash, the size and who attached it", () => {
    expect(store).toMatch(/slice\(0, BRIEF_JD_TEXT_CAP\)/)
    expect(files).toMatch(/BRIEF_JD_TEXT_CAP = 20000/)
    expect(files).toMatch(/BRIEF_JD_LIMIT_BYTES = 10 \* 1024 \* 1024/)
    for (const k of ["sha256,", "size_bytes: file.buffer.length", "uploaded_by_side: ctx.side", "uploaded_by: ctx.userId", "text_chars: text.length"]) expect(store).toContain(k)
    expect(store).toMatch(/`\$\{ctx\.agencyId\}\/\$\{briefId\}\/\$\{fileId\}\/\$\{safeName\}`/)
  })

  it("the list paths never select the text column", () => {
    expect(files).toMatch(/const POINTER_COLUMNS = "id, name, size_bytes, content_type, uploaded_by_side, created_at, text_chars"/)
    // text_chars is the COUNT (an int) — never the text column itself.
    const cols = files.match(/const POINTER_COLUMNS = "([^"]+)"/)![1].split(", ")
    expect(cols).not.toContain("text")
    expect(cols).toContain("text_chars")
    expect(fnBody(files, "export async function listBriefJdFiles")).toMatch(/\.select\(POINTER_COLUMNS\)/)
    expect(fnBody(files, "export async function listBriefJdFiles")).not.toMatch(/text/)
    // The text is read in exactly one place: for connect.
    expect(fnBody(files, "export async function getBriefJdText")).toMatch(/\.select\("name, text"\)/)
  })

  it("deleting a draft's files removes blobs first and keeps the row of any blob that stayed", () => {
    const del = fnBody(files, "export async function deleteBriefJdFiles")
    const remove = del.indexOf(".remove(")
    const rowDelete = del.indexOf(".delete()")
    expect(remove).toBeGreaterThan(-1)
    expect(rowDelete).toBeGreaterThan(remove)
    expect(del).toMatch(/rows\.filter\(\(r\) => gone\.has\(r\.storage_path\)\)/)
    // And only a DRAFT's — discardDraft is the one caller, after its own state check.
    const discard = fnBody(briefs, "export async function discardDraft")
    expect(discard).toMatch(/view\.state !== "draft"/)
    expect(discard).toMatch(/deleteBriefJdFiles\(briefId\)/)
    expect(briefs.match(/deleteBriefJdFiles\(/g)?.length).toBe(1)
  })
})

describe("the file type is decided by the extension, and only by an own property", () => {
  const DOCX = BRIEF_JD_TYPES.docx
  it("accepts the three types, case-insensitively, with a matching, empty or octet-stream declared type", () => {
    const accepted: Array<[string, string, string]> = [
      ["JD.PDF", "", "application/pdf"],
      ["jd.pdf", "application/pdf", "application/pdf"],
      ["x.docx", "application/octet-stream", DOCX],
      ["x.docx", "", DOCX],
      ["x.txt", "text/plain; charset=utf-8", "text/plain"],
      ["Head of Growth (final).v2.txt", "", "text/plain"],
    ]
    for (const [name, declared, want] of accepted) {
      const got = briefJdContentType(name, declared)
      expect(got, `${name} / ${declared}`).toBe(want)
      expect(typeof got).toBe("string")
    }
  })
  it("refuses a mismatched declared type, a missing extension, and every other extension", () => {
    for (const [name, declared] of [["x.pdf", "text/plain"], ["jd", "application/pdf"], ["jd.doc", ""], ["jd.exe", ""], ["jd.pdf.html", ""], ["", ""]] as Array<[string, string]>) {
      expect(briefJdContentType(name, declared), `${name} / ${declared}`).toBeNull()
    }
  })
  it("never lets an inherited Object.prototype key through as a type", () => {
    for (const name of ["jd.constructor", "jd.__proto__", "jd.toString", "jd.hasOwnProperty", "jd.valueOf"]) {
      const got = briefJdContentType(name, "")
      expect(got, name).toBeNull()
    }
    // And the module never reaches for `in` on the map.
    expect(fnBody(files, "export function briefJdContentType")).not.toMatch(/\bin BRIEF_JD_TYPES/)
    expect(fnBody(files, "export function briefJdContentType")).toMatch(/hasOwnProperty\.call\(BRIEF_JD_TYPES/)
  })
})

describe("a brief holds a bounded number of files, and a config names only a file that is on it", () => {
  beforeEach(() => {
    admin.from.mockReset()
    admin.storage.from.mockReset()
    writeAudit.mockReset()
  })
  const CTX = { side: "recruiter" as const, agencyId: "agency-1", userId: "rec-1" }
  const FILE = { buffer: Buffer.from("A job description"), name: "jd.txt", contentType: "text/plain" }

  it("refuses the twenty-first file with a 400-class error and stores nothing", async () => {
    admin.from.mockReturnValue(table({ count: BRIEF_JD_MAX_FILES, error: null }))
    const upload = vi.fn()
    admin.storage.from.mockReturnValue({ upload, remove: vi.fn() })
    await expect(storeBriefJd({ ctx: CTX, briefId: "brief-1", file: FILE })).rejects.toBeInstanceOf(AgencyAccessError)
    expect(upload).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
    expect(BRIEF_JD_MAX_FILES).toBe(20)
  })

  it("counts with a head query on the brief's live rows, before the upload, in the same function", () => {
    const store = fnBody(files, "export async function storeBriefJd")
    const count = store.indexOf('{ count: "exact", head: true }')
    expect(count).toBeGreaterThan(-1)
    expect(count).toBeLessThan(store.indexOf(".upload("))
    expect(store.slice(count)).toMatch(/^[^\n]*\.eq\("brief_id", briefId\)\.is\("deleted_at", null\)/)
    expect(store).toMatch(/>= BRIEF_JD_MAX_FILES\) throw new AgencyAccessError/)
  })

  it("assertJdOnBrief throws AgencyAccessError for an id that is not a live file on that brief, and passes for one that is", async () => {
    const id = "3e386262-12b7-8155-bdeb-fa19cc33e7b8"
    admin.from.mockReturnValue(table({ data: [], error: null }))
    await expect(assertJdOnBrief("brief-1", id)).rejects.toBeInstanceOf(AgencyAccessError)
    admin.from.mockReturnValue(table({ data: [{ id, name: "jd.pdf", size_bytes: 10, content_type: "application/pdf", uploaded_by_side: "client", created_at: "2026-09-26T00:00:00Z" }], error: null }))
    await expect(assertJdOnBrief("brief-1", id)).resolves.toBeUndefined()
    // No file named is nothing to check.
    admin.from.mockReset()
    await expect(assertJdOnBrief("brief-1", null)).resolves.toBeUndefined()
    expect(admin.from).not.toHaveBeenCalled()
  })

  it("every write that records a config checks the file first — draft save, recruiter amend, client amend", () => {
    for (const m of ["saveDraft", "recruiterAmend", "clientAmend"]) {
      const body = fnBody(briefs, `export async function ${m}`)
      const check = body.indexOf("assertJdOnBrief(briefId, config.jdFileId)")
      expect(check, m).toBeGreaterThan(-1)
      const write = body.search(/\.from\("search_brief_versions"\)\.(insert|update)\(/)
      expect(write, m).toBeGreaterThan(check)
    }
    expect(fnBody(files, "export async function assertJdOnBrief")).toMatch(/listBriefJdFiles\(briefId, \[fileId\]\)[\s\S]*throw new AgencyAccessError/)
  })
})

describe("the upload routes are rate limited", () => {
  it("both call checkRateLimit on the caller with the upload preset, after auth and before the file is read", () => {
    for (const k of ["recruiterUpload", "clientUpload"] as const) {
      const r = route(k)
      const limit = r.indexOf('checkRateLimit(auth.ctx.userId, "upload")')
      expect(limit, k).toBeGreaterThan(r.indexOf("if (!auth.ok)"))
      expect(limit, k).toBeLessThan(r.indexOf("req.formData()"))
      expect(r, k).toMatch(/if \(limited\) return limited/)
    }
    const presets = code(read("lib/rate-limit.ts"))
    expect(presets).toMatch(/upload: \[\s*\{ key: 'upload:min', limit: 10,\s*windowSeconds: 60 \},\s*\{ key: 'upload:day', limit: 100, windowSeconds: DAY \},\s*\]/)
  })
})

describe("the database gives the browser nothing", () => {
  it("grants the table to the service role only, with RLS on", () => {
    expect(migration).toMatch(/alter table agency\.search_brief_files enable row level security/)
    expect(migration).toMatch(/grant select, insert, update, delete on agency\.search_brief_files to service_role/)
    expect(migration).not.toMatch(/grant[^;]*agency\.search_brief_files[^;]*to authenticated/)
    expect(migration).not.toMatch(/create policy[^;]*search_brief_files/)
  })
  it("the bucket is private, capped at 10 MB, three types, and has NO policies", () => {
    const bucket = migration.slice(migration.indexOf("insert into storage.buckets"), migration.indexOf("create table"))
    expect(bucket).toMatch(/'agency-briefs',\s*'agency-briefs',\s*false/)
    expect(bucket).toMatch(/10485760/)
    for (const t of ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]) expect(bucket).toContain(`'${t}'`)
    expect(bucket).toMatch(/set public = false/)
    expect(migration).not.toMatch(/create policy/i)
    expect(migration).not.toMatch(/storage\.objects/)
  })
  it("the table carries the pointer, the hash, the side and the cap", () => {
    const table = migration.slice(migration.indexOf("create table"), migration.indexOf("create index"))
    for (const col of ["storage_path      text not null unique", "sha256            text not null", "size_bytes > 0 and size_bytes <= 10485760", "uploaded_by_side in ('recruiter', 'client')", "references agency.search_briefs on delete cascade", "references agency.agencies on delete cascade", "deleted_at        timestamptz"]) {
      expect(table).toContain(col)
    }
    expect(migration).toMatch(/create index if not exists search_brief_files_brief_idx/)
    expect(migration).toMatch(/create index if not exists search_brief_files_agency_idx/)
  })
})

describe("the four routes scope to their own side", () => {
  it("the recruiter's routes go through requireAgencyContext and the agency-scoped read", () => {
    for (const k of ["recruiterUpload", "recruiterDownload"] as const) {
      const r = route(k)
      expect(r, k).toMatch(/requireAgencyContext\(\)/)
      expect(r, k).toMatch(/getBriefForRecruiter\(auth\.ctx, briefId\)/)
      expect(r, k).not.toMatch(/requireHiringContext/)
    }
    // Uploading is a write; a viewer may not.
    expect(route("recruiterUpload")).toMatch(/assertWriter\(auth\.ctx\)/)
    expect(route("recruiterUpload")).toMatch(/side: "recruiter"/)
  })
  it("the client's routes go through requireHiringContext and the contact-scoped read", () => {
    for (const k of ["clientUpload", "clientDownload"] as const) {
      const r = route(k)
      expect(r, k).toMatch(/requireHiringContext\(\)/)
      expect(r, k).toMatch(/getBriefForClient\(auth\.ctx, briefId\)/)
      expect(r, k).not.toMatch(/requireAgencyContext/)
      expect(r, k).not.toMatch(/agencyAdmin\(/)
    }
    expect(route("clientUpload")).toMatch(/side: "client"/)
    // The client uploads under the amendment's own condition: live, not approved by both.
    expect(route("clientUpload")).toMatch(/brief\.state === "approved"/)
  })
  it("the download routes pass the SCOPED brief's id, answer 404 off-brief, and send an attachment", () => {
    for (const k of ["recruiterDownload", "clientDownload"] as const) {
      const r = route(k)
      expect(r, k).toMatch(/readBriefJd\(brief\.id, fileId\)/)
      expect(r, k).toMatch(/if \(!found\) return NextResponse\.json\([^)]*\{ status: 404 \}\)/)
      expect(r, k).toMatch(/attachmentHeaders\(found\.file\)/)
    }
    expect(fnBody(files, "export function attachmentHeaders")).toMatch(/attachment; filename=/)
    expect(fnBody(files, "export async function readBriefJd")).toMatch(/\.eq\("brief_id", briefId\)[\s\S]*\.eq\("id", fileId\)/)
  })
  it("the upload routes take multipart field \"file\" and refuse the wrong type or size before storing", () => {
    for (const k of ["recruiterUpload", "clientUpload"] as const) {
      const r = route(k)
      expect(r, k).toMatch(/form\.get\("file"\)/)
      expect(r, k).toMatch(/uploaded\.size > BRIEF_JD_LIMIT_BYTES/)
      expect(r, k).toMatch(/briefJdContentType\(uploaded\.name, uploaded\.type\)/)
      expect(r, k).toMatch(/storeBriefJd\(/)
      expect(r, k).toMatch(/NextResponse\.json\(\{ file \}\)/)
    }
  })
  it("no route audits a download; the upload is audited once, in the module", () => {
    for (const k of Object.keys(ROUTES) as Array<keyof typeof ROUTES>) expect(route(k), k).not.toMatch(/writeAudit/)
  })
})

describe("nobody but the two sides imports the module", () => {
  function sourceFiles(dir: string): string[] {
    const abs = join(process.cwd(), dir)
    let entries: string[]
    try {
      entries = readdirSync(abs)
    } catch {
      return []
    }
    const out: string[] = []
    for (const entry of entries) {
      const full = join(abs, entry)
      if (statSync(full).isDirectory()) out.push(...sourceFiles(join(dir, entry)))
      else if (/\.tsx?$/.test(entry) && !full.includes("__tests__")) out.push(join(dir, entry))
    }
    return out
  }
  const ALLOWED = new Set<string>([...Object.values(ROUTES), "lib/agency/search-briefs.ts"])

  it("finds the doorways it is guarding", () => {
    for (const d of ["app/api/consent", "app/api/portal", "app/api/rights", "app/api/reference"]) expect(sourceFiles(d).length, d).toBeGreaterThan(0)
  })

  it("only the brief routes and the brief module import brief-files — never a doorway, a candidate or a referee surface", () => {
    const importers = [...sourceFiles("app"), ...sourceFiles("lib"), ...sourceFiles("components")].filter((f) => /from\s+["'](@\/lib\/agency\/brief-files|\.\/brief-files|\.\.\/agency\/brief-files)["']/.test(read(f)))
    expect(importers.sort()).toEqual([...ALLOWED].sort())
  })

  it("the text column reaches only connect — no doorway, portal or client read selects it", () => {
    // getBriefJdText is the one reader of `text`; connectRoleToBrief is its one caller.
    const callers = [...sourceFiles("app"), ...sourceFiles("lib")].filter((f) => f !== "lib/agency/brief-files.ts" && read(f).includes("getBriefJdText("))
    expect(callers).toEqual(["lib/agency/search-briefs.ts"])
    expect(fnBody(briefs, "export async function connectRoleToBrief")).toMatch(/getBriefJdText\(/)
    expect(briefs.match(/getBriefJdText\(/g)?.length).toBe(1)
  })
})

describe("the role-brief route for the hiring side carries no file", () => {
  it("strips status.jd, because the role's contact may not be the brief's addressee", () => {
    const route = readFileSync("app/api/hiring/roles/[roleId]/brief/route.ts", "utf8")
    expect(route).toMatch(/const \{ jd: _jd, \.\.\.statusForClient \}/)
    expect(route).toMatch(/status: status \? statusForClient : null/)
  })
})
