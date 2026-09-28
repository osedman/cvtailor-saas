/**
 * Candidate rights shell. Public, noindex, same design system as the rest of
 * the agency surfaces.
 */

import type { Metadata } from "next"

import { agMono, agSans } from "@/app/fonts"
import "../agencies/agencies.css"

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
