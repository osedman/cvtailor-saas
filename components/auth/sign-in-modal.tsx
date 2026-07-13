"use client"

import { useState } from "react"
import { X, Mail, Loader2, CheckCircle } from "lucide-react"
import { useAuth } from "./auth-provider"

interface SignInModalProps {
  onClose: () => void
}

export function SignInModal({ onClose }: SignInModalProps) {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    const { error } = await signInWithEmail(email)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setSent(true)
    }
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
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            <h2 className="text-base font-semibold text-[#1e1813] mb-2">Check your email</h2>
            <p className="text-sm text-gray-500">
              We sent a magic link to <strong>{email}</strong>. Open it on this device to sign in — no password needed.
            </p>
            <p className="mt-3 text-xs text-gray-400 leading-relaxed">
              The link works once and expires after a few minutes. If it says it&apos;s already used, request a fresh one here.
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
