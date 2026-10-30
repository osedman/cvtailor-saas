-- Tailr for Agencies — drop the raw rights token (30 Oct 2026).
--
-- Second half of 20261030120000_rights_links_hashed.sql. Run AFTER the code
-- that reads agency.rights_links instead is deployed: until then the old
-- code still selects this column. Every value was copied into rights_links
-- as a hash by the first half, so nothing is lost.
--
-- Idempotent: safe to re-run.

drop index if exists agency.candidates_rights_token_idx;
alter table agency.candidates drop column if exists rights_token;
