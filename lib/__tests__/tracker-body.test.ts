/**
 * The tracker routes spread the request body into insert/update, so the
 * server-owned columns are dropped first (30 Sep 2026 access audit). The
 * full staging audit test also covers agency routes and ports with them.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { withoutOwnership } from "@/lib/tracker-body"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("withoutOwnership", () => {
  it("drops id, owner and timestamps and keeps everything else", () => {
    expect(
      withoutOwnership({ id: "x", user_id: "someone-else", created_at: "t", updated_at: "t", company: "Acme", status: "applied" })
    ).toEqual({ company: "Acme", status: "applied" })
  })

  it("returns an empty object for anything that is not a plain object", () => {
    expect(withoutOwnership(null)).toEqual({})
    expect(withoutOwnership("text")).toEqual({})
    expect(withoutOwnership([{ id: "x" }])).toEqual({})
  })

  it("both tracker routes strip the body before writing", () => {
    for (const f of ["app/api/tracker/route.ts", "app/api/tracker/[id]/route.ts"]) {
      expect(read(f), f).toContain("withoutOwnership(await req.json())")
      expect(read(f), f).not.toMatch(/const body = await req\.json\(\)/)
    }
  })
})
