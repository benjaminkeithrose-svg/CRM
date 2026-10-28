-- Field CRM, Step 8: AI tidy-up and Draft it (v95).
--
-- One row per user per day, counting requests to the ai-tidy function, so a
-- fault in the app (or a stolen sign-in) cannot run up the Anthropic bill.
-- Holds no note text: only who, which day, and how many.
--
-- Row-level security is on with no policies, so the app itself can neither
-- read nor write it. Only the ai-tidy function touches it, through ai_bump(),
-- which runs with the service role.

create table public.ai_usage (
  owner  uuid not null references auth.users (id) on delete cascade,
  day    date not null default current_date,
  n      integer not null default 0,
  primary key (owner, day)
);
alter table public.ai_usage enable row level security;

-- Adds one to today's count and returns the new count, atomically.
create or replace function public.ai_bump(p_owner uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (owner, day, n) values (p_owner, current_date, 1)
  on conflict (owner, day) do update set n = public.ai_usage.n + 1
  returning n;
$$;
revoke all on function public.ai_bump(uuid) from public, anon, authenticated;
grant execute on function public.ai_bump(uuid) to service_role;
