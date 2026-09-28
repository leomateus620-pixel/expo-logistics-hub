-- Fase 1: novo estado cadastral SALE_OPEN
ALTER TABLE public.commercial_lots DROP CONSTRAINT IF EXISTS commercial_lots_status_check;
ALTER TABLE public.commercial_lots ADD CONSTRAINT commercial_lots_status_check
  CHECK (status = ANY (ARRAY['AVAILABLE','RESERVED','IN_NEGOTIATION','SALE_OPEN','SOLD','BLOCKED','UNAVAILABLE']));

ALTER TABLE public.lot_status_history DROP CONSTRAINT IF EXISTS lot_status_history_new_check;
ALTER TABLE public.lot_status_history ADD CONSTRAINT lot_status_history_new_check
  CHECK (new_status = ANY (ARRAY['AVAILABLE','RESERVED','IN_NEGOTIATION','SALE_OPEN','SOLD','BLOCKED','UNAVAILABLE']));
ALTER TABLE public.lot_status_history DROP CONSTRAINT IF EXISTS lot_status_history_previous_check;
ALTER TABLE public.lot_status_history ADD CONSTRAINT lot_status_history_previous_check
  CHECK (previous_status IS NULL OR previous_status = ANY (ARRAY['AVAILABLE','RESERVED','IN_NEGOTIATION','SALE_OPEN','SOLD','BLOCKED','UNAVAILABLE']));

-- Fase 2: estado contratual dos itens do pedido
ALTER TABLE public.lot_sale_order_items ADD COLUMN IF NOT EXISTS contract_state text NOT NULL DEFAULT 'PENDING_SIGNATURE';
ALTER TABLE public.lot_sale_order_items ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE public.lot_sale_order_items ADD COLUMN IF NOT EXISTS signed_by uuid;
ALTER TABLE public.lot_sale_order_items ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.lot_sale_order_items ADD COLUMN IF NOT EXISTS cancelled_by uuid;
ALTER TABLE public.lot_sale_order_items DROP CONSTRAINT IF EXISTS lot_sale_order_items_contract_state_check;
ALTER TABLE public.lot_sale_order_items ADD CONSTRAINT lot_sale_order_items_contract_state_check
  CHECK (contract_state = ANY (ARRAY['PENDING_SIGNATURE','SIGNED','CANCELLED','LEGACY_UNVERIFIED']));

-- Itens históricos: legado sem comprovação de assinatura (lotes permanecem SOLD)
UPDATE public.lot_sale_order_items SET contract_state = 'LEGACY_UNVERIFIED' WHERE contract_state = 'PENDING_SIGNATURE';

-- lot_sales passa a aceitar OPEN (venda em aberto) além de CONFIRMED/REVERTED
ALTER TABLE public.lot_sales DROP CONSTRAINT IF EXISTS lot_sales_status_check;
ALTER TABLE public.lot_sales ADD CONSTRAINT lot_sales_status_check
  CHECK (status = ANY (ARRAY['OPEN','CONFIRMED','REVERTED']));

-- Fase 3: checkout registra Venda em aberto (não mais SOLD direto)
CREATE OR REPLACE FUNCTION public.register_commercial_sale_order(p_idempotency_key text, p_stage text, p_lot_ids uuid[], p_buyer_name text, p_document_number text, p_phone text, p_email text, p_payment_type text, p_installment_count integer, p_payment_method text, p_first_due_date date, p_installments jsonb, p_expected_total numeric, p_notes text, p_exhibitor_id uuid DEFAULT NULL::uuid, p_fee_admin numeric DEFAULT 0, p_fee_ppci numeric DEFAULT 0, p_fee_cleaning_license numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing uuid; v_project_id uuid; v_org_id uuid; v_order_id uuid; v_lot record;
  v_price numeric; v_total numeric := 0; v_area numeric := 0; v_rule_id uuid; v_rule_label text;
  v_item_total numeric; v_sale_id uuid; v_inst jsonb; v_inst_sum numeric := 0; v_count integer := 0;
  v_sellable boolean; v_salesperson_name text; v_fees numeric; v_final numeric; v_n integer; v_type text; v_method text;
  v_fa numeric := round(coalesce(p_fee_admin,0),2); v_fp numeric := round(coalesce(p_fee_ppci,0),2); v_fc numeric := round(coalesce(p_fee_cleaning_license,0),2);
  v_idx integer := 0;
BEGIN
  IF coalesce(trim(p_idempotency_key), '') = '' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('sale_order:' || trim(p_idempotency_key)));
  SELECT id INTO v_existing FROM public.lot_sale_orders WHERE idempotency_key = trim(p_idempotency_key);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF p_stage NOT IN ('RENOVACAO','SEGUNDA_ETAPA') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  IF p_lot_ids IS NULL OR array_length(p_lot_ids, 1) IS NULL THEN RAISE EXCEPTION 'NO_LOTS_SELECTED'; END IF;
  IF coalesce(trim(p_buyer_name), '') = '' THEN RAISE EXCEPTION 'BUYER_REQUIRED'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_fa < 0 OR v_fp < 0 OR v_fc < 0 THEN RAISE EXCEPTION 'INVALID_FEE'; END IF;
  v_fees := v_fa + v_fp + v_fc;

  v_method := upper(coalesce(trim(p_payment_method), ''));
  IF v_method NOT IN ('PIX','BOLETO_AVISTA','BOLETO_PARCELADO') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'; END IF;
  v_n := coalesce(jsonb_array_length(p_installments), 0);
  IF v_method IN ('PIX','BOLETO_AVISTA') AND v_n <> 1 THEN RAISE EXCEPTION 'INSTALLMENT_COUNT_INVALID'; END IF;
  IF v_method = 'BOLETO_PARCELADO' AND (v_n < 2 OR v_n > 36) THEN RAISE EXCEPTION 'INSTALLMENT_COUNT_INVALID'; END IF;
  v_type := CASE WHEN v_method = 'BOLETO_PARCELADO' THEN 'INSTALLMENTS' ELSE 'CASH' END;

  v_salesperson_name := coalesce((SELECT nullif(btrim(p.full_name), '') FROM public.profiles AS p WHERE p.user_id = auth.uid()), 'Equipe comercial');

  SELECT l.project_id INTO v_project_id FROM public.commercial_lots l WHERE l.id = p_lot_ids[1];
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_exhibitor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.commercial_exhibitors WHERE id = p_exhibitor_id AND org_id = v_org_id) THEN
    RAISE EXCEPTION 'EXHIBITOR_NOT_FOUND';
  END IF;

  INSERT INTO public.lot_sale_orders (
    project_id, buyer_name, document_number, phone, email, stage, official_area_total, negotiated_total, payment_type, installment_count,
    payment_method, first_due_date, notes, salesperson_user_id, idempotency_key, exhibitor_id, fee_admin, fee_ppci, fee_cleaning_license, fees_total, spaces_subtotal
  ) VALUES (
    v_project_id, trim(p_buyer_name), nullif(trim(p_document_number), ''), nullif(trim(p_phone), ''), nullif(trim(p_email), ''), p_stage, 0, 0, v_type, v_n,
    v_method, (p_installments->0->>'due_date')::date, nullif(trim(p_notes), ''), auth.uid(), trim(p_idempotency_key), p_exhibitor_id, v_fa, v_fp, v_fc, v_fees, 0
  ) RETURNING id INTO v_order_id;

  FOR v_lot IN SELECT l.* FROM public.commercial_lots l WHERE l.id = ANY(p_lot_ids) AND l.archived_at IS NULL ORDER BY l.id FOR UPDATE LOOP
    v_count := v_count + 1;
    IF v_lot.project_id <> v_project_id THEN RAISE EXCEPTION 'LOT_PROJECT_MISMATCH:%', v_lot.public_identifier; END IF;
    SELECT e.is_sellable INTO v_sellable FROM public.commercial_sale_eligibility e WHERE e.lot_id = v_lot.id;
    IF v_sellable IS NOT TRUE THEN RAISE EXCEPTION 'LOT_NOT_SELLABLE:%', v_lot.public_identifier; END IF;
    SELECT CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_price_per_sqm ELSE v.segunda_price_per_sqm END,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_rule_id ELSE v.segunda_rule_id END,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_rule_label ELSE v.segunda_rule_label END
      INTO v_price, v_rule_id, v_rule_label FROM public.commercial_lot_pricing_2028 v WHERE v.lot_id = v_lot.id;
    IF v_price IS NULL OR v_price <= 0 OR v_lot.official_area_sqm IS NULL OR v_lot.official_area_sqm <= 0 THEN
      RAISE EXCEPTION 'LOT_WITHOUT_OFFICIAL_PRICE:%', v_lot.public_identifier;
    END IF;
    v_item_total := round(v_lot.official_area_sqm * v_price, 2);
    v_total := v_total + v_item_total;
    v_area := v_area + v_lot.official_area_sqm;
    INSERT INTO public.lot_sales (lot_id, buyer_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, payment_status, internal_notes, status)
    VALUES (v_lot.id, trim(p_buyer_name), nullif(trim(p_document_number), ''), v_item_total, current_date, auth.uid(), v_salesperson_name, 'PENDING', nullif(trim(p_notes), ''), 'OPEN')
    RETURNING id INTO v_sale_id;
    INSERT INTO public.lot_sale_order_items (order_id, lot_id, public_identifier, official_area_snapshot, price_per_sqm_snapshot, pricing_rule_id, pricing_rule_label, pricing_stage, item_total, original_status, sale_id, contract_state)
    VALUES (v_order_id, v_lot.id, v_lot.public_identifier, v_lot.official_area_sqm, v_price, v_rule_id, v_rule_label, p_stage, v_item_total, v_lot.status, v_sale_id, 'PENDING_SIGNATURE');
    UPDATE public.lot_reservations SET status = 'CONVERTED', updated_at = now() WHERE lot_id = v_lot.id AND status = 'ACTIVE';
    UPDATE public.lot_negotiations SET status = 'WON', updated_at = now() WHERE lot_id = v_lot.id AND status = 'ACTIVE';
    UPDATE public.commercial_lots SET status = 'SALE_OPEN', updated_by = auth.uid(), updated_at = now() WHERE id = v_lot.id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_lot.id, v_lot.status, 'SALE_OPEN', coalesce(nullif(trim(p_notes), ''), 'Venda em aberto registrada'), auth.uid());
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, v_lot.id, 'LOT_SALE_OPEN', jsonb_build_object('status', v_lot.status),
      jsonb_build_object('status', 'SALE_OPEN', 'sale_order_id', v_order_id, 'stage', p_stage, 'item_total', v_item_total), 'Venda em aberto registrada', auth.uid());
  END LOOP;

  IF v_count <> array_length(p_lot_ids, 1) THEN RAISE EXCEPTION 'LOT_UNAVAILABLE_OR_MISSING'; END IF;
  v_final := v_total + v_fees;
  IF p_expected_total IS NOT NULL AND abs(p_expected_total - v_final) > 0.001 THEN RAISE EXCEPTION 'TOTAL_MISMATCH:%:%', p_expected_total, v_final; END IF;

  FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments) LOOP
    v_idx := v_idx + 1;
    IF (v_inst->>'amount')::numeric <= 0 OR round((v_inst->>'amount')::numeric, 2) <> (v_inst->>'amount')::numeric THEN RAISE EXCEPTION 'INSTALLMENT_AMOUNT_INVALID'; END IF;
    IF (v_inst->>'due_date') IS NULL OR (v_inst->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'INSTALLMENT_DATE_INVALID'; END IF;
    v_inst_sum := v_inst_sum + (v_inst->>'amount')::numeric;
    INSERT INTO public.lot_sale_installments (order_id, installment_number, due_date, amount)
    VALUES (v_order_id, v_idx, (v_inst->>'due_date')::date, (v_inst->>'amount')::numeric);
  END LOOP;
  IF v_inst_sum <> v_final THEN RAISE EXCEPTION 'INSTALLMENTS_MISMATCH:%:%', v_inst_sum, v_final; END IF;

  UPDATE public.lot_sale_orders SET official_area_total = v_area, spaces_subtotal = v_total, negotiated_total = v_final, updated_at = now() WHERE id = v_order_id;
  RETURN v_order_id;
END;
$function$;

-- Fase 4: venda individual legada também cria Venda em aberto
CREATE OR REPLACE FUNCTION public.register_commercial_sale(p_lot_id uuid, p_buyer_name text, p_document_number text, p_negotiated_value numeric, p_sale_date date, p_salesperson_name text, p_contract_number text, p_payment_status text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_sale_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.status NOT IN ('RESERVED', 'IN_NEGOTIATION', 'AVAILABLE') THEN RAISE EXCEPTION 'LOT_CANNOT_BE_SOLD'; END IF;
  IF coalesce(trim(p_buyer_name), '') = '' OR coalesce(trim(p_salesperson_name), '') = '' THEN RAISE EXCEPTION 'SALE_PARTIES_REQUIRED'; END IF;
  IF p_negotiated_value < 0 THEN RAISE EXCEPTION 'INVALID_SALE_VALUE'; END IF;
  INSERT INTO public.lot_sales (lot_id, buyer_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, contract_number, payment_status, internal_notes, status)
  VALUES (p_lot_id, trim(p_buyer_name), nullif(trim(p_document_number), ''), p_negotiated_value, p_sale_date, auth.uid(), trim(p_salesperson_name), nullif(trim(p_contract_number), ''), p_payment_status, p_notes, 'OPEN')
  RETURNING id INTO v_sale_id;
  UPDATE public.lot_reservations SET status = 'CONVERTED', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.lot_negotiations SET status = 'WON', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.commercial_lots SET status = 'SALE_OPEN', updated_by = auth.uid(), updated_at = now() WHERE id = p_lot_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (p_lot_id, v_lot.status, 'SALE_OPEN', coalesce(nullif(trim(p_notes), ''), 'Venda em aberto registrada'), auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, 'LOT_SALE_OPEN', jsonb_build_object('status', v_lot.status), jsonb_build_object('status', 'SALE_OPEN', 'sale_id', v_sale_id), p_notes, auth.uid());
  RETURN v_sale_id;
END;
$function$;

-- Fase 5: confirmar assinatura (um ou vários itens do mesmo pedido) — idempotente
CREATE OR REPLACE FUNCTION public.confirm_sale_order_items(p_order_id uuid, p_item_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.lot_sale_orders%ROWTYPE; v_org_id uuid; v_item record;
  v_confirmed integer := 0; v_skipped integer := 0; v_remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN RAISE EXCEPTION 'NO_ITEMS_SELECTED'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_order.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;

  FOR v_item IN
    SELECT i.*, l.status AS lot_status, l.entity_id, l.project_id AS lot_project_id
      FROM public.lot_sale_order_items i
      JOIN public.commercial_lots l ON l.id = i.lot_id
     WHERE i.order_id = p_order_id AND i.id = ANY(p_item_ids)
     ORDER BY i.id
     FOR UPDATE OF i, l
  LOOP
    IF v_item.contract_state = 'SIGNED' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF v_item.contract_state <> 'PENDING_SIGNATURE' THEN
      RAISE EXCEPTION 'ITEM_NOT_PENDING:%', v_item.public_identifier;
    END IF;
    IF v_item.lot_status <> 'SALE_OPEN' THEN
      RAISE EXCEPTION 'LOT_NOT_SALE_OPEN:%', v_item.public_identifier;
    END IF;
    UPDATE public.lot_sale_order_items
       SET contract_state = 'SIGNED', signed_at = now(), signed_by = auth.uid()
     WHERE id = v_item.id;
    UPDATE public.lot_sales SET status = 'CONFIRMED' WHERE id = v_item.sale_id AND status = 'OPEN';
    UPDATE public.commercial_lots SET status = 'SOLD', updated_by = auth.uid(), updated_at = now() WHERE id = v_item.lot_id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_item.lot_id, 'SALE_OPEN', 'SOLD', 'Contrato assinado confirmado', auth.uid());
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org_id, v_item.lot_project_id, v_item.entity_id, v_item.lot_id, 'LOT_SALE_CONFIRMED',
      jsonb_build_object('status', 'SALE_OPEN'), jsonb_build_object('status', 'SOLD', 'sale_order_id', p_order_id, 'item_id', v_item.id),
      'Contrato assinado confirmado', auth.uid());
    v_confirmed := v_confirmed + 1;
  END LOOP;

  IF v_confirmed + v_skipped <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'ITEM_NOT_IN_ORDER';
  END IF;

  UPDATE public.lot_sale_orders SET updated_at = now() WHERE id = p_order_id;
  SELECT count(*) INTO v_remaining FROM public.lot_sale_order_items WHERE order_id = p_order_id AND contract_state = 'PENDING_SIGNATURE';

  RETURN jsonb_build_object('orderId', p_order_id, 'confirmed', v_confirmed, 'skipped', v_skipped, 'pendingRemaining', v_remaining);
END;
$function$;

-- Fase 6: cancelar venda em aberto — lotes voltam a Disponível, nada é apagado
CREATE OR REPLACE FUNCTION public.cancel_sale_order_items(p_order_id uuid, p_item_ids uuid[], p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.lot_sale_orders%ROWTYPE; v_org_id uuid; v_item record;
  v_cancelled integer := 0; v_skipped integer := 0; v_remaining integer; v_open_items integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN RAISE EXCEPTION 'NO_ITEMS_SELECTED'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_order.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;

  FOR v_item IN
    SELECT i.*, l.status AS lot_status, l.entity_id, l.project_id AS lot_project_id
      FROM public.lot_sale_order_items i
      JOIN public.commercial_lots l ON l.id = i.lot_id
     WHERE i.order_id = p_order_id AND i.id = ANY(p_item_ids)
     ORDER BY i.id
     FOR UPDATE OF i, l
  LOOP
    IF v_item.contract_state = 'CANCELLED' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF v_item.contract_state <> 'PENDING_SIGNATURE' THEN
      RAISE EXCEPTION 'ITEM_NOT_PENDING:%', v_item.public_identifier;
    END IF;
    IF v_item.lot_status <> 'SALE_OPEN' THEN
      RAISE EXCEPTION 'LOT_NOT_SALE_OPEN:%', v_item.public_identifier;
    END IF;
    UPDATE public.lot_sale_order_items
       SET contract_state = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid()
     WHERE id = v_item.id;
    UPDATE public.lot_sales SET status = 'REVERTED' WHERE id = v_item.sale_id AND status = 'OPEN';
    UPDATE public.commercial_lots SET status = 'AVAILABLE', updated_by = auth.uid(), updated_at = now() WHERE id = v_item.lot_id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_item.lot_id, 'SALE_OPEN', 'AVAILABLE', coalesce(nullif(trim(p_reason), ''), 'Venda em aberto cancelada'), auth.uid());
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org_id, v_item.lot_project_id, v_item.entity_id, v_item.lot_id, 'LOT_SALE_CANCELLED',
      jsonb_build_object('status', 'SALE_OPEN'), jsonb_build_object('status', 'AVAILABLE', 'sale_order_id', p_order_id, 'item_id', v_item.id),
      coalesce(nullif(trim(p_reason), ''), 'Venda em aberto cancelada'), auth.uid());
    v_cancelled := v_cancelled + 1;
  END LOOP;

  IF v_cancelled + v_skipped <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'ITEM_NOT_IN_ORDER';
  END IF;

  SELECT count(*) FILTER (WHERE contract_state = 'PENDING_SIGNATURE'),
         count(*) FILTER (WHERE contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED'))
    INTO v_remaining, v_open_items
    FROM public.lot_sale_order_items WHERE order_id = p_order_id;

  IF v_open_items = 0 THEN
    UPDATE public.lot_sale_orders
       SET status = 'REVERTED', reverted_at = now(), reverted_by = auth.uid(), updated_at = now()
     WHERE id = p_order_id;
  ELSE
    UPDATE public.lot_sale_orders SET updated_at = now() WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('orderId', p_order_id, 'cancelled', v_cancelled, 'skipped', v_skipped, 'pendingRemaining', v_remaining);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_sale_order_items(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale_order_items(uuid, uuid[], text) TO authenticated;

-- Fase 7: contrato público reconhece a fase Venda em aberto (sem expor comprador/pedido)
CREATE OR REPLACE FUNCTION public.public_map_lot_availability(_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _status
    WHEN 'AVAILABLE' THEN 'AVAILABLE'
    WHEN 'RESERVED' THEN 'RESERVED'
    WHEN 'IN_NEGOTIATION' THEN 'RESERVED'
    WHEN 'SALE_OPEN' THEN 'SALE_OPEN'
    WHEN 'SOLD' THEN 'SOLD'
    ELSE 'UNAVAILABLE'
  END;
$function$;