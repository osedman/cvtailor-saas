/**
 * Strip dash punctuation from model-generated prose.
 *
 * Removes em dashes (—), en dashes (–) and spaced hyphens (" - ") used as
 * sentence punctuation, replacing them with a comma so sentences still read.
 * Preserves:
 *  - bullet markers at the start of a line ("- item")
 *  - hyphenated compound words ("ATS-safe", "two-page")
 *  - unspaced ranges ("2021-2025")
 */
export function stripDashPunctuation(text: string): string {
  return text
    // em/en dashes anywhere -> comma separator
    .replace(/\s*[—–]\s*/g, ", ")
    // spaced hyphen between two words mid-sentence -> comma (a line-start
    // bullet has whitespace/newline before the hyphen, so \S prevents a match)
    .replace(/(\S) +- +(?=\S)/g, "$1, ")
    // tidy artefacts the substitutions can create
    .replace(/,\s*,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*([.!?:;])/g, "$1")
}

/** Recursively apply stripDashPunctuation to every string in a JSON-ish value */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") {
    return stripDashPunctuation(value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeDeep(v)) as unknown as T
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeDeep(v)
    }
    return out as unknown as T
  }
  return value
}
