"use client"

/**
 * The themed agency surface: token scope + the theme control, in one place.
 *
 * `.ag-themed` is what the dark token block keys off, alongside
 * `data-ag-theme` on <html>. The doorways (/portal, /rights) are `.ag-app`
 * without this marker on purpose — a candidate opening a rights link has
 * never touched the toggle and should not inherit a recruiter's preference.
 *
 * `attribute="data-ag-theme"` and a distinct storage key keep this from
 * colliding with any theming the consumer side of the app grows later; both
 * are namespaced rather than sharing next-themes' `class` default.
 */

import { ThemeProvider } from "next-themes"
import { ThemeToggle } from "./theme-toggle"

export function AgencyShell({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  return (
    <ThemeProvider
      attribute="data-ag-theme"
      storageKey="ag-theme"
      defaultTheme="system"
      enableSystem
      // The token swap is instant and the surface is dense; letting every
      // colour transition on toggle makes the whole page crawl for 200ms.
      disableTransitionOnChange
    >
      <div className={`ag-app ag-themed ${className}`}>
        {children}
        <ThemeToggle />
      </div>
    </ThemeProvider>
  )
}
