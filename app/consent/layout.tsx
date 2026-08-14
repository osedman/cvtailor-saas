/**
 * The consent doorway.
 *
 * Standalone, like /portal and /rights: the candidate has no account, arrives
 * from an email, and is reading one decision. Brand faces, brand colours, no
 * product chrome — nothing here should feel like a dashboard they have wandered
 * into, and there is nothing to navigate to.
 */

import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./consent.css"

const sans = Geist({ subsets: ["latin"], variable: "--cs-sans" })

export const metadata: Metadata = {
  title: "Your interview — Tailr",
  description: "Decide whether your interview is recorded.",
  // A consent link is personal. Keep it out of indexes entirely.
  robots: { index: false, follow: false },
}

export default function ConsentLayout({ children }: { children: React.ReactNode }) {
  return <div className={`cs-app ${sans.variable}`}>{children}</div>
}
