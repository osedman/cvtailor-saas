/**
 * The referee doorway. Same shape as /consent: one person, one decision,
 * arriving cold from an email with no account and no reason to trust us yet.
 * Never indexed — a reference link names two people.
 */

import type { Metadata } from "next"

import { csSans } from "@/app/fonts"
import "../consent/consent.css"

export const metadata: Metadata = {
  title: "A reference request — Tailr",
  description: "Give a reference, or decline.",
  robots: { index: false, follow: false },
}

export default function ReferenceLayout({ children }: { children: React.ReactNode }) {
  return <div className={`cs-app ${csSans.variable}`}>{children}</div>
}
