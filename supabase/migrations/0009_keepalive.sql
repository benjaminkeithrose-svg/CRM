-- Field CRM (2026-10-31): a free Supabase project is paused after a week with
-- no activity. A scheduled GitHub job (.github/workflows/supabase-keepalive.yml)
-- calls this twice a week with the publishable key, so the database answers a
-- real query. It reads no table and returns only the server's time.
-- Applied to the live project.
create or replace function public.keepalive()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
