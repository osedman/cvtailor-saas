/**
 * Nobody should ever be shown "[object Object]".
 *
 * The pattern `error instanceof Error ? error.message : String(error)` appears
 * ~45 times in this repo and is wrong for the case that matters most:
 * SUPABASE ERRORS ARE PLAIN OBJECTS. They fail the instanceof check, fall
 * through to String(), and render as the literal text [object Object]. That is
 * what a recruiter saw when publishing a role failed, with the real cause — a
 * stale PostgREST schema cache — nowhere on screen.
 */
import { describe, it, expect } from "vitest"
import { errorMessage } from "@/lib/error-message"

describe("errorMessage", () => {
  it("never returns [object Object], whatever it is given", () => {
    const nasties: unknown[] = [
      { message: "boom" },
      { code: "PGRST205" },
      {},
      [],
      Object.create(null),
      42,
      null,
      undefined,
      true,
    ]
    for (const n of nasties) {
      expect(errorMessage(n)).not.toContain("[object Object]")
      expect(errorMessage(n).length).toBeGreaterThan(0)
    }
  })

  it("reads a real Supabase error the way a human needs it", () => {
    const supabase = {
      message: "Could not find the table 'agency.role_matching' in the schema cache",
      details: null,
      hint: "Reload the schema cache",
      code: "PGRST205",
    }
    const msg = errorMessage(supabase)
    expect(msg).toContain("agency.role_matching")
    expect(msg).toContain("Reload the schema cache")
    expect(msg).toContain("PGRST205")
  })

  it("prefers a real Error's message", () => {
    expect(errorMessage(new Error("plain and clear"))).toBe("plain and clear")
  })

  it("passes a string straight through", () => {
    expect(errorMessage("just a string")).toBe("just a string")
  })

  it("survives a circular object rather than throwing", () => {
    const circular: Record<string, unknown> = { code: undefined }
    circular.self = circular
    expect(() => errorMessage(circular)).not.toThrow()
    expect(errorMessage(circular)).not.toContain("[object Object]")
  })

  it("says something honest when there is genuinely no message", () => {
    expect(errorMessage({})).toMatch(/carried no message/)
  })
})

describe("the publish route uses it", () => {
  it("does not fall back to String(error)", async () => {
    const { readFileSync } = await import("fs")
    const { join } = await import("path")
    const route = readFileSync(
      join(process.cwd(), "app/api/agency/roles/[roleId]/matching/route.ts"),
      "utf8"
    )
    expect(route).toMatch(/errorMessage\(error\)/)
    expect(route).not.toMatch(/: String\(error\)/)
  })
})
