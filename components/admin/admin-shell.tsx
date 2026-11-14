"use client"

/**
 * The admin shell: one navigation bar across every /admin page, and the
 * signed-in person's access for the pages underneath it.
 *
 * Built to the Figma frame "Admin — Admins" (admin-nav). Which tabs appear
 * comes from /api/admin/me — the same gate the routes use — so the nav never
 * offers a section the server would refuse. That is a convenience, not the
 * security boundary: every route checks again.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/auth-provider"
import { roleAllows, type AdminRole } from "@/lib/admin-roles"
import { ROLE_LABELS } from "@/lib/admin-activity-text"

export interface AdminMe {
  role: AdminRole
  twoStep: boolean
  needsTwoStep: boolean
  canWrite: boolean
}

interface AdminContextValue {
  me: AdminMe
  /** Re-read access — call after two-step verification succeeds. */
  refresh: () => Promise<void>
}

const AdminContext = createContext<AdminContextValue | null>(null)

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error("useAdmin must be used inside the admin shell")
  return ctx
}

export const TWO_STEP_PATH = "/admin/two-step"

const TABS: Array<{ href: string; label: string; short: string; needs: AdminRole }> = [
  { href: "/admin", label: "Product health", short: "Health", needs: "viewer" },
  { href: "/admin/insights", label: "Insights & ops", short: "Insights", needs: "viewer" },
  { href: "/admin/courses", label: "Courses", short: "Courses", needs: "admin" },
  { href: "/admin/admins", label: "Admins", short: "Admins", needs: "admin" },
  { href: "/admin/activity", label: "Activity", short: "Activity", needs: "support" },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname() ?? "/admin"
  const [me, setMe] = useState<AdminMe | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/me", { cache: "no-store" })
    if (res.status === 403 || res.status === 401) {
      toast.error("Admin access required")
      router.replace("/tailor")
      return
    }
    if (!res.ok) throw new Error("Could not load your admin access.")
    setMe((await res.json()) as AdminMe)
  }, [router])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    load().catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your admin access."))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  if (!me) {
    return (
      <div className="ns flex min-h-screen items-center justify-center" role="status" aria-label="Loading admin">
        <Loader2 className="h-6 w-6 animate-spin text-[#dc4f33]" aria-hidden />
      </div>
    )
  }

  const tabs = TABS.filter((t) => roleAllows(me.role, t.needs))
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) || user?.email || ""
  const promptTwoStep = me.needsTwoStep && !me.twoStep && pathname !== TWO_STEP_PATH

  return (
    <AdminContext.Provider value={{ me, refresh: load }}>
      <div className="ns min-h-screen">
        <header className="ns-admin-nav">
          <div className="mx-auto flex max-w-[1100px] items-center gap-4 px-4 sm:gap-7 sm:px-10">
            <Link href="/admin" className="flex shrink-0 items-center gap-2 py-4" aria-label="Tailr admin home">
              <span className="text-[15px] font-bold text-[#1e1813]">Tailr</span>
              <span className="text-[10.5px] font-bold tracking-[0.14em] text-[#dc4f33]">ADMIN</span>
            </Link>
            <nav aria-label="Admin sections" className="ns-admin-tabs flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
              {tabs.map((t) => {
                const current = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href)
                return (
                  <Link key={t.href} href={t.href} className="ns-admin-tab" aria-current={current ? "page" : undefined}>
                    <span className="sm:hidden">{t.short}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </Link>
                )
              })}
            </nav>
            <div className="hidden shrink-0 items-center gap-2 md:flex">
              <span className="max-w-[180px] truncate text-[12px] font-medium text-[#5c534c]">{displayName}</span>
              <span className="ns-admin-pill">{ROLE_LABELS[me.role]}</span>
            </div>
          </div>
        </header>

        {promptTwoStep && (
          <div className="border-b border-[#f5d9d0] bg-[#fff7f4]">
            <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-10">
              <p className="text-[12.5px] text-[#b3341b]">
                You can read everything here. To make changes, turn on two-step verification.
              </p>
              <Link
                href={`${TWO_STEP_PATH}?next=${encodeURIComponent(pathname)}`}
                className="ns-admin-btn ns-admin-btn-sm"
              >
                Set up two-step
              </Link>
            </div>
          </div>
        )}

        {children}
      </div>
    </AdminContext.Provider>
  )
}

/** Shared page header: coral eyebrow, title with the coral full stop, lede. */
export function AdminPageHeader({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: string }) {
  return (
    <>
      <div className="t-eyebrow" style={{ fontSize: 10.5 }}>{eyebrow}</div>
      <h1 className="t-title mt-3.5 text-[26px]">
        {title}
        <span style={{ color: "var(--ns-coral)" }}>.</span>
      </h1>
      <p className="mt-3.5 max-w-[720px] text-[12.5px] leading-[1.5] text-[#5c534c]">{lede}</p>
    </>
  )
}

/**
 * Turn a failed admin response into the sentence to show. A missing second
 * factor gets its own wording so the person knows what to do next.
 */
export async function adminErrorMessage(res: Response, fallback = "Something went wrong. Try again."): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  if (body?.error === "two_step_required") return "Turn on two-step verification to make changes."
  if (res.status === 403) return "You don't have access to do that."
  return body?.error || fallback
}
