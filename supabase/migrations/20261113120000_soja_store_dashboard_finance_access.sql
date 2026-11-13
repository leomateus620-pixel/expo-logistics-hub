BEGIN;

-- Monetary indicators also require the store's financial read capability.
CREATE OR REPLACE FUNCTION public.soja_store_current_dashboard(
  _org_id uuid, _commission_id uuid, _start date DEFAULT NULL, _end date DEFAULT NULL, _location_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_caps text[] := soja_store_private.capabilities(_org_id, _commission_id);
  v_products bigint;
  v_ordered bigint;
  v_partial bigint;
  v_positions bigint;
  v_sales bigint;
  v_confirmed numeric;
  v_received numeric;
  v_locations jsonb;
BEGIN
  IF NOT (v_caps && ARRAY['catalog.view','purchases.view','stock.view','sales.view']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FORBIDDEN';
  END IF;
  PERFORM soja_store_private.operational_range(_start, _end);
  IF v_caps && ARRAY['purchases.view','stock.view','sales.view'] THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) ORDER BY lower(l.name), l.id), '[]'::jsonb)
    INTO v_locations FROM soja_store_private.locations l WHERE l.org_id = _org_id AND l.commission_id = _commission_id;
  END IF;
  IF 'catalog.view' = ANY(v_caps) AND _location_id IS NULL AND _start IS NULL AND _end IS NULL THEN
    SELECT count(*) INTO v_products FROM soja_store_private.products p
    WHERE p.org_id = _org_id AND p.commission_id = _commission_id AND p.status = 'active';
  END IF;
  IF 'stock.view' = ANY(v_caps) THEN
    SELECT count(*) INTO v_positions FROM soja_store_private.stock_positions s
    WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND (_location_id IS NULL OR s.location_id = _location_id);
  END IF;
  IF 'purchases.view' = ANY(v_caps) THEN
    SELECT count(*) FILTER (WHERE status = 'ordered'), count(*) FILTER (WHERE status = 'partially_received')
    INTO v_ordered, v_partial
    FROM soja_store_private.filtered_purchases(_org_id, _commission_id, _start, _end, _location_id);
  END IF;
  IF v_caps @> ARRAY['sales.view', 'finance.view'] THEN
    WITH sales AS MATERIALIZED (
      SELECT id, total_cents FROM soja_store_private.filtered_sales(_org_id, _commission_id, _start, _end, _location_id, true)
    ), returns AS (
      SELECT coalesce(sum(l.returned_cents), 0) AS total
      FROM sales s JOIN soja_store_private.sale_lines l ON l.sale_id = s.id
    ), payments AS (
      SELECT coalesce(sum(p.amount_cents), 0) AS total
      FROM sales s JOIN soja_store_private.sale_payments p ON p.sale_id = s.id
    ), totals AS (
      SELECT count(*) AS count, coalesce(sum(total_cents), 0) AS amount FROM sales
    )
    SELECT totals.count, totals.amount - returns.total, payments.total INTO v_sales, v_confirmed, v_received
    FROM totals CROSS JOIN returns CROSS JOIN payments;
  ELSIF 'sales.view' = ANY(v_caps) THEN
    SELECT count(*) INTO v_sales
    FROM soja_store_private.filtered_sales(_org_id, _commission_id, _start, _end, _location_id, true);
  END IF;
  RETURN jsonb_build_object('active_products', v_products, 'ordered_purchases', v_ordered,
    'partial_purchases', v_partial, 'stock_positions', v_positions, 'confirmed_sales', v_sales,
    'confirmed_cents', v_confirmed::text, 'received_cents', v_received::text,
    'locations', coalesce(v_locations, '[]'::jsonb), 'generated_at', statement_timestamp());
END;
$$;

COMMIT;
