/**
 * Where a request's time goes (30 Sep 2026, Ose: "screens loading or
 * submitting on buttons is too slow").
 *
 * Every API route is wrapped (withTiming) in one AsyncLocalStorage store, and
 * every Supabase client is handed timedFetch, so each response reports — with
 * no per-route code — how many round trips it made to the database, to Auth
 * and to Storage, and how long they took:
 *
 *   Server-Timing: db;desc="9 calls";dur=212.4, auth;desc="1 call";dur=0.0, total;dur=318.7
 *
 * Visible in the browser: DevTools → Network → the request → Timing. And a
 * request slower than SLOW_REQUEST_MS logs one `[slow]` line (route, method,
 * total, the same breakdown) to the Vercel runtime logs, so the slow buttons
 * name themselves without anyone holding DevTools open.
 *
 * Counts only — no URLs, bodies, ids or user data leave this module. Durations
 * of parallel calls are SUMMED ("summed" in the desc), so db can exceed total
 * when a route runs queries side by side; the count is the thing to watch.
 */
import { AsyncLocalStorage } from "node:async_hooks"

export const SLOW_REQUEST_MS = 1000

interface Mark {
  dur: number
  count: number
}
type Store = Map<string, Mark>

const als = new AsyncLocalStorage<Store>()

function add(name: string, dur: number) {
  const store = als.getStore()
  if (!store) return
  const m = store.get(name) ?? { dur: 0, count: 0 }
  m.dur += dur
  m.count += 1
  store.set(name, m)
}

/** Time one named step inside a wrapped route (e.g. an AI call). */
export async function timeStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now()
  try {
    return await fn()
  } finally {
    add(name, performance.now() - t)
  }
}

function kindOf(input: RequestInfo | URL): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url.includes("/rest/v1/")) return "db"
  if (url.includes("/auth/v1/")) return "auth"
  if (url.includes("/storage/v1/")) return "storage"
  if (url.includes("api.anthropic.com")) return "ai"
  return "net"
}

/** Handed to every Supabase client as `global.fetch`. Outside a wrapped
 *  route (scripts, crons) it is plain fetch. */
export const timedFetch: typeof fetch = async (input, init) => {
  const t = performance.now()
  try {
    return await fetch(input, init)
  } finally {
    add(kindOf(input), performance.now() - t)
  }
}

export function serverTimingHeader(store: Store, total: number): string {
  const parts = [...store.entries()].map(
    ([name, m]) => `${name};desc="${m.count} call${m.count === 1 ? "" : "s"}${m.count > 1 ? ", summed" : ""}";dur=${m.dur.toFixed(1)}`
  )
  parts.push(`total;dur=${total.toFixed(1)}`)
  return parts.join(", ")
}

/**
 * Wrap a route handler. The route and method are passed as literals by the
 * wrapping (they are what the slow log names).
 */
export function withTiming<A extends unknown[], R extends Response>(
  route: string,
  method: string,
  handler: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const store: Store = new Map()
    const t0 = performance.now()
    const res = await als.run(store, () => handler(...args))
    const total = performance.now() - t0
    const header = serverTimingHeader(store, total)
    try {
      res.headers.set("Server-Timing", header)
    } catch {
      // Some responses (redirects) carry immutable headers; the log still runs.
    }
    if (total > SLOW_REQUEST_MS) {
      console.warn(`[slow] ${method} ${route} ${Math.round(total)}ms · ${header}`)
    }
    return res
  }
}
