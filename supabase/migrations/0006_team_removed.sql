-- Field CRM, Step 9: taking someone out of the team (v113).
--
-- The admin adds and removes colleagues in the app, through the team-admin
-- edge function. Removing someone must not take their work with them: the
-- team keeps reading the call reports, visits and photos they wrote. So the
-- membership row stays, marked removed, and the function bans their sign-in.
--
--   my_team()     a removed person has no team: they see only their own rows,
--                 and not the team's vault (so not the team key) - even in the
--                 hour an already-issued sign-in token still works.
--   in_my_team()  unchanged: still true for a removed person's folder, so the
--                 team keeps their photos.
--   the trigger   unchanged: a row a teammate edits keeps its author's team.
--
-- Additive: one new column, one function body replaced. Nothing dropped.

alter table public.team_members add column removed_at timestamptz;

create or replace function public.my_team()
returns uuid language sql stable security definer set search_path = ''
as $$ select team_id from public.team_members where user_id = (select auth.uid()) and removed_at is null $$;
