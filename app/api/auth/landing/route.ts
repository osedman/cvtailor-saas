/**
 * Where should this signed-in person go?
 *
 * The magic-link confirm page computes its `next` while the visitor is still
 * anonymous, so it cannot know their hats (docs/AGENCIES_SCHEMA.md §5.4). It
 * calls this once, after verification, only when no explicit `next` was given.
 *
 * Discloses nothing beyond a path the caller is about to visit anyway, and
 * falls back to the old default on every failure — an authentication redirect
 * must never hang on this.
 */

import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { resolveLandingPath } from "@/lib/hat-routing"
import { DOOR_FALLBACK } from "@/lib/auth-paths"
import { doorFromHost } from "@/lib/site-url"

export const maxDuration = 10

export async function GET(request: NextRequest) {
  // The door is the host the sign-in actually happened on, so a recruiter who
  // came in at the business domain lands in the recruiter product rather than
  // the consumer app. It decides where someone goes, never what they may see.
  const door = doorFromHost(request.headers.get("host"))
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            // Read-only: the proxy owns session refresh.
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ path: DOOR_FALLBACK[door] })

    return NextResponse.json({ path: await resolveLandingPath(user.id, undefined, door) })
  } catch {
    return NextResponse.json({ path: DOOR_FALLBACK[door] })
  }
}
