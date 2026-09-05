/**
 * Proposing interview windows from a calendar's busy time.
 *
 * Pure, and it runs in the browser: busy intervals come from the server
 * (the tokens never leave it), the proposal is made where the hiring
 * manager's own time zone is known for free, and the confirmed windows go
 * back to the server one at a time through offerSlot's validation.
 *
 * The sizing rule is the whole point. A hiring manager choosing three
 * candidates does not want to hand-pick three slots; they want enough
 * sensible windows for the recruiter to book three first rounds without
 * coming back. So: one window per candidate plus half again for choice,
 * spread across at least two working days, never more than a few a day,
 * each one interview long, inside working hours, and clear of anything the
 * calendar already holds. They can untick any before confirming.
 */

export interface Interval {
  /** ISO timestamps. */
  start: string
  end: string
}

export interface ProposalInput {
  /** Number of candidates the windows are for. */
  candidates: number
  /** Length of one interview. */
  durationMinutes: number
  /** Breathing room after each interview. */
  bufferMinutes?: number
  /** Busy time from the calendar, any order, may overlap. */
  busy: Interval[]
  /** First day to consider (local midnight is taken from it). Defaults to tomorrow. */
  from?: Date
  /** How many calendar days to look across. */
  days?: number
  /** Local working hours, 24h. */
  workingHours?: { start: number; end: number }
  /** Cap per day so a candidate is not asked to pick from one wall of slots. */
  perDayMax?: number
  /** Weekdays only by default. 0 = Sunday. */
  workingDays?: number[]
}

export interface Proposal {
  windows: Interval[]
  /** How many the sizing rule asked for. */
  wanted: number
  /** True when the calendar could not fit `wanted` inside the horizon. */
  short: boolean
}

/** One window per candidate, plus half again for choice, never fewer than two. */
export function windowsWanted(candidates: number): number {
  return Math.max(2, Math.ceil(Math.max(0, candidates) * 1.5))
}

function merge(busy: Interval[]): Array<[number, number]> {
  const spans = busy
    .map((b) => [Date.parse(b.start), Date.parse(b.end)] as [number, number])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const [s, e] of spans) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

function clear(busy: Array<[number, number]>, s: number, e: number): boolean {
  for (const [bs, be] of busy) {
    if (bs >= e) break
    if (be > s && bs < e) return false
  }
  return true
}

/**
 * Propose windows. Walks each working day from `from`, takes the first
 * free interview-length spans inside working hours, at most `perDayMax` a
 * day, and stops when it has `wanted` across at least two days — or when
 * the horizon runs out, in which case `short` is true and the UI says so
 * rather than padding with times that do not exist.
 */
export function proposeWindows(input: ProposalInput): Proposal {
  const candidates = Math.max(0, Math.floor(input.candidates))
  const wanted = windowsWanted(candidates)
  const duration = Math.max(5, input.durationMinutes) * 60_000
  const buffer = Math.max(0, input.bufferMinutes ?? 15) * 60_000
  const hours = input.workingHours ?? { start: 9, end: 17 }
  const perDayMax = Math.max(1, input.perDayMax ?? Math.max(2, Math.ceil(wanted / 2)))
  const workingDays = input.workingDays ?? [1, 2, 3, 4, 5]
  const days = Math.max(1, input.days ?? 10)
  const busy = merge(input.busy)
  const now = Date.now()

  const start = input.from ? new Date(input.from) : new Date(now + 86_400_000)
  start.setHours(0, 0, 0, 0)

  const windows: Interval[] = []
  const daysUsed = new Set<string>()
  for (let d = 0; d < days && (windows.length < wanted || daysUsed.size < 2); d++) {
    const day = new Date(start)
    day.setDate(start.getDate() + d)
    if (!workingDays.includes(day.getDay())) continue
    const open = new Date(day)
    open.setHours(hours.start, 0, 0, 0)
    const close = new Date(day)
    close.setHours(hours.end, 0, 0, 0)
    let cursor = open.getTime()
    let today = 0
    while (cursor + duration <= close.getTime() && today < perDayMax && windows.length < wanted) {
      if (cursor <= now) {
        cursor += 30 * 60_000
        continue
      }
      const end = cursor + duration
      if (clear(busy, cursor, end)) {
        windows.push({ start: new Date(cursor).toISOString(), end: new Date(end).toISOString() })
        daysUsed.add(day.toDateString())
        today += 1
        cursor = end + buffer
      } else {
        // Jump past the busy span that blocked us, on the half hour.
        const blocker = busy.find(([bs, be]) => be > cursor && bs < end)
        cursor = blocker ? Math.ceil(blocker[1] / (30 * 60_000)) * (30 * 60_000) : cursor + 30 * 60_000
      }
    }
  }
  return { windows, wanted, short: windows.length < wanted }
}
