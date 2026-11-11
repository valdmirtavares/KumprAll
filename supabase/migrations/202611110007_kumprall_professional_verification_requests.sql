-- Private professional verification applications. No identity data is exposed on public profiles.
create table if not exists public.kumprall_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 160),
  business_tax_id text not null check (char_length(business_tax_id) between 4 and 30),
  professional_email text not null check (char_length(professional_email) <= 254),
  professional_phone text not null check (char_length(professional_phone) between 6 and 40),
  website text check (website is null or char_length(website) <= 300),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists kumprall_verification_requests_user_created_idx
  on public.kumprall_verification_requests(user_id, created_at desc);
create unique index if not exists kumprall_one_pending_verification_per_user
  on public.kumprall_verification_requests(user_id) where status = 'pending';
alter table public.kumprall_verification_requests enable row level security;
drop policy if exists "Users can submit own professional verification" on public.kumprall_verification_requests;
create policy "Users can submit own professional verification"
  on public.kumprall_verification_requests for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users can read own professional verification" on public.kumprall_verification_requests;
create policy "Users can read own professional verification"
  on public.kumprall_verification_requests for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.kumprall_verification_requests from anon;
grant select, insert on public.kumprall_verification_requests to authenticated;
