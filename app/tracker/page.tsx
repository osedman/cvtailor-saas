"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { JobTrackerBoard } from "@/components/tracker/job-tracker-board"

export default function TrackerPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) router.push("/tailor")
  }, [authLoading, user, router])

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f9f6f0] flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/tailor" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#1e1813] transition-colors">
            <ArrowLeft className="w-4 h-4" />Back
          </Link>
          <div className="w-px h-4 bg-gray-200" />
          <h1 className="text-sm font-semibold text-[#1e1813]">Job tracker</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <JobTrackerBoard />
      </main>
    </div>
  )
}
