-- The client contact on a role, set at intake by the recruiter.
--
-- The brief is the recruiter's job description now (smooth-flow plan, Wave
-- 5a). Until this, the only tie between a role and a hiring-manager contact
-- was role_briefs.contact_id — which exists only when the client wrote the
-- brief. A recruiter-authored role had no contact at all: no client name on
-- the header, no way for the hiring manager's workspace to see it before a
-- submission or a round tied them. This column is that tie, nullable and
-- set-null so removing a contact never blocks anything; acceptBrief also
-- copies the brief's contact here so both paths converge.
--
-- Additive; run in tailr-staging first. Idempotent.

alter table agency.job_roles
  add column if not exists contact_id uuid references agency.client_contacts on delete set null;

create index if not exists job_roles_contact_idx
  on agency.job_roles (contact_id)
  where contact_id is not null;

comment on column agency.job_roles.contact_id is
  'The hiring-manager contact this role is for. Set at intake by the recruiter, or copied from the brief on accept.';
