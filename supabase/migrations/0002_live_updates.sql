-- Field CRM, Step 6: live updates (v92).
--
-- Adds the records table to Supabase Realtime's publication, so a signed-in
-- device is told within a second or two when one of its records changes and
-- runs its normal sync. Realtime applies the same row-level security as a
-- query: the "own records" policy means a device only ever hears about its
-- own rows. The rows are still the encrypted envelopes; the app does not use
-- the payload, only the fact that something changed.

alter publication supabase_realtime add table public.records;
