import { NextRequest, NextResponse } from "next/server"
import { isCareerPathBeta, BETA_LOCKED } from '@/lib/feature-gate'
import { anthropic, EVIDENCE_REVIEW_TOOL, type CareerRoadmapItem, type SkillEvidence } from "@/lib/anthropic"
import { createClient } from "@/lib/supabase/server"
import { loadItems, setItemEvidence, setItemProjectBrief } from "@/lib/roadmap-store"
import { checkRateLimit } from "@/lib/rate-limit"
import { sanitizeDeep } from "@/lib/sanitize"
import { errMessage } from "@/lib/err"
import { extractFileText } from "@/lib/extract-file-text"

export const maxDuration = 300

/**
 * Evidence-gated skill completion. The user uploads the project artifact or
 * course certificate; a reviewer judges it against the skill and its brief.
 * Pass → the skill closes with a CV bullet grounded in the ACTUAL evidence.
 * Not yet → constructive feedback + a right-sized replacement project saved
 * onto the item. Files are read in memory and discarded — never stored.
 *
 * `dry=1` judges without persisting anything (used for verification).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    if (!(await isCareerPathBeta(user.email))) return NextResponse.json(BETA_LOCKED, { status: 403 })

    const limited = await checkRateLimit(user.id, "ai")
    if (limited) return limited

    const form = await req.formData()
    const file = form.get("file")
    const skill = String(form.get("skill") ?? "").trim().slice(0, 120)
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file first." }, { status: 400 })
    if (!skill) return NextResponse.json({ error: "Which skill is this evidence for?" }, { status: 400 })
    const dryRun = req.nextUrl.searchParams.get("dry") === "1"

    const rawText = (await extractFileText(file)).trim().slice(0, 30_000)
    if (rawText.length < 40) {
      return NextResponse.json({ error: "We couldn't read enough text from that file. If it's a scanned image, export it as a text PDF and try again." }, { status: 422 })
    }

    const { data: row, error: fetchErr } = await supabase
      .from("career_roadmaps").select("id, target_role").eq("user_id", user.id).maybeSingle()
    if (fetchErr) throw fetchErr
    // Both horizons: a quick win closed with real evidence is as genuine as a
    // core one, and must be judgeable the same way.
    const items = await loadItems(supabase, user.id)
    const item = items.find((i) => i.skill.toLowerCase() === skill.toLowerCase())
    if (!row || !item) return NextResponse.json({ error: "That skill isn't on your path." }, { status: 404 })

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      tools: [EVIDENCE_REVIEW_TOOL],
      tool_choice: { type: "tool", name: "submit_evidence_review" },
      messages: [{
        role: "user",
        content: `Review this candidate's uploaded evidence for the skill "${item.skill}"${row.target_role ? ` (target role: ${row.target_role})` : ""}.

The project brief they were given:
${item.projectBrief}

Why the skill matters:
${item.whyItMatters}

Judging rules:
- A completed course CERTIFICATE for a course genuinely covering this skill passes (check issuer, course name, topic match). An enrolment confirmation or in-progress record does not.
- A PROJECT artifact passes when it has real substance matching the brief's INTENT (the exact brief need not be followed to the letter): specific work, real decisions, ideally numbers/outcomes. A skeleton, notes-to-self, or generic copied content does not.
- Substance over polish. Never credit what the document doesn't show. Pass requires quality 3+.
- On not_yet, be specific and kind — and right-size the suggested replacement project to what the submission suggests they can do.

Uploaded document ("${file.name.slice(0, 80)}"):
${rawText}`,
      }],
    })
    const tu = msg.content.find((b) => b.type === "tool_use" && b.name === "submit_evidence_review")
    if (!tu || tu.type !== "tool_use") throw new Error("Could not review that document. Please try again.")
    const review = tu.input as { verdict: "pass" | "not_yet"; quality: number; note: string; feedback: string; cvPhrasing?: string; suggestedProject?: string }
    const passed = review.verdict === "pass" && (review.quality ?? 0) >= 3

    const evidence: SkillEvidence = {
      fileName: file.name.slice(0, 120),
      judgedAt: new Date().toISOString(),
      verdict: passed ? "pass" : "not_yet",
      quality: Math.min(5, Math.max(1, Math.round(review.quality ?? 1))),
      note: (review.note ?? "").slice(0, 300),
    }

    if (!dryRun) {
      // One row update instead of rewriting the whole array.
      if (passed) {
        await setItemEvidence(
          supabase, user.id, item.skill,
          sanitizeDeep(evidence), "done",
          (review.cvPhrasing || item.cvPhrasing).slice(0, 400),
        )
      } else {
        await setItemEvidence(supabase, user.id, item.skill, sanitizeDeep(evidence))
        await setItemProjectBrief(
          supabase, user.id, item.skill,
          (review.suggestedProject || item.projectBrief).slice(0, 800),
        )
      }
      await supabase.from("career_roadmaps")
        .update({ updated_at: new Date().toISOString() }).eq("id", row.id)
    }

    return NextResponse.json({
      passed,
      quality: evidence.quality,
      note: evidence.note,
      feedback: (review.feedback ?? "").slice(0, 800),
      cvPhrasing: passed ? (review.cvPhrasing ?? "") : undefined,
      suggestedProject: !passed ? (review.suggestedProject ?? "") : undefined,
      dryRun,
    })
  } catch (err) {
    const status = (err as { status?: number })?.status === 429 ? 429 : 500
    return NextResponse.json({ error: errMessage(err) }, { status })
  }
}
