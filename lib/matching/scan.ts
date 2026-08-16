/**
 * The quiet-matching scan: I/O around the pure core in scan-core.ts.
 *
 * Runs ONLY as the service role, and never inside a user-facing request — the
 * publish route queues an `ingestion_jobs` row (kind 'match_scan') and hands
 * it to `after()`, with the agency cron as the backstop for anything that
 * queued and was never run.
 *
 * THE WALL, restated where the code could breach it: this module reads the
 * consumer plane and writes role_recommendations, marks, and the bucket. It
 * NEVER touches agency.candidates — a matched person who has not applied does
 * not exist to the agency, and a source-scan test pins that this file never
 * mentions that table.
 *
 * Cost shape per scan: at most PREFILTER_KEEP assessments, minus everyone
 * whose (profile_hash, requirements_hash) pair is already marked. Assessments
 * run sequentially — a scan is a background job with a 24h cooldown, so
 * latency is cheap and burst pressure on the model API is not.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin } from "@/lib/agency/db"
import { createJob, finishJob } from "@/lib/agency/ingest"
import { extractAssessment } from "@/lib/agency/assessment"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import type { Weight } from "@/lib/agency/types"
import { prefilterPool, type PrefilterCandidate } from "./prefilter"
import {
  buildProfileText,
  profileHash,
  scoreForMatching,
  selectMatches,
  toRecommendationEvidence,
  type MatchRequirement,
} from "./scan-core"
import { bucketOf, PREFILTER_KEEP, SCAN_COOLDOWN_HOURS } from "./limits"

interface PublishedRoleRow {
  id: string
  agency_id: string
  role_id: string
  title: string
  seniority: string
  summary: string
  status: string
  min_score: number
  requirements: Array<{ ref: string; text: string; weight: Weight }>
  requirements_hash: string
}

export interface ScanSummary {
  scanned: number
  skippedUnchanged: number
  assessed: number
  matched: number
  bucket: string
}

/**
 * Record that a scan should happen, without doing any of it. The publish
 * route calls this BEFORE its response goes out, then hands the actual run
 * to `after()` — so if the process dies between the two, a queued row
 * survives for the cron to sweep. A scan that can be silently lost is a
 * bucket that quietly stops meaning anything.
 */
export async function queueMatchScan(agencyId: string, roleId: string): Promise<string | null> {
  const admin = agencyAdmin()
  const { data } = await admin
    .from("ingestion_jobs")
    .insert({ agency_id: agencyId, role_id: roleId, kind: "match_scan", status: "queued" })
    .select("id")
    .single()
  return data?.id ?? null
}

/**
 * Run every match_scan job still sitting queued — the cron backstop. Bounded
 * so one cron run cannot spend the whole model budget; the rest keep their
 * place for the next run.
 */
export async function runQueuedMatchScans(limit = 3): Promise<number> {
  const admin = agencyAdmin()
  const { data: jobs } = await admin
    .from("ingestion_jobs")
    .select("id, role_id")
    .eq("kind", "match_scan")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit)

  let ran = 0
  for (const job of jobs ?? []) {
    try {
      await runMatchScan(job.role_id as string, job.id as string)
      ran++
    } catch {
      // finishJob already recorded the failure on the job row; keep sweeping.
    }
  }
  return ran
}

/**
 * Execute one role's scan. Returns a summary with counts only — never names,
 * never user ids. The summary is what lands in logs.
 */
export async function runMatchScan(roleId: string, queuedJobId?: string): Promise<ScanSummary> {
  const admin = agencyAdmin()
  const publicAdmin = createAdminClient()

  // Claim the queued row when we were handed one; otherwise open our own.
  let jobId: string | null = queuedJobId ?? null
  if (jobId) {
    const { data: claimed } = await admin
      .from("ingestion_jobs")
      .update({ status: "running", started_at: new Date().toISOString(), attempts: 1 })
      .eq("id", jobId)
      .eq("status", "queued") // claim exactly once — a second runner finds it gone
      .select("id")
      .maybeSingle()
    if (!claimed) {
      // Someone else (after() vs cron) got here first. Not an error.
      return { scanned: 0, skippedUnchanged: 0, assessed: 0, matched: 0, bucket: "unclaimed" }
    }
  } else {
    jobId = await createJob(admin, await agencyIdOf(admin, roleId), roleId, "match_scan")
  }

  try {
    // ── the role, as published ─────────────────────────────
    const { data: matching, error: mErr } = await admin
      .from("role_matching")
      .select("enabled, min_score, published_role_id")
      .eq("role_id", roleId)
      .maybeSingle()
    if (mErr) throw mErr
    if (!matching?.enabled || !matching.published_role_id) {
      throw new Error("matching is not enabled for this role")
    }

    const { data: published, error: pErr } = await publicAdmin
      .from("published_roles")
      .select("id, agency_id, role_id, title, seniority, summary, status, min_score, requirements, requirements_hash")
      .eq("id", matching.published_role_id)
      .maybeSingle()
    if (pErr) throw pErr
    const role = published as PublishedRoleRow | null
    if (!role || role.status !== "live") {
      throw new Error("published role is not live")
    }

    const requirements: MatchRequirement[] = (role.requirements ?? []).map((r) => ({
      // The snapshot stores no agency-side ids, and needs none: within one
      // scan the ref IS the identity, on both the assessor and the scorer.
      id: r.ref,
      ref: r.ref,
      text: r.text,
      weight: r.weight,
    }))
    if (requirements.length === 0) {
      throw new Error("published role has no requirements")
    }

    // ── the pool: opted-in users and their visible evidence ─
    const { data: optedIn, error: poolErr } = await publicAdmin
      .from("match_preferences")
      .select("user_id")
      .eq("matching_opt_in", true)
    if (poolErr) throw poolErr
    const userIds = ((optedIn ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)

    const summary: ScanSummary = {
      scanned: userIds.length,
      skippedUnchanged: 0,
      assessed: 0,
      matched: 0,
      bucket: "none",
    }

    const pool: PrefilterCandidate[] = []
    if (userIds.length > 0) {
      const { data: evidence, error: evErr } = await publicAdmin
        .from("career_evidence")
        .select("id, category, claim, source_role, source_company, source_span, cv_line, pinned, hidden, rephrased_text, sort_order, user_id")
        .in("user_id", userIds)
        .eq("hidden", false)
      if (evErr) throw evErr

      const byUser = new Map<string, EvidenceRow[]>()
      for (const row of evidence ?? []) {
        const { user_id, ...card } = row as EvidenceRow & { user_id: string }
        const list = byUser.get(user_id) ?? []
        list.push(card)
        byUser.set(user_id, list)
      }
      for (const [userId, cards] of byUser) pool.push({ userId, evidence: cards })
    }

    // ── skip-on-unchanged ──────────────────────────────────
    const { data: marks, error: markErr } = await publicAdmin
      .from("match_scan_marks")
      .select("user_id, profile_hash, requirements_hash, min_score")
      .eq("published_role_id", role.id)
    if (markErr) throw markErr
    const markByUser = new Map(
      ((marks ?? []) as Array<{
        user_id: string
        profile_hash: string
        requirements_hash: string
        min_score: number | null
      }>).map((m) => [m.user_id, m])
    )

    const hashByUser = new Map<string, string>()
    const fresh: PrefilterCandidate[] = []
    for (const person of pool) {
      const hash = profileHash(person.evidence)
      hashByUser.set(person.userId, hash)
      const mark = markByUser.get(person.userId)
      // THE THRESHOLD IS PART OF THE SKIP KEY. Without it the recruiter could
      // raise the bar but never lower it: no score is stored for someone who
      // did not match, so the only way to reconsider them is to assess them
      // again — and a mark that ignored min_score said "already done" forever.
      // A null min_score is a pre-migration-18 mark: treat as stale.
      if (
        mark &&
        mark.profile_hash === hash &&
        mark.requirements_hash === role.requirements_hash &&
        mark.min_score === role.min_score
      ) {
        summary.skippedUnchanged++
        continue
      }
      fresh.push(person)
    }

    // ── stage 1: the cheap slice ───────────────────────────
    const hits = prefilterPool(fresh, requirements, PREFILTER_KEEP)

    // Recommendations that must not be disturbed: a dismissal stands, and an
    // application is terminal. Rescoring either would overrule a person.
    const { data: existingRecs, error: recErr } = await publicAdmin
      .from("role_recommendations")
      .select("user_id, state")
      .eq("published_role_id", role.id)
    if (recErr) throw recErr
    const settled = new Set(
      ((existingRecs ?? []) as Array<{ user_id: string; state: string }>)
        .filter((r) => r.state === "dismissed" || r.state === "applied")
        .map((r) => r.user_id)
    )

    // ── stage 2: the real assessment, one person at a time ─
    const poolByUser = new Map(pool.map((p) => [p.userId, p]))
    for (const hit of hits) {
      if (settled.has(hit.userId)) continue
      const person = poolByUser.get(hit.userId)
      if (!person) continue

      const text = buildProfileText(person.evidence)
      if (!text) continue

      const assessment = await extractAssessment(
        text,
        // company_context deliberately carries the published summary — the
        // frozen snapshot, not the live role — so what the person is scored
        // against is exactly what they would read.
        { title: role.title, seniority: role.seniority, company_context: role.summary },
        requirements,
        { cacheRolePrefix: true }
      )
      summary.assessed++

      const score = scoreForMatching(assessment, requirements)
      // The evidence map is built BEFORE the decision, because the floor is
      // partly about the evidence: a recommendation with nothing in its
      // "why you" panel is a false match, not a weak one. This used to pass
      // an empty array here and decide on the score alone.
      const evidenceMap = toRecommendationEvidence(assessment, requirements)
      const matchedNow =
        selectMatches(
          [{
            userId: hit.userId,
            score,
            evidence: evidenceMap,
            profileHash: hashByUser.get(hit.userId) ?? "",
          }],
          role.min_score
        ).length === 1

      if (matchedNow) {
        summary.matched++
        const { error: upErr } = await publicAdmin.from("role_recommendations").upsert(
          {
            user_id: hit.userId,
            published_role_id: role.id,
            score: score.overall,
            score_breakdown: {
              requirement_coverage: score.requirement_coverage,
              evidence_strength: score.evidence_strength,
              seniority_calibration: score.seniority_calibration,
              context_fit: score.context_fit,
              confidence_completeness: score.confidence_completeness,
              must_have_hit: score.must_have_hit,
              must_have_total: score.must_have_total,
            },
            evidence: evidenceMap,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,published_role_id" }
        )
        if (upErr) throw upErr
      }

      const { error: markUpErr } = await publicAdmin.from("match_scan_marks").upsert(
        {
          published_role_id: role.id,
          user_id: hit.userId,
          profile_hash: hashByUser.get(hit.userId) ?? "",
          requirements_hash: role.requirements_hash,
          min_score: role.min_score,
          matched: matchedNow,
          assessed_at: new Date().toISOString(),
        },
        { onConflict: "published_role_id,user_id" }
      )
      if (markUpErr) throw markUpErr
    }

    // People below the prefilter cut were not assessed and get no mark: they
    // are re-considered next scan, which is the honest reading of "not scored
    // this cycle". Marking them as assessed would quietly convert a cost cap
    // into a rejection.

    // ── the one thin disclosure ────────────────────────────
    const { count, error: cErr } = await publicAdmin
      .from("role_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("published_role_id", role.id)
      .in("state", ["new", "seen", "applied"])
    if (cErr) throw cErr
    summary.bucket = bucketOf(count ?? 0)

    const now = new Date()
    const { error: doneErr } = await admin
      .from("role_matching")
      .update({
        matched_bucket: summary.bucket,
        last_scan_at: now.toISOString(),
        next_scan_allowed_at: new Date(now.getTime() + SCAN_COOLDOWN_HOURS * 3600_000).toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("role_id", roleId)
    if (doneErr) throw doneErr

    await finishJob(admin, jobId, "succeeded")
    return summary
  } catch (error) {
    await finishJob(
      admin,
      jobId,
      "failed",
      "scan_error",
      // Counts and mechanics only — never a name, never an email, never CV text.
      error instanceof Error ? error.message.slice(0, 500) : String(error)
    )
    throw error
  }
}

async function agencyIdOf(admin: ReturnType<typeof agencyAdmin>, roleId: string): Promise<string> {
  const { data, error } = await admin.from("job_roles").select("agency_id").eq("id", roleId).single()
  if (error) throw error
  return data.agency_id as string
}
