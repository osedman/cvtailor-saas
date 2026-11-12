import { NextResponse } from "next/server"
import { currentAdmin } from "@/lib/admin-access"
import { roleNeedsTwoStep } from "@/lib/admin-roles"
import { withTiming } from "@/lib/server-timing"

/**
 * The signed-in person's admin access, for the admin shell: which sections
 * to show, and whether to ask for two-step verification before a change.
 * 403 for anyone who is not an admin — the same answer as every other admin
 * route, so it reveals nothing about who is.
 */
async function GET_handler() {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const needsTwoStep = roleNeedsTwoStep(admin.role)
  return NextResponse.json({
    role: admin.role,
    twoStep: admin.twoStep,
    needsTwoStep,
    canWrite: needsTwoStep && admin.twoStep,
  })
}

export const GET = withTiming("/api/admin/me", "GET", GET_handler)
