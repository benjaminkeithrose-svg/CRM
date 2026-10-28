-- Field CRM (v111, 2026-10-11): the sync trigger is only ever run by the
-- database itself. Supabase's security check flagged that it could also be
-- called through the API; it never needs to be. Applied to the live project.
revoke execute on function public.records_before_write() from public, anon, authenticated;
