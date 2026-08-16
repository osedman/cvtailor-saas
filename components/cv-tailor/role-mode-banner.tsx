"use client"

/**
 * Role mode: /tailor entered from a recommendation on /found (Figma
 * "Consumer · Tailor-first apply — changed surfaces", section D).
 *
 * The banner says three load-bearing things, and the copy is tested: the JD
 * is locked to the version of the role the person was matched on, tailoring
 * shares nothing, and applying happens back on /found — this surface never
 * grows a send button.
 */

import Link from "next/link"

export interface RoleModeInfo {
  recommendationId: string
  roleTitle: string
  company: string
  agencyName: string
  roleRef: string
}

export function RoleModeBanner({
  role,
  onExit,
}: {
  role: RoleModeInfo
  onExit: () => void
}) {
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border px-5 py-3.5"
      style={{ borderColor: "var(--ns-tint-2)", background: "var(--ns-tint-1)" }}
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] font-semibold uppercase tracking-[1px]"
          style={{ color: "var(--ns-coral-deep)" }}
        >
          Tailoring against a role that found you
        </p>
        <p
          className="mt-0.5 truncate text-[14px] font-semibold"
          style={{ color: "var(--ns-ink)" }}
          title={`${role.roleTitle}${role.company ? ` — ${role.company}` : ""} · via ${role.agencyName}`}
        >
          {role.roleTitle}
          {role.company ? ` — ${role.company}` : ""} · via {role.agencyName}
        </p>
        <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--ns-ink-55)" }}>
          The role&apos;s requirements are locked to the version you were matched on — the
          job panel is read-only in this mode. Tailoring shares nothing; when you&apos;re
          ready, apply from{" "}
          <Link href="/found" className="underline">
            your recommendations
          </Link>
          .
        </p>
      </div>
      <button
        onClick={onExit}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border bg-white px-3.5 py-2 text-[12.5px] font-medium transition-colors [touch-action:manipulation] hover:border-[color:var(--ns-coral)]"
        style={{ borderColor: "var(--ns-border)", color: "var(--ns-ink-70)" }}
      >
        Exit role mode
      </button>
    </div>
  )
}
