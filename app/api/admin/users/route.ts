import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/admin-access"
import { USER_SEARCH_MIN, cleanUserSearch } from "@/lib/admin-users"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

const LIMIT = 20

/**
 * Find a consumer account by email or name. Support and up.
 *
 * A search, not a list: it needs at least three characters and returns at
 * most twenty people, so it cannot be used to page through every account.
 * Returns who they are and nothing they have written.
 */
async function GET_handler(req: NextRequest) {
  try {
    const gate = await requireAdmin("support")
    if (!gate.ok) return gate.response

    const term = cleanUserSearch(req.nextUrl.searchParams.get("q"))
    if (!term) {
      return NextResponse.json({ error: `Type at least ${USER_SEARCH_MIN} characters of an email or name.` }, { status: 400 })
    }

    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("id, email, full_name, plan, created_at")
      .or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(LIMIT + 1)
    if (error) throw error

    const rows = (data ?? []) as Array<{ id: string; email: string | null; full_name: string | null; plan: string; created_at: string }>
    return NextResponse.json({
      users: rows.slice(0, LIMIT).map((u) => ({ id: u.id, email: u.email, name: u.full_name, plan: u.plan, createdAt: u.created_at })),
      more: rows.length > LIMIT,
    })
  } catch (err) {
    console.error("[admin/users GET]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const GET = withTiming("/api/admin/users", "GET", GET_handler)
