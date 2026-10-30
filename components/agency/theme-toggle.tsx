"use client"

/**
 * Light / dark for the agency surface.
 *
 * Three states, not two: light, dark, and system — because "system" is the
 * only one that follows a recruiter who works in a bright office by day and
 * a dark one by night, and it is the default so nobody has to choose before
 * the product is usable.
 *
 * The theme lives on <html> as `data-ag-theme`, written pre-paint by
 * next-themes, and the dark token block keys off it. `.ag-themed` on the
 * surface keeps it away from the /portal and /rights doorways.
 *
 * Rendered from the layout rather than the ten pages that each hand-roll a
 * sidebar: a control duplicated ten times is a control that will be nine
 * places in a month.
 */

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // next-themes cannot know the resolved theme until it is on the client;
  // rendering the selected state before then produces a hydration mismatch
  // and a control that briefly lies about which mode you are in.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  return (
    <div
      className="ag-theme-toggle"
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = ready && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            className={`ag-theme-opt${active ? " is-active" : ""}`}
            onClick={() => setTheme(value)}
          >
            <Icon className="ag-theme-icon" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
