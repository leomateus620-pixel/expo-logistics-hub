BEGIN;

CREATE FUNCTION public.soja_store_dashboard(_org_id uuid, _commission_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_capabilities text[] := soja_store_private.capabilities(_org_id, _commission_id);
  v_active_products bigint;
  v_ordered_purchases bigint;
  v_partial_purchases bigint;
  v_stock_positions bigint;
BEGIN
  IF NOT (v_capabilities && ARRAY['catalog.view', 'purchases.view', 'stock.view']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FORBIDDEN';
  END IF;

  IF 'catalog.view' = ANY(v_capabilities) THEN
    SELECT count(*) INTO v_active_products
    FROM soja_store_private.products p
    WHERE p.org_id = _org_id AND p.commission_id = _commission_id AND p.status = 'active';
  END IF;

  IF 'purchases.view' = ANY(v_capabilities) THEN
    SELECT count(*) FILTER (WHERE p.status = 'ordered'),
      count(*) FILTER (WHERE p.status = 'partially_received')
    INTO v_ordered_purchases, v_partial_purchases
    FROM soja_store_private.purchases p
    WHERE p.org_id = _org_id AND p.commission_id = _commission_id AND p.status <> 'received';
  END IF;

  IF 'stock.view' = ANY(v_capabilities) THEN
    SELECT count(*) INTO v_stock_positions
    FROM (
      SELECT 1
      FROM soja_store_private.stock_movements m
      WHERE m.org_id = _org_id AND m.commission_id = _commission_id
      GROUP BY m.variant_id, m.location_id, m.ownership, m.owner_supplier_id, m.destination
    ) positions;
  END IF;

  RETURN jsonb_build_object(
    'active_products', v_active_products,
    'ordered_purchases', v_ordered_purchases,
    'partial_purchases', v_partial_purchases,
    'stock_positions', v_stock_positions,
    'generated_at', statement_timestamp()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soja_store_dashboard(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_dashboard(uuid, uuid) TO authenticated;

COMMIT;
