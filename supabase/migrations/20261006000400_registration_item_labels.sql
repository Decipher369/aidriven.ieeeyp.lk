-- Server-generated historical labels remain readable after catalog deactivation.
begin;
alter table public.order_items add column display_name text not null default '';
create function public.snapshot_item_label() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.ticket_type_id is not null then select name into new.display_name from public.ticket_types where id=new.ticket_type_id;
  else select m.name || case when v.size is null then '' else ' · ' || v.size::text end into new.display_name
    from public.merch_variants v join public.merch_items m on m.id=v.merch_item_id where v.id=new.merch_variant_id;
  end if;
  new.display_name:=coalesce(new.display_name,'');
  return new;
end;
$$;
create trigger order_items_label before insert on public.order_items for each row execute function public.snapshot_item_label();
revoke all on function public.snapshot_item_label() from public,anon,authenticated;
commit;
