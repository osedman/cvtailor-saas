/**
 * The three phases (lib/agency/phases.ts).
 *
 * A phase is derived, never stored, so these tests are the whole contract:
 * there is no column to inspect and no migration to check against. The one
 * that matters most is precedence — a role with a handover pack also has a
 * submission, and calling that "interviews" would put a finished role back in
 * the middle of the loop.
 */

import { describe, it, expect } from "vitest"
import {
  PHASES,
  derivePhase,
  phaseHref,
  phaseState,
  roleLandingPath,
  workflowHref,
  type PhaseKey,
} from "../agency/phases"

describe("derivePhase", () => {
  it("is the shortlist workflow until a submission exists", () => {
    expect(derivePhase({ hasSubmission: false, hasHandoverPack: false })).toBe("shortlist")
  })

  it("moves to the interview loop once the client has the shortlist", () => {
    expect(derivePhase({ hasSubmission: true, hasHandoverPack: false })).toBe("interviews")
  })

  it("moves to handover once a pack exists", () => {
    expect(derivePhase({ hasSubmission: true, hasHandoverPack: true })).toBe("handover")
  })

  it("reports the FURTHEST fact reached, not the earliest", () => {
    // Every real handover role also has a submission. Precedence must be
    // most-advanced-first or a finished role reads as mid-loop forever.
    expect(derivePhase({ hasSubmission: true, hasHandoverPack: true })).not.toBe("interviews")
  })

  it("trusts a pack even with no submission recorded", () => {
    // Not reachable through the UI, but the derivation must not disagree with
    // itself if it ever happens — the pack is the later fact either way.
    expect(derivePhase({ hasSubmission: false, hasHandoverPack: true })).toBe("handover")
  })
})

describe("phaseState", () => {
  const keys: PhaseKey[] = ["shortlist", "interviews", "handover"]

  it("marks earlier phases done, the current one now, later ones todo", () => {
    expect(keys.map((k) => phaseState(k, "interviews"))).toEqual(["done", "now", "todo"])
  })

  it("has exactly one 'now' from every phase", () => {
    for (const current of keys) {
      const states = keys.map((k) => phaseState(k, current))
      expect(states.filter((s) => s === "now")).toHaveLength(1)
    }
  })

  it("never marks anything done from the first phase", () => {
    expect(keys.map((k) => phaseState(k, "shortlist"))).toEqual(["now", "todo", "todo"])
  })

  it("marks everything before handover as done", () => {
    expect(keys.map((k) => phaseState(k, "handover"))).toEqual(["done", "done", "now"])
  })
})

describe("phaseHref", () => {
  it("routes each phase to the surface that owns it", () => {
    expect(phaseHref("shortlist", "r1")).toBe("/agencies/roles/r1?flow=shortlist")
    expect(phaseHref("interviews", "r1")).toBe("/agencies/roles/r1/interviews")
    expect(phaseHref("handover", "r1")).toBe("/agencies/roles/r1/close-out")
  })

  it("the shortlist chip never lands on the front door", () => {
    // The bare role URL forwards past the workflow once a submission exists
    // (roleLandingPath). A chip that said "Shortlist" and delivered you back
    // to interviews was inert on every role past phase one.
    for (const phase of ["interviews", "handover"] as const) {
      expect(phaseHref("shortlist", "r1")).not.toBe(roleLandingPath(phase, "r1"))
    }
  })
})

describe("workflowHref", () => {
  it("always carries the flag that keeps the workflow from forwarding away", () => {
    expect(workflowHref("r1")).toBe("/agencies/roles/r1?flow=shortlist")
  })

  it("carries a step alongside the flag", () => {
    const href = workflowHref("r1", "screening")
    const q = new URLSearchParams(href.split("?")[1])
    expect(href.startsWith("/agencies/roles/r1?")).toBe(true)
    expect(q.get("flow")).toBe("shortlist")
    expect(q.get("step")).toBe("screening")
  })
})

describe("the phase list itself", () => {
  it("is the three phases in order, and stays three", () => {
    // An eighth step went missing once by being derived from what a page
    // happened to render. Same failure mode, pinned here.
    expect(PHASES.map((p) => p.key)).toEqual(["shortlist", "interviews", "handover"])
  })

  it("gives every phase the sentence that says what closes it", () => {
    for (const p of PHASES) {
      expect(p.endsWhen).toMatch(/^Ends when /)
      expect(p.label.length).toBeGreaterThan(0)
    }
  })
})

describe("the module stays browser-safe", () => {
  it("imports nothing that would drag the service-role key into the bundle", async () => {
    // Client components render the rail. A runtime import reaching agencyAdmin
    // pulls next/headers into the browser bundle and fails the build — the
    // exact trap settings-limits.ts and round-delta.ts exist to avoid.
    const { readFileSync } = await import("node:fs")
    const src = readFileSync(new URL("../agency/phases.ts", import.meta.url), "utf8")
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/\bfrom\s+["'][^"']*\bdb["']/)
    expect(code).not.toMatch(/next\/headers/)
    expect(code).not.toMatch(/agencyAdmin/)
    expect(code).not.toMatch(/^\s*import\s/m)
  })
})
