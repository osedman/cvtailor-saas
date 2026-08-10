"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { SignInModal } from "@/components/auth/sign-in-modal"

/** Only same-origin relative paths — blocks open redirects. */
function safeNextPath(raw: string | null): string {
  if (!raw) return "/tailor"
  const next = raw.trim()
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return "/tailor"
  if (next.length > 512) return "/tailor"
  return next
}

function LoginInner() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get("next"))

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
        next={next === "/tailor" ? undefined : next}
        onClose={() => router.push("/tailor")}
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
