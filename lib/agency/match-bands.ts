/**
 * Score bands for the matched list. Bands, never an ordinal rank: the
 * review was right that "#1, #2, #3" implies a precision the score does not
 * have, and everywhere else in the product evidence is shown as bands.
 * No imports, so the browser can use it.
 */
export type MatchBand = "fit" | "strong" | "very strong"

export function matchBand(score: number): MatchBand {
  if (score >= 90) return "very strong"
  if (score >= 75) return "strong"
  return "fit"
}
