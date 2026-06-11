"use client"

import { useState } from "react"
import { X, Mail, Loader2, CheckCircle } from "lucide-react"
import { useAuth } from "./auth-provider"

interface SignInModalProps {
  onClose: () => void
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zm1.78 13.02H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}

export function SignInModal({ onClose }: SignInModalProps) {
  const { signInWithEmail, signInWithLinkedIn } = useAuth()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [linkedInLoading, setLinkedInLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLinkedIn() {
    setLinkedInLoading(true)
    setError(null)
    const { error } = await signInWithLinkedIn()
    if (error) {
      setError(error)
      setLinkedInLoading(false)
    }
    // On success the browser redirects to LinkedIn — no need to reset loading
  }

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
            <h2 className="text-base font-semibold text-[#0f0f0f] mb-2">Check your email</h2>
            <p className="text-sm text-gray-500">
              We sent a magic link to <strong>{email}</strong>. Click it to sign in — no password needed.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="w-10 h-10 bg-[#2563eb]/10 rounded-xl flex items-center justify-center mb-4">
                <Mail className="w-5 h-5 text-[#2563eb]" />
              </div>
              <h2 className="text-base font-semibold text-[#0f0f0f] mb-1">Sign in to CV Tailor</h2>
              <p className="text-sm text-gray-500">Use LinkedIn or get a magic link by email.</p>
            </div>

            {/* LinkedIn OAuth */}
            <button
              onClick={handleLinkedIn}
              disabled={linkedInLoading}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#0A66C2] rounded-lg hover:bg-[#084d92] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mb-4"
            >
              {linkedInLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <LinkedInIcon className="w-4 h-4" />}
              {linkedInLoading ? "Redirecting…" : "Continue with LinkedIn"}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[10px] text-gray-300 uppercase tracking-wide">or</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 transition-all"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 text-sm font-medium text-white bg-[#2563eb] rounded-lg hover:bg-[#1d4ed8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
