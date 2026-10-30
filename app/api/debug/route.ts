import { NextRequest, NextResponse } from 'next/server'
import { withTiming } from "@/lib/server-timing"

async function GET_handler(req: NextRequest) {
  // A diagnostic, not a feature: absent on production (30 Sep 2026 access audit).
  if (process.env.VERCEL_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cookies = req.cookies.getAll()
  return NextResponse.json({
    cookieCount: cookies.length,
    cookieNames: cookies.map(c => c.name),
  })
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/debug", "GET", GET_handler)
