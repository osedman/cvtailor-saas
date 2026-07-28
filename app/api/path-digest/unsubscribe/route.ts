import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { errMessage } from "@/lib/err"

/** One-click digest unsubscribe from the email itself — no login, HMAC-signed.
 * If moving/stopping is frictionless it's planning; if it needs a login it's
 * nagging (spec, docs/PROJECT.md). */
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid") ?? ""
  const sig = req.nextUrl.searchParams.get("sig") ?? ""
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  const expected = createHmac("sha256", secret).update(`digest-unsub:${uid}`).digest("hex").slice(0, 32)

  const valid =
    uid.length > 0 && sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  if (!valid) return NextResponse.json({ error: "Invalid link" }, { status: 400 })

  try {
    const admin = createAdminClient()
    const { error } = await admin.from("profiles").update({ path_digest_opt_out: true }).eq("id", uid)
    if (error) throw error
    return new NextResponse(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,sans-serif;background:#f9f6f0;color:#1e1813;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="text-align:center;padding:24px;"><p style="font-size:18px;font-weight:700;margin:0 0 8px;">You're unsubscribed.</p><p style="font-size:14px;color:#5c534c;margin:0;">No more weekly digests. Your path stays exactly where you left it.</p></div></body>`,
      { headers: { "Content-Type": "text/html" } },
    )
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}
