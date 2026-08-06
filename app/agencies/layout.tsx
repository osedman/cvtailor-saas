/**
 * Tailr for Agencies shell. Loads the brand faces (Geist + Geist Mono per the
 * handoff's brand v1.0) scoped to the agency surfaces and applies the ported
 * design system in agencies.css. Mono here is chrome and machine data only —
 * see the typography guardrail allowlist.
 */

import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./agencies.css"

const agSans = Geist({ subsets: ["latin"], variable: "--font-ag-sans" })
const agMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ag-mono" })

export const metadata: Metadata = {
  title: "Tailr for Agencies",
  description: "Evidence first shortlists for recruitment agencies. You decide; we structure what you told us.",
}

export default function AgenciesLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ag-app ${agSans.variable} ${agMono.variable}`}>{children}</div>
}
