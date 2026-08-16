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
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-[#f5d9d0] bg-[#fff7f4] px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[1px] text-[#b3341b]">
          Tailoring against a role that found you
        </p>
        <p className="mt-0.5 truncate text-[14px] font-semibold text-[#1e1813]">
          {role.roleTitle}
          {role.company ? ` — ${role.company}` : ""} · via {role.agencyName}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-[#6f675b]">
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
        className="shrink-0 rounded-lg border border-[#eee6da] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#4e463d] transition-colors hover:border-[#dc4f33]/50"
      >
        Exit role mode
      </button>
    </div>
  )
}
