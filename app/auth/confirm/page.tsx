import type { EmailOtpType } from "@supabase/supabase-js"
import { ConfirmSignIn } from "@/components/auth/confirm-sign-in"
import { DEFAULT_LANDING, safeNextPath } from "@/lib/hat-routing"

/**
 * Magic-link landing page. Does NOT verify the token on GET — that would let
 * mobile email prefetchers burn the one-time link before the user taps it.
 * Verification happens only after the user clicks Continue.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = (key: string) => {
    const v = params[key]
    return Array.isArray(v) ? v[0] ?? null : v ?? null
  }

  const tokenHash = raw("token_hash")
  const code = raw("code")
  const type = (raw("type") as EmailOtpType | null) ?? "email"
  // A `next` on the link is an explicit destination and always wins. Without
  // one, /tailor is only the fallback: the real landing depends on which hats
  // this person wears, and that is resolved after verification, because this
  // page renders while they are still anonymous.
  //
  // The guard is safeNextPath() and nothing else. A second, hand-rolled copy
  // lived here and had already drifted permissive — it missed the backslash
  // rejection, so `next=/\evil.example.com` passed and the browser resolved it
  // off-origin, right after a session was minted.
  const explicitNext = safeNextPath(raw("next"))
  const nextExplicit = explicitNext !== null
  const next = explicitNext ?? DEFAULT_LANDING

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-gradient-to-b from-[#faf7f4] to-white">
      <div className="w-full max-w-sm">
        <ConfirmSignIn
          tokenHash={tokenHash}
          code={code}
          type={type}
          next={next}
          nextExplicit={nextExplicit}
        />
      </div>
    </main>
  )
}
