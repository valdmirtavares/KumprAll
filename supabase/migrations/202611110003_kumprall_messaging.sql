-- KUMPRALL: conversas privadas entre comprador e vendedor
create table if not exists public.kumprall_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.kumprall_listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kumprall_conversations_not_self check (buyer_id <> seller_id),
  constraint kumprall_conversations_unique unique (listing_id,buyer_id,seller_id)
);
create table if not exists public.kumprall_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kumprall_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists kumprall_conversations_buyer_idx on public.kumprall_conversations(buyer_id,updated_at desc);
create index if not exists kumprall_conversations_seller_idx on public.kumprall_conversations(seller_id,updated_at desc);
create index if not exists kumprall_messages_conversation_idx on public.kumprall_messages(conversation_id,created_at);
alter table public.kumprall_conversations enable row level security;
alter table public.kumprall_messages enable row level security;
drop policy if exists "Participants can read conversations" on public.kumprall_conversations;
create policy "Participants can read conversations" on public.kumprall_conversations for select to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id);
drop policy if exists "Buyers can start conversations for active listings" on public.kumprall_conversations;
create policy "Buyers can start conversations for active listings" on public.kumprall_conversations for insert to authenticated
with check (
  auth.uid() = buyer_id and buyer_id <> seller_id
  and exists (select 1 from public.kumprall_listings l where l.id = listing_id and l.owner_id = seller_id and l.status = 'active')
);
drop policy if exists "Participants can read messages" on public.kumprall_messages;
create policy "Participants can read messages" on public.kumprall_messages for select to authenticated
using (exists (select 1 from public.kumprall_conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
drop policy if exists "Participants can send messages" on public.kumprall_messages;
create policy "Participants can send messages" on public.kumprall_messages for insert to authenticated
with check (auth.uid() = sender_id and exists (select 1 from public.kumprall_conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
grant select, insert on public.kumprall_conversations to authenticated;
grant select, insert on public.kumprall_messages to authenticated;
