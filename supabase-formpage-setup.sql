-- ============================================================
-- Setup for the mini-program suggestion form (/#/formPage)
-- Run this ONCE in Supabase → SQL Editor → New query → Run
-- Project: epdnvsarvkucabnntbws
-- ============================================================

-- 1) Table that stores the submitted answers -----------------
create table if not exists public.miniprogram_suggestions (
  id             bigint generated always as identity primary key,
  name           text        not null,
  department     text        not null,
  emp_num        text        not null,
  suggested_name text        not null,
  avatar_url     text,
  created_at     timestamptz not null default now()
);

alter table public.miniprogram_suggestions enable row level security;

-- The app uses the public anon key, so anon must be allowed to INSERT.
drop policy if exists "anon can submit suggestions" on public.miniprogram_suggestions;
create policy "anon can submit suggestions"
  on public.miniprogram_suggestions
  for insert
  to anon
  with check (true);

-- Reading: required by the admin responses page (/#/formResponses).
--
-- ⚠️ READ THIS BEFORE RUNNING:
-- The app ships the public "anon" key in its JavaScript bundle, so granting
-- SELECT to anon makes every submission readable by anyone who inspects the
-- site — the 📋 查看提交 button only HIDES the page, it does not protect the data.
-- This is the same posture the existing "scores" table already uses.
--
-- If that is acceptable (internal tool, non-sensitive answers), keep this policy.
-- If it is NOT, delete this policy and read submissions in the Supabase
-- Table Editor instead; the responses page will then simply show no rows.
drop policy if exists "anon can read suggestions" on public.miniprogram_suggestions;
create policy "anon can read suggestions"
  on public.miniprogram_suggestions
  for select
  to anon
  using (true);


-- 2) Storage bucket for the uploaded avatars -----------------
insert into storage.buckets (id, name, public)
values ('miniprogram-avatars', 'miniprogram-avatars', true)
on conflict (id) do nothing;

-- anon may upload into that bucket...
drop policy if exists "anon can upload avatars" on storage.objects;
create policy "anon can upload avatars"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'miniprogram-avatars');

-- ...and the stored images must be publicly readable so avatar_url works.
drop policy if exists "public can read avatars" on storage.objects;
create policy "public can read avatars"
  on storage.objects
  for select
  to public
  using (bucket_id = 'miniprogram-avatars');


-- ============================================================
-- To review submissions later:
--   select name, department, emp_num, suggested_name, avatar_url, created_at
--   from public.miniprogram_suggestions
--   order by created_at desc;
-- ============================================================
