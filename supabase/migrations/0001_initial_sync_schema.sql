-- Field CRM - cloud sync schema (BACKEND-PLAN.md, Step 1)
--
-- Everything the app stores here is encrypted on the device before it is sent
-- (AES-GCM, Web Crypto). The server only ever sees ciphertext, plus the few
-- plain fields it needs to sync: who owns a row, which store it belongs to,
-- its ID, when it was last edited, and whether it was deleted.
--
-- This file holds no data and no secrets, so it is safe in a public repo.
-- Applied to the "Field CRM" project (Sydney) through the Supabase connector.

-- ---------------------------------------------------------------------------
-- vaults: one per user. Holds the user's data key, locked with a key derived
-- from their passphrase. Envelope encryption: the passphrase can change, and a
-- colleague can be given the key later, without re-encrypting every record.
-- ---------------------------------------------------------------------------
create table public.vaults (
  owner        uuid primary key default auth.uid()
               references auth.users (id) on delete cascade,
  team_id      uuid,                          -- unused until colleagues join (Step 9)
  key_id       text not null,                 -- which data key; changes on rotation
  kdf          jsonb not null,                -- e.g. {"alg":"PBKDF2","hash":"SHA-256","iterations":600000,"salt":"..."}
  wrapped_key  text not null,                 -- base64: the data key, AES-GCM encrypted with the passphrase key
  wrap_iv      text not null,                 -- base64
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- records: every synced thing, one encrypted row each.
--   store = 'calls' | 'appts' | 'datasets' (and later 'tasks', 'emails', ...)
--   Named "store", not "kind": CLAUDE.md reserves "kind" in the sync payload,
--   and quote requests are marked inside the encrypted body (rectype), never here.
--   For store = 'datasets', id is the dataset name: 'accounts', 'beltref',
--   'assets', 'overrides', 'mgrOf', 'weeks', 'meta'.
-- ---------------------------------------------------------------------------
create table public.records (
  owner           uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  store           text not null check (store ~ '^[a-z][a-zA-Z]{1,30}$'),
  id              text not null check (length(id) between 1 and 200),
  team_id         uuid,                       -- unused until colleagues join (Step 9)
  key_id          text not null,
  iv              text not null,              -- base64
  body            text not null,              -- base64 AES-GCM ciphertext of the record as JSON
  client_updated  bigint not null,            -- the app's own "updated" time (ms); newest edit wins
  deleted         boolean not null default false,
  server_updated  timestamptz not null default now(),  -- set by the server; "what's new since" cursor
  primary key (owner, store, id)
);

create index records_owner_server_updated on public.records (owner, server_updated);

-- ---------------------------------------------------------------------------
-- Newest edit wins, enforced by the server so a device that comes back online
-- with an older copy can never overwrite a newer one. An update carrying an
-- older client_updated is silently skipped. The owner can never be changed.
-- server_updated is always the server's clock, never a device's.
-- ---------------------------------------------------------------------------
create function public.records_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.client_updated < old.client_updated then
      return null;                            -- keep the newer copy already here
    end if;
    new.owner := old.owner;
  end if;
  new.server_updated := now();
  return new;
end;
$$;

create trigger records_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

create function public.vaults_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner := old.owner;
  new.updated_at := now();
  return new;
end;
$$;

create trigger vaults_before_update
  before update on public.vaults
  for each row execute function public.vaults_before_update();

-- ---------------------------------------------------------------------------
-- Access rules: a signed-in user can read and write only their own rows.
-- Nobody who isn't signed in can touch anything.
-- ---------------------------------------------------------------------------
alter table public.vaults  enable row level security;
alter table public.records enable row level security;

revoke all on public.vaults  from anon;
revoke all on public.records from anon;

create policy "own vault" on public.vaults
  for all to authenticated
  using      (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

create policy "own records" on public.records
  for all to authenticated
  using      (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Photos: a private bucket. Each user's photos live under a folder named with
-- their user ID, e.g. <user-id>/<call-id>/<photo-id>. Files are encrypted on the
-- device, so they are stored as plain bytes, not images.
-- 5 MB per file is far above a 1400px photo (roughly 200-350 KB).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['application/octet-stream']);

create policy "own photos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own photos: add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own photos: replace" on storage.objects
  for update to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
