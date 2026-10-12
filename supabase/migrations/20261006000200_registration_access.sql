-- Phase 2: fail-closed RLS, private receipts and transactional business RPCs.
begin;
create schema if not exists registration_internal;
revoke all on schema registration_internal from public, anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles, public.admins, public.ticket_types, public.merch_items,
  public.merch_variants, public.event_info, public.orders, public.order_items,
  public.order_totals, public.payment_review_attempts, public.payment_submissions,
  public.tickets, public.email_log, public.audit_log to authenticated;
grant update(full_name, phone, institution) on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_edit on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active and not (select public.is_admin()))
  with check (id = (select auth.uid()) and is_active and not (select public.is_admin()));
create policy admins_read on public.admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy ticket_types_read on public.ticket_types for select to authenticated
  using (active or (select public.is_admin()));
create policy merch_items_read on public.merch_items for select to authenticated
  using (active or (select public.is_admin()));
create policy merch_variants_read on public.merch_variants for select to authenticated
  using ((active and exists(select 1 from public.merch_items where id=merch_item_id and active)) or (select public.is_admin()));
create policy event_info_read on public.event_info for select to authenticated
  using (published or (select public.is_admin()));
create policy orders_read on public.orders for select to authenticated
  using (delegate_id = (select auth.uid()) or (select public.is_admin()));
create policy tickets_read on public.tickets for select to authenticated
  using (delegate_id = (select auth.uid()) or (select public.is_admin()));
create policy order_items_read on public.order_items for select to authenticated
  using (exists(select 1 from public.orders o where o.id=order_id and (o.delegate_id=(select auth.uid()) or (select public.is_admin()))));
create policy reviews_read on public.payment_review_attempts for select to authenticated
  using (exists(select 1 from public.orders o where o.id=order_id and (o.delegate_id=(select auth.uid()) or (select public.is_admin()))));
create policy submissions_read on public.payment_submissions for select to authenticated
  using (exists(select 1 from public.orders o where o.id=order_id and (o.delegate_id=(select auth.uid()) or (select public.is_admin()))));
create policy email_log_read on public.email_log for select to authenticated using ((select public.is_admin()));
create policy audit_log_read on public.audit_log for select to authenticated using ((select public.is_admin()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('receipts', 'receipts', false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false, file_size_limit=1048576,
  allowed_mime_types=excluded.allowed_mime_types;
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id='receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select public.is_admin())));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id='receipts' and not (select public.is_admin())
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$')
    and exists(select 1 from public.orders o where o.id::text=(storage.foldername(name))[2]
      and o.delegate_id=(select auth.uid()) and o.status in ('pending','rejected')));
-- No receipt UPDATE/DELETE policies. Uploads always use upsert=false.

create function registration_internal.audit(p_action text, p_entity text, p_id uuid,
  p_order uuid, p_details jsonb default '{}'::jsonb, p_system boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor_id, actor_role, action, entity_type, entity_id, order_id, details)
  values(case when p_system then null else auth.uid() end,
    case when p_system then 'system'::public.actor_role when public.is_admin() then 'admin'::public.actor_role else 'delegate'::public.actor_role end,
    p_action, p_entity, p_id, p_order, p_details);
end;
$$;
create function registration_internal.queue_email(p_order uuid, p_template text, p_key text, p_extra jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.email_log(delegate_id, order_id, template, dedupe_key, payload)
  select delegate_id, id, p_template, p_key, p_extra from public.orders where id=p_order
  on conflict(dedupe_key) do nothing;
end;
$$;

create function public.create_order(p_ticket_type_id uuid default null, p_merch jsonb default '[]'::jsonb,
  p_membership_number text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_order uuid; v_line uuid; v_type public.ticket_types%rowtype;
  v_entry jsonb; v_variant uuid; v_qty integer; v_price numeric(10,2); v_count bigint;
begin
  if v_owner is null or public.is_admin() or not exists(select 1 from public.profiles where id=v_owner and is_active) then
    raise exception 'An active delegate account is required' using errcode='42501'; end if;
  if p_merch is null or jsonb_typeof(p_merch)<>'array' or jsonb_array_length(p_merch)>100 then
    raise exception 'Invalid merchandise selection' using errcode='22023'; end if;
  if p_ticket_type_id is null and jsonb_array_length(p_merch)=0 then
    raise exception 'Choose at least one item' using errcode='22023'; end if;
  if p_ticket_type_id is not null then
    select * into v_type from public.ticket_types where id=p_ticket_type_id and active for update;
    if not found then raise exception 'This ticket is unavailable' using errcode='22023'; end if;
    if exists(select 1 from public.tickets where delegate_id=v_owner and status<>'void') then
      raise exception 'You already have a ticket' using errcode='23505'; end if;
    select count(*) into v_count from public.tickets where ticket_type_id=p_ticket_type_id and status<>'void';
    if v_count>=v_type.capacity then raise exception 'This ticket is sold out' using errcode='23514'; end if;
    if v_type.requires_membership and length(btrim(coalesce(p_membership_number,'')))=0 then
      raise exception 'Enter your IEEE membership number' using errcode='22023'; end if;
  end if;
  insert into public.orders(delegate_id, membership_number)
    values(v_owner, nullif(btrim(p_membership_number),'')) returning id into v_order;
  if p_ticket_type_id is not null then
    insert into public.order_items(order_id, ticket_type_id, quantity, unit_price)
      values(v_order,p_ticket_type_id,1,v_type.price) returning id into v_line;
    begin
      insert into public.tickets(order_item_id,delegate_id,ticket_type_id) values(v_line,v_owner,p_ticket_type_id);
    exception when unique_violation then raise exception 'You already have a ticket' using errcode='23505'; end;
  end if;
  for v_entry in select value from jsonb_array_elements(p_merch) loop
    if jsonb_typeof(v_entry)<>'object' or jsonb_typeof(v_entry->'quantity')<>'number'
      or (v_entry->>'quantity') !~ '^[1-5]$' or not (v_entry ? 'variant_id') then
      raise exception 'Invalid merchandise quantity or variant' using errcode='22023'; end if;
    begin v_variant := (v_entry->>'variant_id')::uuid; v_qty := (v_entry->>'quantity')::integer;
      exception when invalid_text_representation then raise exception 'Invalid merchandise variant' using errcode='22023'; end;
    select m.price into v_price from public.merch_variants v join public.merch_items m on m.id=v.merch_item_id
      where v.id=v_variant and v.active and m.active for share of v,m;
    if not found then raise exception 'This merchandise is unavailable' using errcode='22023'; end if;
    insert into public.order_items(order_id,merch_variant_id,quantity,unit_price) values(v_order,v_variant,v_qty,v_price);
  end loop;
  perform registration_internal.audit('order_created','order',v_order,v_order,jsonb_build_object('after',jsonb_build_object('status','pending')));
  return v_order;
end;
$$;

create function public.submit_receipt(p_order_id uuid, p_path text, p_membership_number text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_review uuid; v_submission uuid;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or auth.uid() is null or v_order.delegate_id<>auth.uid() or public.is_admin() then
    raise exception 'Order not found' using errcode='42501'; end if;
  if v_order.status not in ('pending','rejected') then raise exception 'This order is already handled' using errcode='23514'; end if;
  if p_path is null or p_path !~ ('^'||auth.uid()::text||'/'||p_order_id::text||'/[0-9a-f-]{36}\.jpg$') then
    raise exception 'Invalid receipt path' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects where bucket_id='receipts' and name=p_path) then
    raise exception 'Upload the receipt before submitting' using errcode='22023'; end if;
  if p_membership_number is not null and p_membership_number is distinct from v_order.membership_number then
    if v_order.status<>'rejected' then raise exception 'Membership corrections require a rejected order' using errcode='23514'; end if;
    update public.orders set membership_number=nullif(btrim(p_membership_number),'') where id=p_order_id;
  end if;
  select id into v_review from public.payment_review_attempts where order_id=p_order_id and decision='pending' for update;
  if v_review is null then
    insert into public.payment_review_attempts(order_id) values(p_order_id) returning id into v_review;
  end if;
  begin v_submission := replace(split_part(p_path,'/',3),'.jpg','')::uuid;
    exception when invalid_text_representation then raise exception 'Invalid receipt id' using errcode='22023'; end;
  if exists(select 1 from public.payment_submissions where id=v_submission and order_id=p_order_id and receipt_path=p_path) then return v_submission; end if;
  insert into public.payment_submissions(id,order_id,review_attempt_id,receipt_path) values(v_submission,p_order_id,v_review,p_path);
  if v_order.status='rejected' then update public.orders set status='pending' where id=p_order_id; end if;
  perform registration_internal.audit('receipt_submitted','payment_submission',v_submission,p_order_id,jsonb_build_object('review_attempt_id',v_review,'receipt_path',p_path));
  perform registration_internal.queue_email(p_order_id,'receipt_received','receipt:'||v_submission::text);
  return v_submission;
end;
$$;

create function public.confirm_order(p_order_id uuid, p_membership_verified boolean default false,
  p_expected_receipt_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_review public.payment_review_attempts%rowtype; v_ticket uuid; v_time timestamptz:=now();
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status<>'pending' then return jsonb_build_object('result','already_handled'); end if;
  select * into v_review from public.payment_review_attempts where order_id=p_order_id and decision='pending' for update;
  if not found or not exists(select 1 from public.payment_submissions where review_attempt_id=v_review.id) then
    return jsonb_build_object('result','already_handled','message','No pending receipts'); end if;
  if p_expected_receipt_ids is not null and
    (select array_agg(id order by id) from public.payment_submissions where review_attempt_id=v_review.id) is distinct from
    (select array_agg(id order by id) from unnest(p_expected_receipt_ids) as requested(id)) then
    return jsonb_build_object('result','already_handled','message','Receipt package changed. Review the new receipts first.');
  end if;
  update public.payment_review_attempts set decision='approved',membership_verified=p_membership_verified,
    reviewed_by=auth.uid(),reviewed_at=v_time where id=v_review.id;
  update public.payment_submissions set decision='approved',reviewed_by=auth.uid(),reviewed_at=v_time where review_attempt_id=v_review.id;
  update public.orders set status='confirmed',confirmed_at=v_time,confirmed_by=auth.uid() where id=p_order_id and status='pending';
  update public.tickets set status='issued',issued_at=v_time,qr_token=encode(extensions.gen_random_bytes(24),'hex')
    where order_item_id in (select id from public.order_items where order_id=p_order_id) and status='reserved' returning id into v_ticket;
  perform registration_internal.audit('order_confirmed','order',p_order_id,p_order_id,
    jsonb_build_object('before',jsonb_build_object('status','pending'),'after',jsonb_build_object('status','confirmed'),'review_attempt_id',v_review.id,'membership_verified',p_membership_verified));
  if v_ticket is not null then
    perform registration_internal.audit('ticket_issued','ticket',v_ticket,p_order_id);
  end if;
  perform registration_internal.queue_email(p_order_id,case when v_ticket is null then 'merch_confirmed' else 'order_confirmed' end,'order:'||p_order_id::text||':confirmed');
  return jsonb_build_object('result','confirmed');
end;
$$;

create function public.reject_order(p_order_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_review uuid; v_time timestamptz:=now();
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Give a reason of at least 5 characters' using errcode='22023'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status<>'pending' then return jsonb_build_object('result','already_handled'); end if;
  select id into v_review from public.payment_review_attempts where order_id=p_order_id and decision='pending' for update;
  if v_review is null or not exists(select 1 from public.payment_submissions where review_attempt_id=v_review) then return jsonb_build_object('result','already_handled'); end if;
  update public.payment_review_attempts set decision='rejected',rejection_reason=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=v_time where id=v_review;
  update public.payment_submissions set decision='rejected',rejection_reason=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=v_time where review_attempt_id=v_review;
  update public.orders set status='rejected' where id=p_order_id;
  perform registration_internal.audit('order_rejected','order',p_order_id,p_order_id,jsonb_build_object('before',jsonb_build_object('status','pending'),'after',jsonb_build_object('status','rejected'),'reason',p_reason,'review_attempt_id',v_review));
  perform registration_internal.queue_email(p_order_id,'receipt_rejected','order:'||p_order_id::text||':rejected:'||v_review::text,jsonb_build_object('reason',p_reason));
  return jsonb_build_object('result','rejected');
end;
$$;

create function registration_internal.cancel(p_order_id uuid,p_reason text,p_system boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_ticket uuid;
begin
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Cancellation reason is required' using errcode='22023'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='42501'; end if;
  if not p_system and not public.is_admin() and
    (auth.uid() is null or v_order.delegate_id<>auth.uid() or exists(select 1 from public.payment_submissions where order_id=p_order_id)) then
    raise exception 'Only an admin can cancel after a receipt is submitted' using errcode='42501'; end if;
  if v_order.status not in ('pending','rejected') then return jsonb_build_object('result','already_handled'); end if;
  update public.orders set status='cancelled',cancelled_at=now(),cancelled_by=case when p_system then null else auth.uid() end,cancel_reason=btrim(p_reason) where id=p_order_id;
  update public.tickets set status='void',voided_at=now(),void_reason=btrim(p_reason)
    where order_item_id in (select id from public.order_items where order_id=p_order_id) and status<>'void' returning id into v_ticket;
  perform registration_internal.audit('order_cancelled','order',p_order_id,p_order_id,
    jsonb_build_object('before',jsonb_build_object('status',v_order.status),'after',jsonb_build_object('status','cancelled'),'reason',p_reason),p_system);
  if v_ticket is not null then perform registration_internal.audit('ticket_voided','ticket',v_ticket,p_order_id,jsonb_build_object('reason',p_reason),p_system); end if;
  perform registration_internal.queue_email(p_order_id,'order_cancelled','order:'||p_order_id::text||':cancelled',jsonb_build_object('reason',p_reason));
  return jsonb_build_object('result','cancelled');
end;
$$;
create function public.cancel_order(p_order_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin return registration_internal.cancel(p_order_id,p_reason,false); end;
$$;

create function public.check_in_ticket(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ticket public.tickets%rowtype; v_name text; v_delegate text; v_type text; v_order uuid; v_admin text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  update public.tickets set status='used',checked_in_at=now(),checked_in_by=auth.uid()
    where qr_token=p_token and status='issued' returning * into v_ticket;
  if not found then
    select * into v_ticket from public.tickets where qr_token=p_token;
    if not found or v_ticket.status<>'used' then return jsonb_build_object('result','invalid'); end if;
    select full_name into v_admin from public.admins where user_id=v_ticket.checked_in_by;
    return jsonb_build_object('result','already_used','checked_in_at',v_ticket.checked_in_at,'checked_in_by',v_admin);
  end if;
  select full_name,delegate_id into v_name,v_delegate from public.profiles where id=v_ticket.delegate_id;
  select name into v_type from public.ticket_types where id=v_ticket.ticket_type_id;
  select order_id into v_order from public.order_items where id=v_ticket.order_item_id;
  perform registration_internal.audit('ticket_checked_in','ticket',v_ticket.id,v_order,
    jsonb_build_object('before',jsonb_build_object('status','issued'),'after',jsonb_build_object('status','used')));
  return jsonb_build_object('result','valid','full_name',v_name,'delegate_id',v_delegate,'ticket_type',v_type);
end;
$$;

create function public.upsert_event_info(p_slug text,p_title text,p_body text,p_published boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_before jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(btrim(coalesce(p_title,'')))=0 or p_body is null or p_published is null then
    raise exception 'Provide a slug, title, body and publication state' using errcode='22023'; end if;
  select to_jsonb(e) into v_before from public.event_info e where slug=p_slug for update;
  insert into public.event_info(slug,title,body,published,updated_by) values(p_slug,btrim(p_title),p_body,p_published,auth.uid())
    on conflict(slug) do update set title=excluded.title,body=excluded.body,published=excluded.published,updated_by=excluded.updated_by returning id into v_id;
  perform registration_internal.audit('event_info_updated','event_info',v_id,null,
    jsonb_build_object('before',v_before,'after',jsonb_build_object('slug',p_slug,'title',p_title,'body',p_body,'published',p_published)));
  return v_id;
end;
$$;

create function public.expire_unpaid_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_order record; v_count integer:=0;
begin
  for v_order in select id from public.orders o where status='pending' and created_at<now()-interval '3 days'
    and not exists(select 1 from public.payment_submissions where order_id=o.id) for update skip locked loop
    perform registration_internal.cancel(v_order.id,'Unpaid reservation expired after 3 days',true);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

revoke all on all functions in schema registration_internal from public, anon, authenticated;
revoke all on function public.create_order(uuid,jsonb,text),public.submit_receipt(uuid,text,text),
  public.confirm_order(uuid,boolean,uuid[]),public.reject_order(uuid,text),public.cancel_order(uuid,text),
  public.check_in_ticket(text),public.upsert_event_info(text,text,text,boolean),public.expire_unpaid_orders()
  from public, anon;
grant execute on function public.create_order(uuid,jsonb,text),public.submit_receipt(uuid,text,text),
  public.confirm_order(uuid,boolean,uuid[]),public.reject_order(uuid,text),public.cancel_order(uuid,text),
  public.check_in_ticket(text),public.upsert_event_info(text,text,text,boolean) to authenticated;
-- Expiry is scheduler-only, never a delegate/admin RPC.
revoke all on function public.expire_unpaid_orders() from authenticated;
commit;
