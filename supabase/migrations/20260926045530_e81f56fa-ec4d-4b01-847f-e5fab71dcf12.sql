CREATE TABLE IF NOT EXISTS public.commercial_exhibitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_number text NOT NULL,
  document_normalized text NOT NULL,
  phone text,
  email text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_exhibitors_doc_chk CHECK (document_normalized ~ '^[0-9]{11}$|^[0-9]{14}$'),
  CONSTRAINT commercial_exhibitors_org_doc_key UNIQUE (org_id, document_normalized)
);
GRANT SELECT ON public.commercial_exhibitors TO authenticated;
GRANT ALL ON public.commercial_exhibitors TO service_role;
ALTER TABLE public.commercial_exhibitors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sales users read exhibitors" ON public.commercial_exhibitors;
CREATE POLICY "Sales users read exhibitors" ON public.commercial_exhibitors
  FOR SELECT TO authenticated USING (public.map_has_explicit_capability(org_id, 'map.manage_sales'));

ALTER TABLE public.lot_sale_orders
  ADD COLUMN IF NOT EXISTS exhibitor_id uuid REFERENCES public.commercial_exhibitors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS spaces_subtotal numeric,
  ADD COLUMN IF NOT EXISTS fee_admin numeric NOT NULL DEFAULT 0 CHECK (fee_admin >= 0),
  ADD COLUMN IF NOT EXISTS fee_ppci numeric NOT NULL DEFAULT 0 CHECK (fee_ppci >= 0),
  ADD COLUMN IF NOT EXISTS fee_cleaning_license numeric NOT NULL DEFAULT 0 CHECK (fee_cleaning_license >= 0),
  ADD COLUMN IF NOT EXISTS fees_total numeric NOT NULL DEFAULT 0 CHECK (fees_total >= 0);
UPDATE public.lot_sale_orders SET spaces_subtotal = negotiated_total WHERE spaces_subtotal IS NULL;

CREATE OR REPLACE FUNCTION public.upsert_commercial_exhibitor(p_project_id uuid, p_name text, p_document text, p_phone text, p_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_org uuid; v_doc text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  v_doc := regexp_replace(coalesce(p_document,''), '\D', '', 'g');
  IF length(v_doc) NOT IN (11,14) THEN RAISE EXCEPTION 'INVALID_DOCUMENT'; END IF;
  IF length(btrim(coalesce(p_name,''))) < 3 THEN RAISE EXCEPTION 'BUYER_REQUIRED'; END IF;
  IF nullif(btrim(p_email),'') IS NOT NULL AND btrim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
  INSERT INTO public.commercial_exhibitors (org_id, name, document_number, document_normalized, phone, email, created_by, updated_by)
  VALUES (v_org, btrim(p_name), btrim(p_document), v_doc, nullif(btrim(p_phone),''), nullif(btrim(p_email),''), auth.uid(), auth.uid())
  ON CONFLICT (org_id, document_normalized) DO UPDATE SET
    name = coalesce(nullif(btrim(EXCLUDED.name),''), commercial_exhibitors.name),
    document_number = EXCLUDED.document_number,
    phone = coalesce(EXCLUDED.phone, commercial_exhibitors.phone),
    email = coalesce(EXCLUDED.email, commercial_exhibitors.email),
    updated_by = auth.uid(), updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.upsert_commercial_exhibitor(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_commercial_exhibitor(uuid,text,text,text,text) TO authenticated;

DROP FUNCTION IF EXISTS public.register_commercial_sale_order(text,text,uuid[],text,text,text,text,text,integer,text,date,jsonb,numeric,text);

CREATE OR REPLACE FUNCTION public.register_commercial_sale_order(p_idempotency_key text, p_stage text, p_lot_ids uuid[], p_buyer_name text, p_document_number text, p_phone text, p_email text, p_payment_type text, p_installment_count integer, p_payment_method text, p_first_due_date date, p_installments jsonb, p_expected_total numeric, p_notes text,
  p_exhibitor_id uuid DEFAULT NULL, p_fee_admin numeric DEFAULT 0, p_fee_ppci numeric DEFAULT 0, p_fee_cleaning_license numeric DEFAULT 0)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
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
    INSERT INTO public.lot_sales (lot_id, buyer_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, payment_status, internal_notes)
    VALUES (v_lot.id, trim(p_buyer_name), nullif(trim(p_document_number), ''), v_item_total, current_date, auth.uid(), v_salesperson_name, 'PENDING', nullif(trim(p_notes), ''))
    RETURNING id INTO v_sale_id;
    INSERT INTO public.lot_sale_order_items (order_id, lot_id, public_identifier, official_area_snapshot, price_per_sqm_snapshot, pricing_rule_id, pricing_rule_label, pricing_stage, item_total, original_status, sale_id)
    VALUES (v_order_id, v_lot.id, v_lot.public_identifier, v_lot.official_area_sqm, v_price, v_rule_id, v_rule_label, p_stage, v_item_total, v_lot.status, v_sale_id);
    UPDATE public.lot_reservations SET status = 'CONVERTED', updated_at = now() WHERE lot_id = v_lot.id AND status = 'ACTIVE';
    UPDATE public.lot_negotiations SET status = 'WON', updated_at = now() WHERE lot_id = v_lot.id AND status = 'ACTIVE';
    UPDATE public.commercial_lots SET status = 'SOLD', updated_by = auth.uid(), updated_at = now() WHERE id = v_lot.id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_lot.id, v_lot.status, 'SOLD', coalesce(nullif(trim(p_notes), ''), 'Venda multi-lote'), auth.uid());
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, v_lot.id, 'LOT_SOLD', jsonb_build_object('status', v_lot.status),
      jsonb_build_object('status', 'SOLD', 'sale_order_id', v_order_id, 'stage', p_stage, 'item_total', v_item_total), 'Venda multi-lote', auth.uid());
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
REVOKE ALL ON FUNCTION public.register_commercial_sale_order(text,text,uuid[],text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_commercial_sale_order(text,text,uuid[],text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric) TO authenticated;