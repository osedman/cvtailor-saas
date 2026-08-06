-- Tailr for Agencies — migration 9: candidate rights capability token.
--
-- The Art 14 notice tells a candidate they can see, correct, delete or object
-- to the data an agency holds. This is the link that lets them do it: a
-- per candidate capability token carried in the notice email.
--
-- Stored raw rather than hashed (unlike portal tokens) because the candidate
-- keeps the email and may return months later, so the link must stay
-- resolvable. It is a capability over that person's OWN data only, it is
-- readable by agency members who are already the controller, and it dies with
-- the candidate row at purge.
--
-- The public page never deletes anything directly: it files a PENDING request
-- for the agency to action, so a forwarded link cannot erase someone's record.
--
-- Idempotent: safe to re-run against staging and production.

alter table agency.candidates
  add column if not exists rights_token text not null
    default encode(gen_random_bytes(24), 'hex');

create unique index if not exists candidates_rights_token_idx
  on agency.candidates (rights_token);
