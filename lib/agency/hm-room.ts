/**
 * The hiring manager's three places — Figma frame 23 (signed off 22 Sep 2026).
 *
 * To do (what do I have to do now?), Roles (where is each hire?) and Diary
 * (when am I interviewing?). Every role is a ROOM walked in order:
 * Shortlist → Round 1 … Round N → Decision → Handover, one page per stage,
 * each handing off to the next.
 *
 * Pure and free of server imports: every /hiring page imports it.
 */

import type { HiringRound, RoundDecision } from "./types"

export type RoomStage =
  | { key: "shortlist" }
  | { key: "round"; n: number }
  | { key: "decision" }
  | { key: "handover" }

export function stageId(s: RoomStage): string {
  return s.key === "round" ? `round-${s.n}` : s.key
}

/**
 * "Round 2 · Panel" when the role runs on a brief whose plan names the round,
 * "Round 2" when it does not. Names come from the role's COPIED plan (frame
 * 25 band D) — never the live brief — and a round beyond the plan (a third
 * round on a two-round brief) simply has no name, which is itself the tell.
 */
export function stageLabel(s: RoomStage, roundNames: string[] = []): string {
  if (s.key === "round") {
    const name = roundNames[s.n - 1]
    return name ? `Round ${s.n} · ${name.charAt(0).toUpperCase()}${name.slice(1)}` : `Round ${s.n}`
  }
  return { shortlist: "Shortlist", decision: "Decision", handover: "Handover" }[s.key]
}

export function stageHref(roleId: string, s: RoomStage): string {
  const base = `/hiring/roles/${roleId}`
  return s.key === "round" ? `${base}/round/${s.n}` : `${base}/${s.key}`
}

/** A missing plan is two rounds, never zero (see loopState). */
export function plannedFor(rounds: HiringRound[]): number {
  const p = rounds.find((r) => Number(r.planned_rounds) > 0)?.planned_rounds
  return p && p > 0 ? p : 2
}

/** Shortlist, Round 1 … Round max(planned, rounds actually held), Decision, Handover. */
export function roomStages(rounds: HiringRound[]): RoomStage[] {
  const held = rounds.filter((r) => r.status !== "cancelled").map((r) => r.round_number)
  const last = Math.max(plannedFor(rounds), ...held, 1)
  return [
    { key: "shortlist" },
    ...Array.from({ length: last }, (_, i) => ({ key: "round" as const, n: i + 1 })),
    { key: "decision" },
    { key: "handover" },
  ]
}

/** Over by the clock or marked done. A booked round whose time has passed is
 *  treated as held — the same rule cohortStatus and loopState use. */
export function roundEnded(r: HiringRound, now: number): boolean {
  if (r.status === "completed") return true
  if (r.status !== "scheduled" || !r.scheduled_at) return false
  const end = Date.parse(r.scheduled_at) + (r.duration_minutes || 45) * 60_000
  return Number.isFinite(end) && end <= now
}

/** Started by the clock — "coming up" means not yet started. */
export function roundStarted(r: HiringRound, now: number): boolean {
  if (r.status === "completed") return true
  if (!r.scheduled_at) return false
  const at = Date.parse(r.scheduled_at)
  return Number.isFinite(at) && at <= now
}

/** What THIS person owes on a round, if anything. */
export function owedOn(r: HiringRound, now: number): "write-up" | "decision" | null {
  if (r.status === "cancelled" || !roundEnded(r, now)) return null
  if (!r.has_debrief) return "write-up"
  if (!r.latest_decision) return "decision"
  return null
}

const LATE_KEYS = new Set(["take-to-close-out", "pack-generated", "handed-over", "closed", "loop-ended"])

/**
 * The stage a role is at. A delivered pack is the handover; the ladder saying
 * the loop is over is the decision; otherwise the highest live round — or the
 * next one when every candidate in it was advanced and more rounds are planned.
 */
export function currentStage(rounds: HiringRound[], subStateKey: string | null, handoverDelivered: boolean): RoomStage {
  if (handoverDelivered) return { key: "handover" }
  if (subStateKey && LATE_KEYS.has(subStateKey)) return { key: "decision" }
  const live = rounds.filter((r) => r.status !== "cancelled")
  if (live.length === 0) return { key: "shortlist" }
  const n = Math.max(...live.map((r) => r.round_number))
  const atN = live.filter((r) => r.round_number === n)
  const allDecided = atN.every((r) => r.latest_decision !== null)
  if (allDecided) {
    const advanced = atN.some((r) => r.latest_decision === "advance")
    if (!advanced) return { key: "decision" }
    return n < plannedFor(rounds) ? { key: "round", n: n + 1 } : { key: "decision" }
  }
  return { key: "round", n }
}

/** Index order, for done / here / next on the stage bar. */
export function stageIndex(stages: RoomStage[], s: RoomStage): number {
  return stages.findIndex((x) => stageId(x) === stageId(s))
}

/** Latest decision per candidate across rounds: the round-by-round outcome. */
export function outcomeByRef(rounds: HiringRound[]): Map<string, { round: number; decision: RoundDecision | null }> {
  const out = new Map<string, { round: number; decision: RoundDecision | null }>()
  for (const r of rounds) {
    if (r.status === "cancelled") continue
    const seen = out.get(r.candidate_ref)
    if (!seen || r.round_number > seen.round) out.set(r.candidate_ref, { round: r.round_number, decision: r.latest_decision })
  }
  return out
}

export function outcomeSentence(o: { round: number; decision: RoundDecision | null } | undefined, planned: number): string | null {
  if (!o) return null
  if (o.decision === "decline") return `Not advanced after round ${o.round}`
  if (o.decision === "hold") return `On hold after round ${o.round}`
  if (o.decision === "advance") return o.round >= planned ? `Taken forward · round ${o.round}` : `Advanced after round ${o.round}`
  return `In round ${o.round}`
}

// ── To do ────────────────────────────────────────────────────────────────

export interface RoleSummary {
  id: string
  ref: string
  title: string
  subStateKey: string | null
  /** The ladder's own verdict on whose move it is. */
  mode: "act" | "wait" | "done"
  nextTitle: string
}

export interface TodoItem {
  key: string
  verb: string
  who: string
  role: { id: string; ref: string; title: string }
  when: string
  href: string
  cta: string
  urgent: boolean
}

const listRefs = (refs: string[]) =>
  refs.length <= 1 ? refs.join("") : `${refs.slice(0, -1).join(", ")} and ${refs[refs.length - 1]}`

/**
 * ONE ROW PER THING OWED, NOT PER ROLE. The old Tasks screen took one ladder
 * rung per role, and "round to book" outranked "write-up due" — so a role
 * where a write-up was owed read as a wait and the screen said nothing
 * needed you. Owed write-ups and decisions come from the rounds themselves;
 * choosing and offering times come from the ladder, the only place they live.
 */
export function buildTodo(roles: RoleSummary[], rounds: HiringRound[], now: number): TodoItem[] {
  const byRole = new Map(roles.map((r) => [r.id, r]))
  const items: TodoItem[] = []

  const groups = new Map<string, { kind: "write-up" | "decision"; role: string; n: number; refs: string[]; at: number }>()
  for (const r of rounds) {
    const owed = owedOn(r, now)
    if (!owed) continue
    const k = `${owed}:${r.role_id}:${r.round_number}`
    const at = r.scheduled_at ? Date.parse(r.scheduled_at) : 0
    const g = groups.get(k) ?? { kind: owed, role: r.role_id, n: r.round_number, refs: [], at }
    g.refs.push(r.candidate_ref)
    g.at = Math.max(g.at, at)
    groups.set(k, g)
  }
  for (const g of groups.values()) {
    const role = byRole.get(g.role)
    if (!role) continue
    items.push({
      key: `${g.kind}:${g.role}:${g.n}`,
      verb: g.kind === "write-up" ? `Write up round ${g.n}` : `Decide after round ${g.n}`,
      who: listRefs([...g.refs].sort()),
      role: { id: role.id, ref: role.ref, title: role.title },
      when: g.kind === "write-up" ? "The interview has happened" : "Written up — your decision is next",
      href: stageHref(role.id, { key: "round", n: g.n }),
      cta: g.kind === "write-up" ? "Write up" : "Decide",
      urgent: true,
    })
  }

  for (const role of roles) {
    if (role.mode !== "act") continue
    if (role.subStateKey === "with-the-client") {
      items.push({ key: `choose:${role.id}`, verb: "Choose who to interview", who: "from the shortlist", role: { id: role.id, ref: role.ref, title: role.title }, when: "Your recruiter sent the shortlist", href: stageHref(role.id, { key: "shortlist" }), cta: "Review shortlist", urgent: false })
    } else if (role.subStateKey === "windows-to-offer") {
      items.push({ key: `times:${role.id}`, verb: "Offer interview times", who: "for the candidates you chose", role: { id: role.id, ref: role.ref, title: role.title }, when: "They pick from your windows", href: `/hiring/roles/${role.id}/interviews`, cta: "Offer times", urgent: false })
    }
  }

  // Owed-on-a-round first (something happened and waits on you), then the rest.
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent))
}
