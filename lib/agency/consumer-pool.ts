/**
 * The consumer pool, as a recruiter may see it.
 *
 * WHAT CHANGED (19 Sep 2026, Ose). The window listed only people the scan had
 * already accepted — above the threshold and clearing the must-have floor.
 * That hides the person a recruiter most wants: someone whose career arc is
 * pointing at this kind of work but whose evidence does not yet hit the
 * must-haves. Somebody mid-switch scores badly and is exactly who you want to
 * talk to.
 *
 * So this returns the POOL, not the winners: every person who may be shown,
 * with their arc, what they have evidenced, and a relevance signal against
 * this role. The recruiter decides; nothing here filters anyone out.
 *
 * ── WHO MAY BE SHOWN ──────────────────────────────────────────────────────
 *
 * Only people who turned BOTH switches on: `profiles.recruiter_visibility`
 * ("let recruiters see me") and `match_preferences.discoverable` ("let them
 * see me when a role matches"). Everyone else is absent, and absent in the
 * same way a person who never signed up is absent — there is no count, no
 * placeholder, no gap in the numbering.
 *
 * That is not a preference. `recruiter_profile_snapshot` returns null for a
 * person who has not opted in, from the same code path and with the same
 * timing as for somebody who does not exist, precisely so a recruiter cannot
 * learn that anybody is hiding. Widening this list to people who did not
 * agree would undo the property the opt-in is built on, and it is a consent
 * commitment in docs/LEGAL-REVIEW-PACK.md §3.2.
 *
 * ── WHAT IS SHOWN, AND WHAT IS NOT ────────────────────────────────────────
 *
 * Shown: the Career Arc the person wrote about themselves, their evidence
 * bank (their own claims, in their words, respecting `hidden`), coarse
 * activity stats, and a relevance signal computed here.
 *
 * NOT shown, ever: `career_roadmaps` and `career_roadmap_items`. That is the
 * person's private view of their own weaknesses and what they are trying to
 * fix — the one thing a recruiter must never read. The snapshot function
 * refuses to touch those tables and so does this.
 *
 * The relevance signal is DETERMINISTIC and explainable — overlap between the
 * role's requirements and what the person has evidenced. It is not a model
 * call, not a ranking of human beings, and not a score anyone is rejected by.
 * It orders a list for a recruiter to read; every person in the pool is
 * selectable whatever it says.
 */

import { agencyAdmin } from "./db"
import { createAdminClient } from "@/lib/supabase/server"
import type { AgencyContext } from "./types"

export interface PoolPerson {
  userId: string
  name: string
  /** What they call themselves — their own words, not a title we inferred. */
  headline: string
  /** The Career Arc, trimmed to what fits a card. Their writing, never ours. */
  arc: string
  /** Their own evidenced claims that overlap this role, in their words. */
  matchedOn: string[]
  /** Requirements nothing in their evidence speaks to. Shown as an absence. */
  gaps: string[]
  /** 0–100, deterministic overlap. A reading aid, never a judgement. */
  relevance: number
  evidenceCount: number
  /**
   * True when the arc points at this kind of work but the evidence does not
   * yet carry it — the switcher. The whole reason this list exists.
   */
  switching: boolean
  /** Set once a scan has accepted them, so the two lists agree. */
  recommendationId: string | null
  state: string | null
}

const STOP = new Set([
  "and","the","with","for","a","an","of","to","in","on","or","at","by","from","as","is","are",
  "experience","working","work","strong","deep","using","use","including","ideally","evidence",
  "years","year","more","than","not","just","their","this","that","them","they","who","what",
])

/** Words worth matching on: lowercase, de-punctuated, stop-words dropped. */
function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#. ]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/\.$/, ""))
      .filter((w) => w.length > 2 && !STOP.has(w))
  )
}

export async function listConsumerPool(
  ctx: AgencyContext,
  roleId: string
): Promise<{ people: PoolPerson[]; requirements: Array<{ ref: string; text: string; weight: string }> }> {
  const admin = agencyAdmin()
  const pub = createAdminClient()

  const { data: role } = await admin
    .from("job_roles")
    .select("id, agency_id")
    .eq("id", roleId)
    .maybeSingle()
  if (!role || role.agency_id !== ctx.agencyId) return { people: [], requirements: [] }

  const { data: reqRows } = await admin
    .from("requirements")
    .select("ref, text, weight")
    .eq("role_id", roleId)
    .order("sort_order")
  const requirements = (reqRows ?? []).map((r) => ({
    ref: r.ref as string,
    text: r.text as string,
    weight: r.weight as string,
  }))
  if (requirements.length === 0) return { people: [], requirements }

  // BOTH switches. A person who turned on only one is not in this list.
  const { data: prefs } = await pub
    .from("match_preferences")
    .select("user_id")
    .eq("discoverable", true)
  const discoverable = new Set((prefs ?? []).map((p: { user_id: string }) => p.user_id))
  if (discoverable.size === 0) return { people: [], requirements }

  const { data: profiles } = await pub
    .from("profiles")
    .select("id, full_name")
    .eq("recruiter_visibility", true)
    .in("id", [...discoverable])
  const users = (profiles ?? []).filter((p: { id: string }) => discoverable.has(p.id))
  if (users.length === 0) return { people: [], requirements }

  const ids = users.map((u: { id: string }) => u.id)
  const [{ data: arcs }, { data: evidence }, { data: recs }] = await Promise.all([
    pub.from("career_profiles").select("user_id, sections").in("user_id", ids),
    // `hidden` is the person's own control over what a recruiter reads. It is
    // honoured here exactly as the snapshot honours it.
    pub
      .from("career_evidence")
      .select("user_id, claim, rephrased_text, source_role, category")
      .in("user_id", ids)
      .eq("hidden", false),
    pub
      .from("role_recommendations")
      .select("id, user_id, state")
      .eq("published_role_id", roleId),
  ])

  const arcByUser = new Map<string, string>()
  for (const a of arcs ?? []) {
    const sections = a.sections as unknown
    const text = Array.isArray(sections)
      ? (sections as Array<Record<string, unknown>>)
          .map((s) => (typeof s.body === "string" ? s.body : typeof s.text === "string" ? s.text : ""))
          .filter(Boolean)
          .join(" ")
      : typeof sections === "string"
        ? sections
        : ""
    arcByUser.set(a.user_id as string, text)
  }

  const evByUser = new Map<string, Array<{ text: string; role: string }>>()
  for (const e of evidence ?? []) {
    const uid = e.user_id as string
    const text = ((e.rephrased_text as string) || (e.claim as string) || "").trim()
    if (!text) continue
    const list = evByUser.get(uid) ?? []
    list.push({ text, role: (e.source_role as string) ?? "" })
    evByUser.set(uid, list)
  }

  const recByUser = new Map<string, { id: string; state: string }>()
  for (const r of recs ?? []) {
    recByUser.set(r.user_id as string, { id: r.id as string, state: r.state as string })
  }

  const people: PoolPerson[] = users.map((u: { id: string; full_name: string | null }) => {
    const uid = u.id as string
    const ev = evByUser.get(uid) ?? []
    const arc = arcByUser.get(uid) ?? ""
    const evTerms = terms(ev.map((e) => e.text).join(" "))
    const arcTerms = terms(arc + " " + ev.map((e) => e.role).join(" "))

    const matchedOn: string[] = []
    const gaps: string[] = []
    let hits = 0
    let arcHits = 0
    for (const r of requirements) {
      const rt = [...terms(r.text)]
      if (rt.length === 0) continue
      const inEvidence = rt.some((t) => evTerms.has(t))
      const inArc = rt.some((t) => arcTerms.has(t))
      if (inEvidence) {
        hits += 1
        const line = ev.find((e) => rt.some((t) => terms(e.text).has(t)))
        if (line && matchedOn.length < 3) matchedOn.push(line.text)
      } else {
        gaps.push(r.ref)
        if (inArc) arcHits += 1
      }
    }

    const relevance = Math.round((hits / requirements.length) * 100)
    const rec = recByUser.get(uid) ?? null
    return {
      userId: uid,
      name: (u.full_name as string) || "A Tailr user",
      headline: ev[0]?.role || "",
      arc: arc.slice(0, 260),
      matchedOn,
      gaps,
      relevance,
      evidenceCount: ev.length,
      // Their direction speaks to requirements their evidence does not yet
      // carry. That is the person worth a conversation.
      switching: arcHits > 0 && relevance < 60,
      recommendationId: rec?.id ?? null,
      state: rec?.state ?? null,
    }
  })

  // Most relevant first, then the switchers, then the rest. Ordering a list
  // is not ranking people: everyone here is selectable.
  people.sort((a, b) => b.relevance - a.relevance || Number(b.switching) - Number(a.switching))
  return { people, requirements }
}
