-- Custom presets (keyframe curves, filters, effects) saved to a user's account, and app feedback.

create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('curve', 'filter', 'effect')),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists presets_user_idx on public.presets (user_id, created_at desc);

alter table public.presets enable row level security;

create policy "presets are private to their owner" on public.presets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Feedback: write-only for the public. Nobody can read it through the API; view it in the dashboard.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  email text check (email is null or char_length(email) <= 200),
  rating smallint check (rating is null or rating between 1 and 5),
  message text not null check (char_length(message) between 1 and 4000),
  platform text check (platform is null or char_length(platform) <= 40),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "anyone can send feedback" on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
