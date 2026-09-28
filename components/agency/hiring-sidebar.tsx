"use client"

/**
 * The hiring manager's five places, as a left rail.
 *
 * WHAT THIS REPLACES, and why it is a rail rather than a strip. The five
 * places shipped on 19 Sep 2026 into `.hm-nav` — a horizontal row of small
 * uppercase mono pills across the top. Same words, wrong object: Figma frame
 * 15 draws a 300px column of sentence-case places down the left, and a top
 * strip is a set of tabs on one screen where a rail is a place you are in.
 * The tell was the responsive check: the strip WRAPPED TO TWO ROWS at 375px
 * and that was recorded as a pass, when a thing that wraps is not the thing
 * that was designed.
 *
 * `.ag-app` is `display:flex`, and the recruiter's own `.ag-sidebar` already
 * sits beside `.ag-main` in it. So this is the same shell shape the other
 * side of the product uses, not a second layout.
 *
 * THE DOORWAY GETS NO WORKSPACE CHROME. /hiring/invite is where somebody
 * accepts an invitation and is not yet inside anything; rendering a rail of
 * places they cannot reach would be five dead links. It returns null there,
 * which is the same rule HiringNav kept.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { hiringNavFor, showsHiringRail } from "./hm-shared"
import { SignOut } from "./sign-out"

export function HiringSidebar() {
  const pathname = usePathname() ?? ""

  // Doorways, not the workspace. The rule is a pure function so it is tested
  // against paths rather than scanned for in this file.
  if (!showsHiringRail(pathname)) return null

  const items = hiringNavFor(pathname)

  return (
    <aside className="hm-rail" aria-label="Hiring workspace">
      <div className="ag-brand">
        <div className="ag-brand-mark" aria-hidden="true">T</div>
        <div>
          <div className="ag-brand-name">Tailr</div>
          <div className="ag-brand-sub">Hiring manager</div>
        </div>
      </div>

      <nav className="hm-rail-nav" aria-label="Places">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`hm-rail-item${it.on ? " on" : ""}`}
            aria-current={it.on ? "page" : undefined}
          >
            {it.label}
          </Link>
        ))}
      </nav>

      {/* THE BRIEF DOOR IS STILL CLOSED (15 Sep 2026). "My roles" lists roles
          the RECRUITER opened; nothing in this workspace links to the brief
          form, though the route itself deliberately still answers. */}

      <div className="hm-rail-foot">
        <SignOut door="consumer" />
      </div>
    </aside>
  )
}
