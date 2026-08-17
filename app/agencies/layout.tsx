/**
 * Tailr for Agencies shell. Body and chrome stay on the brand faces (Geist +
 * Geist Mono per brand v1.0); headlines speak in Fraunces — a deliberate
 * agencies-side fork Ose chose on 7 Aug from five specimens, because the
 * default grotesque headline read as AI-template. Serif is display only:
 * screen titles, card titles, role names. Mono remains chrome and machine
 * data only — see the typography guardrail allowlist.
 */

import type { Metadata } from "next"
import { Fraunces, Geist, Geist_Mono } from "next/font/google"
import { AgencyShell } from "@/components/agency/agency-shell"
import "./agencies.css"

const agSans = Geist({ subsets: ["latin"], variable: "--font-ag-sans" })
const agMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ag-mono" })
// Variable font: weight span + optical size axis, so 15px card titles and
// 38px heroes each get the right optical cut.
const agDisplay = Fraunces({ subsets: ["latin"], weight: "variable", variable: "--font-ag-display", axes: ["opsz"] })

export const metadata: Metadata = {
  title: "Tailr for Agencies",
  description: "Evidence first shortlists for recruitment agencies. You decide; we structure what you told us.",
}

export default function AgenciesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgencyShell className={`${agSans.variable} ${agMono.variable} ${agDisplay.variable}`}>
      {children}
    </AgencyShell>
  )
}
