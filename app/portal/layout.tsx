/**
 * Client portal shell: the one public surface of Tailr for Agencies. Reuses
 * the agencies design system; mono stays chrome and machine data only, per
 * the typography guardrail allowlist.
 */

import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "../agencies/agencies.css"

const agSans = Geist({ subsets: ["latin"], variable: "--font-ag-sans" })
const agMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ag-mono" })

export const metadata: Metadata = {
  title: "Shortlist",
  description: "A candidate shortlist prepared for you.",
  robots: { index: false, follow: false },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ag-app ${agSans.variable} ${agMono.variable}`} style={{ display: "block", padding: "40px 20px" }}>
      {children}
    </div>
  )
}
