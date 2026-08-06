/**
 * Candidate rights shell. Public, noindex, same design system as the rest of
 * the agency surfaces.
 */

import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "../agencies/agencies.css"

const agSans = Geist({ subsets: ["latin"], variable: "--font-ag-sans" })
const agMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ag-mono" })

export const metadata: Metadata = {
  title: "Your data",
  description: "See what a recruitment agency holds about you, and ask them to change or delete it.",
  robots: { index: false, follow: false },
}

export default function RightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ag-app ${agSans.variable} ${agMono.variable}`} style={{ display: "block", padding: "40px 20px" }}>
      {children}
    </div>
  )
}
