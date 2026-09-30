/**
 * The tailor page's two helpers — read a CV file, fetch a job ad — work
 * before sign-in on purpose: people upload a CV and paste a link, and are
 * asked to sign in only when they tailor. Until 30 Sep 2026 they had no limit
 * at all, so anyone could use them as a free document parser and fetch proxy
 * (access audit). Signed in, the person's own "upload" allowance applies;
 * signed out, the same allowance per network.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sessionUser } from "@/lib/supabase/session-user"
import { anonRateLimitId, checkRateLimit } from "@/lib/rate-limit"

export async function checkPublicToolLimit(req: Request, tool: string): Promise<NextResponse | null> {
  let userId: string | null = null
  try {
    userId = (await sessionUser(await createClient()))?.id ?? null
  } catch {
    userId = null
  }
  if (userId) return checkRateLimit(userId, "upload")
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
  return checkRateLimit(anonRateLimitId(`public-tool:${tool}:${ip}`), "upload")
}
