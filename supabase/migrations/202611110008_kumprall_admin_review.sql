-- KUMPRALL: private administrator access and secure professional verification review.
-- No public/admin self-registration. The first administrator must be inserted manually by the project owner.
create table if not exists public.kumprall_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.kumprall_admins enable row level security;
revoke all on public.kumprall_admins from anon, authenticated;

create or replace function public.kumprall_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.kumprall_admins a where a.user_id = auth.uid()
  );
$$;
revoke all on function public.kumprall_is_admin() from public;
grant execute on function public.kumprall_is_admin() to authenticated;

drop policy if exists "Admins can read all professional verification requests" on public.kumprall_verification_requests;
create policy "Admins can read all professional verification requests"
  on public.kumprall_verification_requests for select to authenticated
  using (public.kumprall_is_admin());

-- Allow only the privileged SECURITY DEFINER review RPC to update protected profile fields.
create or replace function public.kumprall_profiles_protect_verification()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('postgres','service_role') and coalesce(auth.role(), '') <> 'service_role' then
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

create or replace function public.kumprall_review_verification_request(
  p_request_id uuid,
  p_decision text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.kumprall_verification_requests%rowtype;
begin
  if not public.kumprall_is_admin() then
    raise exception 'Acesso reservado à administração KUMPRALL.';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decisão inválida.';
  end if;

  select * into v_request
  from public.kumprall_verification_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Candidatura não encontrada.'; end if;
  if v_request.status <> 'pending' then raise exception 'Esta candidatura já foi analisada.'; end if;

  update public.kumprall_verification_requests
  set status = p_decision,
      admin_notes = left(p_admin_notes, 2000),
      reviewed_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    update public.kumprall_profiles
    set verification_status = 'verified',
        verified_at = now(),
        verification_expires_at = now() + interval '1 year'
    where user_id = v_request.user_id;
  else
    update public.kumprall_profiles
    set verification_status = 'rejected',
        verified_at = null,
        verification_expires_at = null
    where user_id = v_request.user_id;
  end if;

  return jsonb_build_object('success', true, 'decision', p_decision);
end;
$$;
revoke all on function public.kumprall_review_verification_request(uuid,text,text) from public;
grant execute on function public.kumprall_review_verification_request(uuid,text,text) to authenticated;
