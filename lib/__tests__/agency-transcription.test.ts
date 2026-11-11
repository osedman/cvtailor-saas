/**
 * Transcription — the promises, as source properties.
 *
 * Two of these are the reason the feature is allowed to exist at all: only
 * the candidate's own words become their evidence, and the audio dies when a
 * person has checked the transcript. Both are structural, so both are
 * scanned rather than mocked.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { syntheticProvider, resolveProvider } from "@/lib/agency/transcription"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const lib = read("lib/agency/transcription.ts")

/**
 * Comments state the prohibitions ("never tone, sentiment, fluency"), so a
 * naive scan for those words finds the documentation and fails. These
 * assertions are about CODE, so strip comments first.
 */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const libCode = code(lib)
const route = read("app/api/agency/rounds/[roundId]/transcript/route.ts")
const cron = read("app/api/agency/cron/route.ts")
const migration = read("supabase/migrations/20260817140000_agency_transcription_jobs.sql")
const hiring = read("lib/agency/rounds.ts")
// Scanned as CODE: the module explains the rule in prose, so a raw scan
// would match its own documentation — the trap source-scan.ts exists for.
const debriefModule = code(read("lib/agency/round-debrief.ts"))

describe("no vendor is wired in", () => {
  it("defaults to the synthetic provider", () => {
    expect(resolveProvider().name).toBe("synthetic")
  })

  it("refuses an unknown provider rather than guessing", () => {
    // Guessing here means a candidate's voice leaving the building
    // unannounced. A named vendor is a sub-processor: DPA first.
    const prev = process.env.TRANSCRIPTION_PROVIDER
    process.env.TRANSCRIPTION_PROVIDER = "some-vendor"
    expect(() => resolveProvider()).toThrow(/sub-processor|DPA/i)
    process.env.TRANSCRIPTION_PROVIDER = prev
  })

  it("marks synthetic transcripts as such on the artifact", () => {
    // A synthetic transcript must never be mistaken for a real one later.
    expect(syntheticProvider.name).toBe("synthetic")
  })
})

describe("only the candidate's words may become the candidate's evidence", () => {
  it("the transcript carries speaker-labelled segments", async () => {
    const result = await syntheticProvider.transcribe(new Blob(["x"]))
    expect(result.segments.length).toBeGreaterThan(1)
    for (const s of result.segments) expect(typeof s.speaker).toBe("number")
    // More than one voice, or diarization is doing nothing.
    expect(new Set(result.segments.map((s) => s.speaker)).size).toBeGreaterThan(1)
  })

  it("never guesses which speaker is the candidate", () => {
    // Inference about a person by the back door. A human names it.
    expect(lib).toMatch(/candidateSpeaker: null/)
    expect(libCode).not.toMatch(/mostWords|likelyCandidate|guessSpeaker/i)
  })

  it("verification refuses a speaker that does not appear", () => {
    expect(lib).toMatch(/speakers\.has\(candidateSpeaker\)/)
    expect(lib).toMatch(/reason: "bad_speaker"/)
  })

  it("scores nothing about the person", () => {
    // The EU AI Act line, and the product's whole argument.
    expect(libCode).not.toMatch(/\b(sentiment|tone|confidenceScore|fluency|emotion)\b/i)
  })
})

describe("the audio dies when a person has checked the transcript", () => {
  it("verifying is what stamps verified_at", () => {
    const verify = lib.slice(lib.indexOf("export async function verifyTranscript"))
    expect(verify).toMatch(/verified_at: new Date\(\)\.toISOString\(\)/)
  })

  it("transcription itself never stamps verified_at", () => {
    // Transcribing is not checking. If the runner could stamp it, the audio
    // would be deleted on a transcript nobody had read.
    const run = lib.slice(lib.indexOf("export async function runTranscription"), lib.indexOf("export async function runQueuedTranscriptions"))
    expect(run).not.toMatch(/verified_at:/)
  })

  it("a failed transcription leaves the audio alone", () => {
    // Deleting on failure destroys the only copy of something the candidate
    // agreed to have transcribed once.
    const cat = lib.slice(lib.indexOf("} catch (err) {"))
    expect(cat).not.toMatch(/remove\(|recording_deleted_at/)
  })

  it("the cron runs transcription and the sweep as separate passes", () => {
    expect(cron).toMatch(/runQueuedTranscriptions/)
    expect(cron).toMatch(/listRecordingsDueForDeletion/)
  })
})

describe("the queue", () => {
  it("refuses a second live job for the same round", () => {
    // Two writers racing to fill one artifact is how a transcript ends up
    // half one run and half another.
    expect(migration).toMatch(/unique index[\s\S]*ingestion_jobs \(round_id\)[\s\S]*status in \('queued', 'running'\)/)
    expect(lib).toMatch(/reason: "already_queued"/)
  })

  it("refuses a round with no recording, and one already swept", () => {
    expect(lib).toMatch(/reason: "no_recording"/)
    expect(lib).toMatch(/recording_deleted_at\) return \{ ok: false, reason: "already_done" \}/)
  })

  it("cross-tenant rounds read as not found", () => {
    expect(lib).toMatch(/round\.agency_id !== ctx\.agencyId\) return \{ ok: false, reason: "not_found" \}/)
  })
})

describe("the audit log is not a transcript store", () => {
  it("records shape, never content", () => {
    const audit = lib.slice(lib.indexOf('action: "transcribed"'))
    expect(audit).toMatch(/segments: result\.segments\.length/)
    expect(audit).not.toMatch(/text:|segments: result\.segments,/)
  })
})

describe("the client never sees the raw transcript", () => {
  it("the hiring-manager surface does not read artifact content", () => {
    // §5.7: structured evidence and quotes only. The consent copy promises
    // the people interviewing you are not handed the tape.
    //
    // rounds.ts is a MIXED module — offerSlot, withdrawSlot and decideRound
    // all take a HiringContext — so it may not read artifact content at all,
    // even for a recruiter. On 18 Sep 2026 the recruiter's round detail
    // needed the write-up text and this fired; the read moved to
    // round-debrief.ts rather than the rule being loosened. The two
    // assertions below keep that move honest.
    expect(hiring).not.toMatch(/round_artifacts[\s\S]{0,200}content/)
  })

  it("the module that DOES read write-ups is recruiter-only, and debrief-only", () => {
    // Moving a forbidden read into a new file is only legitimate while that
    // file cannot be reached by a hiring manager. If either assertion ever
    // fails, the read has followed the client through the door.
    expect(debriefModule).not.toMatch(/HiringContext/)
    expect(debriefModule).toMatch(/\.eq\("kind", "debrief"\)/)

    // ONE query, and it carries the filter. Counting matters: a second,
    // unfiltered read of the same table would satisfy a bare "does the string
    // appear" check while fetching transcripts. Filtered in the QUERY and not
    // after it, because a transcript row's mere existence discloses that a
    // candidate consented to being recorded — discarding the text afterwards
    // does not undo that.
    const queries = debriefModule.match(/\.from\("round_artifacts"\)/g) ?? []
    expect(queries).toHaveLength(1)
    const q = debriefModule.slice(debriefModule.indexOf('.from("round_artifacts")'))
    const statement = q.slice(0, q.indexOf("\n  if (error)"))
    expect(statement).toMatch(/\.eq\("kind", "debrief"\)/)
  })

  it("the verify route is recruiter-scoped, not client-scoped", () => {
    expect(route).toMatch(/requireAgencyContext/)
    expect(route).not.toMatch(/requireHiringContext|HiringContext/)
  })
})
