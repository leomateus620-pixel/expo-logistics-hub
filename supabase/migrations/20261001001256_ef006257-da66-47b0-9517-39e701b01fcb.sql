do $$
declare v_lots uuid[]; v_sales uuid[];
begin
  if (select count(*) from public.lot_sale_orders) = 0 then return; end if;
  if (select count(*) from public.lot_sale_orders) <> 14 or (select count(*) from public.lot_sale_order_items) <> 60 or (select count(*) from public.lot_sales) <> 60 then
    raise exception 'inventario divergente';
  end if;
  select array_agg(distinct lot_id), array_agg(distinct sale_id) into v_lots, v_sales from public.lot_sale_order_items;
  if exists (select 1 from public.lot_sales where id <> all(v_sales)) then raise exception 'venda fora dos pedidos'; end if;
  delete from public.lot_sale_installments;
  delete from public.lot_sale_order_items;
  delete from public.lot_sale_orders;
  delete from public.lot_sales where id = any(v_sales);
  delete from public.lot_status_history where lot_id = any(v_lots) and new_status in ('SOLD','SALE_OPEN');
  delete from public.map_activity_logs where lot_id = any(v_lots) and action in ('LOT_SOLD','LOT_SALE_OPEN');
  update public.commercial_lots set status='AVAILABLE' where id = any(v_lots) and status in ('SOLD','SALE_OPEN');
  if (select count(*) from public.commercial_lots where id = any(v_lots) and status <> 'AVAILABLE') > 0 then raise exception 'lote nao restaurado'; end if;
end $$;