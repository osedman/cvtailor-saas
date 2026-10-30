/**
 * The matching loop against the REAL staging database.
 *
 * Six bugs shipped in this feature and every one was found by a human
 * clicking, because every one lived where the mocked suite cannot see:
 * missing grants (migration 17), a stale schema cache, a SECURITY DEFINER
 * guard that never fired (13), a column-level revoke that was a silent no-op
 * (15), a skip key that made the threshold one-way (18), and a half-publish
 * across two schemas. This suite exists so the seventh is found here.
 *
 * WHAT IS REAL: Supabase — grants, RLS, constraints, triggers, both schemas,
 * the audit coupling, the job lifecycle. Exactly the layer that kept lying.
 *
 * WHAT IS MOCKED: the model call, and only the model call. extractAssessment
 * returns a canned assessment (strong on the must-have, with a quote lifted
 * verbatim from the seeded evidence). It was proven live on 16 Aug — ROL-2403,
 * nine verbatim quotes — and burning tokens per test run buys nothing the
 * canned version does not.
 *
 * HOW TO RUN (writes to tailr-staging — never point this at production):
 *
 *   INTEGRATION=1 \
 *   INTEGRATION_SUPABASE_URL=https://pwonuqkpumgejqmotkwh.supabase.co \
 *   INTEGRATION_SUPABASE_SERVICE_ROLE_KEY=<tailr-staging service key> \
 *   npx vitest run lib/__tests__/matching-loop.integration.test.ts
 *
 * The INTEGRATION_* variables are REQUIRED to be explicit on purpose. The
 * first thing this suite ever did was refuse to run, because
 * .env.development.local pointed local dev at PRODUCTION ("Cv-Tailor tool",
 * wgpaaafseibcqagiiavt) — so inheriting the app's env is exactly how a
 * write-heavy suite ends up aimed at real users. The URL is additionally
 * pinned to the staging ref below; both checks stay.
 *
 * Without INTEGRATION=1 every test skips, so the ordinary suite stays fast
 * and offline. Fixtures are ZZ-prefixed and torn down in afterAll even on
 * failure; nothing existing is touched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"

const RUN = process.env.INTEGRATION === "1"

// next/headers must resolve (lib/agency/db imports it) but is never invoked —
// no request scope exists here, and the admin clients do not use cookies.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {} }),
  headers: async () => ({ get: () => null }),
}))

// The one mock. Everything else in the loop is the real thing.
vi.mock("@/lib/agency/assessment", () => ({
  QUOTE_LIMIT: 1000,
  extractAssessment: vi.fn(async (_cv: string, _role: unknown, requirements: Array<{ ref: string; weight: string }>) => ({
    profile: { full_name: "ZZ Integration", current_title: "Analyst" },
    calibration: { seniority: 70, context_fit: 60, confidence: 80, confidence_level: 3 },
    evidence: requirements.map((r) =>
      r.weight === "must"
        ? {
            requirement_ref: r.ref,
            strength: "strong",
            // Verbatim from the seeded card below, as the real model is
            // instructed to be.
            quote: "Ran the ZZ integration workshops end to end",
            source_cite: "seeded",
          }
        : { requirement_ref: r.ref, strength: "missing", quote: "", source_cite: "" }
    ),
  })),
}))

describe.skipIf(!RUN)("the matching loop, on the real database", () => {
  // Dynamic imports so the skipped path never loads server modules.
  let matching: typeof import("@/lib/agency/matching")
  let scan: typeof import("@/lib/matching/scan")
  let agencyAdmin: typeof import("@/lib/agency/db").agencyAdmin
  let createAdminClient: typeof import("@/lib/supabase/server").createAdminClient

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any

  const ids = {
    agencyId: "",
    roleId: "",
    userId: "",
    publishedRoleId: "",
    evidenceIds: [] as string[],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = () =>
    ({
      agencyId: ids.agencyId,
      agencyName: "ZZ Integration Agency",
      userId: ids.userId,
      role: "owner",
      memberships: [],
    }) as any

  const recId = async (): Promise<string> => {
    const { data } = await pub
      .from("role_recommendations")
      .select("id")
      .eq("published_role_id", ids.publishedRoleId)
      .single()
    return data.id
  }

  beforeAll(async () => {
    // Explicit credentials only. The app's own env files are deliberately NOT
    // read: on first run they pointed at production.
    const url = process.env.INTEGRATION_SUPABASE_URL ?? ""
    const key = process.env.INTEGRATION_SUPABASE_SERVICE_ROLE_KEY ?? ""
    if (!url || !key) {
      throw new Error(
        "set INTEGRATION_SUPABASE_URL and INTEGRATION_SUPABASE_SERVICE_ROLE_KEY (tailr-staging) — this suite does not inherit the app's env"
      )
    }
    if (!url.includes("pwonuqkpumgejqmotkwh")) {
      // Refuse to run against anything but tailr-staging — this suite WRITES.
      throw new Error(`refusing to run against ${url} — staging only`)
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = url
    process.env.SUPABASE_SERVICE_ROLE_KEY = key

    matching = await import("@/lib/agency/matching")
    scan = await import("@/lib/matching/scan")
    ;({ agencyAdmin } = await import("@/lib/agency/db"))
    ;({ createAdminClient } = await import("@/lib/supabase/server"))
    admin = agencyAdmin()
    pub = createAdminClient()

    // An existing auth user for attribution columns; never written to.
    const { data: user } = await pub
      .from("profiles")
      .select("id")
      .limit(1)
      .single()
    ids.userId = user.id

    const { data: agency, error: aErr } = await admin
      .from("agencies")
      .insert({ name: "ZZ Integration Agency", slug: "zz-integration-agency" })
      .select("id")
      .single()
    if (aErr) throw aErr
    ids.agencyId = agency.id

    const { data: role, error: rErr } = await admin
      .from("job_roles")
      .insert({
        agency_id: ids.agencyId,
        ref: "ROL-ZZIT",
        title: "ZZ Integration Role",
        company: "ZZ Co",
        company_context: "ZZ context",
        status: "open",
      })
      .select("id")
      .single()
    if (rErr) throw rErr
    ids.roleId = role.id

    const { error: qErr } = await admin.from("requirements").insert([
      { agency_id: ids.agencyId, role_id: ids.roleId, ref: "ZR1", text: "ZZ workshop delivery", weight: "must", sort_order: 1 },
      { agency_id: ids.agencyId, role_id: ids.roleId, ref: "ZR2", text: "ZZ nice extra", weight: "nice", sort_order: 2 },
    ])
    if (qErr) throw qErr

    // The consumer side: opt the user in and give them one seeded card whose
    // text the mocked assessor quotes verbatim.
    const { error: pErr } = await pub.from("match_preferences").upsert(
      { user_id: ids.userId, matching_opt_in: true, copy_version: "zz-it" },
      { onConflict: "user_id" }
    )
    if (pErr) throw pErr

    const { data: card, error: cErr } = await pub
      .from("career_evidence")
      .insert({
        user_id: ids.userId,
        category: "impact",
        claim: "Ran the ZZ integration workshops end to end",
        sort_order: 9001,
      })
      .select("id")
      .single()
    if (cErr) throw cErr
    ids.evidenceIds.push(card.id)
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    // Teardown runs even when assertions failed; order respects FKs.
    // published_roles cascades recommendations and marks.
    await pub.from("published_roles").delete().eq("role_id", ids.roleId)
    await admin.from("role_matching").delete().eq("role_id", ids.roleId)
    await admin.from("ingestion_jobs").delete().eq("role_id", ids.roleId)
    await admin.from("audit_log").delete().eq("agency_id", ids.agencyId)
    await admin.from("candidates").delete().eq("role_id", ids.roleId)
    await admin.from("requirements").delete().eq("role_id", ids.roleId)
    await admin.from("job_roles").delete().eq("id", ids.roleId)
    await admin.from("agencies").delete().eq("id", ids.agencyId)
    for (const id of ids.evidenceIds) await pub.from("career_evidence").delete().eq("id", id)
    await pub.from("match_preferences").delete().eq("user_id", ids.userId)
    await pub.from("matching_consent_events").delete().eq("copy_version", "zz-it")
  }, 60_000)

  it("publishes: snapshot, matching row, audit row, queued job — all four", async () => {
    const result = await matching.publishForMatching(ctx(), ids.roleId, 40)
    expect(result.enabled).toBe(true)
    expect(result.minScore).toBe(40)
    expect(result.queuedJobId).toBeTruthy()

    const { data: snap } = await pub
      .from("published_roles")
      .select("id, status, min_score, requirements")
      .eq("role_id", ids.roleId)
      .single()
    expect(snap.status).toBe("live")
    expect(snap.min_score).toBe(40)
    expect(snap.requirements).toHaveLength(2)
    ids.publishedRoleId = snap.id

    // The audit row landed in the same operation — the coupling six mocked
    // tests could not check.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action, entity_ref")
      .eq("agency_id", ids.agencyId)
      .eq("entity_type", "matching")
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: "matching_published", entity_ref: "ROL-ZZIT" })
  }, 60_000)

  it("scans: assesses the opted-in person and writes a floor-clearing recommendation", async () => {
    const { data: job } = await admin
      .from("ingestion_jobs")
      .select("id")
      .eq("role_id", ids.roleId)
      .eq("status", "queued")
      .single()

    const summary = await scan.runMatchScan(ids.roleId, job.id)
    expect(summary.assessed).toBe(1)
    expect(summary.matched).toBe(1)

    const { data: rec } = await pub
      .from("role_recommendations")
      .select("state, score, evidence")
      .eq("published_role_id", ids.publishedRoleId)
      .single()
    expect(rec.state).toBe("new")
    expect(Number(rec.score)).toBeGreaterThanOrEqual(40)
    // The must-have carries the verbatim quote; the nice-to-have is missing
    // with a null quote — the DB constraint enforced this on the way in.
    const byRef = Object.fromEntries(rec.evidence.map((e: { requirement_ref: string }) => [e.requirement_ref, e]))
    expect(byRef.ZR1).toMatchObject({ strength: "strong", quote: "Ran the ZZ integration workshops end to end" })
    expect(byRef.ZR2).toMatchObject({ strength: "missing", quote: null })

    const { data: mark } = await pub
      .from("match_scan_marks")
      .select("matched, min_score")
      .eq("published_role_id", ids.publishedRoleId)
      .single()
    expect(mark).toMatchObject({ matched: true, min_score: 40 })

    const { data: doneJob } = await admin
      .from("ingestion_jobs")
      .select("status")
      .eq("id", job.id)
      .single()
    expect(doneJob.status).toBe("succeeded")
  }, 60_000)

  it("skips an unchanged person on rescan — and the cooldown blocks a free one", async () => {
    const summary = await scan.runMatchScan(ids.roleId)
    expect(summary.skippedUnchanged).toBe(1)
    expect(summary.assessed).toBe(0)

    // Publishing again inside the cooldown must not queue another scan.
    const again = await matching.publishForMatching(ctx(), ids.roleId, 40)
    expect(again.queuedJobId).toBeNull()
    expect(again.nextScanAllowedAt).toBeTruthy()
  }, 60_000)

  it("a threshold change invalidates the mark: the person is re-assessed, not skipped", async () => {
    // The migration-18 bug, as a permanent regression test: raise the bar,
    // clear the cooldown, rescan — the person must be assessed again, and at
    // 90 the canned ~67 no longer matches. The old recommendation survives:
    // the scan never deletes what a person was already shown.
    await matching.publishForMatching(ctx(), ids.roleId, 90)
    await admin
      .from("role_matching")
      .update({ next_scan_allowed_at: null })
      .eq("role_id", ids.roleId)

    const summary = await scan.runMatchScan(ids.roleId)
    expect(summary.skippedUnchanged).toBe(0)
    expect(summary.assessed).toBe(1)
    expect(summary.matched).toBe(0)

    const { data: rec } = await pub
      .from("role_recommendations")
      .select("state")
      .eq("published_role_id", ids.publishedRoleId)
      .single()
    expect(rec.state).toBe("new")
  }, 60_000)


  it("applies: one transaction — consent event, candidate, evidence, score, audit; no notice", async () => {
    // Put the published threshold back where the recommendation can be
    // applied against a fresh snapshot+hash (the 90-publish above refreshed
    // the snapshot; requirements unchanged so the hash still matches).
    const { applyToRole } = await import("@/lib/matching/apply")

    const result = await applyToRole(ids.userId, await recId())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.candidateRef).toMatch(/^CAN-/)
    expect(result.result.rightsPath).toMatch(/^\/rights\//)

    // The candidate bundle, all of it.
    const { data: cand } = await admin
      .from("candidates")
      .select("id, source, source_detail, cv_text, parse_status, ingested_by")
      .eq("role_id", ids.roleId)
      .single()
    expect(cand.source).toBe("matched")
    expect(cand.ingested_by).toBe(ids.userId)
    expect(cand.cv_text).toContain("Ran the ZZ integration workshops end to end")

    const { data: ev } = await admin
      .from("candidate_evidence")
      .select("strength, quote, origin")
      .eq("candidate_id", cand.id)
    expect(ev).toHaveLength(2)
    expect(ev.every((e: { origin: string }) => e.origin === "matched")).toBe(true)

    const { data: sb } = await admin
      .from("score_breakdowns")
      .select("overall, inputs_hash, engine_version")
      .eq("candidate_id", cand.id)
      .single()
    expect(Number(sb.overall)).toBeGreaterThan(0)
    expect(sb.inputs_hash).toMatch(/^[0-9a-f]{64}$/)

    // THE ABSENCE THAT MATTERS: no Art 14 notice. The manifest was the notice.
    const { count: notices } = await admin
      .from("candidate_notices")
      .select("id", { count: "exact", head: true })
      .eq("candidate_id", cand.id)
    expect(notices).toBe(0)

    // The consent ledger holds the manifest.
    const { data: consent } = await pub
      .from("matching_consent_events")
      .select("subject, action, manifest")
      .eq("user_id", ids.userId)
      .eq("subject", "application")
    expect(consent).toHaveLength(1)
    expect(consent[0].manifest.sharedWith).toBe("ZZ Integration Agency")

    // The recommendation is terminally applied.
    const { data: rec } = await pub
      .from("role_recommendations")
      .select("state, applied_at")
      .eq("id", await recId())
      .single()
    expect(rec.state).toBe("applied")
    expect(rec.applied_at).toBeTruthy()
  }, 60_000)

  it("a second apply aborts whole — no duplicate candidate, no duplicate consent", async () => {
    const { applyToRole } = await import("@/lib/matching/apply")
    const second = await applyToRole(ids.userId, await recId())
    expect(second).toEqual({ ok: false, reason: "settled" })

    const { count: cands } = await admin
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("role_id", ids.roleId)
    expect(cands).toBe(1)

    const { count: consents } = await pub
      .from("matching_consent_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ids.userId)
      .eq("subject", "application")
    expect(consents).toBe(1)
  }, 60_000)

  it("pausing stops visibility without touching the person's record", async () => {
    await matching.pauseMatching(ctx(), ids.roleId)

    const { data: snap } = await pub
      .from("published_roles")
      .select("status")
      .eq("id", ids.publishedRoleId)
      .single()
    expect(snap.status).toBe("paused")

    const { count } = await pub
      .from("role_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("published_role_id", ids.publishedRoleId)
    expect(count).toBe(1)

    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("agency_id", ids.agencyId)
      .eq("entity_type", "matching")
      .order("created_at", { ascending: false })
    expect(audit[0].action).toBe("matching_paused")
  }, 60_000)
})
