-- KUMPRALL verification status. Personal identity documents must never be stored in public profile fields.
alter table public.kumprall_profiles
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected','expired')),
  add column if not exists verified_at timestamptz,
  add column if not exists verification_expires_at timestamptz;

-- Only trusted server-side operations using the service role may change verification fields.
create or replace function public.kumprall_profiles_protect_verification()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.verification_status := 'unverified';
      new.verified_at := null;
      new.verification_expires_at := null;
    else
      new.verification_status := old.verification_status;
      new.verified_at := old.verified_at;
      new.verification_expires_at := old.verification_expires_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists kumprall_profiles_protect_verification on public.kumprall_profiles;
create trigger kumprall_profiles_protect_verification
before insert or update on public.kumprall_profiles
for each row execute function public.kumprall_profiles_protect_verification();
