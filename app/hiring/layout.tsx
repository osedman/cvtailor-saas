/**
 * The hiring-manager (client actor) shell.
 *
 * Same design system as Tailr for Agencies — the HM surface is the agencies
 * product seen from the client's side of the wall, not a second product, so it
 * loads agencies.css and the same three faces (Geist body, Geist Mono chrome,
 * Fraunces display) rather than forking a token set.
 *
 * Theme: dark is a user TOGGLE now (`data-ag-theme` on <html>, applied to
 * `.ag-themed`), not a property of this surface. The older note here said
 * agencies.css turned dark for `.ag-app:has(.agd-main)` — that stopped being
 * true when dark became a mode, and it misled a session on 19 Sep 2026 into
 * treating "should /hiring be light?" as an open question when the hiring
 * manager already chooses.
 *
 * THE RAIL LIVES HERE, not in each page (19 Sep 2026, Figma frame 15). Five
 * places rendered per-page is five chances for them to disagree, and the
 * first version of this shipped as a horizontal strip inside <main> for
 * exactly that reason — it was easier to add to a page than to the shell.
 * `.ag-app` is display:flex, so the rail is a sibling of <main> and the
 * recruiter's own sidebar already works this way. HiringSidebar returns null
 * on the invite doorway, which is not the workspace.
 *
 * Access model (docs/AGENCIES_SCHEMA.md §5.4): hiring managers hold no RLS
 * grants at all. Nothing under /hiring reads Supabase from the client — every
 * read goes through lib/agency/client-auth.ts on the server.
 */

import type { Metadata } from "next"
import { Fraunces, Geist, Geist_Mono } from "next/font/google"
import { AgencyShell } from "@/components/agency/agency-shell"
import { HiringSidebar } from "@/components/agency/hiring-sidebar"
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
    <AgencyShell className={`${agSans.variable} ${agMono.variable} ${agDisplay.variable}`}>
      <HiringSidebar />
      {children}
    </AgencyShell>
  )
}
