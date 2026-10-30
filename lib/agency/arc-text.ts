/**
 * The Career Arc a person wrote, as one line of plain text for the
 * recruiter's pool (lib/agency/consumer-pool.ts).
 *
 * Pure, so it can be tested without a database.
 *
 * WHY THIS EXISTS (5 Oct 2026). The pool read `career_profiles.sections` as
 * an array of { body } or a plain string. Every stored arc is an OBJECT
 * (CareerProfileSections: identity, story, chapters, …), so every person's
 * arc reached recruiters as an empty string. The "may be switching" signal
 * leaned on the same text, so it was mostly dead too.
 *
 * What it reads: the identity's role and supporting lines, the story the
 * person told in their own words (ambition first: it is where they are
 * heading), and the chapter names and summaries. The name is left out
 * because the pool row shows it already. Nothing from career_roadmaps is
 * ever read here: that is their private plan, never a recruiter's.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

export function arcText(sections: unknown): string {
  if (typeof sections === "string") return sections.trim()
  if (Array.isArray(sections)) {
    return sections
      .map((s) => (s && typeof s === "object" ? str((s as Record<string, unknown>).body) || str((s as Record<string, unknown>).text) : ""))
      .filter(Boolean)
      .join(" ")
  }
  if (!sections || typeof sections !== "object") return ""
  const o = sections as Record<string, unknown>
  const identity = (o.identity ?? {}) as Record<string, unknown>
  const story = (o.story ?? {}) as Record<string, unknown>
  const chapters = Array.isArray(o.chapters) ? (o.chapters as Array<Record<string, unknown>>) : []
  const parts = [
    str(identity.roleLine),
    str(identity.supportingLine),
    str(story.ambition),
    str(story.turningPoint),
    str(story.origin),
    ...chapters.map((c) => [str(c?.name), str(c?.summary)].filter(Boolean).join(": ")),
  ]
  return parts.filter(Boolean).join(" ")
}
