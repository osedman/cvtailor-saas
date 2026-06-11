import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TailorForm from '@/components/TailorForm'
import Link from 'next/link'
import { cookies } from 'next/headers'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { upgraded?: string }
}) {
  // Check for Supabase session cookie before making any network calls
  const cookieStore = await cookies()
  const hasSession = cookieStore.getAll().some(c => c.name === 'sb-wgpaaafseibcqagiiavt-auth-token')

  if (!hasSession) redirect('/login')

  // Payments not yet enabled — all users get unlimited access
  const isPro = true
  const monthlyUsage = 0
  const FREE_LIMIT = 3

  async function handleSignOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-brand-600">Tailr</Link>
        <div className="flex items-center gap-4">
          {isPro ? (
            <span className="text-xs bg-brand-50 text-brand-700 font-medium px-2 py-1 rounded-full">
              Pro
            </span>
          ) : (
            <Link
              href="/pricing"
              className="text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors"
            >
              Upgrade to Pro
            </Link>
          )}
          <form action={handleSignOut}>
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {searchParams.upgraded && (
          <div className="mb-6 bg-green-50 border border-green-100 text-green-800 text-sm rounded-lg px-4 py-3">
            🎉 You're now on Pro. Enjoy unlimited tailoring!
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-6">Tailor your CV</h1>
        <p className="text-sm text-gray-500 mb-8">
          Paste your CV and job description below. We'll tailor it, optimise for ATS, and show you what gaps remain.
        </p>

        <TailorForm isPro={isPro} monthlyUsage={monthlyUsage} freeLimit={FREE_LIMIT} />
      </main>
    </div>
  )
}
