-- KUMPRALL marketplace: listings owned by authenticated users.
-- Apply this migration in the Supabase SQL Editor before enabling database-backed listings.

create table if not exists public.kumprall_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 90),
  description text not null default '' check (char_length(description) <= 2000),
  price numeric(12,2) not null check (price >= 0),
  category text not null,
  location text not null,
  image_url text,
  status text not null default 'active' check (status in ('active', 'sold', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kumprall_listings_status_created_idx
  on public.kumprall_listings (status, created_at desc);
create index if not exists kumprall_listings_category_idx
  on public.kumprall_listings (category);
create index if not exists kumprall_listings_owner_idx
  on public.kumprall_listings (owner_id);

alter table public.kumprall_listings enable row level security;

drop policy if exists "Public can read active listings" on public.kumprall_listings;
create policy "Public can read active listings"
  on public.kumprall_listings for select
  using (status = 'active' or auth.uid() = owner_id);

drop policy if exists "Users can create their own listings" on public.kumprall_listings;
create policy "Users can create their own listings"
  on public.kumprall_listings for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Users can update their own listings" on public.kumprall_listings;
create policy "Users can update their own listings"
  on public.kumprall_listings for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Users can delete their own listings" on public.kumprall_listings;
create policy "Users can delete their own listings"
  on public.kumprall_listings for delete
  to authenticated
  using (auth.uid() = owner_id);

create or replace function public.kumprall_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kumprall_listings_updated_at on public.kumprall_listings;
create trigger kumprall_listings_updated_at
before update on public.kumprall_listings
for each row execute function public.kumprall_set_updated_at();

grant select on public.kumprall_listings to anon, authenticated;
grant insert, update, delete on public.kumprall_listings to authenticated;
