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
import { HatSwitch } from "./hat-switch"
import { usePathname } from "next/navigation"

export function AgencyShell({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  // The client side carries its own switch in its top bar, which stays
  // visible on a phone; the phone bar is for the recruiter side only.
  const onRecruiterSide = (usePathname() ?? "").startsWith("/agencies")
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
        {/* Frame 44: the sidebar (and its switch) hides on a phone, so the
            phone gets the switch as a bar above the page. Renders nothing
            unless the person holds both sides. */}
        {onRecruiterSide && <HatSwitch current="recruiter" phoneBar />}
        {children}
        <ThemeToggle />
      </div>
    </ThemeProvider>
  )
}
