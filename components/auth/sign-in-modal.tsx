"use client"

import { useState } from "react"
import { X, Mail, Loader2, CheckCircle } from "lucide-react"
import { useAuth } from "./auth-provider"
import { createClient } from "@/lib/supabase/client"

interface SignInModalProps {
  onClose: () => void
  /** Called after a successful OTP verify. Defaults to onClose. */
  onSuccess?: () => void
  /** Relative path forwarded into the magic-link confirm URL (e.g. /admin). */
  next?: string
}

export function SignInModal({ onClose, onSuccess, next }: SignInModalProps) {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [verifying, setVerifying] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    const { error } = await signInWithEmail(email, { next })
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setSent(true)
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    const token = code.replace(/\s/g, "")
    if (!email || token.length < 6) return
    setVerifying(true)
    setError(null)
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    })
    if (verifyError) {
      setError(verifyError.message || "That code didn't work. Try again or request a new link.")
      setVerifying(false)
      return
    }
    try {
      await fetch("/api/auth/post-login", { method: "POST" })
    } catch {
      /* ignore */
    }
    setVerifying(false)
    ;(onSuccess ?? onClose)()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-slide-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {sent ? (
          <div className="py-2">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <h2 className="text-base font-semibold text-[#1e1813] mb-2">Check your email</h2>
              <p className="text-sm text-gray-500">
                We sent a sign-in link to <strong>{email}</strong>. On your phone, open the link
                and tap <strong>Continue</strong> — or enter the code from that email below.
              </p>
            </div>

            <form onSubmit={handleVerifyCode} className="mt-5 space-y-3">
              <label className="block text-xs font-medium text-gray-500" htmlFor="otp-code">
                Code from the email
              </label>
              <input
                id="otp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
                className="w-full px-3 py-2.5 text-sm tracking-[0.3em] text-center font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-[#dc4f33] focus:ring-1 focus:ring-[#dc4f33]/20 transition-all"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={verifying || code.replace(/\s/g, "").length < 6}
                className="w-full py-2.5 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
                {verifying ? "Verifying…" : "Verify code"}
              </button>
            </form>

            <p className="mt-4 text-xs text-gray-400 leading-relaxed text-center">
              The link and code each work once and expire after about an hour. If either fails,
              request a fresh one.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="w-10 h-10 bg-[#dc4f33]/10 rounded-xl flex items-center justify-center mb-4">
                <Mail className="w-5 h-5 text-[#dc4f33]" />
              </div>
              <h2 className="text-base font-semibold text-[#1e1813] mb-1">Sign in to Tailr</h2>
              <p className="text-sm text-gray-500">Enter your email and we&apos;ll send you a magic link.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#dc4f33] focus:ring-1 focus:ring-[#dc4f33]/20 transition-all"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 text-sm font-medium text-white bg-[#dc4f33] rounded-lg hover:bg-[#b3341b] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Sending..." : "Send magic link"}
              </button>
            </form>

            <p className="mt-4 text-xs text-center text-gray-400">
              No account needed — we&apos;ll create one automatically.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
