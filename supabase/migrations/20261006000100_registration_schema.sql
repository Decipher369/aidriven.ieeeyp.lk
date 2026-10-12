-- PHASE 1 DRAFT: review before applying to a linked/production Supabase project.
-- PostgreSQL 15+ (NULLS NOT DISTINCT). API access stays denied until Phase 2.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.merch_size as enum ('XS', 'S', 'M', 'L', 'XL', 'XXL');
create type public.order_status as enum ('pending', 'confirmed', 'rejected', 'cancelled');
create type public.submission_decision as enum ('pending', 'approved', 'rejected');
create type public.ticket_status as enum ('reserved', 'issued', 'used', 'void');
create type public.email_status as enum ('queued', 'sent', 'failed');
create type public.actor_role as enum ('admin', 'delegate', 'system');

create sequence public.delegate_number_seq;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  delegate_id text unique not null default
    ('DEL-' || lpad(nextval('public.delegate_number_seq')::text, 4, '0')),
  full_name text not null check (length(btrim(full_name)) > 0),
  email text unique not null check (length(btrim(email)) > 0),
  phone text not null default '',
  institution text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint delegate_id_format check (delegate_id ~ '^DEL-[0-9]{4,}$')
);
-- Keep sequence values longer than four digits intact; lpad would truncate them.
create function public.next_delegate_id() returns text
language sql volatile set search_path = '' as $$
  select 'DEL-' || case when length(n::text) < 4 then lpad(n::text, 4, '0')
    else n::text end from (select nextval('public.delegate_number_seq') as n) s;
$$;
alter table public.profiles alter column delegate_id set default public.next_delegate_id();
create unique index profiles_email_lower_key on public.profiles (lower(email));
create index profiles_created_at_idx on public.profiles(created_at);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  created_at timestamptz not null default now()
);
-- Organizer decision: exactly one possible admin account (zero until provisioned).
create unique index admins_single_account_key on public.admins ((true));

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (length(btrim(name)) > 0),
  price numeric(10,2) not null check (price >= 0 and price <= 99999999.99),
  capacity integer not null check (capacity > 0),
  requires_membership boolean not null default false,
  active boolean not null default false
);
create table public.merch_items (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (length(btrim(name)) > 0),
  price numeric(10,2) not null check (price >= 0 and price <= 99999999.99),
  has_sizes boolean not null,
  active boolean not null default false
);
create table public.merch_variants (
  id uuid primary key default gen_random_uuid(),
  merch_item_id uuid not null references public.merch_items(id) on delete restrict,
  size public.merch_size,
  active boolean not null default false,
  unique nulls not distinct (merch_item_id, size)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  delegate_id uuid not null references public.profiles(id) on delete restrict,
  status public.order_status not null default 'pending',
  membership_number text check (membership_number is null or length(btrim(membership_number)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.admins(user_id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancel_reason text,
  check (status <> 'confirmed' or (confirmed_at is not null and confirmed_by is not null)),
  check (status <> 'cancelled' or
    (cancelled_at is not null and length(btrim(coalesce(cancel_reason, ''))) > 0))
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  ticket_type_id uuid references public.ticket_types(id) on delete restrict,
  merch_variant_id uuid references public.merch_variants(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 5),
  unit_price numeric(10,2) not null check (unit_price >= 0 and unit_price <= 99999999.99),
  check (num_nonnulls(ticket_type_id, merch_variant_id) = 1),
  check (ticket_type_id is null or quantity = 1)
);
create unique index order_items_one_ticket_per_order on public.order_items(order_id)
  where ticket_type_id is not null;
create view public.order_totals with (security_invoker = true) as
  select order_id, sum(quantity * unit_price) as total
  from public.order_items group by order_id;

-- One immutable review history entry per receipt package. Additional receipts
-- join the pending attempt; rejected packages are never reopened or overwritten.
create table public.payment_review_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  membership_number text,
  membership_verified boolean,
  decision public.submission_decision not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.admins(user_id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, order_id),
  unique (order_id, attempt_number),
  check (membership_number is null or length(btrim(membership_number)) > 0),
  check (decision <> 'rejected' or
    (length(btrim(coalesce(rejection_reason, ''))) >= 5 and reviewed_by is not null and reviewed_at is not null)),
  check (decision <> 'approved' or (reviewed_by is not null and reviewed_at is not null)),
  check (decision <> 'pending' or
    (reviewed_by is null and reviewed_at is null and rejection_reason is null and membership_verified is null))
);
create unique index review_attempts_one_pending_per_order on public.payment_review_attempts(order_id)
  where decision = 'pending';
create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  review_attempt_id uuid not null,
  receipt_path text unique not null,
  submitted_at timestamptz not null default now(),
  decision public.submission_decision not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.admins(user_id) on delete restrict,
  reviewed_at timestamptz,
  foreign key (review_attempt_id, order_id)
    references public.payment_review_attempts(id, order_id) on delete restrict,
  check (decision <> 'rejected' or
    (length(btrim(coalesce(rejection_reason, ''))) >= 5 and reviewed_by is not null and reviewed_at is not null)),
  check (decision <> 'approved' or (reviewed_by is not null and reviewed_at is not null)),
  check (decision <> 'pending' or (reviewed_by is null and reviewed_at is null and rejection_reason is null))
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid unique not null references public.order_items(id) on delete restrict,
  delegate_id uuid not null references public.profiles(id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  status public.ticket_status not null default 'reserved',
  qr_token text unique,
  issued_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references public.admins(user_id) on delete restrict,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  check (status not in ('issued', 'used') or (qr_token is not null and issued_at is not null)),
  check (qr_token is null or qr_token ~ '^[0-9a-f]{48}$'),
  check (status <> 'reserved' or (qr_token is null and issued_at is null)),
  check (status <> 'used' or (checked_in_at is not null and checked_in_by is not null)),
  check (status <> 'void' or
    (voided_at is not null and length(btrim(coalesce(void_reason, ''))) > 0))
);
create unique index tickets_one_active_per_delegate on public.tickets(delegate_id) where status <> 'void';

create table public.event_info (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) > 0),
  body text not null,
  published boolean not null default false,
  updated_by uuid references public.admins(user_id) on delete restrict,
  updated_at timestamptz not null default now()
);
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  delegate_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  template text not null,
  dedupe_key text unique not null check (length(btrim(dedupe_key)) > 0),
  status public.email_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (status <> 'sent' or sent_at is not null)
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete restrict,
  actor_role public.actor_role not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  order_id uuid references public.orders(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((actor_role = 'system' and actor_id is null) or (actor_role <> 'system' and actor_id is not null))
);

-- Every foreign key has an index; unique keys already index their FK prefixes.
create index orders_delegate_idx on public.orders(delegate_id);
create index orders_confirmed_by_idx on public.orders(confirmed_by);
create index orders_cancelled_by_idx on public.orders(cancelled_by);
create index orders_status_created_idx on public.orders(status, created_at);
create index orders_created_at_idx on public.orders(created_at);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_ticket_type_idx on public.order_items(ticket_type_id);
create index order_items_merch_variant_idx on public.order_items(merch_variant_id);
create index reviews_order_idx on public.payment_review_attempts(order_id);
create index reviews_reviewer_idx on public.payment_review_attempts(reviewed_by);
create index reviews_decision_created_idx on public.payment_review_attempts(decision, created_at);
create index reviews_created_idx on public.payment_review_attempts(created_at);
create index submissions_order_idx on public.payment_submissions(order_id);
create index submissions_review_idx on public.payment_submissions(review_attempt_id, order_id);
create index submissions_reviewer_idx on public.payment_submissions(reviewed_by);
create index submissions_decision_created_idx on public.payment_submissions(decision, submitted_at);
create index submissions_submitted_at_idx on public.payment_submissions(submitted_at);
create index tickets_delegate_idx on public.tickets(delegate_id);
create index tickets_type_status_idx on public.tickets(ticket_type_id, status);
create index tickets_status_created_idx on public.tickets(status, created_at);
create index tickets_created_at_idx on public.tickets(created_at);
create index tickets_checked_in_by_idx on public.tickets(checked_in_by);
create index event_info_updated_by_idx on public.event_info(updated_by);
create index emails_delegate_idx on public.email_log(delegate_id);
create index emails_order_idx on public.email_log(order_id);
create index emails_status_created_idx on public.email_log(status, created_at);
create index emails_created_at_idx on public.email_log(created_at);
create index audit_actor_idx on public.audit_log(actor_id);
create index audit_order_idx on public.audit_log(order_id);
create index audit_action_created_idx on public.audit_log(action, created_at);
create index audit_created_at_idx on public.audit_log(created_at);

create function public.prevent_delete() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Hard deletion is forbidden on %', tg_table_name using errcode = '23514'; end;
$$;
create function public.prevent_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception '% is immutable', tg_table_name using errcode = '23514'; end;
$$;
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger event_info_updated_at before update on public.event_info
  for each row execute function public.set_updated_at();
create trigger order_items_immutable before update or delete on public.order_items
  for each row execute function public.prevent_mutation();
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.prevent_mutation();

create function public.guard_role_exclusivity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  if tg_table_name = 'admins' then v_user_id := new.user_id; else v_user_id := new.id; end if;
  -- Lock the common parent to serialize concurrent profile/admin insertion.
  perform 1 from auth.users where id = v_user_id for update;
  if (tg_table_name = 'admins' and exists(select 1 from public.profiles where id = v_user_id))
    or (tg_table_name = 'profiles' and exists(select 1 from public.admins where user_id = v_user_id)) then
    raise exception 'A user cannot be both admin and delegate' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger profiles_exclusive before insert or update on public.profiles
  for each row execute function public.guard_role_exclusivity();
create trigger admins_exclusive before insert or update on public.admins
  for each row execute function public.guard_role_exclusivity();
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Only server-controlled app metadata is considered; client user metadata
  -- cannot skip delegate creation or assign admin privileges.
  if new.raw_app_meta_data ->> 'registration_admin' = 'true'
    or exists(select 1 from public.admins where user_id = new.id) then return new; end if;
  insert into public.profiles(id, full_name, email, phone, institution)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Delegate'),
    lower(new.email), coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'institution', ''));
  return new;
end;
$$;
create trigger registration_handle_new_user after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.guard_order_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'Orders must start pending' using errcode = '23514'; end if;
  else
    if new.id <> old.id or new.delegate_id <> old.delegate_id or new.created_at <> old.created_at then
      raise exception 'Order identity is immutable' using errcode = '23514';
    end if;
    if new.status <> old.status and not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled')) or
      (old.status = 'rejected' and new.status in ('pending', 'cancelled'))) then
      raise exception 'Illegal order status transition: % -> %', old.status, new.status using errcode = '23514';
    end if;
    if old.status = 'rejected' and new.status = 'pending' and not exists (
      select 1 from public.payment_review_attempts r join public.payment_submissions s on s.review_attempt_id = r.id
      where r.order_id = old.id and r.decision = 'pending') then
      raise exception 'Reopening requires a new receipt package' using errcode = '23514';
    end if;
    if old.status in ('confirmed', 'cancelled') and new is distinct from old then
      raise exception 'Terminal orders are immutable' using errcode = '23514';
    end if;
    if new.membership_number is distinct from old.membership_number and exists(
      select 1 from public.payment_review_attempts where order_id = old.id and decision = 'pending') then
      raise exception 'Membership number cannot change during a pending review' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_status_guard before insert or update on public.orders
  for each row execute function public.guard_order_status();

create function public.guard_variant_size() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_has_sizes boolean;
begin
  select has_sizes into v_has_sizes from public.merch_items where id = new.merch_item_id for update;
  if not found then raise exception 'Unknown merchandise item' using errcode = '23503'; end if;
  if v_has_sizes <> (new.size is not null) then
    raise exception 'Variant size does not match item size configuration' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.merch_item_id <> old.merch_item_id or new.size is distinct from old.size) then
    raise exception 'Variant identity is immutable; deactivate and create another' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger variants_size_guard before insert or update on public.merch_variants
  for each row execute function public.guard_variant_size();
create function public.guard_merch_size_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.has_sizes <> old.has_sizes and exists(select 1 from public.merch_variants where merch_item_id = old.id) then
    raise exception 'Cannot change size configuration after variants exist' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger merch_size_change_guard before update on public.merch_items
  for each row execute function public.guard_merch_size_change();

create function public.guard_order_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.order_status; v_price numeric(10,2); v_membership boolean; v_number text;
begin
  select status, membership_number into v_status, v_number from public.orders where id = new.order_id for update;
  if not found then raise exception 'Unknown order' using errcode = '23503'; end if;
  if v_status <> 'pending' or exists(select 1 from public.payment_review_attempts where order_id = new.order_id) then
    raise exception 'Items can only be added before the first receipt review' using errcode = '23514';
  end if;
  if num_nonnulls(new.ticket_type_id, new.merch_variant_id) <> 1 then
    raise exception 'Exactly one item type is required' using errcode = '23514';
  end if;
  if new.ticket_type_id is not null then
    select price, requires_membership into v_price, v_membership
      from public.ticket_types where id = new.ticket_type_id and active for update;
    if v_membership and length(btrim(coalesce(v_number, ''))) = 0 then
      raise exception 'IEEE membership number is required to purchase this pass' using errcode = '23514';
    end if;
  else
    select m.price into v_price from public.merch_variants v
      join public.merch_items m on m.id = v.merch_item_id
      where v.id = new.merch_variant_id and v.active and m.active for share of v, m;
  end if;
  if v_price is null then raise exception 'Item is unavailable' using errcode = '23514'; end if;
  if new.unit_price is distinct from v_price then
    raise exception 'Unit price must match the server catalog price' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger order_items_price_guard before insert on public.order_items
  for each row execute function public.guard_order_item();

create function public.guard_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_capacity integer; v_count bigint; v_owner uuid; v_type uuid;
begin
  select o.delegate_id, i.ticket_type_id into v_owner, v_type
    from public.order_items i join public.orders o on o.id = i.order_id where i.id = new.order_item_id;
  if v_type is null or v_type <> new.ticket_type_id or v_owner <> new.delegate_id then
    raise exception 'Ticket must match its order owner and ticket line' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.status <> 'reserved' then
    raise exception 'Tickets must start reserved' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.order_item_id <> old.order_item_id or
      new.delegate_id <> old.delegate_id or new.ticket_type_id <> old.ticket_type_id or new.created_at <> old.created_at then
      raise exception 'Ticket identity is immutable' using errcode = '23514';
    end if;
    if new.status <> old.status and not (
      (old.status = 'reserved' and new.status in ('issued', 'void')) or
      (old.status = 'issued' and new.status in ('used', 'void')) or
      (old.status = 'used' and new.status = 'void')) then
      raise exception 'Illegal ticket status transition' using errcode = '23514';
    end if;
    if old.qr_token is not null and new.qr_token is distinct from old.qr_token then
      raise exception 'Issued QR token is immutable' using errcode = '23514';
    end if;
    if old.status = 'void' and new is distinct from old then
      raise exception 'Voided tickets are immutable' using errcode = '23514';
    end if;
  end if;
  -- Serialize allocation and voiding with the capacity row. Phase 2 RPCs take
  -- this lock before counting as well, so concurrent callers cannot oversell.
  select capacity into v_capacity from public.ticket_types where id = new.ticket_type_id for update;
  if new.status <> 'void' then
    select count(*) into v_count from public.tickets
      where ticket_type_id = new.ticket_type_id and status <> 'void' and id <> new.id;
    if v_count >= v_capacity then raise exception 'Ticket type is sold out' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
create trigger tickets_integrity_guard before insert or update on public.tickets
  for each row execute function public.guard_ticket();
create function public.guard_ticket_type() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.capacity < (select count(*) from public.tickets where ticket_type_id = old.id and status <> 'void') then
    raise exception 'Capacity cannot be lower than allocated tickets' using errcode = '23514';
  end if;
  if new.requires_membership <> old.requires_membership and exists(
    select 1 from public.order_items where ticket_type_id = old.id) then
    raise exception 'Membership requirement is immutable after purchase' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger ticket_types_capacity_guard before update on public.ticket_types
  for each row execute function public.guard_ticket_type();

create function public.guard_review_attempt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_number text; v_status public.order_status; v_requires boolean;
begin
  select membership_number, status into v_number, v_status from public.orders where id = new.order_id for update;
  if not found then raise exception 'Unknown order' using errcode = '23503'; end if;
  if tg_op = 'INSERT' then
    if new.decision <> 'pending' or v_status not in ('pending', 'rejected') then
      raise exception 'Review must start pending on an open order' using errcode = '23514';
    end if;
    new.membership_number := v_number;
    new.attempt_number := coalesce((select max(attempt_number) from public.payment_review_attempts where order_id = new.order_id), 0) + 1;
  else
    if old.decision <> 'pending' then raise exception 'Closed review history is immutable' using errcode = '23514'; end if;
    if new.id <> old.id or new.order_id <> old.order_id or new.attempt_number <> old.attempt_number or new.created_at <> old.created_at or
      new.membership_number is distinct from old.membership_number then
      raise exception 'Review identity and membership snapshot are immutable' using errcode = '23514';
    end if;
    if new.decision <> 'pending' and not exists(select 1 from public.payment_submissions where review_attempt_id = new.id) then
      raise exception 'Cannot review a package without receipts' using errcode = '23514';
    end if;
    if v_status <> 'pending' then raise exception 'Order is not pending review' using errcode = '23514'; end if;
  end if;
  select exists(select 1 from public.order_items i join public.ticket_types t on t.id = i.ticket_type_id
    where i.order_id = new.order_id and t.requires_membership) into v_requires;
  if new.decision = 'approved' and v_requires and
    (new.membership_verified is distinct from true or length(btrim(coalesce(new.membership_number, ''))) = 0) then
    raise exception 'Membership and receipts must be approved together' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger review_attempts_guard before insert or update on public.payment_review_attempts
  for each row execute function public.guard_review_attempt();

create function public.guard_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_status public.order_status; v_review public.submission_decision;
begin
  select delegate_id, status into v_owner, v_status from public.orders where id = new.order_id for update;
  select decision into v_review from public.payment_review_attempts where id = new.review_attempt_id for update;
  if tg_op = 'INSERT' then
    if v_status not in ('pending', 'rejected') or v_review <> 'pending' or new.decision <> 'pending' then
      raise exception 'Receipts require a pending review on an open order' using errcode = '23514';
    end if;
    if new.receipt_path <> v_owner::text || '/' || new.order_id::text || '/' || new.id::text || '.jpg' then
      raise exception 'Invalid receipt path' using errcode = '23514';
    end if;
  else
    if old.decision <> 'pending' then raise exception 'Reviewed receipt history is immutable' using errcode = '23514'; end if;
    if new.id <> old.id or new.order_id <> old.order_id or new.review_attempt_id <> old.review_attempt_id or
      new.receipt_path <> old.receipt_path or new.submitted_at <> old.submitted_at then
      raise exception 'Receipt evidence is immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger submissions_guard before insert or update on public.payment_submissions
  for each row execute function public.guard_submission();

-- Deferred guards let transactional RPCs update a review, all its receipts,
-- order and ticket in any necessary order, but refuse inconsistent commits.
create function public.validate_order_integrity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_order public.orders%rowtype; v_latest public.payment_review_attempts%rowtype;
begin
  if tg_table_name = 'orders' then v_id := new.id;
  elsif tg_table_name = 'tickets' then
    select order_id into v_id from public.order_items where id = new.order_item_id;
  else v_id := new.order_id; end if;
  select * into v_order from public.orders where id = v_id;
  select * into v_latest from public.payment_review_attempts where order_id = v_id order by attempt_number desc limit 1;
  if not exists(select 1 from public.order_items where order_id = v_id) then
    raise exception 'An order requires at least one item' using errcode = '23514';
  end if;
  if exists(select 1 from public.order_items i left join public.tickets t on t.order_item_id = i.id
    where i.order_id = v_id and i.ticket_type_id is not null and t.id is null) then
    raise exception 'Every ticket line requires a matching ticket' using errcode = '23514';
  end if;
  if exists(select 1 from public.payment_submissions s join public.payment_review_attempts r on r.id = s.review_attempt_id
    where s.order_id = v_id and (s.decision <> r.decision or s.reviewed_by is distinct from r.reviewed_by or
      s.reviewed_at is distinct from r.reviewed_at or s.rejection_reason is distinct from r.rejection_reason)) then
    raise exception 'All receipts must match their package review decision' using errcode = '23514';
  end if;
  if v_order.status = 'confirmed' and (
    v_latest.decision is distinct from 'approved'::public.submission_decision or
    v_order.confirmed_by is distinct from v_latest.reviewed_by or
    exists(select 1 from public.payment_review_attempts where order_id = v_id and decision = 'pending')) then
    raise exception 'Confirmation requires an approved receipt package and no pending review' using errcode = '23514';
  end if;
  if v_order.status = 'rejected' and (
    v_latest.decision is distinct from 'rejected'::public.submission_decision or
    exists(select 1 from public.payment_review_attempts where order_id = v_id and decision = 'pending')) then
    raise exception 'Rejection requires a rejected receipt package and no pending review' using errcode = '23514';
  end if;
  if v_order.status = 'pending' and v_latest.id is not null and v_latest.decision <> 'pending' then
    raise exception 'Pending orders require a pending latest receipt package' using errcode = '23514';
  end if;
  if exists(select 1 from public.tickets t join public.order_items i on i.id = t.order_item_id
    where i.order_id = v_id and (
      (v_order.status = 'cancelled' and t.status <> 'void') or
      (v_order.status = 'confirmed' and t.status = 'reserved') or
      (v_order.status <> 'confirmed' and t.status in ('issued', 'used')))) then
    raise exception 'Ticket status must match order status' using errcode = '23514';
  end if;
  return null;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['orders', 'order_items', 'payment_review_attempts', 'payment_submissions', 'tickets'] loop
    execute format('create constraint trigger %I after insert or update on public.%I deferrable initially deferred for each row execute function public.validate_order_integrity()',
      v_table || '_transaction_integrity', v_table);
  end loop;
  foreach v_table in array array['profiles', 'admins', 'ticket_types', 'merch_items', 'merch_variants',
    'orders', 'payment_review_attempts', 'payment_submissions', 'tickets', 'event_info', 'email_log'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.prevent_delete()',
      v_table || '_no_delete', v_table);
  end loop;
  -- TRUNCATE bypasses row DELETE triggers; prohibit it too, including for owners.
  foreach v_table in array array['profiles', 'admins', 'ticket_types', 'merch_items', 'merch_variants',
    'orders', 'order_items', 'payment_review_attempts', 'payment_submissions', 'tickets', 'event_info', 'email_log', 'audit_log'] loop
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.prevent_delete()',
      v_table || '_no_truncate', v_table);
    execute format('alter table public.%I enable row level security', v_table);
  end loop;
end;
$$;

-- Fail closed throughout the schema-only phase. Phase 2 adds explicit grants,
-- policies and RPC execution privileges. Helpers never become public RPCs.
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on public.audit_log from service_role;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

commit;
