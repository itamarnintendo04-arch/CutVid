-- CutVid cloud schema. Applied automatically by the Supabase GitHub integration (or paste into the SQL Editor).

-- 1) Projects: one JSON document per project, private to its owner.
create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "projects are private to their owner" on public.projects;
create policy "projects are private to their owner" on public.projects
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2) Media: private bucket, each user may only touch files under a folder named by their user id.
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists "media select own" on storage.objects;
create policy "media select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media insert own" on storage.objects;
create policy "media insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media update own" on storage.objects;
create policy "media update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media delete own" on storage.objects;
create policy "media delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
