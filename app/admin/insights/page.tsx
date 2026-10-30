"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Loader2, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Gauge, Users, BookOpen, Moon,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/auth-provider"
import { isAdminEmail } from "@/lib/admin"
import type { AdminInsights, OpsAlert } from "@/lib/admin-insights"

interface Payload {
  insights: AdminInsights
  generatedAt: string
  env: string
}

function fmtHours(h: number | null): string {
  if (h == null) return "—"
  if (h < 48) return `${h}h`
  return `${Math.round((h / 24) * 10) / 10}d`
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString([], {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function Section({
  title, meaning, children, icon,
}: {
  title: string
  meaning: string
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[#eee6da] bg-[#fdfcf9] p-5 sm:p-6">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold tracking-tight text-[#1e1813]">{title}</h2>
        </div>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#1e1813]/55">{meaning}</p>
      </header>
      {children}
    </section>
  )
}

function AlertStrip({ alerts }: { alerts: OpsAlert[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {alerts.map((a) => {
        const tone =
          a.severity === "critical"
            ? "border-[#dc4f33]/40 bg-[#fff7f4]"
            : a.severity === "warn"
              ? "border-[#eee6da] bg-[#fdfcf9]"
              : "border-[#eee6da] bg-white"
        return (
          <div key={a.key} className={`rounded-xl border p-4 ${tone}`}>
            <div className="flex items-start gap-2">
              {a.severity === "info" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${
                  a.severity === "critical" ? "text-[#b3341b]" : "text-[#dc4f33]"
                }`} />
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#1e1813]">{a.label}</p>
                <p className="mt-0.5 text-[12px] text-[#1e1813]/55">{a.detail}</p>
                {a.href && (
                  <Link href={a.href} className="mt-2 inline-block text-[12px] text-[#dc4f33] hover:underline">
                    Open →
                  </Link>
                )}
              </div>
              {a.count != null && a.key !== "all_clear" && (
                <span className="ml-auto text-[15px] font-semibold tabular-nums text-[#1e1813]">
                  {a.count}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AdminInsightsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch("/api/admin/insights")
      if (res.status === 403) {
        toast.error("Admin access required")
        router.push("/tailor")
        return
      }
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load")
      setData(await res.json())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load insights")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push("/login?next=/admin/insights")
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f6f0]">
        <Loader2 className="h-6 w-6 animate-spin text-[#dc4f33]" />
      </div>
    )
  }

  if (!data) return null
  const i = data.insights
  const t = i.timeToX
  const q = i.quota
  const c = i.courseOps

  return (
    <div className="min-h-screen bg-[#f9f6f0]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[#1e1813]/55 hover:text-[#1e1813]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Product health
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1e1813]">
              Insights & ops
            </h1>
            <p className="mt-1 text-[13px] text-[#1e1813]/55">
              Alerts, quality vs outcomes, time-to-value, retention, courses, quiet users.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAdminEmail(user?.email) && (
              <Link
                href="/admin/courses"
                className="rounded-lg border border-[#eee6da] bg-white px-3 py-2 text-[13px] text-[#1e1813]/70 hover:border-[#dc4f33]/40"
              >
                Course review
              </Link>
            )}
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1e1813] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#1e1813]/90 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-6">
          <AlertStrip alerts={i.alerts} />
        </div>

        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Section
              title="Quality by outcome"
              meaning="Median match score among users who reached each tracker stage (last 30d runs)."
              icon={<Gauge className="h-4 w-4 text-[#dc4f33]" />}
            >
              <div className="space-y-3">
                {i.qualityByOutcome.map((row) => (
                  <div
                    key={row.stage}
                    className="flex items-center justify-between gap-3 border-b border-[#eee6da] pb-2 last:border-0"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-[#1e1813]">{row.label}</p>
                      <p className="text-[11px] text-[#1e1813]/45">
                        {row.users} users · {row.runs} runs
                      </p>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums text-[#1e1813]">
                      {row.medianScore ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="Time to value"
              meaning="Median hours between journey milestones. Small samples mean treat with care."
              icon={<Clock className="h-4 w-4 text-[#dc4f33]" />}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    label: "Signup → first tailor",
                    value: t.signupToFirstTailorHours,
                    n: t.sampleSizes.signupToFirstTailor,
                  },
                  {
                    label: "First tailor → track",
                    value: t.firstTailorToTrackHours,
                    n: t.sampleSizes.firstTailorToTrack,
                  },
                  {
                    label: "Track → applied",
                    value: t.trackToAppliedHours,
                    n: t.sampleSizes.trackToApplied,
                  },
                ].map((cell) => (
                  <div key={cell.label} className="rounded-lg border border-[#eee6da] bg-white p-4">
                    <p className="text-[11px] uppercase tracking-wide text-[#1e1813]/45">
                      {cell.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-[#1e1813]">
                      {fmtHours(cell.value)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#1e1813]/40">n = {cell.n}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <Section
            title="Plan & quota pressure"
            meaning="Pro share and free users pushing hard. Near-wall ≈ ≥40 tailor runs in 30 days (rate limit 60/day)."
            icon={<Users className="h-4 w-4 text-[#dc4f33]" />}
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Pro share", value: `${q.proShare}%`, sub: `${q.proUsers} pro · ${q.freeUsers} free` },
                { label: "Free ≥10 all-time", value: String(q.freeHeavy10), sub: "Heavy free users" },
                { label: "Free ≥30 all-time", value: String(q.freeHeavy30), sub: "Power free users" },
                { label: "Near daily wall", value: String(q.freeNearDailyWall), sub: "≥40 runs / 30d" },
              ].map((card) => (
                <div key={card.label} className="rounded-lg border border-[#eee6da] bg-white p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[#1e1813]/45">{card.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-[#1e1813]">{card.value}</p>
                  <p className="mt-1 text-[11px] text-[#1e1813]/45">{card.sub}</p>
                </div>
              ))}
            </div>
            {q.nearWallEmails.length > 0 && (
              <div>
                <p className="mb-2 text-[12px] font-medium text-[#1e1813]">Near-wall emails</p>
                <ul className="flex flex-wrap gap-1.5">
                  {q.nearWallEmails.map((e) => (
                    <li key={e} className="rounded bg-[#fff7f4] px-2 py-0.5 text-[11px] text-[#1e1813]/80">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section
            title="Feature retention"
            meaning="Of people who adopted each feature, who tailored again in the last 7 / 30 days."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#eee6da] text-[10px] uppercase tracking-wide text-[#1e1813]/40">
                    <th className="py-2 pr-4 font-medium">Feature</th>
                    <th className="py-2 pr-4 font-medium">Adopters</th>
                    <th className="py-2 pr-4 font-medium">Active 7d</th>
                    <th className="py-2 font-medium">Active 30d</th>
                  </tr>
                </thead>
                <tbody>
                  {i.featureRetention.map((r) => (
                    <tr key={r.key} className="border-b border-[#eee6da]/60 last:border-0">
                      <td className="py-3 pr-4 text-[13px] font-medium text-[#1e1813]">{r.label}</td>
                      <td className="py-3 pr-4 text-[13px] tabular-nums text-[#1e1813]/70">{r.adopters}</td>
                      <td className="py-3 pr-4 text-[13px] tabular-nums text-[#1e1813]">
                        {r.active7d}
                        <span className="ml-1.5 text-[11px] text-[#1e1813]/40">{r.rate7d}%</span>
                      </td>
                      <td className="py-3 text-[13px] tabular-nums text-[#1e1813]">
                        {r.active30d}
                        <span className="ml-1.5 text-[11px] text-[#1e1813]/40">{r.rate30d}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Course ops"
            meaning="Catalogue health and review backlog. Approvals stay on the Course review page."
            icon={<BookOpen className="h-4 w-4 text-[#dc4f33]" />}
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Pending review", value: String(c.pendingTotal) },
                { label: "Active catalogue", value: String(c.catalogActive) },
                { label: "Stale catalogue", value: String(c.catalogStale) },
                {
                  label: "Last sync",
                  value: c.lastSync ? c.lastSync.status : "—",
                  sub: c.lastSync
                    ? `${c.lastSync.source} · ${fmtWhen(c.lastSync.started_at)}`
                    : "No runs recorded",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-lg border border-[#eee6da] bg-white p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[#1e1813]/45">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold capitalize tabular-nums text-[#1e1813]">
                    {card.value}
                  </p>
                  {"sub" in card && card.sub && (
                    <p className="mt-1 text-[11px] text-[#1e1813]/45">{card.sub}</p>
                  )}
                </div>
              ))}
            </div>
            {Object.keys(c.pendingByProvider).length > 0 && (
              <div>
                <p className="mb-2 text-[12px] font-medium text-[#1e1813]">Pending by provider</p>
                <ul className="flex flex-wrap gap-2">
                  {Object.entries(c.pendingByProvider)
                    .sort((a, b) => b[1] - a[1])
                    .map(([provider, count]) => (
                      <li
                        key={provider}
                        className="rounded-lg border border-[#eee6da] bg-white px-3 py-1.5 text-[12px] text-[#1e1813]"
                      >
                        {provider}
                        <span className="ml-2 font-semibold tabular-nums text-[#dc4f33]">{count}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {isAdminEmail(user?.email) && (
              <Link
                href="/admin/courses"
                className="mt-4 inline-block text-[13px] text-[#dc4f33] hover:underline"
              >
                Open course review →
              </Link>
            )}
          </Section>

          <Section
            title="Quiet users"
            meaning="Activated in the last 14 days, no sign-in for 7+ days — win-back candidates."
            icon={<Moon className="h-4 w-4 text-[#dc4f33]" />}
          >
            {i.quietUsers.length === 0 ? (
              <p className="text-[13px] text-[#1e1813]/45">None right now — good.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#eee6da] text-[10px] uppercase tracking-wide text-[#1e1813]/40">
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Last sign-in</th>
                      <th className="py-2 pr-4 font-medium">Activated</th>
                      <th className="py-2 text-right font-medium">Tailors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.quietUsers.map((u) => (
                      <tr key={u.email} className="border-b border-[#eee6da]/60 last:border-0">
                        <td className="py-2.5 pr-4 text-[12px] text-[#1e1813]">{u.email}</td>
                        <td className="py-2.5 pr-4 text-[12px] text-[#1e1813]/55">
                          {fmtWhen(u.last_sign_in_at)}
                        </td>
                        <td className="py-2.5 pr-4 text-[12px] text-[#1e1813]/55">
                          {fmtWhen(u.activated_at)}
                        </td>
                        <td className="py-2.5 text-right text-[12px] tabular-nums text-[#1e1813]/70">
                          {u.tailors_used}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <footer className="rounded-xl border border-[#eee6da] bg-white p-5">
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-[#1e1813]/55">
              {i.generatedNotes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] tabular-nums text-[#1e1813]/40">
              Generated {fmtWhen(data.generatedAt)} · env {data.env}
            </p>
          </footer>
        </div>
      </div>
    </div>
  )
}
