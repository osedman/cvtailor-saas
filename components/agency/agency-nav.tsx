"use client"

/**
 * The recruiter sidebar's navigate list — ONE definition, every screen.
 *
 * It was hand-rolled five times and had drifted: the briefs page offered
 * Roles / Client access / Audit log while its siblings also offered Settings
 * and Notifications, and the DASHBOARD — the screen you land on — offered
 * nothing at all. So the only route to a client brief was knowing the URL,
 * which is most of why four of them sat unseen for a week.
 *
 * The current screen renders as `.ag-step.on` with aria-current rather than
 * being omitted, so the list is the same length everywhere and you can always
 * see where you are.
 *
 * The Briefs count is deliberately cross-agency: a brief waiting in another
 * of your agencies is still waiting on you, and the badge is the only thing
 * that says so before you have thought to switch.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export type AgencyNavKey = "roles" | "briefs" | "clients" | "audit" | "settings" | "notifications"

const ITEMS: Array<{ key: AgencyNavKey; label: string; href: string }> = [
  { key: "roles", label: "Roles", href: "/agencies" },
  { key: "briefs", label: "Client briefs", href: "/agencies/briefs" },
  { key: "clients", label: "Client access", href: "/agencies/clients" },
  { key: "audit", label: "Audit log", href: "/agencies/audit" },
  { key: "settings", label: "Settings", href: "/agencies/settings" },
  { key: "notifications", label: "Notifications", href: "/agencies/notifications" },
]

export function AgencyNav({ current }: { current: AgencyNavKey }) {
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
      // which is the same as none waiting. The band on the dashboard and the
      // inbox itself both still tell the truth.
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
          <button
            key={item.key}
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
        )
      })}
    </div>
  )
}
