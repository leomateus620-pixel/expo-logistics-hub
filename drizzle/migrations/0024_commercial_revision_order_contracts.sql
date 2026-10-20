-- Read-only revision fix: ORDER_ITEMS documents have no lot_id. The previous
-- inner join silently ignored their creation, replacement and removal, and did
-- not observe changes to explicit lot coverage in another browser/session.
-- Preserve the existing authorization, signature inputs and refresh cadence.
CREATE OR REPLACE FUNCTION public.commercial_map_revision(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org uuid;
  v_sig text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF v_org IS NULL OR NOT public.can_view_commercial_map(v_org) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  WITH project_contracts AS MATERIALIZED (
    SELECT c.id, c.scope, c.updated_at, c.is_active, c.contract_number
    FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id = c.lot_id
    WHERE c.scope = 'LOT' AND l.project_id = p_project_id
    UNION ALL
    SELECT c.id, c.scope, c.updated_at, c.is_active, c.contract_number
    FROM public.lot_contracts c JOIN public.lot_sale_orders o ON o.id = c.order_id
    WHERE c.scope = 'ORDER_ITEMS' AND o.project_id = p_project_id
  )
  SELECT md5(concat_ws('|',
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.commercial_lots WHERE project_id = p_project_id),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.map_entities WHERE project_id = p_project_id),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.map_entity_geometries WHERE project_id = p_project_id AND is_current),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.commercial_price_rules WHERE project_id = p_project_id OR project_id IS NULL),
    (SELECT max(o.updated_at)::text || ':' || count(*) FROM public.commercial_lot_price_overrides o JOIN public.commercial_lots l ON l.id = o.lot_id WHERE l.project_id = p_project_id),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.lot_sale_orders WHERE project_id = p_project_id),
    (SELECT max(i.updated_at)::text || ':' || count(*) FROM public.lot_sale_installments i JOIN public.lot_sale_orders o ON o.id = i.order_id WHERE o.project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', c.id, c.scope, c.updated_at, c.is_active, c.contract_number), ';' ORDER BY c.id), ''))
       FROM project_contracts c),
    (SELECT md5(coalesce(string_agg(concat_ws(',', cl.contract_id, cl.lot_id), ';' ORDER BY cl.contract_id, cl.lot_id), ''))
       FROM public.lot_contract_lots cl JOIN project_contracts c ON c.id = cl.contract_id),
    (SELECT max(r.updated_at)::text || ':' || count(*) FROM public.lot_reservations r JOIN public.commercial_lots l ON l.id = r.lot_id WHERE l.project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', s.id, s.status, s.reverted_at, s.negotiated_value, s.buyer_name, s.buyer_trade_name, s.contract_number), ';' ORDER BY s.id), ''))
       FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE l.project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', it.id, it.lot_id, it.contract_state, it.signed_at, it.cancelled_at, it.item_total), ';' ORDER BY it.id), ''))
       FROM public.lot_sale_order_items it JOIN public.lot_sale_orders o ON o.id = it.order_id WHERE o.project_id = p_project_id)
  )) INTO v_sig;
  RETURN v_sig;
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_map_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_map_revision(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
