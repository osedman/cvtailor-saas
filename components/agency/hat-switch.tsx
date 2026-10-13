"use client"

/**
 * "Viewing as: Recruiter | Hiring manager" — frame 44, band A (approved
 * 13 Oct 2026, Ose).
 *
 * The two sides share one login and one look, and the only links across were
 * on the two home screens, so someone holding both roles lost track of which
 * side a screen belonged to. This sits on every screen of both sides, but
 * renders ONLY for a person who genuinely holds both (lib/hat-routing.ts
 * getHatsHeld): a recruiter who is not a client contact, or a client who is
 * not an agency member, sees nothing new. Switching goes to the other side's
 * home. It is navigation only — it changes no data and no permission.
 */

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import styles from "./hat-switch.module.css"

type Hats = { recruiter: boolean; hiringManager: boolean }
let cached: Hats | null = null
let pending: Promise<Hats> | null = null

function loadHats(): Promise<Hats> {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = fetch("/api/me/hats")
      .then((r) => (r.ok ? r.json() : { recruiter: false, hiringManager: false }))
      .then((h: Hats) => (cached = { recruiter: !!h.recruiter, hiringManager: !!h.hiringManager }))
      .catch(() => ({ recruiter: false, hiringManager: false }))
  }
  return pending
}

export function HatSwitch({ current, fallback = null, inline = false }: { current: "recruiter" | "hiring"; fallback?: ReactNode; inline?: boolean }) {
  const [hats, setHats] = useState<Hats | null>(cached)
  useEffect(() => {
    let live = true
    void loadHats().then((h) => live && setHats(h))
    return () => {
      live = false
    }
  }, [])
  if (!hats || !(hats.recruiter && hats.hiringManager)) return <>{fallback}</>
  return (
    <nav className={`${styles.hat}${inline ? ` ${styles.inline}` : ""}`} aria-label="Viewing as">
      <span className={styles.label}>Viewing as</span>
      <span className={styles.seg}>
        <Link href="/agencies" className={styles.opt} data-side="recruiter" aria-current={current === "recruiter" ? "page" : undefined}>
          Recruiter
        </Link>
        <Link href="/hiring" className={styles.opt} data-side="hiring" aria-current={current === "hiring" ? "page" : undefined}>
          Hiring manager
        </Link>
      </span>
    </nav>
  )
}
