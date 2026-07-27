/**
 * Data access for career-path skills.
 *
 * Items moved out of `career_roadmaps.items` (a jsonb array on one row per user)
 * into `career_roadmap_items` (migration 016). Every route previously did its own
 * read-modify-write on that array; they now go through here instead, which keeps
 * the change contained to one module and gives us dedupe, provenance and horizon
 * filtering as real database features.
 *
 * The API contract is unchanged on purpose: callers still receive a roadmap object
 * with `items` as an ordered array of CareerRoadmapItem, so no client code changes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CareerRoadmapItem, CareerItemStatus } from './anthropic'

export type Horizon = 'quick' | 'core'
export type ItemSource = 'north_star' | 'tailor_run'

/** Extra per-item context that only exists once items are rows, not array entries */
export interface RoadmapItemMeta {
  horizon: Horizon
  source: ItemSource
  sourceRunId?: string | null
  roleFamilyAtCapture?: string | null
  effortEstimateHours?: number | null
  surfacedCount: number
  archivedAt?: string | null
}

export type StoredRoadmapItem = CareerRoadmapItem & Partial<RoadmapItemMeta>

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbRow = Record<string, any>
type Db = SupabaseClient<any, any, any>

/** DB row → the shape the API and client already expect */
export function rowToItem(row: DbRow): StoredRoadmapItem {
  return {
    skill: row.skill,
    whyItMatters: row.why_it_matters ?? '',
    resources: Array.isArray(row.resources) ? row.resources : [],
    projectBrief: row.project_brief ?? '',
    cvPhrasing: row.cv_phrasing ?? '',
    status: (row.status ?? 'todo') as CareerItemStatus,
    touchedAt: row.touched_at ?? undefined,
    evidence: row.evidence ?? undefined,
    horizon: row.horizon ?? 'core',
    source: row.source ?? 'north_star',
    sourceRunId: row.source_run_id ?? null,
    roleFamilyAtCapture: row.role_family_at_capture ?? null,
    effortEstimateHours: row.effort_estimate_hours ?? null,
    surfacedCount: row.surfaced_count ?? 1,
    archivedAt: row.archived_at ?? null,
  }
}

function itemToRow(item: StoredRoadmapItem, userId: string, roadmapId: string | null, position: number): DbRow {
  return {
    user_id: userId,
    roadmap_id: roadmapId,
    skill: item.skill,
    why_it_matters: item.whyItMatters ?? '',
    resources: item.resources ?? [],
    project_brief: item.projectBrief ?? '',
    cv_phrasing: item.cvPhrasing ?? '',
    status: item.status ?? 'todo',
    touched_at: item.touchedAt ?? null,
    evidence: item.evidence ?? null,
    horizon: item.horizon ?? 'core',
    source: item.source ?? 'north_star',
    source_run_id: item.sourceRunId ?? null,
    role_family_at_capture: item.roleFamilyAtCapture ?? null,
    effort_estimate_hours: item.effortEstimateHours ?? null,
    surfaced_count: item.surfacedCount ?? 1,
    position,
    updated_at: new Date().toISOString(),
  }
}

export interface LoadOpts {
  /** Restrict to one horizon. Omit for both. */
  horizon?: Horizon
  /** Include expired/archived quick items (default false) */
  includeArchived?: boolean
}

/** Ordered items for a user, filtered by horizon. */
export async function loadItems(db: Db, userId: string, opts: LoadOpts = {}): Promise<StoredRoadmapItem[]> {
  let q = db.from('career_roadmap_items').select('*').eq('user_id', userId)
  if (opts.horizon) q = q.eq('horizon', opts.horizon)
  if (!opts.includeArchived) q = q.is('archived_at', null)
  const { data, error } = await q.order('position', { ascending: true }).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(rowToItem)
}

/**
 * Replace a user's items for one horizon — used where a route previously wrote a
 * whole new array (regenerate, lock a target). Scoped to the horizon so
 * regenerating the North Star path can never wipe quick wins, which is exactly
 * the kind of cross-contamination the single array made easy.
 */
export async function replaceItems(
  db: Db, userId: string, roadmapId: string | null,
  items: StoredRoadmapItem[], horizon: Horizon = 'core',
): Promise<StoredRoadmapItem[]> {
  const { error: delErr } = await db
    .from('career_roadmap_items').delete().eq('user_id', userId).eq('horizon', horizon)
  if (delErr) throw delErr
  if (items.length === 0) return []

  const rows = items.map((it, i) => itemToRow({ ...it, horizon }, userId, roadmapId, i))
  const { data, error } = await db.from('career_roadmap_items').insert(rows).select('*')
  if (error) throw error
  return (data ?? []).map(rowToItem)
}

/**
 * Add items without disturbing existing ones. A skill the user already has is NOT
 * duplicated: its surfaced_count increments and it is un-archived, which is what
 * makes the promotion rule ("surfaced by 3+ runs") possible.
 */
export async function addItems(
  db: Db, userId: string, roadmapId: string | null, items: StoredRoadmapItem[],
): Promise<StoredRoadmapItem[]> {
  if (items.length === 0) return loadItems(db, userId)

  const existing = await loadItems(db, userId, { includeArchived: true })
  const bySkill = new Map(existing.map((i) => [i.skill.toLowerCase(), i]))
  let position = existing.length

  for (const item of items) {
    const key = item.skill.trim().toLowerCase()
    if (!key) continue
    const prior = bySkill.get(key)
    if (prior) {
      const { error } = await db
        .from('career_roadmap_items')
        .update({
          surfaced_count: (prior.surfacedCount ?? 1) + 1,
          archived_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId).ilike('skill', item.skill)
      if (error) throw error
    } else {
      const { error } = await db
        .from('career_roadmap_items')
        .insert(itemToRow(item, userId, roadmapId, position++))
      // A concurrent run may have inserted the same skill between our read and
      // write; the unique index catches it, and losing that race is harmless.
      if (error && !`${error.message}`.includes('duplicate key')) throw error
    }
  }
  return loadItems(db, userId)
}

/** Cycle one skill's status. Replaces a whole-array rewrite with a single row update. */
export async function setItemStatus(
  db: Db, userId: string, skill: string, status: CareerItemStatus,
): Promise<StoredRoadmapItem[]> {
  const { error } = await db
    .from('career_roadmap_items')
    .update({ status, touched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId).ilike('skill', skill)
  if (error) throw error
  return loadItems(db, userId)
}

/** Attach an evidence judgement to a skill (evidence-gated completion). */
export async function setItemEvidence(
  db: Db, userId: string, skill: string,
  evidence: unknown, status?: CareerItemStatus, cvPhrasing?: string,
): Promise<StoredRoadmapItem[]> {
  const patch: DbRow = { evidence, updated_at: new Date().toISOString() }
  if (status) { patch.status = status; patch.touched_at = new Date().toISOString() }
  if (typeof cvPhrasing === 'string' && cvPhrasing) patch.cv_phrasing = cvPhrasing
  const { error } = await db
    .from('career_roadmap_items').update(patch).eq('user_id', userId).ilike('skill', skill)
  if (error) throw error
  return loadItems(db, userId)
}

export async function removeSkill(db: Db, userId: string, skill: string): Promise<StoredRoadmapItem[]> {
  const { error } = await db
    .from('career_roadmap_items').delete().eq('user_id', userId).ilike('skill', skill)
  if (error) throw error
  return loadItems(db, userId)
}

/**
 * Closed skills that may be woven into a future CV.
 *
 * Evidence-gated by design: a self-marked "done" with no uploaded artifact is NOT
 * returned. Without this the feature degrades into keyword stuffing — a user
 * claiming a skill because they ticked a box — which is the exact failure mode the
 * product exists to prevent. Both horizons count: a quick win closed with real
 * evidence is as true as a core one.
 */
export async function loadProvenSkills(db: Db, userId: string, limit = 8): Promise<StoredRoadmapItem[]> {
  const { data, error } = await db
    .from('career_roadmap_items')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'done')
    .not('evidence', 'is', null)
    .order('touched_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(rowToItem).filter((i) => i.evidence?.verdict === 'pass')
}
