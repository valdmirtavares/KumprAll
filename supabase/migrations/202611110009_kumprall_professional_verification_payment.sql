-- KUMPRALL: certification becomes active only after a confirmed Stripe payment.
alter table public.kumprall_verification_requests
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','checkout_pending','paid','past_due','cancelled')),
  add column if not exists certification_paid_until timestamptz;

create unique index if not exists kumprall_verification_checkout_session_uidx
  on public.kumprall_verification_requests(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Approval authorizes payment; it must NOT activate the public verification badge.
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
  select * into v_request from public.kumprall_verification_requests
    where id = p_request_id for update;
  if not found then raise exception 'Candidatura não encontrada.'; end if;
  if v_request.status <> 'pending' then raise exception 'Esta candidatura já foi analisada.'; end if;

  update public.kumprall_verification_requests
    set status=p_decision, admin_notes=left(p_admin_notes,2000), reviewed_at=now()
    where id=p_request_id;

  if p_decision='approved' then
    update public.kumprall_profiles
      set verification_status='pending', verified_at=null, verification_expires_at=null
      where user_id=v_request.user_id;
  else
    update public.kumprall_profiles
      set verification_status='rejected', verified_at=null, verification_expires_at=null
      where user_id=v_request.user_id;
  end if;
  return jsonb_build_object('success',true,'decision',p_decision);
end;
$$;
