-- Add structured location fields to profiles and listings.
alter table public.kumprall_profiles
  add column if not exists region text not null default '',
  add column if not exists municipality text not null default '';
alter table public.kumprall_listings
  add column if not exists region text not null default '',
  add column if not exists municipality text not null default '';
create index if not exists kumprall_listings_region_municipality_idx
  on public.kumprall_listings (region, municipality);
