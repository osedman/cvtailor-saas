/**
 * Candidate ingestion + listing for one role.
 *
 * POST multipart/form-data { file } or JSON { cvText } — runs the full
 * pipeline in lib/agency/ingest.ts (suppression check, extraction, evidence,
 * server-side score, notice scheduling, audit).
 * GET returns candidates with their score breakdowns and evidence, all
 * through the user-scoped client so RLS does the tenancy work.
 */

import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { CV_TEXT_LIMIT, extractFileText, ingestCandidate } from "@/lib/agency/ingest"

export const maxDuration = 300

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_CANDIDATES_PER_ROLE = 10

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const [candidates, scores, evidence, reviews, decisions] = await Promise.all([
      auth.db
        .from("candidates")
        .select(
          "id, ref, full_name, current_title, years, location, salary_text, source, ingested_at, redacted, parse_status, parse_error, duplicate_of, cv_storage_path"
        )
        .eq("role_id", roleId)
        .order("ref"),
      auth.db.from("score_breakdowns").select("*").eq("agency_id", auth.ctx.agencyId),
      auth.db
        .from("candidate_evidence")
        .select("candidate_id, requirement_id, strength, quote, source_cite, origin"),
      auth.db
        .from("candidate_reviews")
        .select("candidate_id, status, communication, motivation, availability, salary_confirm, notice_period, notes")
        .eq("role_id", roleId),
      auth.db
        .from("recruiter_reviews")
        .select("candidate_id, decision, decision_note")
        .eq("role_id", roleId),
    ])
    if (candidates.error) throw candidates.error

    const candidateIds = new Set((candidates.data ?? []).map((c) => c.id))
    return NextResponse.json({
      candidates: candidates.data ?? [],
      scores: (scores.data ?? []).filter((s) => candidateIds.has(s.candidate_id)),
      evidence: (evidence.data ?? []).filter((e) => candidateIds.has(e.candidate_id)),
      reviews: reviews.data ?? [],
      decisions: decisions.data ?? [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const limited = await checkRateLimit(auth.ctx.userId, "ai")
    if (limited) return limited

    const { count } = await auth.db
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("role_id", roleId)
    if ((count ?? 0) >= MAX_CANDIDATES_PER_ROLE) {
      return NextResponse.json(
        { error: `Up to ${MAX_CANDIDATES_PER_ROLE} candidates per role` },
        { status: 400 }
      )
    }

    let cvText = ""
    let source: "upload" | "paste" = "paste"
    let sourceDetail = "pasted text"
    let file: { buffer: Buffer; name: string; contentType: string } | undefined

    const contentType = req.headers.get("content-type") ?? ""
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const uploaded = formData.get("file") as File | null
      if (!uploaded) return NextResponse.json({ error: "No file provided" }, { status: 400 })
      if (uploaded.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 })
      }
      cvText = (await extractFileText(uploaded)).trim()
      source = "upload"
      sourceDetail = uploaded.name.slice(0, 200)
      file = {
        buffer: Buffer.from(await uploaded.arrayBuffer()),
        name: uploaded.name,
        contentType: uploaded.type || "application/octet-stream",
      }
    } else {
      const body = await req.json()
      cvText = typeof body?.cvText === "string" ? body.cvText.trim() : ""
    }

    if (cvText.length < 100) {
      return NextResponse.json(
        { error: "CV text is too short to assess (or the file could not be read)" },
        { status: 400 }
      )
    }

    const result = await ingestCandidate(auth.ctx, auth.db, roleId, {
      cvText: cvText.slice(0, CV_TEXT_LIMIT),
      source,
      sourceDetail,
      file,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
