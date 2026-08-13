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

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { DEFAULT_LANDING, resolveLandingPath } from "@/lib/hat-routing"

export const maxDuration = 10

export async function GET() {
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
    if (!user) return NextResponse.json({ path: DEFAULT_LANDING })

    return NextResponse.json({ path: await resolveLandingPath(user.id) })
  } catch {
    return NextResponse.json({ path: DEFAULT_LANDING })
  }
}
