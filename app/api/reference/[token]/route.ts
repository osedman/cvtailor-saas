/**
 * The referee's own link. Token only — they never asked to be here and must
 * never need an account.
 *
 * Invalid, spent and declined all answer identically, so a guessed token
 * learns nothing about who is being referenced.
 *
 * Rate-limited against FLOODS, not guessing: the token is 192 random bits,
 * which no request rate can guess. So the limit is per link plus a high
 * per-network ceiling (checkDoorwayLimit), never the sign-in tier keyed by IP
 * alone — referees at one employer share an office network.
 */

import { NextRequest, NextResponse } from "next/server"
import { peekReference, recordReference, type RefereeAnswer } from "@/lib/agency/references"
import { checkDoorwayLimit } from "@/lib/rate-limit"

export const maxDuration = 15

function callerIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const limited = await checkDoorwayLimit("reference", callerIp(req), token)
    if (limited) return limited
    const view = await peekReference(token)
    if (!view) return NextResponse.json({ error: "That link is not valid" }, { status: 404 })
    return NextResponse.json({ reference: view })
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const limited = await checkDoorwayLimit("reference", callerIp(req), token)
    if (limited) return limited
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
