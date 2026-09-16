CREATE OR REPLACE VIEW public.commercial_sale_eligibility
WITH (security_invoker = on) AS
WITH hist AS (
  SELECT lot_id,
         count(*) AS entries,
         count(*) FILTER (
           WHERE reason IS DISTINCT FROM 'Lote numerado importado da referência oficial 2026.3; validação comercial pendente.'
         ) AS commercial_entries
  FROM public.lot_status_history
  GROUP BY lot_id
)
SELECT
  l.id AS lot_id,
  l.project_id,
  l.public_identifier,
  l.block,
  l.status,
  l.official_area_sqm,
  p.resolution_status,
  (l.block = 'P7') AS is_unpriced_pavilion,
  (EXISTS (SELECT 1 FROM public.lot_sales s WHERE s.lot_id = l.id AND coalesce(s.status, 'ACTIVE') <> 'REVERTED')) AS has_active_sale,
  (EXISTS (SELECT 1 FROM public.lot_reservations r WHERE r.lot_id = l.id AND r.status = 'ACTIVE')) AS has_active_reservation,
  (EXISTS (SELECT 1 FROM public.lot_negotiations n WHERE n.lot_id = l.id AND n.status = 'ACTIVE')) AS has_active_negotiation,
  (EXISTS (SELECT 1 FROM public.lot_contracts c WHERE c.lot_id = l.id AND c.is_active)) AS has_active_contract,
  CASE
    WHEN l.status IN ('AVAILABLE', 'RESERVED', 'IN_NEGOTIATION') THEN 'COMMERCIAL_OPEN'
    WHEN l.status = 'BLOCKED' AND coalesce(h.commercial_entries, 0) = 0 THEN 'TECHNICAL_BLOCK'
    WHEN l.status = 'BLOCKED' THEN 'COMMERCIAL_BLOCK'
    ELSE 'CLOSED'
  END AS status_origin,
  CASE
    WHEN l.archived_at IS NOT NULL THEN 'ARQUIVADO'
    WHEN l.official_area_sqm IS NULL OR l.official_area_sqm <= 0 THEN 'SEM_AREA_OFICIAL'
    WHEN l.block = 'P7' THEN 'PAVILHAO_7_SEM_PRECO'
    WHEN p.resolution_status IS DISTINCT FROM 'OK' THEN 'SEM_PRECO_2028'
    WHEN EXISTS (SELECT 1 FROM public.lot_sales s WHERE s.lot_id = l.id AND coalesce(s.status, 'ACTIVE') <> 'REVERTED') THEN 'VENDA_ATIVA'
    WHEN EXISTS (SELECT 1 FROM public.lot_reservations r WHERE r.lot_id = l.id AND r.status = 'ACTIVE') THEN 'RESERVA_ATIVA'
    WHEN EXISTS (SELECT 1 FROM public.lot_negotiations n WHERE n.lot_id = l.id AND n.status = 'ACTIVE') THEN 'NEGOCIACAO_ATIVA'
    WHEN EXISTS (SELECT 1 FROM public.lot_contracts c WHERE c.lot_id = l.id AND c.is_active) THEN 'CONTRATO_ATIVO'
    WHEN l.status IN ('AVAILABLE', 'RESERVED', 'IN_NEGOTIATION') THEN NULL
    WHEN l.status = 'BLOCKED' AND coalesce(h.commercial_entries, 0) = 0 THEN NULL
    WHEN l.status = 'BLOCKED' THEN 'BLOQUEIO_COMERCIAL_EXPLICITO'
    ELSE 'STATUS_NAO_VENDAVEL'
  END AS ineligible_reason,
  (
    l.archived_at IS NULL
    AND l.official_area_sqm IS NOT NULL AND l.official_area_sqm > 0
    AND l.block IS DISTINCT FROM 'P7'
    AND p.resolution_status = 'OK'
    AND NOT EXISTS (SELECT 1 FROM public.lot_sales s WHERE s.lot_id = l.id AND coalesce(s.status, 'ACTIVE') <> 'REVERTED')
    AND NOT EXISTS (SELECT 1 FROM public.lot_reservations r WHERE r.lot_id = l.id AND r.status = 'ACTIVE')
    AND NOT EXISTS (SELECT 1 FROM public.lot_negotiations n WHERE n.lot_id = l.id AND n.status = 'ACTIVE')
    AND NOT EXISTS (SELECT 1 FROM public.lot_contracts c WHERE c.lot_id = l.id AND c.is_active)
    AND (
      l.status IN ('AVAILABLE', 'RESERVED', 'IN_NEGOTIATION')
      OR (l.status = 'BLOCKED' AND coalesce(h.commercial_entries, 0) = 0)
    )
  ) AS is_sellable
FROM public.commercial_lots l
LEFT JOIN hist h ON h.lot_id = l.id
LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id;

GRANT SELECT ON public.commercial_sale_eligibility TO authenticated;
GRANT SELECT ON public.commercial_sale_eligibility TO service_role;

CREATE OR REPLACE FUNCTION public.register_commercial_sale_order(p_idempotency_key text, p_stage text, p_lot_ids uuid[], p_buyer_name text, p_document_number text, p_phone text, p_email text, p_payment_type text, p_installment_count integer, p_payment_method text, p_first_due_date date, p_installments jsonb, p_expected_total numeric, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing uuid;
  v_project_id uuid;
  v_org_id uuid;
  v_order_id uuid;
  v_lot record;
  v_price numeric;
  v_total numeric := 0;
  v_area numeric := 0;
  v_rule_id uuid;
  v_rule_label text;
  v_item_total numeric;
  v_sale_id uuid;
  v_inst jsonb;
  v_inst_sum numeric := 0;
  v_count integer := 0;
  v_sellable boolean;
BEGIN
  IF coalesce(trim(p_idempotency_key), '') = '' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  SELECT id INTO v_existing FROM public.lot_sale_orders WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF p_stage NOT IN ('RENOVACAO','SEGUNDA_ETAPA') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  IF p_lot_ids IS NULL OR array_length(p_lot_ids, 1) IS NULL THEN RAISE EXCEPTION 'NO_LOTS_SELECTED'; END IF;
  IF coalesce(trim(p_buyer_name), '') = '' THEN RAISE EXCEPTION 'BUYER_REQUIRED'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT l.project_id INTO v_project_id FROM public.commercial_lots l WHERE l.id = p_lot_ids[1];
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;

  INSERT INTO public.lot_sale_orders (
    project_id, buyer_name, document_number, phone, email, stage,
    official_area_total, negotiated_total, payment_type, installment_count,
    payment_method, first_due_date, notes, salesperson_user_id, idempotency_key
  ) VALUES (
    v_project_id, trim(p_buyer_name), nullif(trim(p_document_number), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''), p_stage, 0, 0, p_payment_type, greatest(coalesce(p_installment_count, 1), 1),
    coalesce(nullif(trim(p_payment_method), ''), 'OUTRO'), p_first_due_date, nullif(trim(p_notes), ''),
    auth.uid(), trim(p_idempotency_key)
  ) RETURNING id INTO v_order_id;

  FOR v_lot IN
    SELECT l.* FROM public.commercial_lots l
    WHERE l.id = ANY(p_lot_ids) AND l.archived_at IS NULL
    ORDER BY l.id
    FOR UPDATE
  LOOP
    v_count := v_count + 1;
    IF v_lot.project_id <> v_project_id THEN RAISE EXCEPTION 'LOT_PROJECT_MISMATCH:%', v_lot.public_identifier; END IF;

    SELECT e.is_sellable INTO v_sellable
      FROM public.commercial_sale_eligibility e WHERE e.lot_id = v_lot.id;
    IF v_sellable IS NOT TRUE THEN
      RAISE EXCEPTION 'LOT_NOT_SELLABLE:%', v_lot.public_identifier;
    END IF;

    SELECT CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_price_per_sqm ELSE v.segunda_price_per_sqm END,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_rule_id ELSE v.segunda_rule_id END,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_rule_label ELSE v.segunda_rule_label END
      INTO v_price, v_rule_id, v_rule_label
      FROM public.commercial_lot_pricing_2028 v WHERE v.lot_id = v_lot.id;

    IF v_price IS NULL OR v_price <= 0 OR v_lot.official_area_sqm IS NULL OR v_lot.official_area_sqm <= 0 THEN
      RAISE EXCEPTION 'LOT_WITHOUT_OFFICIAL_PRICE:%', v_lot.public_identifier;
    END IF;

    v_item_total := round(v_lot.official_area_sqm * v_price, 2);
    v_total := v_total + v_item_total;
    v_area := v_area + v_lot.official_area_sqm;

    INSERT INTO public.lot_sales (
      lot_id, buyer_name, document_number, negotiated_value, sale_date,
      salesperson_user_id, salesperson_name, payment_status, internal_notes
    ) VALUES (
      v_lot.id, trim(p_buyer_name), nullif(trim(p_document_number), ''), v_item_total, current_date,
      auth.uid(), coalesce((SELECT nome FROM public.profiles WHERE id = auth.uid()), 'Equipe comercial'),
      'PENDING', nullif(trim(p_notes), '')
    ) RETURNING id INTO v_sale_id;

    INSERT INTO public.lot_sale_order_items (
      order_id, lot_id, public_identifier, official_area_snapshot, price_per_sqm_snapshot,
      pricing_rule_id, pricing_rule_label, pricing_stage, item_total, original_status, sale_id
    ) VALUES (
      v_order_id, v_lot.id, v_lot.public_identifier, v_lot.official_area_sqm, v_price,
      v_rule_id, v_rule_label, p_stage, v_item_total, v_lot.status, v_sale_id
    );

    UPDATE public.lot_reservations SET status = 'CONVERTED', updated_at = now() WHERE lot_id = v_lot.id AND status = 'ACTIVE';
    UPDATE public.lot_negotiations SET status = 'WON', updated_at = now() WHERE lot_id = v_lot.id AND status = 'ACTIVE';
    UPDATE public.commercial_lots SET status = 'SOLD', updated_by = auth.uid(), updated_at = now() WHERE id = v_lot.id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_lot.id, v_lot.status, 'SOLD', coalesce(nullif(trim(p_notes), ''), 'Venda multi-lote'), auth.uid());
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, v_lot.id, 'LOT_SOLD',
      jsonb_build_object('status', v_lot.status),
      jsonb_build_object('status', 'SOLD', 'sale_order_id', v_order_id, 'stage', p_stage, 'item_total', v_item_total),
      'Venda multi-lote', auth.uid());
  END LOOP;

  IF v_count <> array_length(p_lot_ids, 1) THEN RAISE EXCEPTION 'LOT_UNAVAILABLE_OR_MISSING'; END IF;
  IF p_expected_total IS NOT NULL AND abs(p_expected_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH:%:%', p_expected_total, v_total;
  END IF;

  IF p_installments IS NOT NULL AND jsonb_array_length(p_installments) > 0 THEN
    FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments) LOOP
      v_inst_sum := v_inst_sum + (v_inst->>'amount')::numeric;
      INSERT INTO public.lot_sale_installments (order_id, installment_number, due_date, amount)
      VALUES (v_order_id, (v_inst->>'number')::integer, (v_inst->>'due_date')::date, (v_inst->>'amount')::numeric);
    END LOOP;
    IF abs(v_inst_sum - v_total) > 0.001 THEN RAISE EXCEPTION 'INSTALLMENTS_MISMATCH:%:%', v_inst_sum, v_total; END IF;
  END IF;

  UPDATE public.lot_sale_orders
  SET official_area_total = v_area, negotiated_total = v_total, updated_at = now()
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_commercial_sale_order(text, text, uuid[], text, text, text, text, text, integer, text, date, jsonb, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_commercial_sale_order(text, text, uuid[], text, text, text, text, text, integer, text, date, jsonb, numeric, text) TO authenticated;