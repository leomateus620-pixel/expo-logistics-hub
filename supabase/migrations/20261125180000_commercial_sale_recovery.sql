BEGIN;

-- Guarda o escopo inicial sem depender dos itens que uma revisão possa acrescentar.
ALTER TABLE public.lot_sale_orders
  ADD COLUMN IF NOT EXISTS submitted_lot_ids uuid[],
  ADD COLUMN IF NOT EXISTS submission_digest text;

CREATE OR REPLACE FUNCTION public.get_commercial_sale_attempt(
  p_project_id uuid, p_idempotency_key text, p_stage text, p_lot_ids uuid[]
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v_order public.lot_sale_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF v_org IS NULL OR public.map_has_explicit_capability(v_org, 'map.manage_sales') IS NOT TRUE THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders
  WHERE project_id = p_project_id AND salesperson_user_id = auth.uid()
    AND idempotency_key = p_idempotency_key AND stage = p_stage;
  IF NOT FOUND OR nullif(cardinality(p_lot_ids), 0) IS NULL THEN RETURN NULL; END IF;
  IF coalesce(v_order.submitted_lot_ids, (
      SELECT array_agg(DISTINCT lot_id ORDER BY lot_id) FROM public.map_activity_logs
      WHERE project_id = p_project_id AND action = 'LOT_SALE_OPEN' AND lot_id IS NOT NULL
        AND after_state->>'sale_order_id' = v_order.id::text
    ), ARRAY(SELECT lot_id FROM public.lot_sale_order_items WHERE order_id = v_order.id ORDER BY lot_id))
    IS DISTINCT FROM ARRAY(SELECT DISTINCT id FROM unnest(p_lot_ids) AS lot(id) ORDER BY id)
  THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('orderId', v_order.id, 'reference', 'PV-' || upper(left(v_order.id::text, 8)));
END;
$$;
REVOKE ALL ON FUNCTION public.get_commercial_sale_attempt(uuid,text,text,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_commercial_sale_attempt(uuid,text,text,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_commercial_sale_order_checked(
  p_project_id uuid, p_operator_id uuid, p_idempotency_key text, p_stage text, p_lot_ids uuid[],
  p_expected_prices jsonb, p_buyer_name text, p_document_number text, p_phone text, p_email text,
  p_payment_type text, p_installment_count integer, p_payment_method text, p_first_due_date date,
  p_installments jsonb, p_expected_total numeric, p_notes text, p_exhibitor_id uuid,
  p_fee_admin numeric, p_fee_ppci numeric, p_fee_cleaning_license numeric, p_buyer_trade_name text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v_key text := btrim(p_idempotency_key);
  v_existing public.lot_sale_orders%ROWTYPE;
  v_lot_ids uuid[] := ARRAY(SELECT DISTINCT id FROM unnest(p_lot_ids) AS lot(id) ORDER BY id);
  v_lot record;
  v_digest text;
  v_order uuid;
  v_changed_price text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF auth.uid() IS DISTINCT FROM p_operator_id OR v_org IS NULL
    OR public.map_has_explicit_capability(v_org, 'map.manage_sales') IS NOT TRUE THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF coalesce(v_key, '') = '' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF p_stage IS NULL OR p_stage NOT IN ('RENOVACAO', 'SEGUNDA_ETAPA') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  IF cardinality(v_lot_ids) = 0 OR array_position(v_lot_ids, NULL::uuid) IS NOT NULL
    OR cardinality(v_lot_ids) <> cardinality(p_lot_ids) THEN RAISE EXCEPTION 'INVALID_LOT_SELECTION'; END IF;

  v_digest := encode(sha256(convert_to(jsonb_build_array(
    p_project_id, p_operator_id, p_stage, v_lot_ids, p_expected_prices, p_buyer_name, p_document_number,
    p_phone, p_email, p_payment_type, p_installment_count, p_payment_method, p_first_due_date,
    p_installments, p_expected_total, p_notes, p_exhibitor_id, p_fee_admin, p_fee_ppci,
    p_fee_cleaning_license, p_buyer_trade_name
  )::text, 'UTF8')), 'hex');
  PERFORM pg_advisory_xact_lock(hashtext('sale_order:' || v_key));
  SELECT * INTO v_existing FROM public.lot_sale_orders WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.project_id <> p_project_id OR v_existing.salesperson_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
    END IF;
    IF v_existing.submission_digest IS DISTINCT FROM v_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_SCOPE_MISMATCH'; END IF;
    RETURN v_existing.id;
  END IF;

  -- A mesma ordem de bloqueio do checkout normal evita duplicidade entre canais.
  PERFORM 1 FROM public.commercial_lots WHERE id = ANY(v_lot_ids) ORDER BY id FOR UPDATE;
  FOR v_lot IN
    SELECT requested.id, l.public_identifier, e.is_sellable,
      CASE p_stage WHEN 'RENOVACAO' THEN p.renovacao_total ELSE p.segunda_total END AS total
    FROM unnest(v_lot_ids) AS requested(id)
    LEFT JOIN public.commercial_lots l ON l.id = requested.id AND l.project_id = p_project_id AND l.archived_at IS NULL
    LEFT JOIN public.commercial_sale_eligibility e ON e.lot_id = l.id
    LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
    ORDER BY requested.id
  LOOP
    IF v_lot.public_identifier IS NULL THEN RAISE EXCEPTION 'LOT_UNAVAILABLE_OR_MISSING:%', v_lot.id; END IF;
    IF v_lot.is_sellable IS NOT TRUE THEN RAISE EXCEPTION 'LOT_NOT_SELLABLE:%', v_lot.public_identifier; END IF;
    IF p_expected_prices -> v_lot.id::text IS DISTINCT FROM to_jsonb(v_lot.total)
      OR v_lot.total IS NULL OR v_lot.total <= 0 THEN
      RAISE EXCEPTION 'LOT_PRICE_CHANGED:%', v_lot.public_identifier;
    END IF;
  END LOOP;

  v_order := public.register_commercial_sale_order(v_key, p_stage, p_lot_ids, p_buyer_name,
    p_document_number, p_phone, p_email, p_payment_type, p_installment_count, p_payment_method,
    p_first_due_date, p_installments, p_expected_total, p_notes, p_exhibitor_id,
    p_fee_admin, p_fee_ppci, p_fee_cleaning_license, p_buyer_trade_name);
  SELECT public_identifier INTO v_changed_price FROM public.lot_sale_order_items
  WHERE order_id = v_order AND p_expected_prices -> lot_id::text IS DISTINCT FROM to_jsonb(item_total)
  ORDER BY lot_id LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'LOT_PRICE_CHANGED:%', v_changed_price; END IF;
  UPDATE public.lot_sale_orders SET submitted_lot_ids = v_lot_ids, submission_digest = v_digest WHERE id = v_order;
  RETURN v_order;
END;
$$;
REVOKE ALL ON FUNCTION public.register_commercial_sale_order_checked(uuid,uuid,text,text,uuid[],jsonb,text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_commercial_sale_order_checked(uuid,uuid,text,text,uuid[],jsonb,text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric,text) TO authenticated;

-- O checkout e a revisão selecionam a etapa do pedido antes de gravar cada preço.
CREATE OR REPLACE FUNCTION public.guard_food_point_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.commercial_lots WHERE id = NEW.lot_id AND commercial_unit = 'FOOD_POINT' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.lot_sales WHERE lot_id = NEW.lot_id AND id <> NEW.id AND status IN ('OPEN', 'CONFIRMED')) THEN
    RAISE EXCEPTION 'FOOD_POINT_ACTIVE_SALE';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public.commercial_lot_pricing_2028 WHERE lot_id = NEW.lot_id
      AND NEW.negotiated_value IN (renovacao_total, segunda_total)
  ) THEN RAISE EXCEPTION 'FOOD_POINT_PRICE_MISMATCH'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_sale_order_items(
  p_order_id uuid, p_item_ids uuid[], p_expect_all_pending boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v_pending uuid[];
BEGIN
  IF p_expect_all_pending IS TRUE THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
    SELECT p.org_id INTO v_org FROM public.lot_sale_orders o
    JOIN public.map_projects p ON p.id = o.project_id WHERE o.id = p_order_id FOR UPDATE OF o;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
    IF public.map_has_explicit_capability(v_org, 'map.manage_sales') IS NOT TRUE THEN
      RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
    END IF;
    SELECT array_agg(id ORDER BY id) INTO v_pending FROM public.lot_sale_order_items
    WHERE order_id = p_order_id AND contract_state = 'PENDING_SIGNATURE';
    IF v_pending IS DISTINCT FROM ARRAY(SELECT id FROM unnest(p_item_ids) AS item(id) ORDER BY id) THEN
      RAISE EXCEPTION 'PENDING_ITEMS_CHANGED';
    END IF;
  END IF;
  RETURN public.confirm_sale_order_items(p_order_id, p_item_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_sale_order_items(uuid,uuid[],boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_sale_order_items(uuid,uuid[],boolean) TO authenticated;

-- A situação da assinatura é acessível na ficha sem consultar documentos.
CREATE OR REPLACE FUNCTION public.get_food_point_sale_snapshot(p_lot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v_sales boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT p.org_id INTO v_org FROM public.commercial_lots l
  JOIN public.map_projects p ON p.id = l.project_id
  WHERE l.id = p_lot_id AND l.commercial_unit = 'FOOD_POINT' AND l.archived_at IS NULL;
  v_sales := public.map_has_explicit_capability(v_org, 'map.manage_sales') IS TRUE;
  IF v_org IS NULL OR NOT (v_sales OR public.can_view_commercial_map(v_org) IS TRUE
    OR public.map_has_explicit_capability(v_org, 'map.manage_contracts') IS TRUE) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  SELECT jsonb_build_object('signatureState', coalesce(i.contract_state, 'LEGACY_UNVERIFIED'),
    'negotiatedValue', CASE WHEN v_sales THEN s.negotiated_value END,
    'orderFees', CASE WHEN v_sales THEN o.fees_total END)
  INTO v_result FROM public.lot_sales s
  LEFT JOIN public.lot_sale_order_items i ON i.sale_id = s.id AND i.lot_id = s.lot_id AND i.contract_state <> 'CANCELLED'
  LEFT JOIN public.lot_sale_orders o ON o.id = i.order_id
  WHERE s.lot_id = p_lot_id AND s.status IN ('OPEN', 'CONFIRMED') ORDER BY s.created_at DESC LIMIT 1;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_food_point_sale_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_food_point_sale_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_commercial_contract_upload(p_storage_path text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version public.lot_contract_versions%ROWTYPE;
  v_linked boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_storage_path IS NULL OR split_part(p_storage_path, '/', 1) NOT IN (
    SELECT id::text FROM public.map_capable_org_ids('map.manage_contracts') AS orgs(id)
  ) THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  SELECT * INTO v_version FROM public.lot_contract_versions WHERE storage_path = p_storage_path
  ORDER BY (uploaded_by = auth.uid()) DESC NULLS LAST, id LIMIT 1;
  v_linked := FOUND;
  RETURN jsonb_build_object('linked', v_linked,
    'uploaded', EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'map-contracts' AND name = p_storage_path
      AND owner_id = auth.uid()::text),
    'registration', CASE WHEN v_linked AND v_version.uploaded_by = auth.uid()
      THEN jsonb_build_object('contractId', v_version.contract_id, 'version', v_version.version, 'versionId', v_version.id) END);
END;
$$;
REVOKE ALL ON FUNCTION public.get_commercial_contract_upload(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_commercial_contract_upload(text) TO authenticated;

COMMIT;
