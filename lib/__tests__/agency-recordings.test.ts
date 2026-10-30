/**
 * Interview audio — the guards, as source properties.
 *
 * These are structural claims, so they are scanned rather than mocked: this
 * repo has three times shipped code whose mocks agreed with it and whose
 * database did not, and the thing being asserted here — "audio cannot exist
 * without the candidate's own consent" — is the one promise in the product
 * that a green mock would be worst at protecting.
 *
 * The behavioural half of this lands with the integration suite, which runs
 * against real staging with INTEGRATION=1.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const lib = read("lib/agency/recordings.ts")

/**
 * Source scans must read CODE, not prose. These files document their own
 * prohibitions ("never a path", "no tone or sentiment"), so a naive scan
 * finds the comment explaining the rule and fails the rule. Strip comments
 * first — this has now bitten three separate assertions.
 */
export const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const libCode = codeOnly(lib)
const route = read("app/api/agency/rounds/[roundId]/recording/route.ts")
const migration = read("supabase/migrations/20260817090000_agency_recordings_bucket.sql")
const artifacts = read("lib/agency/artifacts.ts")
const consentCopy = read("docs/CONSENT-COPY-DRAFT.md")

describe("the consent gate", () => {
  it("refuses upload unless the candidate granted capture consent", () => {
    // THE promise. A recruiter cannot grant it on a candidate's behalf —
    // recordDecision takes a raw token and nothing else — so 'granted' can
    // only have come from the candidate's own click.
    expect(lib).toMatch(/capture_consent_status !== "granted"/)
    expect(lib).toMatch(/reason: "no_consent"/)
  })

  it("applies the gate to BOTH mint and confirm, through one function", () => {
    // Two copies of a consent check is one copy that gets loosened later.
    const gateCalls = lib.match(/await gate\(ctx, roundId\)/g) ?? []
    expect(gateCalls.length).toBe(2)
  })

  it("mints nothing and writes nothing when the gate refuses", () => {
    // The gate runs before createSignedUploadUrl, so a refused round never
    // gets a token at all.
    expect(lib.indexOf("const gated = await gate")).toBeLessThan(
      lib.indexOf("createSignedUploadUrl")
    )
  })
})

describe("what the upload path must never do", () => {
  it("never trusts the client's path", () => {
    // The path is recomputed from the round; a confirm cannot attach another
    // agency's blob to this round.
    expect(lib).toMatch(/expectedPrefix/)
    expect(lib).toMatch(/!path\.startsWith\(expectedPrefix\)/)
  })

  it("writes the artifact row only after proving the blob exists", () => {
    // A row pointing at nothing would put a phantom into the deletion
    // sweep's sights, and the sweep's silence is a promise being kept.
    expect(lib.indexOf("if (!blob) return")).toBeLessThan(lib.indexOf('kind: "transcript"'))
  })

  it("leaves verified_at null so the sweep cannot delete un-checked audio", () => {
    // "Deleted as soon as the transcript is checked" — not before it exists.
    // Assignment, not mention: the comment above the insert says the word.
    expect(lib).not.toMatch(/verified_at\s*:/)
  })

  it("keeps paths and content out of the audit row", () => {
    const audit = libCode.slice(libCode.indexOf('action: "recording_uploaded"'))
    // Up to the end of the toValue block, which is what actually gets stored.
    const block = audit.slice(0, audit.indexOf("})") + 2)
    expect(block).not.toMatch(/recording_path|path:/)
  })

  it("cross-tenant rounds read as not found, not forbidden", () => {
    expect(lib).toMatch(/round\.agency_id !== ctx\.agencyId\) return \{ ok: false, reason: "not_found" \}/)
  })
})

describe("the bucket", () => {
  it("is private", () => {
    expect(migration).toMatch(/'agency-recordings',\s*\n\s*false,/)
  })

  it("accepts audio only — no video of a candidate's face", () => {
    expect(migration).not.toMatch(/video\//)
    expect(migration).toMatch(/audio\/mpeg/)
  })

  it("grants nothing to authenticated — every byte moves via a signed URL", () => {
    // storage.objects has RLS on; with no policy for this bucket the
    // authenticated role can neither read, write nor list it.
    expect(migration).not.toMatch(/create policy/i)
    expect(lib).toMatch(/createSignedUploadUrl/)
  })
})

describe("a round holds one artifact, and it means something", () => {
  it("a debriefed round refuses audio", () => {
    expect(lib).toMatch(/reason: "debriefed"/)
  })

  it("a recorded round refuses a debrief", () => {
    // Unreachable until recordings existed: the update filters on
    // kind='debrief', so against a transcript it changed nothing and still
    // reported success.
    expect(artifacts).toMatch(/existing && existing\.kind !== "debrief"/)
  })

  it("re-uploading over existing audio is refused, not silently replaced", () => {
    expect(lib).toMatch(/reason: "already_recorded"/)
  })
})

describe("the copy this is built to keep", () => {
  it("still promises the audio is deleted when the transcript is checked", () => {
    // If this sentence ever leaves the consent copy, the sweep and the
    // null verified_at above are enforcing a promise nobody made.
    expect(consentCopy).toMatch(/delete[sd]? the (audio|recording)|audio is deleted/i)
  })

  it("the route refuses without consent in words a person can act on", () => {
    expect(route).toMatch(/has not agreed to the interview being recorded/)
    expect(route).toMatch(/no_consent: 403/)
  })
})
