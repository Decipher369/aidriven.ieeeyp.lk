-- Supabase-hosted extensions. Local vanilla tests skip this platform migration.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function registration_internal.invoke_worker(p_worker text,p_body jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_url text;v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='registration_supabase_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='registration_email_webhook_secret' limit 1;
  -- Migrations are safe before secrets are configured: the persistent queue
  -- remains available and the cron worker can dispatch it after setup.
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/'||p_worker,
    headers:=jsonb_build_object('Content-Type','application/json','x-email-webhook-secret',v_secret),
    body:=p_body,timeout_milliseconds:=10000);
end;
$$;
create function registration_internal.email_webhook() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='queued' then perform registration_internal.invoke_worker('send-email',jsonb_build_object('email_id',new.id)); end if;
  return new;
end;
$$;
create trigger email_queued_webhook after insert on public.email_log for each row execute function registration_internal.email_webhook();
revoke all on function registration_internal.invoke_worker(text,jsonb),registration_internal.email_webhook() from public,anon,authenticated;
select cron.schedule('registration-expire-unpaid','0 0 * * *','select public.expire_unpaid_orders()');
select cron.schedule('registration-email-retry','* * * * *',
  $$select registration_internal.invoke_worker('send-email','{}'::jsonb)$$);
-- The worker checks EVENT_DATE and REMINDER_DAYS_BEFORE. No date means no mail.
select cron.schedule('registration-event-reminder','0 * * * *',
  $$select registration_internal.invoke_worker('event-reminder','{}'::jsonb)$$);
commit;
