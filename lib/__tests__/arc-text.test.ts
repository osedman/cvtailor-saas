/**
 * The pool showed every arc blank (5 Oct 2026): stored arcs are objects, and
 * the reader only understood arrays and strings.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { arcText } from "../agency/arc-text"

const stored = {
  identity: { name: "A Person", roleLine: "Product Owner", supportingLine: "Six years in claims platforms" },
  story: { origin: "Started in support", turningPoint: "Moved into delivery", ambition: "Lead a product line" },
  chapters: [{ span: "2019–2022", name: "Delivery", summary: "Ran the claims rebuild" }],
  stats: [], achievements: [], timeline: [], organisations: [], skills: [], growth: {}, projects: [], qualities: [],
}

describe("arcText", () => {
  it("reads the object shape every stored arc actually has", () => {
    const t = arcText(stored)
    expect(t).toContain("Product Owner")
    expect(t).toContain("Lead a product line")
    expect(t).toContain("Delivery: Ran the claims rebuild")
    // The pool row shows the name already.
    expect(t).not.toContain("A Person")
  })
  it("still reads the older array and string shapes", () => {
    expect(arcText([{ body: "one" }, { text: "two" }])).toBe("one two")
    expect(arcText(" plain ")).toBe("plain")
  })
  it("is empty, never a crash, for nothing", () => {
    expect(arcText(null)).toBe("")
    expect(arcText({})).toBe("")
  })
  it("the pool uses it, and never reads the private career path", () => {
    const pool = readFileSync(join(process.cwd(), "lib/agency/consumer-pool.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(pool).toMatch(/arcText\(a\.sections\)/)
    expect(pool).not.toMatch(/from\("career_roadmap/)
  })
})
