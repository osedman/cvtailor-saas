/**
 * Normalize a pasted job posting URL.
 * Accepts bare hosts ("www.indeed.com/…") by prepending https://.
 * Only http(s) is allowed.
 */
export function normalizeJobUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let candidate = trimmed
  // No scheme yet — treat as https host/path
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`
  }

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.')) return null
    return url
  } catch {
    return null
  }
}
