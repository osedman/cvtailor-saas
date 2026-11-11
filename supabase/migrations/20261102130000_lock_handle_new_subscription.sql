-- Tailr — handle_new_subscription is a trigger, not an endpoint (2 Nov 2026).
--
-- From 001_initial.sql: the SECURITY DEFINER trigger on public.profiles that
-- gives each new profile its public.subscriptions row. It was also callable
-- as /rest/v1/rpc/handle_new_subscription by anyone with the public key, anon
-- included. Firing a trigger does not check EXECUTE, so revoking it closes
-- the endpoint and leaves sign-up untouched, the same fix
-- 20260930120000_harden_public.sql made for handle_new_user. The body names
-- its table in full, so the search_path is pinned to nothing.
--
-- Production only (staging never had it); does nothing where it is absent.
-- Idempotent: safe to re-run.

do $lock$
begin
  if to_regprocedure('public.handle_new_subscription()') is not null then
    alter function public.handle_new_subscription() set search_path = '';
    revoke execute on function public.handle_new_subscription() from public, anon, authenticated;
  end if;
end
$lock$;
