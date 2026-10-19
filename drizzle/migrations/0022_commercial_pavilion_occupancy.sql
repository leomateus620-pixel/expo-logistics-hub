-- Read-only projection. No geometry, sales, signature or historical records are changed.
CREATE OR REPLACE FUNCTION public.commercial_pavilion_occupancy(p_project_id uuid, p_pavilion_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_contracts boolean; v_lots jsonb;
BEGIN
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id AND NOT is_archived;
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.can_view_commercial_map(v_org) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_entities WHERE id = p_pavilion_id
    AND project_id = p_project_id AND classification = 'PAVILION' AND NOT is_archived) THEN
    RAISE EXCEPTION 'PAVILION_NOT_FOUND';
  END IF;
  v_contracts := public.map_has_explicit_capability(v_org, 'map.manage_contracts');
  -- A single MVCC statement covers the complete inventory, not a page of orders.
  -- The recursive set follows persisted parents and terminates even on a corrupt cycle.
  WITH RECURSIVE descendants AS (
    SELECT id FROM public.map_entities WHERE id = p_pavilion_id
    UNION
    SELECT e.id FROM public.map_entities e JOIN descendants d ON e.parent_entity_id = d.id
    WHERE e.project_id = p_project_id AND NOT e.is_archived
  ), inventory AS MATERIALIZED (
    SELECT l.* FROM public.commercial_lots l JOIN descendants d ON d.id = l.entity_id
    WHERE l.project_id = p_project_id AND l.archived_at IS NULL
  ), active AS MATERIALIZED (
    SELECT s.*, i.id item_id, i.order_id, i.contract_state, i.signed_at, i.cancelled_at,
      o.exhibitor_id, o.updated_at order_updated_at,
      (i.id IS NOT NULL AND (o.id IS NULL OR o.project_id <> p_project_id OR o.reverted_at IS NOT NULL
        OR o.status = 'REVERTED' OR i.contract_state = 'CANCELLED'
        OR lower(btrim(o.buyer_name)) <> lower(btrim(s.buyer_name)))) inconsistent
    FROM public.lot_sales s JOIN inventory l ON l.id = s.lot_id
    LEFT JOIN public.lot_sale_order_items i ON i.sale_id = s.id AND i.lot_id = s.lot_id
    LEFT JOIN public.lot_sale_orders o ON o.id = i.order_id
    WHERE s.status IN ('OPEN','CONFIRMED') AND s.reverted_at IS NULL
  ), contract_links AS MATERIALIZED (
    SELECT c.id, c.order_id, c.lot_id, c.scope, c.contract_number, c.updated_at, c.created_at
    FROM public.lot_contracts c WHERE v_contracts AND c.is_active
      AND ((c.scope='LOT' AND c.lot_id IN (SELECT id FROM inventory))
        OR (c.scope='ORDER_ITEMS' AND c.id IN (
          SELECT cl.contract_id FROM public.lot_contract_lots cl WHERE cl.lot_id IN (SELECT id FROM inventory))))
  ), conflicting_assignments AS (
    SELECT cl.lot_id, array_agg(DISTINCT c.order_id) order_ids
    FROM contract_links c JOIN public.lot_contract_lots cl ON cl.contract_id=c.id
    JOIN public.lot_sale_orders o ON o.id=c.order_id
    WHERE c.scope='ORDER_ITEMS' AND o.reverted_at IS NULL AND o.status <> 'REVERTED'
      AND cl.lot_id IN (SELECT id FROM inventory)
    GROUP BY cl.lot_id
  ), associations AS (
    SELECT a.lot_id, jsonb_agg(jsonb_build_object(
      'saleId',a.id, 'orderId',a.order_id, 'itemId',a.item_id, 'exhibitorId',a.exhibitor_id,
      'displayName',public.commercial_buyer_display_name(a.buyer_trade_name,a.buyer_name),
      'saleStatus',a.status,
      'contractState',coalesce(a.contract_state,CASE WHEN a.status='OPEN' THEN 'PENDING_SIGNATURE' ELSE 'LEGACY_UNVERIFIED' END),
      'inconsistent',coalesce(a.inconsistent,false) OR coalesce(cardinality(array_remove(ca.order_ids,a.order_id)),0)>0,
      'updatedAt',greatest(a.created_at,a.order_updated_at,a.signed_at,a.cancelled_at),
      'contracts',CASE WHEN v_contracts THEN coalesce((
        SELECT jsonb_agg(jsonb_build_object('id',c.id,'number',c.contract_number,'scope',c.scope,
          'updatedAt',c.updated_at,'verified',c.created_at >= a.created_at) ORDER BY c.id)
        FROM contract_links c WHERE
          (c.scope='LOT' AND c.lot_id=a.lot_id)
          OR (c.scope='ORDER_ITEMS' AND c.order_id=a.order_id AND EXISTS (
            SELECT 1 FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id AND cl.lot_id=a.lot_id))
      ),'[]'::jsonb) ELSE NULL END
    ) ORDER BY a.id,a.item_id) rows FROM active a
    LEFT JOIN conflicting_assignments ca ON ca.lot_id=a.lot_id GROUP BY a.lot_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('lotId',l.id,'entityId',l.entity_id,
    'lotNumber',l.lot_number,'status',l.status,'updatedAt',l.updated_at,
    'associations',coalesce(a.rows,'[]'::jsonb)) ORDER BY l.id),'[]'::jsonb)
  INTO v_lots FROM inventory l LEFT JOIN associations a ON a.lot_id=l.id;
  RETURN jsonb_build_object('projectId',p_project_id,'pavilionId',p_pavilion_id,
    'observedAt',statement_timestamp(),'contractsAccessible',v_contracts,'lots',v_lots);
END $$;
REVOKE ALL ON FUNCTION public.commercial_pavilion_occupancy(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_pavilion_occupancy(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.commercial_pavilion_occupancy(uuid,uuid) IS
  'Authorized pavilion occupancy, without contacts, payments, document numbers, files or storage URLs. Signature is read only from sale items.';
NOTIFY pgrst, 'reload schema';