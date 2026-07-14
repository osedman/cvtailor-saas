import type { EmailOtpType } from "@supabase/supabase-js"
import { ConfirmSignIn } from "@/components/auth/confirm-sign-in"

/**
 * Magic-link landing page. Does NOT verify on GET — mobile email prefetchers
 * would burn the one-time token before the user taps Continue.
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
  const nextRaw = raw("next") ?? "/tailor"
  const next = nextRaw.startsWith("/") ? nextRaw : `/${nextRaw}`

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-gradient-to-b from-[#faf7f4] to-white">
      <div className="w-full max-w-sm">
        <ConfirmSignIn tokenHash={tokenHash} code={code} type={type} next={next} />
      </div>
    </main>
  )
}
