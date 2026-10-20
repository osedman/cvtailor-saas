/**
 * Fetch a URL someone typed, refusing anything that is not the public
 * internet (30 Sep 2026 access audit).
 *
 * The recruiter's "parse the JD from a link" checked the hostname STRING, so
 * a name that resolves to 169.254.169.254 or 10.x passed, and the response
 * text was saved where the recruiter could read it. Redirects were followed
 * first and checked after. Here every hop is resolved and checked BEFORE it
 * is requested, and redirects are followed by hand.
 *
 * Known limit: a name can resolve differently between our lookup and the
 * connect (DNS rebinding). Closing that needs a custom agent; this closes
 * the plain cases, which are the ones that get used.
 */
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export class BlockedUrlError extends Error {}

const MAX_REDIRECTS = 3

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateAddress(mapped[1])
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    return (
      v === "::" || v === "::1" ||
      v.startsWith("fc") || v.startsWith("fd") ||
      /^fe[89ab]/.test(v) ||
      v.startsWith("ff")
    )
  }
  return true
}

async function assertPublic(u: URL): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedUrlError("Only http and https links can be fetched")
  if (u.username || u.password) throw new BlockedUrlError("That address cannot be fetched")
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new BlockedUrlError("That address cannot be fetched")
  }
  let addresses: string[]
  if (isIP(host)) {
    addresses = [host]
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((a) => a.address)
    } catch {
      throw new BlockedUrlError("That address could not be found")
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new BlockedUrlError("That address cannot be fetched")
  }
}

/** fetch() for a user-supplied URL: public addresses only, redirects checked hop by hop. */
export async function fetchPublicUrl(raw: string | URL, init: Omit<RequestInit, "redirect"> = {}): Promise<Response> {
  let url = new URL(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url)
    const res = await fetch(url, { ...init, redirect: "manual" })
    const location = res.headers.get("location")
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url)
      continue
    }
    return res
  }
  throw new BlockedUrlError("That link redirects too many times")
}
