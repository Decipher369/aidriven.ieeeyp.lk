\set ON_ERROR_STOP on
-- Run as database owner against a disposable local database after migrations.
-- Fixtures and all test writes are rolled back. No real credentials are used.
begin;
create temporary table phase1_results(name text primary key);
create function pg_temp.expect_error(p_name text, p_sql text, p_state text) returns void
language plpgsql as $$
declare v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state then
      raise exception '%: expected SQLSTATE %, got %: %', p_name, p_state, sqlstate, sqlerrm;
    end if;
    v_failed := true;
  end;
  if not v_failed then raise exception '%: invalid write was accepted', p_name; end if;
  insert into phase1_results values (p_name);
end;
$$;
create function pg_temp.assert_true(p_name text, p_value boolean) returns void
language plpgsql as $$
begin
  if p_value is distinct from true then raise exception '% failed', p_name; end if;
  insert into phase1_results values (p_name);
end;
$$;
create function pg_temp.ticket_order(p_owner uuid, p_type uuid, p_member text default null) returns uuid
language plpgsql as $$
declare v_order uuid; v_line uuid;
begin
  insert into public.orders(delegate_id, membership_number) values(p_owner, p_member) returning id into v_order;
  insert into public.order_items(order_id, ticket_type_id, quantity, unit_price)
    select v_order, id, 1, price from public.ticket_types where id = p_type returning id into v_line;
  insert into public.tickets(order_item_id, delegate_id, ticket_type_id) values(v_line, p_owner, p_type);
  return v_order;
end;
$$;
create function pg_temp.receipt(p_order uuid, p_review uuid) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_owner uuid;
begin
  select delegate_id into v_owner from public.orders where id = p_order;
  insert into public.payment_submissions(id, order_id, review_attempt_id, receipt_path)
    values(v_id, p_order, p_review, v_owner::text || '/' || p_order::text || '/' || v_id::text || '.jpg');
  return v_id;
end;
$$;

do $$
declare
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid(); v_c uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid(); v_other_admin uuid := gen_random_uuid();
  v_standard uuid; v_member uuid; v_sized uuid; v_unsized uuid; v_variant uuid;
  v_order uuid; v_order2 uuid; v_line uuid; v_review uuid; v_receipt uuid; v_audit uuid;
  v_rejected_review uuid; v_retry_review uuid;
  v_member_order uuid; v_member_review uuid; v_member_receipt uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (v_a, 'phase1-a@example.invalid', '{"full_name":"Delegate A","role":"admin","registration_admin":true}'),
    (v_b, 'phase1-b@example.invalid', '{"full_name":"Delegate B"}'),
    (v_c, 'phase1-c@example.invalid', '{"full_name":"Delegate C"}');
  insert into auth.users(id, email, raw_app_meta_data) values
    (v_admin, 'phase1-admin@example.invalid', '{"registration_admin":true}'),
    (v_other_admin, 'phase1-other-admin@example.invalid', '{"registration_admin":true}');
  perform pg_temp.assert_true('delegate created from auth', exists(select 1 from public.profiles where id = v_a and delegate_id ~ '^DEL-[0-9]{4,}$'));
  perform pg_temp.assert_true('client metadata cannot create admin or skip profile', not exists(select 1 from public.admins where user_id = v_a));
  perform pg_temp.assert_true('intended admin has no delegate profile', not exists(select 1 from public.profiles where id = v_admin));
  insert into public.admins(user_id, full_name) values(v_admin, 'Test Admin');
  perform pg_temp.expect_error('admin cannot have profile', format(
    'insert into public.profiles(id, full_name, email) values(%L, %L, %L)', v_admin, 'Admin', 'forbidden@example.invalid'), '23514');
  perform pg_temp.expect_error('delegate cannot become admin', format(
    'insert into public.admins(user_id, full_name) values(%L, %L)', v_a, 'Forbidden'), '23514');
  perform pg_temp.expect_error('only one admin account', format(
    'insert into public.admins(user_id, full_name) values(%L, %L)', v_other_admin, 'Second'), '23505');

  insert into public.ticket_types(name, price, capacity, active) values('TEST Standard', 1000, 2, true) returning id into v_standard;
  insert into public.ticket_types(name, price, capacity, requires_membership, active)
    values('TEST Member', 500, 2, true, true) returning id into v_member;
  insert into public.merch_items(name, price, has_sizes, active) values('TEST Shirt', 200, true, true) returning id into v_sized;
  insert into public.merch_items(name, price, has_sizes, active) values('TEST Badge', 100, false, true) returning id into v_unsized;
  insert into public.merch_variants(merch_item_id, size, active) values(v_unsized, null, true) returning id into v_variant;
  perform pg_temp.expect_error('negative ticket price', 'insert into public.ticket_types(name, price, capacity) values(''negative'', -1, 1)', '23514');
  perform pg_temp.expect_error('negative merch price', 'insert into public.merch_items(name, price, has_sizes) values(''negative'', -1, false)', '23514');
  perform pg_temp.expect_error('NaN price', 'insert into public.ticket_types(name, price, capacity) values(''nan'', ''NaN'', 1)', '23514');
  perform pg_temp.expect_error('zero capacity', 'insert into public.ticket_types(name, price, capacity) values(''zero'', 0, 0)', '23514');
  perform pg_temp.expect_error('invalid enum size', format('insert into public.merch_variants(merch_item_id, size) values(%L, ''XXXL'')', v_sized), '22P02');
  perform pg_temp.expect_error('unsized item with size', format('insert into public.merch_variants(merch_item_id, size) values(%L, ''S'')', v_unsized), '23514');
  perform pg_temp.expect_error('sized item without size', format('insert into public.merch_variants(merch_item_id) values(%L)', v_sized), '23514');
  perform pg_temp.expect_error('duplicate null variant', format('insert into public.merch_variants(merch_item_id) values(%L)', v_unsized), '23505');
  perform pg_temp.expect_error('parent size changes refused', format('update public.merch_items set has_sizes=true where id=%L', v_unsized), '23514');

  v_order := pg_temp.ticket_order(v_a, v_standard);
  select id into v_line from public.order_items where order_id = v_order;
  perform pg_temp.expect_error('second active ticket fails', format('select pg_temp.ticket_order(%L, %L)', v_a, v_standard), '23505');
  v_order2 := pg_temp.ticket_order(v_b, v_standard);
  perform pg_temp.expect_error('capacity refuses third ticket', format('select pg_temp.ticket_order(%L, %L)', v_c, v_standard), '23514');
  perform pg_temp.expect_error('capacity reduction refused', format('update public.ticket_types set capacity=1 where id=%L', v_standard), '23514');
  perform pg_temp.expect_error('quantity zero', format('insert into public.order_items(order_id, merch_variant_id, quantity, unit_price) values(%L, %L, 0, 100)', v_order, v_variant), '23514');
  perform pg_temp.expect_error('quantity exceeds five', format('insert into public.order_items(order_id, merch_variant_id, quantity, unit_price) values(%L, %L, 6, 100)', v_order, v_variant), '23514');
  perform pg_temp.expect_error('ticket quantity two', format('insert into public.order_items(order_id, ticket_type_id, quantity, unit_price) values(%L, %L, 2, 1000)', v_order, v_standard), '23514');
  perform pg_temp.expect_error('ticket and merch on same line', format('insert into public.order_items(order_id, ticket_type_id, merch_variant_id, quantity, unit_price) values(%L, %L, %L, 1, 1000)', v_order, v_standard, v_variant), '23514');
  perform pg_temp.expect_error('neither ticket nor merch on line', format('insert into public.order_items(order_id, quantity, unit_price) values(%L, 1, 0)', v_order), '23514');
  perform pg_temp.expect_error('forged price snapshot', format('insert into public.order_items(order_id, merch_variant_id, quantity, unit_price) values(%L, %L, 1, 1)', v_order, v_variant), '23514');
  perform pg_temp.expect_error('immutable order items update', format('update public.order_items set quantity=1 where id=%L', v_line), '23514');
  perform pg_temp.expect_error('immutable order items delete', format('delete from public.order_items where id=%L', v_line), '23514');
  perform pg_temp.expect_error('wrong ticket owner', format('update public.tickets set delegate_id=%L where order_item_id=%L', v_b, v_line), '23514');
  perform pg_temp.expect_error('confirmed without reviewer', format('update public.orders set status=''confirmed'', confirmed_at=now() where id=%L', v_order), '23514');

  update public.orders set status='cancelled', cancelled_at=now(), cancel_reason='Test cancellation' where id=v_order;
  update public.tickets set status='void', voided_at=now(), void_reason='Test cancellation' where order_item_id=v_line;
  perform pg_temp.expect_error('cancelled cannot reopen', format('update public.orders set status=''pending'' where id=%L', v_order), '23514');
  v_order := pg_temp.ticket_order(v_a, v_standard);
  perform pg_temp.assert_true('re-registration after void succeeds', exists(select 1 from public.tickets where delegate_id=v_a and status='reserved'));
  perform pg_temp.expect_error('member purchase needs number', format('select pg_temp.ticket_order(%L, %L)', v_c, v_member), '23514');
  v_member_order := pg_temp.ticket_order(v_c, v_member, 'IEEE-TEST-123');
  perform pg_temp.assert_true('member purchase before verification succeeds', exists(select 1 from public.orders where id=v_member_order and status='pending'));
  insert into public.payment_review_attempts(order_id) values(v_member_order) returning id into v_member_review;
  v_member_receipt := pg_temp.receipt(v_member_order, v_member_review);
  perform pg_temp.assert_true('membership snapshot captured', exists(select 1 from public.payment_review_attempts where id=v_member_review and membership_number='IEEE-TEST-123'));
  perform pg_temp.expect_error('unverified membership blocks approval', format(
    'update public.payment_review_attempts set decision=''approved'', reviewed_by=%L, reviewed_at=now() where id=%L', v_admin, v_member_review), '23514');

  insert into public.payment_review_attempts(order_id) values(v_order) returning id into v_review;
  v_receipt := pg_temp.receipt(v_order, v_review);
  perform pg_temp.receipt(v_order, v_review);
  perform pg_temp.assert_true('multiple receipts share review', (select count(*)=2 from public.payment_submissions where review_attempt_id=v_review));
  perform pg_temp.expect_error('second pending package refused', format('insert into public.payment_review_attempts(order_id) values(%L)', v_order), '23505');
  perform pg_temp.expect_error('rejection without reason', format(
    'update public.payment_review_attempts set decision=''rejected'', reviewed_by=%L, reviewed_at=now() where id=%L', v_admin, v_review), '23514');
  perform pg_temp.expect_error('receipt rejection without reason', format(
    'update public.payment_submissions set decision=''rejected'', reviewed_by=%L, reviewed_at=now() where id=%L', v_admin, v_receipt), '23514');
  perform pg_temp.expect_error('approved without reviewer', format(
    'update public.payment_review_attempts set decision=''approved'', reviewed_at=now() where id=%L', v_review), '23514');
  perform pg_temp.expect_error('receipt path cannot change', format(
    'update public.payment_submissions set receipt_path=''forged.jpg'' where id=%L', v_receipt), '23514');
  perform pg_temp.expect_error('wrong receipt folder', format(
    'insert into public.payment_submissions(order_id, review_attempt_id, receipt_path) values(%L, %L, ''wrong.jpg'')', v_order, v_review), '23514');
  perform pg_temp.expect_error('membership cannot change during review', format(
    'update public.orders set membership_number=''different'' where id=%L', v_member_order), '23514');

  -- Deliberately incomplete review transactions must fail at deferred validation.
  perform pg_temp.expect_error('confirmation without approved package', format(
    'update public.orders set status=''confirmed'', confirmed_at=now(), confirmed_by=%L where id=%L; set constraints all immediate', v_admin, v_order2), '23514');
  perform pg_temp.expect_error('receipts must agree with package', format(
    'update public.payment_review_attempts set decision=''approved'', reviewed_at=now(), reviewed_by=%L where id=%L; set constraints all immediate', v_admin, v_review), '23514');

  insert into public.payment_review_attempts(order_id) values(v_order2) returning id into v_rejected_review;
  perform pg_temp.receipt(v_order2, v_rejected_review);
  update public.payment_review_attempts set decision='rejected', rejection_reason='Receipt unreadable', reviewed_by=v_admin, reviewed_at=now() where id=v_rejected_review;
  update public.payment_submissions set decision='rejected', rejection_reason='Receipt unreadable', reviewed_by=v_admin, reviewed_at=now() where review_attempt_id=v_rejected_review;
  update public.orders set status='rejected' where id=v_order2;
  perform pg_temp.expect_error('rejected order cannot reopen without receipt', format('update public.orders set status=''pending'' where id=%L', v_order2), '23514');
  insert into public.payment_review_attempts(order_id) values(v_order2) returning id into v_retry_review;
  perform pg_temp.receipt(v_order2, v_retry_review);
  update public.orders set status='pending' where id=v_order2;
  perform pg_temp.assert_true('resubmission preserves old rejected package', exists(select 1 from public.payment_review_attempts where id=v_rejected_review and decision='rejected' and rejection_reason='Receipt unreadable'));
  perform pg_temp.assert_true('review attempts numbered in order', exists(select 1 from public.payment_review_attempts where id=v_retry_review and attempt_number=2));
  perform pg_temp.assert_true('receipt history preserved after resubmission', (select count(*)=2 from public.payment_submissions where order_id=v_order2));
  perform pg_temp.expect_error('old rejection cannot reject new pending package', format('update public.orders set status=''rejected'' where id=%L; set constraints all immediate', v_order2), '23514');

  -- Valid combined review, receipt decisions, order confirmation and issuance.
  update public.payment_review_attempts set decision='approved', reviewed_at=now(), reviewed_by=v_admin where id=v_review;
  update public.payment_submissions set decision='approved', reviewed_at=now(), reviewed_by=v_admin where review_attempt_id=v_review;
  update public.orders set status='confirmed', confirmed_at=now(), confirmed_by=v_admin where id=v_order;
  update public.tickets set status='issued', issued_at=now(), qr_token=encode(extensions.gen_random_bytes(24), 'hex')
    where order_item_id in (select id from public.order_items where order_id=v_order);
  perform pg_temp.expect_error('confirmed cannot return to pending', format('update public.orders set status=''pending'' where id=%L', v_order), '23514');
  perform pg_temp.expect_error('closed review immutable', format('update public.payment_review_attempts set rejection_reason=''changed'' where id=%L', v_review), '23514');
  perform pg_temp.expect_error('closed receipt immutable', format('update public.payment_submissions set rejection_reason=''changed'' where id=%L', v_receipt), '23514');

  update public.payment_review_attempts set decision='approved', membership_verified=true, reviewed_at=now(), reviewed_by=v_admin where id=v_member_review;
  update public.payment_submissions set decision='approved', reviewed_at=now(), reviewed_by=v_admin where review_attempt_id=v_member_review;
  update public.orders set status='confirmed', confirmed_at=now(), confirmed_by=v_admin where id=v_member_order;
  update public.tickets set status='issued', issued_at=now(), qr_token=encode(extensions.gen_random_bytes(24), 'hex')
    where order_item_id in (select id from public.order_items where order_id=v_member_order);
  perform pg_temp.assert_true('joint member and payment approval succeeds', exists(select 1 from public.orders where id=v_member_order and status='confirmed'));

  insert into public.audit_log(actor_id, actor_role, action, entity_type, entity_id, order_id)
    values(v_admin, 'admin', 'order_created', 'order', v_order, v_order) returning id into v_audit;
  perform pg_temp.expect_error('owner cannot update audit', format('update public.audit_log set action=''changed'' where id=%L', v_audit), '23514');
  perform pg_temp.expect_error('owner cannot delete audit', format('delete from public.audit_log where id=%L', v_audit), '23514');
  perform pg_temp.expect_error('owner cannot truncate audit', 'truncate public.audit_log', '23514');
  perform pg_temp.expect_error('catalog cannot be deleted', format('delete from public.ticket_types where id=%L', v_standard), '23514');
  perform pg_temp.expect_error('profile cannot be deleted', format('delete from public.profiles where id=%L', v_a), '23514');
  perform pg_temp.assert_true('RLS enabled on every public table', not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity));
  perform pg_temp.assert_true('anon denied all table privileges', not has_table_privilege('anon', 'public.orders', 'SELECT,INSERT,UPDATE,DELETE'));
  perform pg_temp.assert_true('authenticated denied direct audit writes', not has_table_privilege('authenticated', 'public.audit_log', 'INSERT,UPDATE,DELETE'));
  perform pg_temp.assert_true('service role denied direct audit writes', not has_table_privilege('service_role', 'public.audit_log', 'INSERT,UPDATE,DELETE'));
end;
$$;

-- The admin uses the authenticated API role too. Real session/RLS tests are
-- Phase 2; Phase 1 verifies fail-closed privileges for both API roles.
set local role authenticated;
do $$
begin
  begin update public.audit_log set action='forbidden'; raise exception 'authenticated audit update accepted';
    exception when insufficient_privilege then null; end;
  begin delete from public.audit_log; raise exception 'authenticated audit delete accepted';
    exception when insufficient_privilege then null; end;
end;
$$;
reset role;
insert into phase1_results values ('authenticated audit update/delete denied');
set local role anon;
do $$
begin
  begin update public.audit_log set action='forbidden'; raise exception 'anon audit update accepted';
    exception when insufficient_privilege then null; end;
  begin delete from public.audit_log; raise exception 'anon audit delete accepted';
    exception when insufficient_privilege then null; end;
end;
$$;
reset role;
insert into phase1_results values ('anon audit update/delete denied');
set constraints all immediate;
select count(*) as passed_checks from phase1_results;
select name as passed from phase1_results order by name;
rollback;
