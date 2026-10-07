-- Índices de leitura do Mapa Comercial: os embeds por lote faziam varredura completa.
CREATE INDEX IF NOT EXISTS lot_prices_lot_id_idx ON public.lot_prices (lot_id);
CREATE INDEX IF NOT EXISTS lot_sales_lot_id_idx ON public.lot_sales (lot_id);
CREATE INDEX IF NOT EXISTS lot_contracts_lot_id_idx ON public.lot_contracts (lot_id);
CREATE INDEX IF NOT EXISTS lot_reservations_lot_id_idx ON public.lot_reservations (lot_id);
CREATE INDEX IF NOT EXISTS lot_negotiations_lot_id_idx ON public.lot_negotiations (lot_id);
CREATE INDEX IF NOT EXISTS lot_status_history_lot_id_idx ON public.lot_status_history (lot_id);
CREATE INDEX IF NOT EXISTS map_entities_project_active_id_idx ON public.map_entities (project_id, is_archived, id);
CREATE INDEX IF NOT EXISTS map_entity_geometries_project_current_id_idx ON public.map_entity_geometries (project_id, is_current, id);

ANALYZE public.lot_prices, public.lot_sales, public.lot_contracts, public.lot_reservations,
  public.lot_negotiations, public.lot_status_history, public.map_entities, public.map_entity_geometries, public.commercial_lots;

-- Assinatura leve do estado comercial do projeto: o app só recarrega o mapa completo quando ela muda.
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
$$;

REVOKE ALL ON FUNCTION public.commercial_map_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_map_revision(uuid) TO authenticated;