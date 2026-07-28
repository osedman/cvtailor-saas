/**
 * Course validation — the gate between "the model found a link" and "we show
 * a user a link".
 *
 * Decided 28 Jul 2026 (strict allowlist, Ose's call, from the 27 Jul sync):
 * roadmap resources come from a short list of accessible, practical platforms
 * — Udemy, YouTube, freeCodeCamp and friends — because users actually finish
 * those. Unknown domains are dropped server-side, and a resource whose URL
 * doesn't respond is dropped too. Fewer, trustworthy links beat a longer list
 * with dead ends.
 *
 * Pure functions are separated from the network check so the policy is unit
 * testable without fetch.
 */
import { ALLOWED_COURSE_DOMAINS } from '@/lib/course-sources/registry'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export interface ValidatableResource {
  title: string
  url: string
  source: string
}

/** Kept as a public alias for existing callers and tests. */
export const ALLOWED_RESOURCE_DOMAINS = ALLOWED_COURSE_DOMAINS

/** True when the URL parses and its host is on (or under) the allowlist. */
export function isAllowedResourceUrl(url: string): boolean {
  let host: string
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    host = u.hostname.toLowerCase()
  } catch {
    return false
  }
  return ALLOWED_RESOURCE_DOMAINS.some(
    (d) => host === d || host.endsWith(`.${d}`)
  )
}

/** Policy-only filter (no network): keeps allowlisted, structurally sane rows. */
export function filterAllowedResources<T extends ValidatableResource>(
  resources: T[]
): T[] {
  return resources.filter(
    (r) =>
      r &&
      typeof r.url === 'string' &&
      typeof r.title === 'string' &&
      r.title.trim().length > 0 &&
      isAllowedResourceUrl(r.url)
  )
}

/**
 * Is this URL alive? HEAD with a short timeout; some platforms reject HEAD or
 * bot-check with 403/405, and a false negative (dropping a live course) costs
 * more than a false positive here — the allowlist has already done the trust
 * work. So: only a clean 404/410 or a network failure counts as dead.
 */
function isPrivateIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase()
    return value === '::1' || value === '::' || value.startsWith('fc') ||
      value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') ||
      value.startsWith('fea') || value.startsWith('feb')
  }
  return true
}

async function hasOnlyPublicAddresses(hostname: string): Promise<boolean> {
  if (hostname === 'localhost' || isIP(hostname)) return false
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateIp(address))
  } catch {
    return false
  }
}

export async function isUrlAlive(
  url: string,
  timeoutMs = 4000,
): Promise<boolean> {
  try {
    let current = new URL(url)
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      if (!isAllowedResourceUrl(current.toString())) return false
      if (!await hasOnlyPublicAddresses(current.hostname)) return false
      const res = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location || redirects === 3) return false
        current = new URL(location, current)
        continue
      }
      return res.status !== 404 && res.status !== 410
    }
    return false
  } catch {
    return false
  }
}

/**
 * The full gate: allowlist first, then liveness checks in parallel (bounded —
 * resources per item are capped at 2-3). A failed check is dropped: the skill
 * remains on the roadmap, and empty beats persisting an invented/dead URL.
 */
export async function validateResources<T extends ValidatableResource>(
  resources: T[]
): Promise<T[]> {
  const allowed = filterAllowedResources(resources)
  if (allowed.length === 0) return []
  const alive = await Promise.all(allowed.map((r) => isUrlAlive(r.url)))
  return allowed.filter((_, i) => alive[i])
}

/**
 * Validate every item's resources in one pass (items in parallel; each item's
 * links in parallel inside validateResources). An item whose links ALL fail
 * keeps its place on the path with no resources — a skill gap is real even
 * when the course search came back junk; the UI treats an empty list as
 * "find your own course" rather than dropping the skill.
 */
export async function validateItemResources<
  T extends { resources: ValidatableResource[] },
>(items: T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      resources: await validateResources(item.resources ?? []),
    }))
  )
}
