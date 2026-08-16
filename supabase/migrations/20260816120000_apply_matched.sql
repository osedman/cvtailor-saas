-- Tailr — migration 19: applying. The bundle crosses the wall, atomically.
--
-- Applying is the single moment quiet matching shares anything with an
-- agency. Until now every multi-write path in this feature was a sequence of
-- PostgREST calls, and one of them half-published a role when the second call
-- failed. This one write CANNOT be allowed a half-state: a candidate row
-- without its consent event is a person in an agency's pipeline with no
-- record of having agreed, and an 'applied' recommendation without a
-- candidate row lies to the person (the trigger makes applied irreversible,
-- for everyone — there is no unclaim).
--
-- So the whole thing is ONE function in ONE transaction, in the spirit of
-- agency.purge_candidate(): the single path by which a matched person becomes
-- a candidate. Order inside the transaction:
--
--   claim → consent event → candidate + identities → evidence → score →
--   audit (+ suppression-override audit if needed) → done
--
-- The claim (state new/seen → applied) comes FIRST as the concurrency lock:
-- a double-click or a second tab raises immediately and the rollback erases
-- everything including the consent event — a consent record for an
-- application that did not happen would itself be wrong.
--
-- WHAT IS DELIBERATELY ABSENT: candidate_notices. Matched applicants get
-- Art 13 AT THE MOMENT OF APPLYING — the manifest they confirmed is the
-- notice — not Art 14 on a seven-day delay. A notices row here would send a
-- second, redundant notice.
--
-- SUPPRESSION IS NOT A BLOCK. ingestCandidate throws for a suppressed
-- identity, and that is right for a recruiter uploading someone who objected.
-- Here the suppressed person themselves is choosing to apply — the rights
-- page promised objection would not lock them out of their own choices — so
-- the application proceeds and the override is audited.
--
-- Idempotent: safe to re-run (create or replace; constraint rebuilds).

-- ============================================================
-- 1. Widenings
-- ============================================================

-- 'matched': evidence that arrived with a self-submitted application.
-- 'tailr_profile' is NOT reused — that value means enrichment under
-- recruiter_visibility, a different consent, and the audit trail must be able
-- to tell the two apart.
alter table agency.candidate_evidence drop constraint if exists candidate_evidence_origin_check;
alter table agency.candidate_evidence add constraint candidate_evidence_origin_check
  check (origin in ('cv', 'tailr_profile', 'interview', 'matched'));

-- The consent ledger learns about applications. The manifest column stores
-- exactly what the person was shown and confirmed — "when did I agree, and
-- to what?" must be answerable for applications too.
alter table public.matching_consent_events
  drop constraint if exists matching_consent_events_subject_check;
alter table public.matching_consent_events
  add constraint matching_consent_events_subject_check
  check (subject in ('matching', 'enrichment', 'application'));

alter table public.matching_consent_events
  add column if not exists manifest jsonb;

-- ============================================================
-- 2. The one path across the wall
-- ============================================================
create or replace function public.apply_matched_recommendation(
  p_recommendation uuid,
  p_actor          uuid,
  p_full_name      text,
  p_email          text,
  p_identity_hash  text,
  p_cv_text        text,
  p_manifest       jsonb,
  p_evidence       jsonb,   -- [{requirement_id, strength, quote, source_cite}]
  p_breakdown      jsonb    -- computeScore output + baselines + inputs_hash + engine_version
) returns jsonb
language plpgsql
security definer
set search_path = public, agency
as $$
declare
  v_rec          record;
  v_snapshot     record;
  v_ref          text;
  v_candidate_id uuid;
  v_rights_token text;
  v_duplicate_of uuid;
  v_suppressed   boolean;
  v_claimed      integer;
  v_row          jsonb;
begin
  -- The claim is the lock. FOR UPDATE so two applies serialise; the state
  -- filter makes the second one find nothing and abort the whole transaction.
  select * into v_rec
    from public.role_recommendations
   where id = p_recommendation
     for update;
  if v_rec is null then
    raise exception 'recommendation not found';
  end if;
  if v_rec.user_id is distinct from p_actor then
    -- Consent is the account holder's own; no actor may apply for another.
    raise exception 'a recommendation can only be applied by its owner';
  end if;

  update public.role_recommendations
     set state = 'applied', applied_at = now(), updated_at = now()
   where id = p_recommendation
     and state in ('new', 'seen');
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    raise exception 'this recommendation is already settled (state: %)', v_rec.state;
  end if;

  select * into v_snapshot
    from public.published_roles
   where id = v_rec.published_role_id;
  if v_snapshot is null or v_snapshot.status <> 'live' then
    raise exception 'this role is no longer live';
  end if;

  -- The record of agreement, before anything crosses. Rolls back with
  -- everything else if any later step fails.
  insert into public.matching_consent_events
    (user_id, subject, action, copy_version, surface, manifest)
  values
    (p_actor, 'application', 'granted',
     coalesce(p_manifest->>'copyVersion', ''), 'found', p_manifest);

  -- ── across the wall ─────────────────────────────────────────
  select agency.next_candidate_ref(v_snapshot.role_id) into v_ref;

  insert into agency.candidates
    (agency_id, role_id, ref, full_name, email, current_title,
     source, source_detail, ingested_by, cv_text, parse_status, parsed_at)
  values
    (v_snapshot.agency_id, v_snapshot.role_id, v_ref,
     p_full_name, nullif(p_email, ''), coalesce(p_manifest->>'currentTitle', ''),
     'matched', 'Applied through Tailr matching',
     p_actor, p_cv_text, 'parsed', now())
  returning id, rights_token into v_candidate_id, v_rights_token;

  -- Identity + duplicate detection, exactly as ingestion does it:
  -- agency-wide, banner-only, never a block.
  v_suppressed := false;
  if p_identity_hash is not null and p_identity_hash <> '' then
    select candidate_id into v_duplicate_of
      from agency.candidate_identities
     where agency_id = v_snapshot.agency_id
       and identity_hash = p_identity_hash
       and candidate_id <> v_candidate_id
     limit 1;

    insert into agency.candidate_identities (agency_id, identity_hash, candidate_id)
    values (v_snapshot.agency_id, p_identity_hash, v_candidate_id);

    if v_duplicate_of is not null then
      update agency.candidates set duplicate_of = v_duplicate_of where id = v_candidate_id;
    end if;

    select exists (
      select 1 from agency.notice_suppressions
       where agency_id = v_snapshot.agency_id and identity_hash = p_identity_hash
    ) into v_suppressed;
  end if;

  -- Evidence rows, from the payload the person confirmed.
  for v_row in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    insert into agency.candidate_evidence
      (agency_id, candidate_id, requirement_id, strength, quote, source_cite, origin)
    values
      (v_snapshot.agency_id, v_candidate_id,
       (v_row->>'requirement_id')::uuid,
       v_row->>'strength',
       case when v_row->>'strength' = 'missing' then null else v_row->>'quote' end,
       coalesce(v_row->>'source_cite', ''),
       'matched');
  end loop;

  insert into agency.score_breakdowns
    (agency_id, candidate_id, overall, requirement_coverage, evidence_strength,
     seniority_calibration, context_fit, confidence_completeness,
     must_have_hit, must_have_total, confidence_level, effective, baselines,
     original_overall, inputs_hash, engine_version, computed_at)
  values
    (v_snapshot.agency_id, v_candidate_id,
     (p_breakdown->>'overall')::numeric,
     (p_breakdown->>'requirement_coverage')::numeric,
     (p_breakdown->>'evidence_strength')::numeric,
     (p_breakdown->>'seniority_calibration')::numeric,
     (p_breakdown->>'context_fit')::numeric,
     (p_breakdown->>'confidence_completeness')::numeric,
     (p_breakdown->>'must_have_hit')::int,
     (p_breakdown->>'must_have_total')::int,
     (p_breakdown->>'confidence_level')::int,
     p_breakdown->'effective',
     p_breakdown->'baselines',
     (p_breakdown->>'overall')::numeric,
     p_breakdown->>'inputs_hash',
     p_breakdown->>'engine_version',
     now());

  -- Provenance. The person is their own ingester; the audit row says so.
  insert into agency.audit_log
    (agency_id, role_id, candidate_id, actor_id, entity_type, entity_ref, action, to_value)
  values
    (v_snapshot.agency_id, v_snapshot.role_id, v_candidate_id, p_actor,
     'candidate', v_ref, 'created',
     jsonb_build_object('source', 'matched', 'source_detail', 'Applied through Tailr matching'));

  if v_suppressed then
    -- The person who once objected chose to apply. Allowed — their choice
    -- outranks their earlier objection for THIS role — and recorded, because
    -- the recruiter must be able to see the suppression was overridden by the
    -- person, not ignored by the machine.
    insert into agency.audit_log
      (agency_id, role_id, candidate_id, actor_id, entity_type, entity_ref, action, reason)
    values
      (v_snapshot.agency_id, v_snapshot.role_id, v_candidate_id, p_actor,
       'candidate', v_ref, 'suppression_overridden_by_application',
       'Identity is on the suppression list; the person themselves chose to apply.');
  end if;

  return jsonb_build_object(
    'candidate_id', v_candidate_id,
    'candidate_ref', v_ref,
    'rights_token', v_rights_token,
    'duplicate_of', v_duplicate_of,
    'suppression_overridden', v_suppressed
  );
end;
$$;

-- Service-role only. Neither the person nor any client session calls this
-- directly — the route recomputes the payload server-side and calls it.
revoke all on function public.apply_matched_recommendation(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_matched_recommendation(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
