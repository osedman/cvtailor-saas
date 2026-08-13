/**
 * The hiring-manager (client actor) shell.
 *
 * Same design system as Tailr for Agencies — the HM surface is the agencies
 * product seen from the client's side of the wall, not a second product, so it
 * loads agencies.css and the same three faces (Geist body, Geist Mono chrome,
 * Fraunces display) rather than forking a token set.
 *
 * Theme: agencies.css turns dark for `.ag-app:has(.agd-main)`. The dashboard
 * renders `.agd-main` and is therefore the dark surface, per the signed-off
 * Figma frame ("Tailr — Hiring Manager Concept" → 01 · Hiring manager → HM ·
 * Dashboard). The invite page deliberately does NOT render `.agd-main`: it is
 * a doorway, not the workspace, and stays on light paper.
 *
 * Access model (docs/AGENCIES_SCHEMA.md §5.4): hiring managers hold no RLS
 * grants at all. Nothing under /hiring reads Supabase from the client — every
 * read goes through lib/agency/client-auth.ts on the server.
 */

import type { Metadata } from "next"
import { Fraunces, Geist, Geist_Mono } from "next/font/google"
import "../agencies/agencies.css"
import "./hiring.css"

const agSans = Geist({ subsets: ["latin"], variable: "--font-ag-sans" })
const agMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ag-mono" })
const agDisplay = Fraunces({ subsets: ["latin"], weight: "variable", variable: "--font-ag-display", axes: ["opsz"] })

export const metadata: Metadata = {
  title: "Hiring — Tailr",
  description: "Your interviews, briefs and decisions, from the agency working your roles.",
  // A private workspace reached only by invite; never indexed.
  robots: { index: false, follow: false },
}

export default function HiringLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ag-app ${agSans.variable} ${agMono.variable} ${agDisplay.variable}`}>{children}</div>
  )
}
