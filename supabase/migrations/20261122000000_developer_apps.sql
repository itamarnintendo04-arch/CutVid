-- Applications from developers who want "Sign in with CutVid" (OAuth) for their apps.
-- Only the developer-apps Edge Function (service role) reads or writes this table.
create table if not exists public.developer_apps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  website text,
  description text not null check (char_length(description) between 10 and 2000),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  contact_email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  oauth_client_id text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists developer_apps_email_idx on public.developer_apps (lower(contact_email));
alter table public.developer_apps enable row level security;
-- No policies on purpose: visitors and signed-in users cannot read or write it directly.
