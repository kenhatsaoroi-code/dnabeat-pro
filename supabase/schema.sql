-- =====================================================================
-- DNAbeat.pro — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PROFILES: one row per auth user, holds plan + premium flag
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  full_name       text,
  avatar_url      text,
  is_premium      boolean      not null default false,
  plan            text         not null default 'free',     -- 'free' | 'premium'
  paypal_sub_id   text,                                      -- PayPal subscription id
  premium_until   timestamptz,                               -- optional expiry
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);

-- ---------------------------------------------------------------------
-- 2) USAGE: one row per user per UTC day, counts analyze calls
-- ---------------------------------------------------------------------
create table if not exists public.usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null default (now() at time zone 'utc')::date,
  count       integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists usage_user_day_idx on public.usage (user_id, day);

-- ---------------------------------------------------------------------
-- 3) Auto-create a profile row when a new auth user signs up
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4) keep updated_at fresh
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 5) Row Level Security
--    Users can read their own profile + usage.
--    All WRITES happen via the service-role key inside /api/* (bypasses RLS),
--    so we do NOT grant client-side write access.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.usage    enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "read own usage" on public.usage;
create policy "read own usage" on public.usage
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 6) Helper RPC: atomically increment today's usage and return new count.
--    Called by /api/analyze via service role.
-- ---------------------------------------------------------------------
create or replace function public.increment_usage(p_user uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.usage (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
  do update set count = public.usage.count + 1, updated_at = now()
  returning count into v_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Storage bucket for Tab 4 (Timing Lyrics).
--    Client uploads the audio here (private), /api/timing downloads it
--    with the service role, runs Whisper+Gemini, then deletes it.
--    Files live under "<auth.uid()>/..." so each user only touches own.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('audio', 'audio', false, 26214400)            -- 25 MB cap (Whisper limit)
on conflict (id) do nothing;

-- Authenticated users may upload / read / delete ONLY inside their own folder.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'audio_insert_own') then
    create policy "audio_insert_own" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'audio_select_own') then
    create policy "audio_select_own" on storage.objects
      for select to authenticated
      using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'audio_delete_own') then
    create policy "audio_delete_own" on storage.objects
      for delete to authenticated
      using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
