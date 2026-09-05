"use client"

/**
 * The recruiter sidebar's navigation — ONE list, every screen.
 *
 * It was hand-rolled five times and had drifted: the briefs page offered
 * Roles / Client access / Audit log while its siblings also offered Settings
 * and Notifications, and the DASHBOARD offered no route navigation at all
 * (its "Navigate" list was in-page scroll anchors). So the only route to a
 * client brief was knowing the URL, which is most of why four sat unseen for
 * a week.
 *
 * ONE LIST, NOT TWO. The first fix added routes ALONGSIDE the dashboard's
 * anchors, which left two navigations in one rail — and "Roles" and "Clients"
 * appearing in both, meaning different things in each. A page's own sections
 * now nest UNDER its nav item, visible only while you are on that page: the
 * indent says "part of this screen" and there is exactly one place to look.
 *
 * The current item renders with aria-current rather than being omitted, so
 * the list is the same length everywhere — omitting it is half of why the
 * drift went unnoticed.
 *
 * NO SECTION MAY REPEAT ITS OWN PAGE (22 Aug walk-through). The dashboard
 * nested a "Today" section that scrolled to the top of the page its own nav
 * item already routes to — the same destination named twice, and the second
 * name led nowhere new. A page's item IS the way back to its top.
 *
 * The Briefs count is deliberately cross-agency: a brief waiting in another
 * of your agencies is still waiting on you, and the badge is the only thing
 * that says so before you have thought to switch.
 *
 * ROLE SCREENS RENDER IT WITH NO CURRENT ITEM (3 Sep 2026). The workflow,
 * candidate detail, interviews, close-out and dossier pages are inside a
 * role, which is not a global place — so nothing here is "current" there,
 * and the role's own rail (RoleRail, or the seven steps) sits underneath.
 * Before this, those pages hand-rolled a "Navigate" list each, and two of
 * them offered no route navigation at all: Briefs, Clients, Audit and
 * Settings were unreachable from the screen recruiters spend most time on.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export type AgencyNavKey =
  | "roles"
  | "list"
  | "candidates"
  | "briefs"
  | "clients"
  | "audit"
  | "settings"
  | "notifications"

/** A section of the CURRENT page, jumped to rather than navigated to. */
export interface AgencyNavSection {
  id: string
  label: string
  count?: number
}

const ITEMS: Array<{ key: AgencyNavKey; label: string; href: string }> = [
  { key: "roles", label: "Today", href: "/agencies" },
  // Today is the queue; Roles is the map. The dashboard's cards were the
  // only way to reach a role until 5 Sep 2026.
  { key: "list", label: "Roles", href: "/agencies/roles" },
  // Candidates was a COUNT in the dashboard's section list and never a route,
  // so a person was reachable only through the role they were on. It is a
  // destination now — the count always implied one (22 Aug walk-through).
  { key: "candidates", label: "Candidates", href: "/agencies/candidates" },
  { key: "briefs", label: "Client briefs", href: "/agencies/briefs" },
  { key: "clients", label: "Client access", href: "/agencies/clients" },
  { key: "audit", label: "Audit log", href: "/agencies/audit" },
  { key: "settings", label: "Settings", href: "/agencies/settings" },
  { key: "notifications", label: "Notifications", href: "/agencies/notifications" },
]

export function AgencyNav({
  current,
  sections,
  onSection,
  activeSection,
}: {
  /** Omit on role-scoped screens: nothing global is current inside a role. */
  current?: AgencyNavKey
  /** Sections of this page, nested under its item. Omit for short screens. */
  sections?: AgencyNavSection[]
  onSection?: (id: string) => void
  activeSection?: string
}) {
  const router = useRouter()
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    let live = true
    fetch("/api/agency/briefs?status=submitted")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && Array.isArray(d?.briefs)) setWaiting(d.briefs.length)
      })
      // Chrome must never break a page: a failed count renders as no badge,
      // which reads the same as none waiting. The inbox still tells the truth.
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return (
    <div>
      <div className="ag-rail-label">Navigate</div>
      {ITEMS.map((item) => {
        const isCurrent = item.key === current
        return (
          <div key={item.key}>
            <button
              className={`ag-step${isCurrent ? " on" : ""}`}
              aria-current={isCurrent ? "page" : undefined}
              onClick={isCurrent ? undefined : () => router.push(item.href)}
            >
              {item.label}
              {item.key === "briefs" && waiting > 0 && (
                <span className="ag-pill" style={{ marginLeft: 8 }}>
                  {waiting}
                </span>
              )}
            </button>
            {isCurrent && sections && sections.length > 0 && (
              <nav className="agd-nav ag-nav-sections" aria-label="On this page">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    className={`agd-nav-item${activeSection === s.id ? " on" : ""}`}
                    onClick={() => onSection?.(s.id)}
                  >
                    <span className="agd-nav-dot" />
                    {s.label}
                    {typeof s.count === "number" && s.count > 0 && (
                      <span className="agd-nav-count">{s.count}</span>
                    )}
                  </button>
                ))}
              </nav>
            )}
          </div>
        )
      })}
    </div>
  )
}
