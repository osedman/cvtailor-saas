export const EVIDENCE_CATEGORIES = [
  "education", "project", "work", "volunteering", "responsibility",
  "award", "certificate", "skill", "activity", "other",
] as const

export type EvidenceCategory = typeof EVIDENCE_CATEGORIES[number]
export type EvidenceStatus = "suggested" | "confirmed" | "excluded"

export interface CvEvidenceItem {
  id: string
  source_name: string
  category: EvidenceCategory
  title: string
  organisation: string
  date_text: string
  description: string
  skills: string[]
  source_excerpt: string
  review_status: EvidenceStatus
}

export interface FirstCvDraft {
  id: string
  target_opportunity: string
  cv_text: string
  status: "draft" | "ready"
}

export function isEvidenceCategory(value: unknown): value is EvidenceCategory {
  return typeof value === "string" && EVIDENCE_CATEGORIES.includes(value as EvidenceCategory)
}

export function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}
