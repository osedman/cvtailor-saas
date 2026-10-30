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
import { usePathname } from "next/navigation"
import styles from "./hat-switch.module.css"

type Hats = { recruiter: boolean; hiringManager: boolean }
let cached: Hats | null = null
let pending: Promise<Hats> | null = null

const NONE: Hats = { recruiter: false, hiringManager: false }

/**
 * Only a signed-in answer is cached. The shell mounts the switch on
 * /agencies/sign-in too, so the first ask happens signed out (401); caching
 * that "neither" hid the switch for the rest of the session, because signing
 * in with a code moves on client-side and nothing reloaded (19 Oct 2026).
 */
export function loadHats(): Promise<Hats> {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = fetch("/api/me/hats")
      .then(async (r) => {
        if (!r.ok) return NONE
        const h = (await r.json()) as Hats
        return (cached = { recruiter: !!h.recruiter, hiringManager: !!h.hiringManager })
      })
      .catch(() => NONE)
      .finally(() => {
        pending = null
      })
  }
  return pending
}

export function HatSwitch({
  current,
  fallback = null,
  inline = false,
  phoneBar = false,
}: {
  current: "recruiter" | "hiring"
  fallback?: ReactNode
  inline?: boolean
  /** The recruiter sidebar hides below 900px; this copy is the phone's. */
  phoneBar?: boolean
}) {
  const [hats, setHats] = useState<Hats | null>(cached)
  // Asked again on each navigation until a signed-in answer is cached: the
  // shell's copy mounts once and outlives the sign-in screen.
  const pathname = usePathname()
  useEffect(() => {
    let live = true
    void loadHats().then((h) => live && setHats(h))
    return () => {
      live = false
    }
  }, [pathname])
  if (!hats || !(hats.recruiter && hats.hiringManager)) return <>{fallback}</>
  const nav = (
    <nav className={`${styles.hat}${inline || phoneBar ? ` ${styles.inline}` : ""}`} aria-label="Viewing as">
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
  return phoneBar ? <div className={styles.phone} data-hat-phone="">{nav}</div> : nav
}
