begin;
create view public.order_queue with (security_invoker=true) as
select o.*,p.full_name,p.email,p.phone,p.institution,p.delegate_id as delegate_display_id,
  coalesce(t.total,0) as total,
  exists(select 1 from public.order_items i where i.order_id=o.id and i.ticket_type_id is not null) as has_ticket,
  exists(select 1 from public.order_items i where i.order_id=o.id and i.merch_variant_id is not null) as has_merch,
  (select count(*) from public.payment_submissions s where s.order_id=o.id and s.decision='pending') as pending_receipts,
  (select rejection_reason from public.payment_review_attempts r where r.order_id=o.id order by attempt_number desc limit 1) as latest_reason
from public.orders o join public.profiles p on p.id=o.delegate_id
left join public.order_totals t on t.order_id=o.id;
create view public.merch_totals with (security_invoker=true) as
select m.id as merch_item_id,m.name,v.size,sum(i.quantity)::bigint as quantity
from public.order_items i join public.orders o on o.id=i.order_id
join public.merch_variants v on v.id=i.merch_variant_id join public.merch_items m on m.id=v.merch_item_id
where o.status='confirmed' and public.is_admin() group by m.id,m.name,v.size;
create view public.audit_entries with (security_invoker=true) as
select a.*,coalesce(ad.full_name,ap.full_name,'System') as actor_name,
  dp.delegate_id as delegate_display_id,dp.full_name as delegate_name,dp.email as delegate_email
from public.audit_log a left join public.admins ad on ad.user_id=a.actor_id
left join public.profiles ap on ap.id=a.actor_id left join public.orders o on o.id=a.order_id
left join public.profiles dp on dp.id=o.delegate_id;
revoke all on public.order_queue,public.merch_totals,public.audit_entries from public,anon;
grant select on public.order_queue,public.merch_totals,public.audit_entries to authenticated;
commit;
