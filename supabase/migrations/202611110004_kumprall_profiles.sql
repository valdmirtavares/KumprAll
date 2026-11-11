-- KUMPRALL user profiles. Public profile fields only; email remains private in Supabase Auth.
create table if not exists public.kumprall_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  location text not null default '' check (char_length(location) <= 100),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kumprall_profiles enable row level security;
drop policy if exists "Public can view profiles" on public.kumprall_profiles;
create policy "Public can view profiles" on public.kumprall_profiles for select using (true);
drop policy if exists "Users can create own profile" on public.kumprall_profiles;
create policy "Users can create own profile" on public.kumprall_profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own profile" on public.kumprall_profiles;
create policy "Users can update own profile" on public.kumprall_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select on public.kumprall_profiles to anon, authenticated;
grant insert, update on public.kumprall_profiles to authenticated;
create or replace function public.kumprall_profiles_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists kumprall_profiles_updated_at on public.kumprall_profiles;
create trigger kumprall_profiles_updated_at before update on public.kumprall_profiles
for each row execute function public.kumprall_profiles_set_updated_at();
