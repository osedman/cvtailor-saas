import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { errMessage } from "@/lib/err"
import { forecastReadyDate, daysSinceLastStitch, readinessFromTargetSkills, type TargetSkill } from "@/lib/career-path-compute"
import type { CareerRoadmapItem } from "@/lib/anthropic"
import { loadItems } from "@/lib/roadmap-store"

export const maxDuration = 300

/**
 * Weekly path digest — one email, Monday morning, that always leads with the
 * win. Tone rules (spec, docs/PROJECT.md): the forecast is an output that
 * shifts, never a deadline; absence is never named; the worst case is an offer
 * to re-plan. Triggered by Vercel cron with `Authorization: Bearer CRON_SECRET`.
 */

function unsubscribeSig(userId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return createHmac("sha256", secret).update(`digest-unsub:${userId}`).digest("hex").slice(0, 32)
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get("dry") === "1"

  try {
    const admin = createAdminClient()
    const { data: roadmaps, error } = await admin
      .from("career_roadmaps")
      .select("user_id, target_role, hours_per_week, target_skills")
      .not("target_role", "is", null)
    if (error) throw error

    let sent = 0
    const skipped: string[] = []
    for (const rm of roadmaps ?? []) {
      // Core only: the forecast this digest reports is the North Star forecast,
      // and it must agree with what the career-path page shows.
      const items = await loadItems(admin, rm.user_id as string, { horizon: "core" })
      const open = items.filter((i) => i.status !== "done")
      if (items.length === 0) { skipped.push("no-items"); continue }

      const { data: prof } = await admin
        .from("profiles").select("path_digest_opt_out").eq("id", rm.user_id).maybeSingle()
      if (prof?.path_digest_opt_out) { skipped.push("opted-out"); continue }

      const { data: userRes } = await admin.auth.admin.getUserById(rm.user_id as string)
      const email = userRes?.user?.email
      if (!email) { skipped.push("no-email"); continue }

      const target = (rm.target_role as string) || "your target role"
      const targetSkills = ((rm.target_skills as TargetSkill[]) ?? [])
      const closed = items.filter((i) => i.status === "done").map((i) => i.skill)
      const readiness = targetSkills.length > 0 ? readinessFromTargetSkills(targetSkills, closed) : null
      const pace = (rm.hours_per_week as number) ?? null
      const forecast = forecastReadyDate(open.length, pace)
      const stitchDays = daysSinceLastStitch(items)
      const inProgress = items.filter((i) => i.status === "in_progress")
      const next = open.find((i) => i.status === "todo")

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.gettailr.com").replace(/\/$/, "")
      const unsub = `${appUrl}/api/path-digest/unsubscribe?uid=${rm.user_id}&sig=${unsubscribeSig(rm.user_id as string)}`

      // Lead with the win. Absence is never named.
      const winLine = readiness
        ? `You're <strong>${readiness.pct}% ready</strong> for ${target} — ${readiness.have} of ${readiness.total} skills evidenced.`
        : `Your path toward <strong>${target}</strong> is live.`
      const forecastLine = forecast.readyByLabel
        ? `At your pace, you're on course for <strong>${forecast.readyByLabel}</strong>. Any stitch this week moves it closer.`
        : `Every skill on this path is closed — time to raise the target?`
      const replanLine = stitchDays !== null && stitchDays > 21
        ? `<p style="margin:16px 0 0;font-size:14px;color:#5c534c;">If the pace doesn't fit right now, that's fine — <a href="${appUrl}/career-path" style="color:#dc4f33;">re-plan at fewer hours a week</a> and the forecast simply shifts. No deadlines here.</p>`
        : ""
      const progressBlock = inProgress.length > 0
        ? `<p style="margin:16px 0 0;font-size:14px;color:#1e1813;"><strong>In progress:</strong> ${inProgress.map((i) => i.skill).join(" · ")}</p>`
        : next
          ? `<p style="margin:16px 0 0;font-size:14px;color:#1e1813;"><strong>A good next stitch:</strong> ${next.skill} — 20 minutes on ${next.resources?.[0]?.source ?? "the first resource"} counts.</p>`
          : ""

      if (!dryRun) {
        const res = await sendEmail({
          to: email,
          subject: `Your path this week — ${target}`,
          html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e1813;max-width:520px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#dc4f33;margin:0 0 12px;">Your career path</p>
  <p style="font-size:16px;line-height:1.6;margin:0;">${winLine}</p>
  <p style="font-size:14px;line-height:1.6;color:#5c534c;margin:12px 0 0;">${forecastLine}</p>
  ${progressBlock}
  ${replanLine}
  <p style="margin:24px 0 0;"><a href="${appUrl}/career-path" style="display:inline-block;background:#dc4f33;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:12px;">Open my path</a></p>
  <p style="font-size:11.5px;color:#a8a29e;margin:28px 0 0;">One email a week, only while your path is open. <a href="${unsub}" style="color:#a8a29e;">Unsubscribe in one click</a>.</p>
</div>`,
        })
        if (!res.sent) { skipped.push(`send-failed:${res.error ?? "unknown"}`); continue }
      }
      sent += 1
    }

    return NextResponse.json({ ok: true, sent, dryRun, skipped })
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}
