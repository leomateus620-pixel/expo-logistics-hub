-- Rollback: definição de public.commercial_map_revision(uuid) antes da 0024 (capturada 2026-10-20)
CREATE OR REPLACE FUNCTION public.commercial_map_revision(p_project_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_sig text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF v_org IS NULL OR NOT public.can_view_commercial_map(v_org) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  SELECT md5(concat_ws('|',
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.commercial_lots WHERE project_id = p_project_id),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.map_entities WHERE project_id = p_project_id),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.map_entity_geometries WHERE project_id = p_project_id AND is_current),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.commercial_price_rules WHERE project_id = p_project_id OR project_id IS NULL),
    (SELECT max(o.updated_at)::text || ':' || count(*) FROM public.commercial_lot_price_overrides o JOIN public.commercial_lots l ON l.id = o.lot_id WHERE l.project_id = p_project_id),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.lot_sale_orders WHERE project_id = p_project_id),
    (SELECT max(i.updated_at)::text || ':' || count(*) FROM public.lot_sale_installments i JOIN public.lot_sale_orders o ON o.id = i.order_id WHERE o.project_id = p_project_id),
    (SELECT max(c.updated_at)::text || ':' || count(*) FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id = c.lot_id WHERE l.project_id = p_project_id),
    (SELECT max(r.updated_at)::text || ':' || count(*) FROM public.lot_reservations r JOIN public.commercial_lots l ON l.id = r.lot_id WHERE l.project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', s.id, s.status, s.reverted_at, s.negotiated_value, s.buyer_name, s.buyer_trade_name, s.contract_number), ';' ORDER BY s.id), ''))
       FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE l.project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', it.id, it.lot_id, it.contract_state, it.signed_at, it.cancelled_at, it.item_total), ';' ORDER BY it.id), ''))
       FROM public.lot_sale_order_items it JOIN public.lot_sale_orders o ON o.id = it.order_id WHERE o.project_id = p_project_id)
  )) INTO v_sig;
  RETURN v_sig;
END;
$function$

;
REVOKE ALL ON FUNCTION public.commercial_map_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_map_revision(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
