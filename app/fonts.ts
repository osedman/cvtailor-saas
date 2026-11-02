/**
 * The B2B faces, declared once.
 *
 * Seven layouts used to declare these independently — /agencies, /hiring,
 * /portal, /rights on the agency token family, and /consent, /booking,
 * /reference on the doorway one. Seven copies meant a face could be changed
 * in six places and look done. They are declared here instead.
 *
 * **Noto Sans is the B2B face (Ose, 28 Sep).** It replaced Geist on body and
 * chrome, and Fraunces on display. The 7 Aug specimen-E decision that gave
 * the agency side a serif headline is deliberately retired — see the design
 * lineage note in `.claude/skills/tailr-b2b/SKILL.md`, updated in the same
 * commit so the next session does not restore it as a regression.
 *
 * Mono is untouched. Geist Mono stays on ids and machine data, and is what
 * the typography guardrail's allowlist entries refer to; the Noto package
 * carries no monospace, so there was nothing to swap it for.
 *
 * Italic is loaded for real here. Geist was loaded upright-only, so every
 * italic in the product — `.ag-layer-quote` among them — was a synthesised
 * oblique. Noto Sans ships a drawn italic, so it costs one extra file and
 * looks like the typeface rather than a slanted copy of it.
 */

import { Geist_Mono, Noto_Sans } from "next/font/google"

/** Body, chrome and — since 28 Sep — display, on the `.ag-app` surfaces. */
export const agSans = Noto_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-ag-sans",
})

/** Ids and machine data only. Never prose — the guardrail test enforces it. */
export const agMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ag-mono",
})

/**
 * The candidate doorways (`/consent`, `/booking`, `/reference`) carry their
 * own token family in `consent.css`, because they are one person reading one
 * decision rather than a workspace. Same face, separate name, so the doorway
 * can diverge later without touching the product.
 */
export const csSans = Noto_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--cs-sans",
})
