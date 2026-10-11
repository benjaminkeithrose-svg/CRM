-- Field CRM, Step 9: opportunities are shared with the team (v115).
--
-- Each opportunity, with its relationship map, is one record in the 'opps'
-- store. Like account plans, the whole team reads and edits them; only the
-- author (or the admin) deletes one - the trigger from 0004 already skips
-- anyone else's delete. A user's own rows were always theirs under 0001.
--
-- Additive: three more rules beside the 0004 ones. Nothing dropped.

create policy "records: read opps" on public.records
  for select to authenticated
  using (store = 'opps' and team_id is not null and team_id = public.my_team());

create policy "records: add opps" on public.records
  for insert to authenticated
  with check (store = 'opps' and public.in_my_team(owner::text));

create policy "records: change opps" on public.records
  for update to authenticated
  using (store = 'opps' and team_id = public.my_team())
  with check (store = 'opps' and public.in_my_team(owner::text));
