CREATE TABLE public.lot_sale_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE RESTRICT,
  buyer_name text NOT NULL,
  document_number text,
  phone text,
  email text,
  stage text NOT NULL CHECK (stage IN ('RENOVACAO','SEGUNDA_ETAPA')),
  official_area_total numeric(14,2) NOT NULL DEFAULT 0,
  negotiated_total numeric(14,2) NOT NULL DEFAULT 0,
  payment_type text NOT NULL CHECK (payment_type IN ('CASH','INSTALLMENTS')),
  installment_count integer NOT NULL DEFAULT 1 CHECK (installment_count >= 1),
  payment_method text NOT NULL,
  first_due_date date,
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','REVERTED')),
  notes text,
  salesperson_user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  reverted_by uuid
);
CREATE UNIQUE INDEX lot_sale_orders_idempotency_key_uidx ON public.lot_sale_orders (idempotency_key);
CREATE INDEX lot_sale_orders_project_idx ON public.lot_sale_orders (project_id, created_at DESC);

CREATE TABLE public.lot_sale_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.lot_sale_orders(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  public_identifier text NOT NULL,
  official_area_snapshot numeric(14,2) NOT NULL,
  price_per_sqm_snapshot numeric(14,2) NOT NULL,
  pricing_rule_id uuid,
  pricing_rule_label text,
  pricing_stage text NOT NULL,
  item_total numeric(14,2) NOT NULL,
  original_status text NOT NULL,
  sale_id uuid REFERENCES public.lot_sales(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lot_sale_order_items_order_lot_uidx ON public.lot_sale_order_items (order_id, lot_id);
CREATE INDEX lot_sale_order_items_lot_idx ON public.lot_sale_order_items (lot_id);

CREATE TABLE public.lot_sale_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.lot_sale_orders(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number >= 1),
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  payment_status text NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PAID','CANCELLED')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lot_sale_installments_order_number_uidx ON public.lot_sale_installments (order_id, installment_number);

GRANT SELECT, INSERT, UPDATE ON public.lot_sale_orders TO authenticated;
GRANT ALL ON public.lot_sale_orders TO service_role;
GRANT SELECT, INSERT ON public.lot_sale_order_items TO authenticated;
GRANT ALL ON public.lot_sale_order_items TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.lot_sale_installments TO authenticated;
GRANT ALL ON public.lot_sale_installments TO service_role;

ALTER TABLE public.lot_sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_sale_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_sale_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales managers read sale orders" ON public.lot_sale_orders FOR SELECT TO authenticated
USING (public.map_has_explicit_capability((SELECT org_id FROM public.map_projects WHERE id = project_id), 'map.manage_sales'));

CREATE POLICY "Sales managers read sale items" ON public.lot_sale_order_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lot_sale_orders o
  WHERE o.id = order_id
    AND public.map_has_explicit_capability((SELECT org_id FROM public.map_projects WHERE id = o.project_id), 'map.manage_sales')
));

CREATE POLICY "Sales managers read installments" ON public.lot_sale_installments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lot_sale_orders o
  WHERE o.id = order_id
    AND public.map_has_explicit_capability((SELECT org_id FROM public.map_projects WHERE id = o.project_id), 'map.manage_sales')
));

CREATE POLICY "Sales managers update installments" ON public.lot_sale_installments FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lot_sale_orders o
  WHERE o.id = order_id
    AND public.map_has_explicit_capability((SELECT org_id FROM public.map_projects WHERE id = o.project_id), 'map.manage_sales')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.lot_sale_orders o
  WHERE o.id = order_id
    AND public.map_has_explicit_capability((SELECT org_id FROM public.map_projects WHERE id = o.project_id), 'map.manage_sales')
));

CREATE TRIGGER lot_sale_orders_set_updated_at BEFORE UPDATE ON public.lot_sale_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lot_sale_installments_set_updated_at BEFORE UPDATE ON public.lot_sale_installments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.register_commercial_sale_order(
  p_idempotency_key text,
  p_stage text,
  p_lot_ids uuid[],
  p_buyer_name text,
  p_document_number text,
  p_phone text,
  p_email text,
  p_payment_type text,
  p_installment_count integer,
  p_payment_method text,
  p_first_due_date date,
  p_installments jsonb,
  p_expected_total numeric,
  p_notes text
) RETURNS uuid
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
    IF v_lot.status NOT IN ('AVAILABLE','RESERVED','IN_NEGOTIATION') THEN
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