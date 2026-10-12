begin;
-- Dashboard-created admins have no delegate registration metadata. Validated
-- register-delegate invitations always carry a nonempty full_name.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.raw_app_meta_data->>'registration_admin'='true'
    or nullif(btrim(new.raw_user_meta_data->>'full_name'),'') is null
    or exists(select 1 from public.admins where user_id=new.id) then return new; end if;
  insert into public.profiles(id,full_name,email,phone,institution)
    values(new.id,btrim(new.raw_user_meta_data->>'full_name'),lower(new.email),
      coalesce(new.raw_user_meta_data->>'phone',''),coalesce(new.raw_user_meta_data->>'institution',''));
  return new;
end;
$$;

create table registration_internal.registration_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null check(attempts>0)
);
create function public.registration_rate_limit(p_ip_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_attempts integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid rate limit key'; end if;
  insert into registration_internal.registration_limits(ip_hash,window_started_at,attempts) values(p_ip_hash,now(),1)
  on conflict(ip_hash) do update set
    attempts=case when registration_internal.registration_limits.window_started_at<now()-interval '1 hour' then 1 else registration_internal.registration_limits.attempts+1 end,
    window_started_at=case when registration_internal.registration_limits.window_started_at<now()-interval '1 hour' then now() else registration_internal.registration_limits.window_started_at end
  returning attempts into v_attempts;
  return v_attempts<=5;
end;
$$;

alter table public.email_log add column delivery_started_at timestamptz,
  add column delivery_lock_until timestamptz,add column delivery_claim uuid;
create function public.claim_email(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_email public.email_log%rowtype;
begin
  select * into v_email from public.email_log where id=p_id for update;
  if not found or v_email.status='sent' or v_email.attempts>=3 or
    v_email.delivery_lock_until>now() or v_email.error like 'PERMANENT:%' then return null; end if;
  -- Never automatically resend beyond a conservative 10-minute idempotency
  -- window. Ambiguous deliveries then need provider-log reconciliation.
  if v_email.delivery_started_at is not null and v_email.delivery_started_at<now()-interval '10 minutes' then
    update public.email_log set status='failed',error='PERMANENT: delivery uncertain; reconcile in Brevo before retrying' where id=p_id;
    return null;
  end if;
  update public.email_log set attempts=attempts+1,delivery_started_at=coalesce(delivery_started_at,now()),
    delivery_lock_until=now()+interval '90 seconds',delivery_claim=gen_random_uuid()
    where id=p_id returning * into v_email;
  return to_jsonb(v_email);
end;
$$;
create function public.complete_email(p_id uuid,p_claim uuid,p_sent boolean,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.email_log set status=case when p_sent then 'sent'::public.email_status else 'failed'::public.email_status end,
    sent_at=case when p_sent then now() else null end,error=case when p_sent then null else p_error end,
    delivery_lock_until=case when p_sent then null else now()+interval '90 seconds' end,delivery_claim=null
    where id=p_id and delivery_claim=p_claim and status<>'sent';
  return found;
end;
$$;
create function public.queue_event_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  insert into public.email_log(delegate_id,order_id,template,dedupe_key,payload)
    select t.delegate_id,i.order_id,'event_reminder','reminder:'||t.id::text,jsonb_build_object('ticket_id',t.id)
    from public.tickets t join public.order_items i on i.id=t.order_item_id
    where t.status in ('issued','used') on conflict(dedupe_key) do nothing;
  get diagnostics v_count=row_count; return v_count;
end;
$$;
revoke all on function public.registration_rate_limit(text),public.claim_email(uuid),public.complete_email(uuid,uuid,boolean,text),public.queue_event_reminders() from public,anon,authenticated;
grant execute on function public.registration_rate_limit(text),public.claim_email(uuid),public.complete_email(uuid,uuid,boolean,text),public.queue_event_reminders() to service_role;
grant select on public.email_log,public.profiles,public.orders,public.order_items,public.tickets,public.ticket_types,public.merch_items,public.merch_variants,public.event_info to service_role;
revoke insert,update,delete on public.audit_log from service_role;
commit;
