/**
 * CV templates — a single token set per template, consumed by BOTH the on-screen
 * preview and the Word export, so what the user picks is what they download.
 *
 * Design constraints, taken from current ATS and recruiter guidance rather than
 * taste (Microsoft Create, Indeed, ResuFit, resume.io, Jan 2026):
 *
 *  - Single column, no tables, no text boxes, no sidebars. Multi-column layouts
 *    are the single most common cause of ATS parsing failures, so NO template
 *    here is multi-column — the variation is typography and rules, never layout.
 *  - Body text 10–12pt, never below 10pt. Headings 11–16pt.
 *  - Only ATS-safe, near-universally installed faces: Calibri, Cambria,
 *    Garamond, Georgia, Helvetica/Arial. Every stack ends in a generic family
 *    because Helvetica ships on macOS but not Windows, and the .doc is very
 *    likely opened on Windows.
 *  - Standard section names are preserved verbatim from the CV text; templates
 *    never rename or reorder sections.
 *
 * Sizes are in POINTS (the Word export's native unit). The preview converts to
 * px via PT_TO_PX so the two renderings stay proportional by construction.
 */

export const PT_TO_PX = 4 / 3

export type CvTemplateId =
  | "modern"
  | "classic"
  | "executive"
  | "editorial"
  | "minimal"
  | "ats"

export interface CvTemplate {
  id: CvTemplateId
  name: string
  /** One line on the picker card — when this template is the right call */
  bestFor: string
  /** The honest reason to pick it, shown on hover/expanded */
  blurb: string
  fontStack: string
  accent: string
  grey: string
  body: string
  /** Candidate name at the top */
  name_: { sizePt: number; color: string; uppercase: boolean; align: "left" | "center"; letterSpacingPt: number }
  contact: { sizePt: number; color: string; align: "left" | "center" }
  /** Rule under the whole header block */
  headerRule: boolean
  heading: {
    sizePt: number
    color: string
    uppercase: boolean
    letterSpacingPt: number
    rule: boolean
    marginTopPt: number
  }
  role: { sizePt: number; color: string }
  company: { sizePt: number; color: string; italic: boolean }
  bodyText: { sizePt: number; color: string; lineHeight: number }
  bulletChar: string
}

const CALIBRI = "Calibri, Aptos, 'Segoe UI', Arial, sans-serif"
const CAMBRIA = "Cambria, Georgia, 'Times New Roman', serif"
const GARAMOND = "Garamond, 'EB Garamond', 'Palatino Linotype', Georgia, serif"
const GEORGIA = "Georgia, Cambria, 'Times New Roman', serif"
const HELVETICA = "Helvetica, 'Helvetica Neue', Arial, sans-serif"
const ARIAL = "Arial, Helvetica, sans-serif"

export const CV_TEMPLATES: Record<CvTemplateId, CvTemplate> = {
  modern: {
    id: "modern",
    name: "Modern Clean",
    bestFor: "Corporate, finance, healthcare, admin",
    blurb:
      "Calibri with a slate-blue accent — the corporate default recruiters see constantly and never think twice about. The safest 'looks current' choice.",
    fontStack: CALIBRI,
    accent: "#2E5266",
    grey: "#595959",
    body: "#3b3b3b",
    name_: { sizePt: 22, color: "#2E5266", uppercase: false, align: "left", letterSpacingPt: 0.5 },
    contact: { sizePt: 10.5, color: "#595959", align: "left" },
    headerRule: true,
    heading: { sizePt: 11.5, color: "#2E5266", uppercase: true, letterSpacingPt: 0.8, rule: true, marginTopPt: 14 },
    role: { sizePt: 11, color: "#1a1a1a" },
    company: { sizePt: 10.5, color: "#595959", italic: true },
    bodyText: { sizePt: 10.5, color: "#3b3b3b", lineHeight: 1.35 },
    bulletChar: "•",
  },

  classic: {
    id: "classic",
    name: "Classic Serif",
    bestFor: "Law, government, education, healthcare",
    blurb:
      "Cambria, black on white, centred header. Cambria was drawn for on-screen reading, so it carries a serif's authority without Times New Roman's dated feel.",
    fontStack: CAMBRIA,
    accent: "#000000",
    grey: "#4a4a4a",
    body: "#222222",
    name_: { sizePt: 20, color: "#000000", uppercase: true, align: "center", letterSpacingPt: 1.2 },
    contact: { sizePt: 10, color: "#4a4a4a", align: "center" },
    headerRule: true,
    heading: { sizePt: 11.5, color: "#000000", uppercase: true, letterSpacingPt: 1, rule: true, marginTopPt: 14 },
    role: { sizePt: 11, color: "#000000" },
    company: { sizePt: 10.5, color: "#4a4a4a", italic: true },
    bodyText: { sizePt: 10.5, color: "#222222", lineHeight: 1.35 },
    bulletChar: "•",
  },

  executive: {
    id: "executive",
    name: "Executive Garamond",
    bestFor: "Senior roles, consulting, academia, publishing",
    blurb:
      "Garamond runs narrower than most faces, so a long career fits without dropping below 10pt. Reads as taste and seniority without announcing itself.",
    fontStack: GARAMOND,
    accent: "#1f2d3d",
    grey: "#55606d",
    body: "#26313d",
    name_: { sizePt: 23, color: "#1f2d3d", uppercase: false, align: "left", letterSpacingPt: 0 },
    contact: { sizePt: 11, color: "#55606d", align: "left" },
    headerRule: true,
    heading: { sizePt: 12, color: "#1f2d3d", uppercase: true, letterSpacingPt: 1.4, rule: false, marginTopPt: 15 },
    role: { sizePt: 11.5, color: "#1f2d3d" },
    company: { sizePt: 11, color: "#55606d", italic: true },
    bodyText: { sizePt: 11, color: "#26313d", lineHeight: 1.4 },
    bulletChar: "–",
  },

  editorial: {
    id: "editorial",
    name: "Editorial Georgia",
    bestFor: "Comms, marketing, non-profit, research",
    blurb:
      "Georgia was designed for screens first, where most CVs are actually read. A warm serif that stays readable on a recruiter's laptop without feeling stuffy.",
    fontStack: GEORGIA,
    accent: "#7a3b2e",
    grey: "#5f5952",
    body: "#2e2a26",
    name_: { sizePt: 21, color: "#2e2a26", uppercase: false, align: "left", letterSpacingPt: 0 },
    contact: { sizePt: 10.5, color: "#5f5952", align: "left" },
    headerRule: false,
    heading: { sizePt: 11, color: "#7a3b2e", uppercase: true, letterSpacingPt: 1.1, rule: true, marginTopPt: 15 },
    role: { sizePt: 11, color: "#2e2a26" },
    company: { sizePt: 10.5, color: "#5f5952", italic: true },
    bodyText: { sizePt: 10.5, color: "#2e2a26", lineHeight: 1.42 },
    bulletChar: "•",
  },

  minimal: {
    id: "minimal",
    name: "Minimal Sans",
    bestFor: "Design, tech, startups, architecture",
    blurb:
      "Helvetica, no colour, no rules — hierarchy carried by weight and whitespace alone. Signals visual literacy in fields where that's read as a credential.",
    fontStack: HELVETICA,
    accent: "#111111",
    grey: "#6b6b6b",
    body: "#2b2b2b",
    name_: { sizePt: 19, color: "#111111", uppercase: true, align: "left", letterSpacingPt: 2.2 },
    contact: { sizePt: 10, color: "#6b6b6b", align: "left" },
    headerRule: false,
    heading: { sizePt: 10.5, color: "#111111", uppercase: true, letterSpacingPt: 2, rule: false, marginTopPt: 17 },
    role: { sizePt: 10.5, color: "#111111" },
    company: { sizePt: 10, color: "#6b6b6b", italic: false },
    bodyText: { sizePt: 10.5, color: "#2b2b2b", lineHeight: 1.45 },
    bulletChar: "—",
  },

  ats: {
    id: "ats",
    name: "ATS Plain",
    bestFor: "High-volume applications, aggressive screens",
    blurb:
      "Deliberately unstyled: Arial, no colour, no rules, no letter-spacing. Nothing here for a parser to trip on — the safest possible read when the filter is ruthless.",
    fontStack: ARIAL,
    accent: "#000000",
    grey: "#333333",
    body: "#000000",
    name_: { sizePt: 16, color: "#000000", uppercase: false, align: "left", letterSpacingPt: 0 },
    contact: { sizePt: 11, color: "#333333", align: "left" },
    headerRule: false,
    heading: { sizePt: 12, color: "#000000", uppercase: true, letterSpacingPt: 0, rule: false, marginTopPt: 13 },
    role: { sizePt: 11, color: "#000000" },
    company: { sizePt: 11, color: "#333333", italic: false },
    bodyText: { sizePt: 11, color: "#000000", lineHeight: 1.3 },
    bulletChar: "•",
  },
}

export const DEFAULT_TEMPLATE_ID: CvTemplateId = "modern"

export const TEMPLATE_LIST: CvTemplate[] = [
  CV_TEMPLATES.modern,
  CV_TEMPLATES.classic,
  CV_TEMPLATES.executive,
  CV_TEMPLATES.editorial,
  CV_TEMPLATES.minimal,
  CV_TEMPLATES.ats,
]

/** Narrow an untrusted value (URL param, DB column, localStorage) to a real id */
export function toTemplateId(v: unknown): CvTemplateId {
  return typeof v === "string" && v in CV_TEMPLATES ? (v as CvTemplateId) : DEFAULT_TEMPLATE_ID
}

export function getTemplate(id: unknown): CvTemplate {
  return CV_TEMPLATES[toTemplateId(id)]
}

/** Points → CSS pixels, for the on-screen preview */
export const px = (pt: number) => `${(pt * PT_TO_PX).toFixed(2)}px`
