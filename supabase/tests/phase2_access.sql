\set ON_ERROR_STOP on
begin;
create temporary table phase2_results(name text primary key);
grant select,insert on phase2_results to authenticated,anon,service_role;
create function pg_temp.assert_true(p_name text,p_value boolean) returns void language plpgsql as $$begin if p_value is distinct from true then raise exception '% failed',p_name;end if;insert into phase2_results values(p_name);end;$$;
create function pg_temp.expect_error(p_name text,p_sql text,p_state text) returns void language plpgsql as $$declare failed boolean:=false;begin begin execute p_sql;exception when others then if sqlstate<>p_state then raise exception '% expected %, got %: %',p_name,p_state,sqlstate,sqlerrm;end if;failed:=true;end;if not failed then raise exception '% accepted a forbidden action',p_name;end if;insert into phase2_results values(p_name);end;$$;

-- Test identities are fictional. Claims simulate PostgREST sessions in SQL.
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','access-a@example.invalid','{"full_name":"Access A","phone":"0700000001","institution":"Test"}'),
 ('10000000-0000-4000-8000-000000000002','access-b@example.invalid','{"full_name":"Access B","phone":"0700000002","institution":"Test"}');
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000003','access-admin@example.invalid');
select pg_temp.assert_true('manual admin has no profile',not exists(select 1 from public.profiles where id='10000000-0000-4000-8000-000000000003'));
insert into public.admins(user_id,full_name) values('10000000-0000-4000-8000-000000000003','Access Admin');
insert into public.ticket_types(id,name,price,capacity,active,requires_membership) values('20000000-0000-4000-8000-000000000001','ACCESS MEMBER',1000,10,true,true);
insert into public.merch_items(id,name,price,has_sizes,active) values('20000000-0000-4000-8000-000000000002','ACCESS SHIRT',250,true,true);
insert into public.merch_variants(id,merch_item_id,size,active) values('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','M',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.create_order('20000000-0000-4000-8000-000000000001','[]','B-MEMBER') as b_order \gset
select pg_temp.assert_true('delegate B order created',(select count(*)=1 from public.orders));
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true('A cannot read B profile',(select count(*)=0 from public.profiles where id='10000000-0000-4000-8000-000000000002'));
select pg_temp.assert_true('A cannot read B orders',(select count(*)=0 from public.orders));
select pg_temp.assert_true('A cannot read B tickets',(select count(*)=0 from public.tickets));
select pg_temp.assert_true('A cannot read B order items',(select count(*)=0 from public.order_items));
select pg_temp.assert_true('A cannot read audit',(select count(*)=0 from public.audit_log));
select pg_temp.expect_error('A cannot confirm','select public.confirm_order('''||:'b_order'||''')','42501');
select pg_temp.expect_error('A cannot reject','select public.reject_order('''||:'b_order'||''',''Wrong receipt'')','42501');
select pg_temp.expect_error('A cannot check in','select public.check_in_ticket(''bad'')','42501');
select pg_temp.expect_error('A cannot edit event','select public.upsert_event_info(''test'',''test'',''test'',true)','42501');
select pg_temp.expect_error('A cannot edit delegate ID','update public.profiles set delegate_id=''DEL-9999''','42501');
select pg_temp.expect_error('A cannot edit email','update public.profiles set email=''forged@example.invalid''','42501');
select pg_temp.expect_error('A cannot edit activation','update public.profiles set is_active=false','42501');
select pg_temp.expect_error('A cannot directly create order','insert into public.orders(delegate_id) values(''10000000-0000-4000-8000-000000000001'')','42501');
select public.create_order('20000000-0000-4000-8000-000000000001','[{"variant_id":"20000000-0000-4000-8000-000000000003","quantity":2}]','A-MEMBER') as a_order \gset
select pg_temp.assert_true('server computes expected total',(select total=1500 from public.order_totals where order_id=:'a_order'));
select pg_temp.expect_error('A second ticket refused','select public.create_order(''20000000-0000-4000-8000-000000000001'',''[]'',''A-MEMBER'')','23505');
select pg_temp.expect_error('no object no submission','select public.submit_receipt('''||:'a_order'||''',''10000000-0000-4000-8000-000000000001/'||:'a_order'||'/30000000-0000-4000-8000-000000000001.jpg'')','22023');
select pg_temp.expect_error('upload outside own folder','insert into storage.objects(bucket_id,name) values(''receipts'',''10000000-0000-4000-8000-000000000002/'||:'b_order'||'/30000000-0000-4000-8000-000000000009.jpg'')','42501');
insert into storage.objects(bucket_id,name) values('receipts','10000000-0000-4000-8000-000000000001/'||:'a_order'||'/30000000-0000-4000-8000-000000000001.jpg');
select public.submit_receipt(:'a_order','10000000-0000-4000-8000-000000000001/'||:'a_order'||'/30000000-0000-4000-8000-000000000001.jpg');
insert into storage.objects(bucket_id,name) values('receipts','10000000-0000-4000-8000-000000000001/'||:'a_order'||'/30000000-0000-4000-8000-000000000002.jpg');
select public.submit_receipt(:'a_order','10000000-0000-4000-8000-000000000001/'||:'a_order'||'/30000000-0000-4000-8000-000000000002.jpg');
select pg_temp.assert_true('two receipts one package',(select count(*)=2 from public.payment_submissions where order_id=:'a_order') and (select count(*)=1 from public.payment_review_attempts where order_id=:'a_order'));
select pg_temp.expect_error('cannot cancel after receipt','select public.cancel_order('''||:'a_order'||''',''Changed my mind'')','42501');
with changed as (update storage.objects set name=name returning id)
select pg_temp.assert_true('receipt update denied by policy',not exists(select 1 from changed));
with changed as (delete from storage.objects returning id)
select pg_temp.assert_true('receipt delete denied by policy',not exists(select 1 from changed));
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true('B cannot read A receipts',(select count(*)=0 from storage.objects));
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true('admin verified by table',public.is_admin());
select pg_temp.assert_true('admin can read both delegates',(select count(*)=2 from public.profiles));
select pg_temp.assert_true('admin can read all receipt objects',(select count(*)=2 from storage.objects));
select pg_temp.expect_error('membership verification required','select public.confirm_order('''||:'a_order'||''',false)','23514');
select public.reject_order(:'a_order','Membership number needs correction');
select pg_temp.assert_true('rejection covers whole package',(select count(*)=2 from public.payment_submissions where order_id=:'a_order' and decision='rejected'));
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into storage.objects(bucket_id,name) values('receipts','10000000-0000-4000-8000-000000000001/'||:'a_order'||'/30000000-0000-4000-8000-000000000003.jpg');
select public.submit_receipt(:'a_order','10000000-0000-4000-8000-000000000001/'||:'a_order'||'/30000000-0000-4000-8000-000000000003.jpg','A-MEMBER-CORRECTED');
select pg_temp.assert_true('correction preserved in new package',(select membership_number='A-MEMBER-CORRECTED' from public.payment_review_attempts where order_id=:'a_order' and attempt_number=2));
select pg_temp.assert_true('old membership snapshot preserved',(select membership_number='A-MEMBER' from public.payment_review_attempts where order_id=:'a_order' and attempt_number=1));
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true('unseen receipt package prevents confirmation',
 (public.confirm_order(:'a_order',true,array['30000000-0000-4000-8000-000000000001'::uuid])->>'result')='already_handled');
select public.confirm_order(:'a_order',true);
select pg_temp.assert_true('repeat confirmation already handled',(public.confirm_order(:'a_order',true)->>'result')='already_handled');
select qr_token as ticket_token from public.tickets where delegate_id='10000000-0000-4000-8000-000000000001' \gset
select pg_temp.assert_true('first scan valid',(public.check_in_ticket(:'ticket_token')->>'result')='valid');
select pg_temp.assert_true('second scan already used',(public.check_in_ticket(:'ticket_token')->>'result')='already_used');
select pg_temp.assert_true('unknown QR invalid',(public.check_in_ticket('invalid')->>'result')='invalid');
select pg_temp.expect_error('admin cannot directly update orders','update public.orders set status=''cancelled''','42501');
select pg_temp.expect_error('admin cannot write audit','update public.audit_log set action=''forged''','42501');
select public.upsert_event_info('access-test','Test page','Markdown body',true);
select pg_temp.assert_true('admin event RPC works',exists(select 1 from public.event_info where slug='access-test'));
set local role anon;
select pg_temp.expect_error('anon cannot read profile','select * from public.profiles','42501');
select pg_temp.expect_error('anon cannot create order','select public.create_order(null,''[]'')','42501');
select pg_temp.expect_error('anon cannot is_admin','select public.is_admin()','42501');
reset role;
select set_config('request.jwt.claim.sub','',true);
-- Email dedupe and delivery claiming are server-only.
select pg_temp.assert_true('queued emails have unique dedupe keys',(select count(*)=count(distinct dedupe_key) from public.email_log));
select public.queue_event_reminders();
select public.queue_event_reminders();
select pg_temp.assert_true('repeat reminder queues once',(select count(*)=1 from public.email_log where template='event_reminder'));
select id as email_id from public.email_log where template='order_confirmed' limit 1 \gset
select public.claim_email(:'email_id') as claim \gset
select pg_temp.assert_true('second sender cannot claim concurrently',public.claim_email(:'email_id') is null);
select public.complete_email(:'email_id',(:'claim'::jsonb->>'delivery_claim')::uuid,true,null);
select pg_temp.assert_true('sent email never reclaims',public.claim_email(:'email_id') is null);
set constraints all immediate;
select count(*) as passed_access_checks from phase2_results;
select name as passed from phase2_results order by name;
rollback;
