-- CV template preference. The user's pick becomes their default for every
-- future run, and stays changeable at any time from the results panel.
--
-- Stored as free text, not an enum, deliberately: template ids are a product
-- concern that will change more often than the schema should. Unknown or NULL
-- values fall back to the default template in lib/cv-templates (toTemplateId),
-- so a removed template can never break a user's results view.
-- Idempotent.

alter table public.profiles
  add column if not exists cv_template text;

comment on column public.profiles.cv_template is
  'Preferred CV template id (see lib/cv-templates.ts). NULL = app default.';
