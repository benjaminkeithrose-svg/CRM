-- Field CRM, Step 9: colleagues (v111).
--
-- Ben's team of 4 to 10 shares one set of data (his answers, 2026-10-11):
--   shared, readable and editable by the team: call reports and quote requests
--     ('calls'), visits ('appts'), account plans, not-stocked products, saved notes;
--   shared, readable by the team, written by the admin only: the CRM export,
--     the belt catalogue, the plant audit register, zone overrides and
--     reassignments ('datasets' other than 'weeks');
--   private to each person: tasks, and their own planning weeks.
-- Only the author (or the admin) can delete a report; anyone in the team can
-- change one. Everything stays encrypted on the device: the team shares one
-- data key, locked with a team passphrase in the admin's vault, which members
-- may read. A user with no team works exactly as before (their own rows only).
--
-- A team is a named group, not "everyone in the project", so a throwaway test
-- account can sit in a test team and never see the real data.
-- Members are added by the admin (Supabase dashboard, or SQL); there is no
-- sign-up and no self-join. This file holds no data and no secrets.
--
-- Nothing is dropped: the "own records", "own vault" and "own photos" rules of
-- migration 0001 stay, and the team rules below sit beside them. Postgres
-- allows a row if any one rule allows it, so the effect is the same as
-- replacing them, and the change needed no destructive step to apply.

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  admin       uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table public.team_members (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  team_id   uuid not null references public.teams (id) on delete cascade,
  name      text not null default '',
  role      text not null default 'member' check (role in ('admin', 'member')),
  added_at  timestamptz not null default now()
);
create index team_members_team on public.team_members (team_id);
create index records_team_server_updated on public.records (team_id, server_updated);

alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
revoke all on public.teams        from anon;
revoke all on public.team_members from anon;

-- ---------------------------------------------------------------------------
-- Helpers. security definer so the access rules can look up membership without
-- tripping over the access rules on team_members itself.
-- ---------------------------------------------------------------------------
create function public.my_team()
returns uuid language sql stable security definer set search_path = ''
as $$ select team_id from public.team_members where user_id = (select auth.uid()) $$;

create function public.team_admin()
returns uuid language sql stable security definer set search_path = ''
as $$ select t.admin from public.teams t where t.id = public.my_team() $$;

-- is this user (given as text, as a storage folder name is) in my team?
create function public.in_my_team(u text)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.team_members m
                     where m.user_id::text = u and m.team_id = public.my_team()) $$;

revoke all on function public.my_team()          from public, anon;
revoke all on function public.team_admin()       from public, anon;
revoke all on function public.in_my_team(text)   from public, anon;
grant execute on function public.my_team()        to authenticated;
grant execute on function public.team_admin()     to authenticated;
grant execute on function public.in_my_team(text) to authenticated;

create policy "my team" on public.teams
  for select to authenticated using (id = public.my_team());
create policy "my team's members" on public.team_members
  for select to authenticated using (team_id = public.my_team());

-- ---------------------------------------------------------------------------
-- records: who can read and write what.
-- ---------------------------------------------------------------------------
create policy "records: read" on public.records
  for select to authenticated
  using (
    owner = (select auth.uid())
    or (team_id is not null and team_id = public.my_team() and (
          store in ('calls', 'appts', 'plans', 'products', 'snippets')
          or (store = 'datasets' and id <> 'weeks' and owner = public.team_admin())))
  );

-- the shared reference data is the admin's to write; a member keeps only their own weeks
create policy "records: add" on public.records
  for insert to authenticated
  with check (
    (owner = (select auth.uid()) and (store <> 'datasets' or id = 'weeks'
       or public.my_team() is null or public.team_admin() = (select auth.uid())))
    or (store in ('calls', 'appts', 'plans', 'products', 'snippets') and public.in_my_team(owner::text))
  );

create policy "records: change" on public.records
  for update to authenticated
  using (
    owner = (select auth.uid())
    or (store in ('calls', 'appts', 'plans', 'products', 'snippets') and team_id = public.my_team())
  )
  with check (
    (owner = (select auth.uid()) and (store <> 'datasets' or id = 'weeks'
       or public.my_team() is null or public.team_admin() = (select auth.uid())))
    or (store in ('calls', 'appts', 'plans', 'products', 'snippets') and public.in_my_team(owner::text))
  );

create policy "records: remove" on public.records
  for delete to authenticated using (owner = (select auth.uid()));

-- Newest edit wins, as before; plus the team. A row takes its owner's team.
-- A teammate may change a shared row but not delete it - only its author or
-- the admin can; anyone else's delete is skipped, and the row comes back to
-- them on their next sync.
create or replace function public.records_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.client_updated < old.client_updated then
      return null;                            -- keep the newer copy already here
    end if;
    if new.deleted and not old.deleted and old.owner <> (select auth.uid())
       and (select t.admin from public.teams t where t.id = old.team_id) is distinct from (select auth.uid()) then
      return null;                            -- not theirs to delete
    end if;
    new.owner := old.owner;
  end if;
  new.team_id := (select m.team_id from public.team_members m where m.user_id = new.owner);
  new.server_updated := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- vaults: members read the admin's, which holds the team key locked with the
-- team passphrase. Each person still writes only their own.
-- ---------------------------------------------------------------------------
create policy "team vault: read" on public.vaults
  for select to authenticated using (owner = public.team_admin());

-- ---------------------------------------------------------------------------
-- photos: a teammate's call carries its photos in its author's folder, so the
-- team reads and writes each other's folders. Users with no team: own folder only.
-- ---------------------------------------------------------------------------
create policy "team photos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.in_my_team((storage.foldername(name))[1])));

create policy "team photos: add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.in_my_team((storage.foldername(name))[1])));

create policy "team photos: replace" on storage.objects
  for update to authenticated
  using      (bucket_id = 'photos' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.in_my_team((storage.foldername(name))[1])))
  with check (bucket_id = 'photos' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.in_my_team((storage.foldername(name))[1])));

create policy "team photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.in_my_team((storage.foldername(name))[1])));
