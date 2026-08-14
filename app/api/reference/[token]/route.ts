/**
 * The referee's own link. Token only — they never asked to be here and must
 * never need an account.
 *
 * Invalid, spent and declined all answer identically, so a guessed token
 * learns nothing about who is being referenced.
 */

import { NextRequest, NextResponse } from "next/server"
import { peekReference, recordReference, type RefereeAnswer } from "@/lib/agency/references"
import { checkRateLimit, anonRateLimitId } from "@/lib/rate-limit"

export const maxDuration = 15

function callerId(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
  return anonRateLimitId(`reference:${ip}`)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = await checkRateLimit(callerId(req), "auth")
    if (limited) return limited
    const { token } = await params
    const view = await peekReference(token)
    if (!view) return NextResponse.json({ error: "That link is not valid" }, { status: 404 })
    return NextResponse.json({ reference: view })
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = await checkRateLimit(callerId(req), "auth")
    if (limited) return limited
    const { token } = await params
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const answers: RefereeAnswer[] = Array.isArray(body.answers)
      ? (body.answers as unknown[])
          .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
          .map((a) => ({
            key: String(a.key ?? ""),
            question: String(a.question ?? ""),
            answer: String(a.answer ?? ""),
          }))
      : []
    const result = await recordReference(token, { answers, decline: body.decline === true })
    if (!result) return NextResponse.json({ error: "That link is not valid" }, { status: 404 })
    return NextResponse.json({ ok: true, declined: result.declined })
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
