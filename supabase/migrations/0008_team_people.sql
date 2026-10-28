-- Field CRM, Step 10: contacts added on Blue Sheet maps are shared with the team (v125).
--
-- Someone typed onto a map under one of the team's customers, who is not in
-- the Dynamics export yet, is one record in the 'people' store. The whole
-- team reads them, so the name is on everyone's contact list and on the
-- Not in Dynamics yet list; only the author (or the admin) deletes one - the
-- trigger from 0004 already skips anyone else's delete. A user's own rows
-- were always theirs under 0001.
--
-- Additive: three more rules beside the 0004 and 0007 ones. Nothing dropped.

create policy "records: read people" on public.records
  for select to authenticated
  using (store = 'people' and team_id is not null and team_id = public.my_team());

create policy "records: add people" on public.records
  for insert to authenticated
  with check (store = 'people' and public.in_my_team(owner::text));

create policy "records: change people" on public.records
  for update to authenticated
  using (store = 'people' and team_id = public.my_team())
  with check (store = 'people' and public.in_my_team(owner::text));
