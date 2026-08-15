"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { SignInModal } from "@/components/auth/sign-in-modal"
import { DEFAULT_LANDING, safeNextPath } from "@/lib/auth-paths"

function LoginInner() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  // The shared guard, not a fourth copy of it: the local one this replaced
  // checked the leading slash and the scheme but not the backslash, so
  // `?next=/\evil.com` resolved off-origin right after a session was minted.
  const next = safeNextPath(searchParams.get("next")) ?? DEFAULT_LANDING

  useEffect(() => {
    if (!loading && user) router.replace(next)
  }, [user, loading, next, router])

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f6f0]">
        <Loader2 className="h-6 w-6 animate-spin text-[#dc4f33]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <SignInModal
        next={next === DEFAULT_LANDING ? undefined : next}
        onClose={() => router.push(DEFAULT_LANDING)}
        onSuccess={() => router.replace(next)}
      />
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f9f6f0]">
          <Loader2 className="h-6 w-6 animate-spin text-[#dc4f33]" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  )
}
