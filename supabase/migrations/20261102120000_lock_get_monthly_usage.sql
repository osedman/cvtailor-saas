-- Tailr — get_monthly_usage is server-only (2 Nov 2026).
--
-- From 001_initial.sql: a SECURITY DEFINER function that counts any user's
-- usage_logs rows for the month, callable by anyone with the public key
-- (anon included) and with no pinned search_path. So anyone could read any
-- user's monthly usage through /rest/v1/rpc/get_monthly_usage, and the
-- definer could be steered through search_path.
--
-- Nothing in the app calls it: usage moved to profiles.tailors_used and
-- increment_tailors_used long ago. It exists on production only (staging
-- never had it), where usage_logs is empty. Kept rather than dropped so
-- nothing that still names it breaks; only the server may call it now.
--
-- Idempotent: safe to re-run.

do $lock$
begin
  if to_regprocedure('public.get_monthly_usage(uuid)') is not null then
    alter function public.get_monthly_usage(uuid) set search_path = '';
    revoke execute on function public.get_monthly_usage(uuid) from public, anon, authenticated;
    grant execute on function public.get_monthly_usage(uuid) to service_role;
  end if;
end
$lock$;
