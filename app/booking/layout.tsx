/**
 * The interview booking doorway.
 *
 * Standalone, like /consent, /portal and /rights: the candidate has no
 * account, arrives from an email, and is answering one question about one
 * morning. It borrows the consent doorway's stylesheet rather than growing a
 * second candidate-facing vocabulary — these are the same person on the same
 * kind of page, and they should not look like two different products.
 */

import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "../consent/consent.css"
import "./booking.css"

const sans = Geist({ subsets: ["latin"], variable: "--cs-sans" })

export const metadata: Metadata = {
  title: "Your interview — Tailr",
  description: "Confirm or rearrange your interview.",
  // A booking link is personal. Keep it out of indexes entirely.
  robots: { index: false, follow: false },
}

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`cs-app ${sans.variable}`}>{children}</div>
}
