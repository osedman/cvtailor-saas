import { NextResponse } from 'next/server'
import { withTiming } from "@/lib/server-timing"

async function POST_handler() {
  return NextResponse.json({ error: 'Payments not yet enabled' }, { status: 503 })
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const POST = withTiming("/api/billing-portal", "POST", POST_handler)
