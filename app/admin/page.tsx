"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Loader2, Users, LogIn, Sparkles, Kanban,
  RefreshCw, ShieldCheck, UserX,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/auth-provider"

// ── Types ──────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
}
interface LoginEvent {
  user_id: string
  email: string
  created_at: string
  ip: string
  user_agent: string
}
interface Profile {
  id: string
  email: string
  tailors_used: number
  plan: string
  created_at: string
}
interface TailorRun { user_id: string; created_at: string; match_score: number }
interface TrackerJob { user_id: string; status: string; created_at: string }

interface Stats {
  users: AdminUser[]
  loginEvents: LoginEvent[]
  profiles: Profile[]
  tailorRuns: TailorRun[]
  trackerJobs: TrackerJob[]
  generatedAt: string
}

// ── Helpers ────────────────────────────────────────────────────────────

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

function lastNDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function relDay(iso: string | null) {
  if (!iso) return "Never"
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return `${diff}d ago`
}

function browserOf(ua: string) {
  if (/edg/i.test(ua)) return "Edge"
  if (/chrome/i.test(ua)) return "Chrome"
  if (/safari/i.test(ua)) return "Safari"
  if (/firefox/i.test(ua)) return "Firefox"
  return "Other"
}

// ── Bar chart (hand-rolled, no deps) ───────────────────────────────────

function BarChart({ data, color = "#dc4f33", height = 120 }: {
  data: { label: string; value: number }[]
  color?: string
  height?: number
}) {
  const max = Math.max(1, ...data.map(d => d.value))
  const showEvery = data.length > 14 ? 7 : data.length > 7 ? 2 : 1

  return (
    <div className="w-full">
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            {/* Tooltip */}
            <div className="absolute -top-7 hidden group-hover:block bg-[#1e1813] text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
              {d.label.slice(5)}: {d.value}
            </div>
            <div
              className="w-full rounded-t transition-all duration-200 group-hover:opacity-80"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value > 0 ? 3 : 1,
                background: d.value > 0 ? color : "#f3f4f6",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 text-center">
            <span className="text-[8px] text-gray-300">
              {i % showEvery === 0 ? d.label.slice(8) : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#1e1813] mt-2 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/stats")
      if (res.status === 403) { setForbidden(true); return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStats(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load stats")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && !user) { router.push("/tailor"); return }
    if (user) fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  // ── Derived metrics ──
  const derived = useMemo(() => {
    if (!stats) return null
    const days30 = lastNDays(30)
    const days14 = lastNDays(14)

    const loginsPerDay = days30.map(day => ({
      label: day,
      value: stats.loginEvents.filter(e => dayKey(e.created_at) === day).length,
    }))
    const signupsPerDay = days30.map(day => ({
      label: day,
      value: stats.users.filter(u => dayKey(u.created_at) === day).length,
    }))
    const tailorsPerDay = days14.map(day => ({
      label: day,
      value: stats.tailorRuns.filter(r => dayKey(r.created_at) === day).length,
    }))

    const now = Date.now()
    const activeIn = (days: number) =>
      stats.users.filter(u => u.last_sign_in_at &&
        now - new Date(u.last_sign_in_at).getTime() < days * 86400000).length

    const neverTailored = stats.profiles.filter(p => p.tailors_used === 0).length

    const topUsers = [...stats.profiles]
      .sort((a, b) => b.tailors_used - a.tailors_used)
      .slice(0, 5)

    return { loginsPerDay, signupsPerDay, tailorsPerDay, dau: activeIn(1), wau: activeIn(7), mau: activeIn(30), neverTailored, topUsers }
  }, [stats])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3">
        <UserX className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-500">You don&apos;t have access to this page.</p>
        <Link href="/tailor" className="text-sm text-[#dc4f33] hover:underline">Back to Tailr</Link>
      </div>
    )
  }

  if (!stats || !derived) return null

  const sortedUsers = [...stats.users].sort((a, b) =>
    (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""))

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/tailor" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#1e1813] transition-colors">
            <ArrowLeft className="w-4 h-4" />Back
          </Link>
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#dc4f33]" />
            <h1 className="text-sm font-semibold text-[#1e1813]">Admin dashboard</h1>
          </div>
          <div className="flex-1" />
          <span className="text-[10px] text-gray-300 hidden sm:block">
            Updated {fmtDateTime(stats.generatedAt)}
          </span>
          <button
            onClick={fetchStats}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#dc4f33] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="w-3.5 h-3.5" />}
            label="Total users"
            value={stats.users.length}
            sub={`${derived.neverTailored} never tailored`}
          />
          <StatCard
            icon={<LogIn className="w-3.5 h-3.5" />}
            label="Active users"
            value={derived.wau}
            sub={`DAU ${derived.dau} · MAU ${derived.mau}`}
          />
          <StatCard
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Tailors (30d)"
            value={stats.tailorRuns.length}
            sub={`${stats.profiles.reduce((s, p) => s + p.tailors_used, 0)} all-time`}
          />
          <StatCard
            icon={<Kanban className="w-3.5 h-3.5" />}
            label="Tracked jobs"
            value={stats.trackerJobs.length}
            sub={`${stats.trackerJobs.filter(j => j.status === "offer").length} offers`}
          />
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-[#1e1813] mb-1">Logins per day</h2>
            <p className="text-[10px] text-gray-400 mb-4">
              Last 30 days · {stats.loginEvents.length} events
              {stats.loginEvents.length === 0 && " — collecting from now on; check back after the next sign-in"}
            </p>
            <BarChart data={derived.loginsPerDay} color="#dc4f33" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-[#1e1813] mb-1">Signups per day</h2>
            <p className="text-[10px] text-gray-400 mb-4">Last 30 days</p>
            <BarChart data={derived.signupsPerDay} color="#16a34a" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tailor runs chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
            <h2 className="text-xs font-semibold text-[#1e1813] mb-1">Tailoring runs per day</h2>
            <p className="text-[10px] text-gray-400 mb-4">Last 14 days</p>
            <BarChart data={derived.tailorsPerDay} color="#7c3aed" height={100} />
          </div>

          {/* Top users */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-[#1e1813] mb-4">Top users by tailors</h2>
            <div className="space-y-3">
              {derived.topUsers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-gray-300 w-4">#{i + 1}</span>
                  <span className="text-xs text-[#1e1813] truncate flex-1">{p.email}</span>
                  <span className="text-xs font-semibold text-[#dc4f33] tabular-nums">{p.tailors_used}</span>
                </div>
              ))}
              {derived.topUsers.length === 0 && (
                <p className="text-xs text-gray-300">No usage yet</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Recent logins feed ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-[#1e1813]">Recent logins</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              From login_events — captures magic-link sign-ins from today onward
            </p>
          </div>
          {stats.loginEvents.length === 0 ? (
            <p className="text-xs text-gray-300 px-5 py-8 text-center">
              No login events recorded yet. The next magic-link sign-in will appear here.
            </p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                  <th className="px-5 py-2.5 font-medium">User</th>
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-5 py-2.5 font-medium hidden sm:table-cell">IP</th>
                  <th className="px-5 py-2.5 font-medium hidden md:table-cell">Browser</th>
                </tr>
              </thead>
              <tbody>
                {stats.loginEvents.slice(0, 20).map((e, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-5 py-2.5 text-xs text-[#1e1813]">{e.email}</td>
                    <td className="px-5 py-2.5 text-xs text-gray-500">{fmtDateTime(e.created_at)}</td>
                    <td className="px-5 py-2.5 text-xs text-gray-400 hidden sm:table-cell font-mono">{e.ip || "—"}</td>
                    <td className="px-5 py-2.5 text-xs text-gray-400 hidden md:table-cell">{browserOf(e.user_agent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── All users table ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-[#1e1813]">All users ({stats.users.length})</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Sorted by most recent sign-in · from Supabase auth</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                  <th className="px-5 py-2.5 font-medium">Email</th>
                  <th className="px-5 py-2.5 font-medium">Last sign-in</th>
                  <th className="px-5 py-2.5 font-medium hidden sm:table-cell">Joined</th>
                  <th className="px-5 py-2.5 font-medium text-right">Tailors</th>
                  <th className="px-5 py-2.5 font-medium hidden md:table-cell">Plan</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map(u => {
                  const profile = stats.profiles.find(p => p.id === u.id)
                  return (
                    <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-5 py-2.5 text-xs text-[#1e1813]">{u.email}</td>
                      <td className="px-5 py-2.5 text-xs">
                        <span className={`${relDay(u.last_sign_in_at) === "Today" ? "text-green-600 font-medium" : "text-gray-500"}`}>
                          {relDay(u.last_sign_in_at)}
                        </span>
                        <span className="text-gray-300 ml-1.5 hidden lg:inline">{fmtDateTime(u.last_sign_in_at)}</span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-gray-400 hidden sm:table-cell">{fmtDateTime(u.created_at)}</td>
                      <td className="px-5 py-2.5 text-xs text-gray-500 text-right tabular-nums">{profile?.tailors_used ?? 0}</td>
                      <td className="px-5 py-2.5 hidden md:table-cell">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          profile?.plan === "pro" ? "bg-violet-50 text-violet-600" : "bg-gray-100 text-gray-500"
                        }`}>
                          {profile?.plan ?? "free"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
