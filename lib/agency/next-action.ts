/**
 * The next action: one sentence per hat, derived from facts.
 *
 * The phase rail says where a role is. It does not say who holds it, who it
 * is waiting on, how long it has waited, or what happens next — so finishing
 * a step still felt like nothing happened (the four seams of 23 Aug). This
 * module answers those questions from facts the role already carries, and
 * answers them the same way on every screen, because there is exactly one
 * ladder here and no page keeps its own.
 *
 * Three rules, in the order they matter:
 *
 * 1. DERIVED, NEVER STORED. Owner is the one column. Everything else — the
 *    sub-state, who is waiting, since when, what next — is a pure function
 *    of `RoleFacts`. The server assembles the facts (lib/agency/role-facts.ts);
 *    this file must stay free of server imports so the header can render it
 *    in the browser. Same discipline, and same reason, as phases.ts.
 *
 * 2. ONE THING, OR ONE PARTY. `nextAction` returns exactly one thing to do,
 *    or exactly one party to wait on. It never lists. When two things are
 *    outstanding the ladder picks the one that unblocks the most, and the
 *    detail sentence names the count ("2 decisions outstanding").
 *
 * 3. HONEST AGE, NO SLA. `since` is the timestamp of the fact that opened the
 *    wait, or null when nobody is waiting. The prototype invented "in 3 days
 *    · 72h"; we have no agreed service level to measure against, so we do
 *    not pretend to. The header shows a date and an age.
 *
 * Deliberately NOT modelled here: a "hire" decision. There is no such value —
 * round decisions are advance / hold / decline, append-only — so "take to
 * close-out" is derived from the closest fact: the last completed round
 * decided 'advance' at or beyond the planned count. The plan stays a plan,
 * never a gate, exactly as the interviews screen already treats it.
 */

import { phaseHref, workflowHref, type PhaseKey } from "./phases"

export type Hat = "recruiter" | "client"

export type WaitingParty = "you" | "recruiter" | "client" | "candidate" | "nobody"

export type RoundStatus = "scheduled" | "completed" | "cancelled"
export type RoundDecision = "advance" | "hold" | "decline"
export type CandidateResponse = "pending" | "confirmed" | "declined"

/** One interview round, reduced to what the ladder needs. Refs, never names. */
export interface RoundFacts {
  candidateRef: string
  roundNumber: number
  status: RoundStatus
  createdAt: string
  scheduledAt: string | null
  /** scheduled_at + duration — the closest thing to "the round ended". */
  endsAt: string | null
  candidateResponse: CandidateResponse | null
  hasDebrief: boolean
  decision: RoundDecision | null
  decidedAt: string | null
}

/** What the product can observe about one role, with no interpretation. */
export interface RoleFacts {
  phase: PhaseKey
  status: "draft" | "open" | "submitted" | "closed"
  createdAt: string
  closedAt: string | null
  /** Display name of roles.owner_id, or null when unassigned. */
  ownerName: string | null
  /** Display name of the hiring-manager contact on the brief, or null. */
  clientName: string | null
  requirements: number
  /** Candidates whose CV parsed. */
  candidates: number
  /** Candidates whose CV would not read. */
  failures: number
  /** candidate_reviews.status === "reviewed". */
  reviewed: number
  /** Reviewed with no recruiter decision. */
  undecided: number
  submission: {
    generatedAt: string
    /** Candidates in the snapshot. */
    submitted: number
    /** Submitted candidates the client has acted on (any action). */
    decided: number
    /** Submitted candidates the client asked to interview or approved. */
    advanced: number
    lastActionAt: string | null
  } | null
  /** Future, unrevoked availability windows not yet holding a round. */
  openWindows: number
  lastWindowOfferedAt: string | null
  plannedRounds: number
  rounds: RoundFacts[]
  pack: { generatedAt: string; deliveredAt: string | null } | null
  /** Injected so the same facts always derive the same answer. ISO string. */
  now: string
}

export type SubStateKey =
  | "cvs-unreadable"
  | "intake"
  | "adding-candidates"
  | "screening"
  | "deciding"
  | "ready-to-send"
  | "with-the-client"
  | "take-to-close-out"
  | "round-to-book"
  | "windows-to-offer"
  | "write-up-due"
  | "decision-due"
  | "invited"
  | "booked"
  | "on-hold"
  | "loop-ended"
  | "pack-generated"
  | "handed-over"
  | "closed"

export interface SubState {
  key: SubStateKey
  /** The rail chip text after the phase name, e.g. "SCREENING 3 OF 8". */
  chip: string
  /** Who the role is waiting on, before either hat's point of view. */
  party: Exclude<WaitingParty, "you">
  /** The fact that opened the wait, or null when nobody is waiting. */
  since: string | null
  /** The round the sub-state is about, when it is about one. */
  candidateRef?: string
  roundNumber?: number
  /** Counts the sentences use. */
  n?: number
  m?: number
}

export interface NextAction {
  key: SubStateKey
  chip: string
  /** "act": this hat does the next thing. "wait": someone else does. "done": nothing is next. */
  mode: "act" | "wait" | "done"
  title: string
  detail: string
  cta: { label: string; href: string } | null
  waitingOn: { party: WaitingParty; label: string }
  since: string | null
}

// ── The ladder ──────────────────────────────────────────────────────────────

/** Where each candidate's loop stands, from their rounds alone. */
type LoopState =
  | { kind: "declined" }
  | { kind: "close-out"; round: RoundFacts }
  | { kind: "to-book"; nextRound: number; since: string | null; candidateRef: string }
  | { kind: "write-up-due"; round: RoundFacts }
  | { kind: "decision-due"; round: RoundFacts }
  | { kind: "invited"; round: RoundFacts }
  | { kind: "booked"; round: RoundFacts }
  | { kind: "on-hold"; round: RoundFacts }

function loopState(rounds: RoundFacts[], planned: number): LoopState | null {
  if (rounds.length === 0) return null
  const live = rounds.filter((r) => r.status !== "cancelled")
  if (rounds.some((r) => r.decision === "decline")) return { kind: "declined" }
  const last = [...rounds].sort((a, b) => b.roundNumber - a.roundNumber)[0]
  if (last.status === "cancelled" || (last.status === "scheduled" && last.candidateResponse === "declined")) {
    // A cancelled or declined booking frees the slot; the round is still owed.
    return { kind: "to-book", nextRound: last.roundNumber, since: last.createdAt, candidateRef: last.candidateRef }
  }
  if (last.status === "scheduled") {
    return last.candidateResponse === "confirmed" ? { kind: "booked", round: last } : { kind: "invited", round: last }
  }
  // completed
  if (!last.hasDebrief) return { kind: "write-up-due", round: last }
  if (!last.decision) return { kind: "decision-due", round: last }
  if (last.decision === "hold") return { kind: "on-hold", round: last }
  // advance
  if (last.roundNumber >= planned) return { kind: "close-out", round: last }
  void live
  return { kind: "to-book", nextRound: last.roundNumber + 1, since: last.decidedAt, candidateRef: last.candidateRef }
}

/**
 * The one sub-state a role is in. Ordered so that the thing that unblocks
 * the most wins: the recruiter's own acts first, then the client's, then
 * the candidate's, then the waits nobody can shorten.
 */
export function deriveSubState(f: RoleFacts): SubState {
  if (f.status === "closed") return { key: "closed", chip: "CLOSED", party: "nobody", since: f.closedAt }

  if (f.phase === "handover" && f.pack) {
    if (f.pack.deliveredAt) return { key: "handed-over", chip: "HANDED OVER", party: "recruiter", since: f.pack.deliveredAt }
    return { key: "pack-generated", chip: "PACK GENERATED", party: "recruiter", since: f.pack.generatedAt }
  }

  if (f.phase === "shortlist" || !f.submission) {
    if (f.failures > 0) return { key: "cvs-unreadable", chip: `${f.failures} CV${f.failures === 1 ? "" : "S"} UNREADABLE`, party: "recruiter", since: null, n: f.failures }
    if (f.requirements === 0) return { key: "intake", chip: "INTAKE", party: "recruiter", since: null }
    if (f.candidates === 0) return { key: "adding-candidates", chip: "ADDING CANDIDATES", party: "recruiter", since: null }
    if (f.reviewed < f.candidates) return { key: "screening", chip: `SCREENING ${f.reviewed} OF ${f.candidates}`, party: "recruiter", since: null, n: f.reviewed, m: f.candidates }
    if (f.undecided > 0) return { key: "deciding", chip: "DECIDING", party: "recruiter", since: null, n: f.undecided }
    return { key: "ready-to-send", chip: "READY TO SEND", party: "recruiter", since: null }
  }

  // Interviews: a submission exists. Per-candidate loop states, then a
  // precedence over them.
  const byCandidate = new Map<string, RoundFacts[]>()
  for (const r of f.rounds) byCandidate.set(r.candidateRef, [...(byCandidate.get(r.candidateRef) ?? []), r])
  const states = [...byCandidate.entries()].map(([ref, rounds]) => ({ ref, state: loopState(rounds, f.plannedRounds)! }))

  const pick = (kind: LoopState["kind"]) => states.find((s) => s.state.kind === kind)

  const closeOut = pick("close-out")
  if (closeOut && closeOut.state.kind === "close-out")
    return { key: "take-to-close-out", chip: "TAKE TO CLOSE-OUT", party: "recruiter", since: closeOut.state.round.decidedAt, candidateRef: closeOut.ref, roundNumber: closeOut.state.round.roundNumber }

  // Advanced on the shortlist but no round yet counts as round 1 to book.
  const unbooked = states.filter((s) => s.state.kind === "to-book")
  const firstRoundOwed = f.submission.advanced - byCandidate.size
  if (unbooked.length > 0 || firstRoundOwed > 0) {
    const first = unbooked[0]
    const nextRound = first && first.state.kind === "to-book" ? first.state.nextRound : 1
    const since = first && first.state.kind === "to-book" ? first.state.since : f.submission.lastActionAt
    const count = unbooked.length + Math.max(0, firstRoundOwed)
    if (f.openWindows === 0)
      return { key: "windows-to-offer", chip: "WINDOWS TO OFFER", party: "client", since: since ?? f.submission.generatedAt, n: count, roundNumber: nextRound, candidateRef: first?.ref }
    return { key: "round-to-book", chip: `ROUND ${nextRound} TO BOOK`, party: "recruiter", since: f.lastWindowOfferedAt ?? since, n: count, roundNumber: nextRound, candidateRef: first?.ref }
  }

  const writeUp = pick("write-up-due")
  if (writeUp && writeUp.state.kind === "write-up-due")
    return { key: "write-up-due", chip: "WRITE-UP DUE", party: "client", since: writeUp.state.round.endsAt ?? writeUp.state.round.scheduledAt, candidateRef: writeUp.ref, roundNumber: writeUp.state.round.roundNumber }

  const decision = pick("decision-due")
  if (decision && decision.state.kind === "decision-due")
    return { key: "decision-due", chip: "DECISION DUE", party: "client", since: decision.state.round.endsAt ?? decision.state.round.scheduledAt, candidateRef: decision.ref, roundNumber: decision.state.round.roundNumber }

  const invited = pick("invited")
  if (invited && invited.state.kind === "invited")
    return { key: "invited", chip: "INVITED, AWAITING CANDIDATE", party: "candidate", since: invited.state.round.createdAt, candidateRef: invited.ref, roundNumber: invited.state.round.roundNumber }

  const booked = states
    .filter((s) => s.state.kind === "booked")
    .sort((a, b) => ((a.state as { round: RoundFacts }).round.scheduledAt ?? "").localeCompare((b.state as { round: RoundFacts }).round.scheduledAt ?? ""))[0]
  if (booked && booked.state.kind === "booked")
    return { key: "booked", chip: "BOOKED", party: "nobody", since: booked.state.round.scheduledAt, candidateRef: booked.ref, roundNumber: booked.state.round.roundNumber }

  const hold = pick("on-hold")
  if (hold && hold.state.kind === "on-hold")
    return { key: "on-hold", chip: "ON HOLD", party: "client", since: hold.state.round.decidedAt, candidateRef: hold.ref, roundNumber: hold.state.round.roundNumber }

  if (byCandidate.size === 0) {
    // The client has the shortlist and nobody is in a loop yet.
    const outstanding = f.submission.submitted - f.submission.decided
    return { key: "with-the-client", chip: "WITH THE CLIENT", party: "client", since: f.submission.lastActionAt ?? f.submission.generatedAt, n: Math.max(0, outstanding), m: f.submission.submitted }
  }

  // Every loop ended in a decline and nothing is owed: the recruiter decides
  // what happens to the role, and nothing here decides it for them.
  return { key: "loop-ended", chip: "LOOP ENDED", party: "recruiter", since: f.submission.lastActionAt }
}

// ── Sentences ───────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function party(sub: SubState, f: RoleFacts, hat: Hat): { party: WaitingParty; label: string } {
  const me = hat === "recruiter" ? "recruiter" : "client"
  if (sub.party === me) return { party: "you", label: "You" }
  if (sub.party === "recruiter") return { party: "recruiter", label: f.ownerName ?? "Your recruiter" }
  if (sub.party === "client") return { party: "client", label: f.clientName ?? "The client" }
  if (sub.party === "candidate") return { party: "candidate", label: sub.candidateRef ? `Candidate ${sub.candidateRef}` : "The candidate" }
  return { party: "nobody", label: "Nobody" }
}

/**
 * One sentence for this hat. The recruiter's CTAs go into the workflow,
 * the interviews screen or close-out; the client's go to their role page
 * or their interviews screen. Nothing here names a candidate to the client:
 * refs only, as everywhere in the hiring payload.
 */
export function nextAction(f: RoleFacts, hat: Hat, roleId: string): NextAction {
  const sub = deriveSubState(f)
  const who = party(sub, f, hat)
  const base = { key: sub.key, chip: sub.chip, waitingOn: who, since: sub.since }
  const wf = (step?: string) => workflowHref(roleId, step)
  const interviews = phaseHref("interviews", roleId)
  const closeOut = phaseHref("handover", roleId)
  const clientRole = `/hiring/roles/${roleId}`
  const clientLoop = "/hiring/interviews"
  const R = hat === "recruiter"
  const ref = sub.candidateRef ?? "the candidate"
  const rn = sub.roundNumber ?? 1
  const client = f.clientName ?? "the client"

  switch (sub.key) {
    case "closed":
      return { ...base, mode: "done", title: "Role closed", detail: "The record is complete and the retention clock is running.", cta: R ? { label: "Open close-out", href: closeOut } : null }
    case "handed-over":
      return R
        ? { ...base, mode: "act", title: "Close the role", detail: "The pack is with the employer. Closing starts the retention clock and tells everyone not hired.", cta: { label: "Open close-out", href: closeOut } }
        : { ...base, mode: "wait", title: "Handover complete", detail: "Your recruiter has handed over the pack. The role closes when they close it.", cta: null }
    case "pack-generated":
      return R
        ? { ...base, mode: "act", title: `Hand the pack over to ${client}`, detail: "The pack is generated. Handing it over ends Tailr's part.", cta: { label: "Open close-out", href: closeOut } }
        : { ...base, mode: "wait", title: "Your recruiter is preparing the handover", detail: "Nothing is needed from you.", cta: null }
    case "cvs-unreadable":
      return R
        ? { ...base, mode: "act", title: `Fix ${plural(sub.n ?? 0, "CV that would not read", "CVs that would not read")}`, detail: "Re-upload or replace them before screening.", cta: { label: "Open candidates", href: wf("candidates") } }
        : clientWaiting(base, f)
    case "intake":
      return R
        ? { ...base, mode: "act", title: "Write the brief", detail: "Paste the job description and parse it into requirements.", cta: { label: "Open intake", href: wf("intake") } }
        : clientWaiting(base, f)
    case "adding-candidates":
      return R
        ? { ...base, mode: "act", title: "Add candidates", detail: "Requirements are in. Add CVs to score against them.", cta: { label: "Add candidates", href: wf("candidates") } }
        : clientWaiting(base, f)
    case "screening":
      return R
        ? { ...base, mode: "act", title: `Screen ${plural((sub.m ?? 0) - (sub.n ?? 0), "candidate")}`, detail: `${sub.n ?? 0} of ${sub.m ?? 0} screened.`, cta: { label: "Open screening", href: wf("screening") } }
        : clientWaiting(base, f)
    case "deciding":
      return R
        ? { ...base, mode: "act", title: `Decide on ${plural(sub.n ?? 0, "candidate")}`, detail: "Every candidate is screened. Shortlist, hold or reject each one.", cta: { label: "Open compare", href: wf("compare") } }
        : clientWaiting(base, f)
    case "ready-to-send":
      return R
        ? { ...base, mode: "act", title: "Send the shortlist", detail: `Every candidate is decided. Generate the submission for ${client}.`, cta: { label: "Open submission", href: wf("submission") } }
        : clientWaiting(base, f)
    case "with-the-client":
      return R
        ? { ...base, mode: "wait", title: `${who.label} is reviewing the shortlist`, detail: sub.n ? `${plural(sub.n, "decision")} outstanding of ${sub.m}.` : "Every candidate has a signal; nobody has been advanced yet.", cta: { label: "Open the submission", href: wf("submission") } }
        : { ...base, mode: "act", title: sub.n ? `Decide on ${plural(sub.n, "candidate")}` : "Advance a candidate to interview", detail: "Ask to interview, approve, decline or question each one.", cta: { label: "Open the shortlist", href: clientRole } }
    case "windows-to-offer":
      return R
        ? { ...base, mode: "wait", title: `${who.label} has no interview windows open`, detail: `${plural(sub.n ?? 1, "round")} to book once they offer times.`, cta: { label: "Open interviews", href: interviews } }
        : { ...base, mode: "act", title: "Offer interview windows", detail: `Your recruiter has ${plural(sub.n ?? 1, "candidate")} to book and no open times.`, cta: { label: "Offer times", href: clientLoop } }
    case "round-to-book":
      return R
        ? { ...base, mode: "act", title: `Book round ${rn} for ${ref}`, detail: sub.n && sub.n > 1 ? `${sub.n} rounds to book. ${f.openWindows} open windows.` : `${f.openWindows} open windows.`, cta: { label: "Book the round", href: interviews } }
        : { ...base, mode: "wait", title: "Your recruiter is booking the next round", detail: "Your open windows are on offer.", cta: { label: "Your diary", href: clientLoop } }
    case "invited":
      return R
        ? { ...base, mode: "wait", title: `${ref} is confirming round ${rn}`, detail: "The booking invite is out.", cta: { label: "Open interviews", href: interviews } }
        : { ...base, mode: "wait", title: `Round ${rn} is with the candidate to confirm`, detail: "You will see it in your diary once confirmed.", cta: { label: "Your diary", href: clientLoop } }
    case "booked":
      return { ...base, mode: "wait", title: `Round ${rn} with ${ref} is booked`, detail: "Nothing is needed until it happens.", cta: { label: R ? "Open interviews" : "Your diary", href: R ? interviews : clientLoop } }
    case "write-up-due":
      return R
        ? { ...base, mode: "wait", title: `${who.label} is writing up round ${rn}`, detail: `Round ${rn} with ${ref} has happened.`, cta: { label: "Open interviews", href: interviews } }
        : { ...base, mode: "act", title: `Write up round ${rn} with ${ref}`, detail: "Your write-up comes before your decision.", cta: { label: "Write it up", href: clientLoop } }
    case "decision-due":
      return R
        ? { ...base, mode: "wait", title: `${who.label} is deciding round ${rn}`, detail: `The write-up for ${ref} is in.`, cta: { label: "Open interviews", href: interviews } }
        : { ...base, mode: "act", title: `Decide round ${rn} with ${ref}`, detail: "Advance, hold or decline.", cta: { label: "Decide", href: clientLoop } }
    case "on-hold":
      return R
        ? { ...base, mode: "wait", title: `${who.label} has ${ref} on hold`, detail: `Held after round ${rn}. Their call to advance or decline.`, cta: { label: "Open interviews", href: interviews } }
        : { ...base, mode: "act", title: `${ref} is on hold after round ${rn}`, detail: "Advance or decline when you are ready.", cta: { label: "Decide", href: clientLoop } }
    case "take-to-close-out":
      return R
        ? { ...base, mode: "act", title: `Take ${ref} to close-out`, detail: `Advanced after round ${rn} of ${f.plannedRounds} planned.`, cta: { label: "Open close-out", href: closeOut } }
        : { ...base, mode: "wait", title: `Your recruiter is taking ${ref} to close-out`, detail: "References and the handover pack come next.", cta: null }
    case "loop-ended":
      return R
        ? { ...base, mode: "act", title: "Every loop has ended", detail: "No candidate is advancing. Add to the shortlist, or close the role.", cta: { label: "Open the submission", href: wf("submission") } }
        : { ...base, mode: "wait", title: "Your recruiter is reviewing the shortlist", detail: "Nothing is needed from you.", cta: null }
  }
}

function clientWaiting(base: Pick<NextAction, "key" | "chip" | "waitingOn" | "since">, f: RoleFacts): NextAction {
  return { ...base, mode: "wait", title: `${f.ownerName ?? "Your recruiter"} is building the shortlist`, detail: "You will be told when it is ready for your decisions.", cta: null }
}

// ── The handoff receipt ─────────────────────────────────────────────────────

export interface Handoff {
  /** The event that completed, named as an event and not a button. */
  confirmed: string
  /** Who holds the role now. */
  owner: string
  /** Their next task, in their words. */
  nextTask: string
  /** What that unlocks for the rest of the loop. */
  then: string
}

/**
 * The receipt after a seam: what completed, who owns it now, their next
 * task, and what follows. Derived from the same facts, so it survives a
 * reload and never says "sent" when nothing was. Null while the role sits
 * mid-step, where there is no event to confirm.
 */
export function handoffFor(f: RoleFacts, hat: Hat, roleId: string): Handoff | null {
  const sub = deriveSubState(f)
  const next = nextAction(f, hat, roleId)
  const other = nextAction(f, hat === "recruiter" ? "client" : "recruiter", roleId)
  const client = f.clientName ?? "the client"
  const recruiter = f.ownerName ?? "your recruiter"
  const owner = next.mode === "act" ? "You" : next.waitingOn.label
  const task = next.mode === "act" ? next.title : other.mode === "act" ? other.title : next.title
  switch (sub.key) {
    case "with-the-client":
      return { confirmed: `Shortlist of ${f.submission?.submitted ?? 0} sent to ${client}.`, owner, nextTask: task, then: "Advanced candidates are invited to round 1." }
    case "windows-to-offer":
      return { confirmed: `${client} advanced ${plural(sub.n ?? 1, "candidate")}.`, owner, nextTask: task, then: `${recruiter === "your recruiter" ? "Your recruiter" : recruiter} books round ${sub.roundNumber ?? 1} once times are offered.` }
    case "round-to-book":
      return { confirmed: sub.roundNumber && sub.roundNumber > 1 ? `Round ${sub.roundNumber - 1} decided: advance.` : `${client} offered interview times.`, owner, nextTask: task, then: "The candidate confirms; the round runs; the client writes it up." }
    case "invited":
      return { confirmed: `Round ${sub.roundNumber ?? 1} booked for ${sub.candidateRef ?? "the candidate"}.`, owner, nextTask: task, then: "Once confirmed it sits in the client's diary." }
    case "booked":
      return { confirmed: `${sub.candidateRef ?? "The candidate"} confirmed round ${sub.roundNumber ?? 1}.`, owner, nextTask: task, then: "After the round, the client writes it up before deciding." }
    case "write-up-due":
      return { confirmed: `Round ${sub.roundNumber ?? 1} with ${sub.candidateRef ?? "the candidate"} has happened.`, owner, nextTask: task, then: "The write-up unlocks the round decision." }
    case "decision-due":
      return { confirmed: `Round ${sub.roundNumber ?? 1} written up.`, owner, nextTask: task, then: "Advance books the next round; the last advance goes to close-out." }
    case "take-to-close-out":
      return { confirmed: `${sub.candidateRef ?? "The candidate"} advanced after the final planned round.`, owner, nextTask: task, then: "References and the handover pack; then the role closes." }
    case "pack-generated":
      return { confirmed: "Handover pack generated.", owner, nextTask: task, then: "Handing over ends Tailr's part; closing starts the retention clock." }
    case "handed-over":
      return { confirmed: `Pack handed over to ${client}.`, owner, nextTask: task, then: "Closing tells everyone not hired and starts the retention clock." }
    case "closed":
      return { confirmed: "Role closed.", owner: "Nobody", nextTask: "Nothing. The record is complete.", then: "Tailr forgets on schedule." }
    default:
      return null
  }
}

// ── Age ─────────────────────────────────────────────────────────────────────

/** "today", "1 day", "3 days", "2 weeks" — honest age, never a deadline. */
export function ageLabel(since: string, now: string): string {
  const ms = Date.parse(now) - Date.parse(since)
  if (!Number.isFinite(ms)) return ""
  const days = Math.floor(Math.abs(ms) / 86_400_000)
  if (ms < 0) return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`
  if (days === 0) return "today"
  if (days < 14) return plural(days, "day")
  return plural(Math.floor(days / 7), "week")
}
