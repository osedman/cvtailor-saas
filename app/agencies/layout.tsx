/**
 * Tailr for Agencies shell. Body, chrome and headlines all speak Noto Sans
 * (Ose, 28 Sep) — retiring the 7 Aug Fraunces fork, which gave the agency
 * side a serif display face. `--ag-display` survives as a token so a distinct
 * headline face is one line away again, but it now resolves to the sans.
 * Mono remains chrome and machine data only — see the guardrail allowlist.
 *
 * Faces are declared in app/fonts.ts, not here.
 */

import type { Metadata } from "next"
import { agMono, agSans } from "@/app/fonts"
import { AgencyShell } from "@/components/agency/agency-shell"
import "./agencies.css"

export const metadata: Metadata = {
  title: "Tailr for Agencies",
  description: "Evidence first shortlists for recruitment agencies. You decide; we structure what you told us.",
}

export default function AgenciesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgencyShell className={`${agSans.variable} ${agMono.variable}`}>
      {children}
    </AgencyShell>
  )
}
