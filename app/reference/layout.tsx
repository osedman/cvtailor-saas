/**
 * The referee doorway. Same shape as /consent: one person, one decision,
 * arriving cold from an email with no account and no reason to trust us yet.
 * Never indexed — a reference link names two people.
 */

import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "../consent/consent.css"

const sans = Geist({ subsets: ["latin"], variable: "--cs-sans" })

export const metadata: Metadata = {
  title: "A reference request — Tailr",
  description: "Give a reference, or decline.",
  robots: { index: false, follow: false },
}

export default function ReferenceLayout({ children }: { children: React.ReactNode }) {
  return <div className={`cs-app ${sans.variable}`}>{children}</div>
}
