"use client"

/**
 * The recruiter sidebar's navigation — ONE component, TWO scopes.
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
 * ONE LEVEL AT A TIME (13 Sep 2026). Role screens used to render this whole
 * list with no current item, and then the role's own rail, and then the seven
 * steps: four labelled groups and eighteen things to click on a screen whose
 * job is pasting a job description. Inside a role the desk COLLAPSES to a
 * single link up, so the rail shows the level you are working at rather than
 * every level at once. Nothing became unreachable — every global destination
 * is one click from that link, which is the level directly above a role.
 *
 * Three separate, individually-correct fixes made the pile-up (role screens
 * gained this nav on 3 Sep because Briefs / Clients / Audit / Settings were
 * unreachable from it; the eight items became two groups on 11 Sep; the role
 * rail arrived later that day because Interviews and Close-out were a genuine
 * dead end). None of them is reverted here. The role's three phases live in
 * the role header, which already says which one is current — and which is the
 * only rail that survives below 900px, where .ag-sidebar is display:none.
 *
 * The Briefs count is deliberately cross-agency: a brief waiting in another
 * of your agencies is still waiting on you, and the badge is the only thing
 * that says so before you have thought to switch. That is why it survives the
 * collapse — inside a role it renders only when something is actually
 * waiting, so the guarantee holds without a permanently-silent row sitting
 * next to a single back link.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export type AgencyNavKey =
  | "today"
  | "roles"
  | "candidates"
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

/**
 * Two groups, because eight flat items is a list rather than a navigation
 * (tidied 11 Sep 2026). The split is what a recruiter is doing: the work of
 * filling roles, and the setup around it. Nothing was removed.
 */
type NavGroup = "work" | "desk"

const ITEMS: Array<{ key: AgencyNavKey; label: string; href: string; group: NavGroup }> = [
  { key: "today", label: "Today", href: "/agencies", group: "work" },
  // Today is the queue; Roles is the map. The dashboard's cards were the
  // only way to reach a role until 5 Sep 2026.
  { key: "roles", label: "Roles", href: "/agencies/roles", group: "work" },
  // Candidates was a COUNT in the dashboard's section list and never a route,
  // so a person was reachable only through the role they were on. It is a
  // destination now — the count always implied one (22 Aug walk-through).
  { key: "candidates", label: "Candidates", href: "/agencies/candidates", group: "work" },
  // "Client briefs" removed 22 Sep 2026 (Ose): the whole client-brief flow
  // went. Roles are created by the recruiter; the old URL redirects home.
  { key: "clients", label: "Client access", href: "/agencies/clients", group: "desk" },
  { key: "audit", label: "Audit log", href: "/agencies/audit", group: "desk" },
  { key: "settings", label: "Settings", href: "/agencies/settings", group: "desk" },
  { key: "notifications", label: "Notifications", href: "/agencies/notifications", group: "desk" },
]

/** Where "up" goes from inside a role: the level directly above it. */
const UP = ITEMS.find((i) => i.key === "roles")!

export function AgencyNav({
  current,
  sections,
  onSection,
  activeSection,
  inRole,
}: {
  /** Omit on role-scoped screens: nothing global is current inside a role. */
  current?: AgencyNavKey
  /** Sections of this page, nested under its item. Omit for short screens. */
  sections?: AgencyNavSection[]
  onSection?: (id: string) => void
  activeSection?: string
  /** Role scope: the desk collapses to one link up. */
  inRole?: boolean
}) {
  const router = useRouter()
  if (inRole) {
    return (
      <div>
        {/* Unconditional, and it needs no data. The role header renders
            nothing until its facts load and nothing at all if they fail, so
            the way OUT of a role must never depend on it. */}
        <button className="ag-step ag-nav-up" onClick={() => router.push(UP.href)}>
          <span className="ag-nav-up-arrow" aria-hidden="true">
            ←
          </span>
          All roles
        </button>
      </div>
    )
  }

  const groups: Array<{ key: NavGroup; label: string }> = [
    { key: "work", label: "Navigate" },
    { key: "desk", label: "Your desk" },
  ]

  return (
    <div>
      {groups.map((group) => (
        <div key={group.key} className={group.key === "desk" ? "ag-nav-group" : undefined}>
          <div className="ag-rail-label">{group.label}</div>
          {ITEMS.filter((item) => item.group === group.key).map((item) => {
            const isCurrent = item.key === current
            return (
              <div key={item.key}>
                <button
                  className={`ag-step${isCurrent ? " on" : ""}`}
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={isCurrent ? undefined : () => router.push(item.href)}
                >
                  {item.label}
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
      ))}
    </div>
  )
}
