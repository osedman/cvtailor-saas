-- Tailr for Agencies — rights links hashed and expiring (30 Oct 2026).
--
-- From the 30 Sep 2026 access audit. The rights link (/rights/<token>) was
-- the only doorway whose token was stored raw: agency.candidates.rights_token,
-- readable by every recruiter in the agency through row security, so anyone
-- with row access could open the candidate's own page and file erasure or
-- objection requests in their name. It also never expired.
--
-- Now, like consent, booking, reference, portal and hiring invites:
--   - each send mints a fresh link and stores only its sha256
--     (agency.rights_links); the raw value lives in the email alone;
--   - a link expires a year after minting, and the app also refuses it 30
--     days after the candidate's retention date (lib/agency/rights-link.ts);
--   - links die with the candidate row at purge (on delete cascade).
--
-- Existing links keep working: every current token is copied in as a hash.
-- The raw column is dropped by the follow-up migration
-- 20261030120100_drop_raw_rights_token.sql, run once the code that stops
-- reading it is deployed.
--
-- Idempotent: safe to re-run.

create table if not exists agency.rights_links (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency.agencies on delete cascade,
  candidate_id uuid not null references agency.candidates on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index if not exists rights_links_candidate_id_fk_idx on agency.rights_links (candidate_id);
create index if not exists rights_links_agency_id_fk_idx on agency.rights_links (agency_id);

-- Server only: no policies, no grant to signed-in users or anon.
alter table agency.rights_links enable row level security;
revoke all on agency.rights_links from public, anon, authenticated;
grant all on agency.rights_links to service_role;

-- Existing tokens become hashed links, so emails already sent keep working.
-- Guarded so a re-run after the raw column is dropped is a no-op.
do $backfill$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'agency' and table_name = 'candidates' and column_name = 'rights_token'
  ) then
    execute $q$
      insert into agency.rights_links (agency_id, candidate_id, token_hash, expires_at)
      select agency_id, id, encode(extensions.digest(rights_token, 'sha256'), 'hex'), now() + interval '365 days'
        from agency.candidates
       where rights_token is not null
      on conflict (token_hash) do nothing
    $q$;
    -- New candidates no longer get a raw token.
    alter table agency.candidates alter column rights_token drop default;
    alter table agency.candidates alter column rights_token drop not null;
  end if;
end
$backfill$;

-- The apply path mints its link the same way. Unchanged apart from the
-- token lines (was 20260816120000_apply_matched.sql).
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
  returning id into v_candidate_id;

  -- The rights link, raw once: only its hash is stored (30 Oct 2026). The
  -- raw value goes back to the route for the "you applied" screen and is
  -- never written anywhere.
  v_rights_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into agency.rights_links (agency_id, candidate_id, token_hash, expires_at)
  values (v_snapshot.agency_id, v_candidate_id,
          encode(extensions.digest(v_rights_token, 'sha256'), 'hex'),
          now() + interval '365 days');

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

revoke all on function public.apply_matched_recommendation(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_matched_recommendation(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb) to service_role;
