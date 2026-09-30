import { NextRequest, NextResponse } from 'next/server'
import { withTiming } from "@/lib/server-timing"

async function GET_handler(req: NextRequest) {
  const cookies = req.cookies.getAll()
  return NextResponse.json({
    cookieCount: cookies.length,
    cookieNames: cookies.map(c => c.name),
  })
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/debug", "GET", GET_handler)
