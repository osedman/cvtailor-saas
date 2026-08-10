"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"

interface ConfirmSignInProps {
  tokenHash: string | null
  code: string | null
  type: EmailOtpType
  next: string
}

/**
 * Prefetch-safe magic-link completion.
 *
 * Email clients (Gmail, Outlook Safe Links, iOS Mail) often GET the link before
 * the user taps it. Verifying on that first GET burns the one-time token —
 * especially common on mobile. We only verify after an explicit button click.
 */
export function ConfirmSignIn({ tokenHash, code, type, next }: ConfirmSignInProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Stay on the current host (staging preview vs prod). Absolute origins can
  // yank a staging magic-link completion onto gettailr.com when env points at prod.
  const relativeNext = next.startsWith("/") ? next : `/${next}`

  async function completeSignIn() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          type,
          token_hash: tokenHash,
        })
        if (verifyError) {
          setError(verifyError.message || "This link has expired or already been used.")
          setLoading(false)
          return
        }
      } else if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setError(exchangeError.message || "This link has expired or already been used.")
          setLoading(false)
          return
        }
      } else {
        setError("This link is missing sign-in details. Request a new one.")
        setLoading(false)
        return
      }

      // Best-effort: login event + welcome email (never block redirect)
      try {
        await fetch("/api/auth/post-login", { method: "POST" })
      } catch {
        /* ignore */
      }

      window.location.assign(relativeNext)
    } catch {
      setError("Something went wrong signing you in. Please try again.")
      setLoading(false)
    }
  }

  if (!tokenHash && !code) {
    return (
      <div className="text-center space-y-3">
        <h1 className="text-xl font-semibold text-[#1e1813]">Link expired</h1>
        <p className="text-sm text-gray-500">
          This sign-in link is missing or already used. Request a fresh one from Tailr.
        </p>
        <a
          href="/login"
          className="inline-flex items-center justify-center w-full py-2.5 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] transition-colors"
        >
          Back to Tailr
        </a>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4">
      <div className="w-12 h-12 bg-[#dc4f33]/10 rounded-2xl flex items-center justify-center mx-auto">
        <span className="text-[#dc4f33] font-semibold text-lg tracking-tight">t.</span>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-[#1e1813]">Sign in to Tailr</h1>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          Tap below to finish signing in. We ask for one tap so email apps can&apos;t use your
          link before you do.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="button"
        onClick={completeSignIn}
        disabled={loading}
        className="w-full py-3 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Signing you in…" : "Continue to Tailr"}
      </button>

      {error && (
        <a href="/login" className="block text-xs text-gray-400 hover:text-gray-600">
          Request a new magic link
        </a>
      )}
    </div>
  )
}
