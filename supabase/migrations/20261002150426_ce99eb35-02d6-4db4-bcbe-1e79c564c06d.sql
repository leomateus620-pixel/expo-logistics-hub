-- Nome fantasia do expositor (independente da razão social) + edição transacional da identificação da venda.
ALTER TABLE public.commercial_exhibitors ADD COLUMN IF NOT EXISTS trade_name text;
ALTER TABLE public.lot_sale_orders ADD COLUMN IF NOT EXISTS buyer_trade_name text;
ALTER TABLE public.lot_sales ADD COLUMN IF NOT EXISTS buyer_trade_name text;

CREATE OR REPLACE FUNCTION public.commercial_buyer_display_name(p_trade text, p_legal text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT coalesce(nullif(btrim(p_trade), ''), nullif(btrim(p_legal), '')) $$;

-- Registro de pedido: núcleo preservado, wrapper grava o nome fantasia na mesma transação.
ALTER FUNCTION public.register_commercial_sale_order(text,text,uuid[],text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric)
  RENAME TO register_commercial_sale_order_core;
REVOKE EXECUTE ON FUNCTION public.register_commercial_sale_order_core(text,text,uuid[],text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.register_commercial_sale_order(p_idempotency_key text, p_stage text, p_lot_ids uuid[], p_buyer_name text, p_document_number text, p_phone text, p_email text, p_payment_type text, p_installment_count integer, p_payment_method text, p_first_due_date date, p_installments jsonb, p_expected_total numeric, p_notes text, p_exhibitor_id uuid DEFAULT NULL, p_fee_admin numeric DEFAULT 0, p_fee_ppci numeric DEFAULT 0, p_fee_cleaning_license numeric DEFAULT 0, p_buyer_trade_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_order uuid; v_trade text := nullif(btrim(p_buyer_trade_name), '');
BEGIN
  v_order := public.register_commercial_sale_order_core(p_idempotency_key, p_stage, p_lot_ids, p_buyer_name, p_document_number, p_phone, p_email, p_payment_type, p_installment_count, p_payment_method, p_first_due_date, p_installments, p_expected_total, p_notes, p_exhibitor_id, p_fee_admin, p_fee_ppci, p_fee_cleaning_license);
  IF v_trade IS NOT NULL THEN
    UPDATE public.lot_sale_orders SET buyer_trade_name = v_trade WHERE id = v_order AND buyer_trade_name IS NULL;
    UPDATE public.lot_sales s SET buyer_trade_name = v_trade FROM public.lot_sale_order_items i
     WHERE i.order_id = v_order AND i.sale_id = s.id AND s.buyer_trade_name IS NULL;
  END IF;
  RETURN v_order;
END $$;
REVOKE EXECUTE ON FUNCTION public.register_commercial_sale_order(text,text,uuid[],text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_commercial_sale_order(text,text,uuid[],text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric,text) TO authenticated;

-- Caminho legado.
ALTER FUNCTION public.register_commercial_sale(uuid,text,text,numeric,date,text,text,text,text) RENAME TO register_commercial_sale_core;
REVOKE EXECUTE ON FUNCTION public.register_commercial_sale_core(uuid,text,text,numeric,date,text,text,text,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.register_commercial_sale(p_lot_id uuid, p_buyer_name text, p_document_number text, p_negotiated_value numeric, p_sale_date date, p_salesperson_name text, p_contract_number text, p_payment_status text, p_notes text, p_buyer_trade_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_sale uuid;
BEGIN
  v_sale := public.register_commercial_sale_core(p_lot_id, p_buyer_name, p_document_number, p_negotiated_value, p_sale_date, p_salesperson_name, p_contract_number, p_payment_status, p_notes);
  UPDATE public.lot_sales SET buyer_trade_name = nullif(btrim(p_buyer_trade_name), '') WHERE id = v_sale;
  RETURN v_sale;
END $$;
REVOKE EXECUTE ON FUNCTION public.register_commercial_sale(uuid,text,text,numeric,date,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_commercial_sale(uuid,text,text,numeric,date,text,text,text,text,text) TO authenticated;

-- Cadastro de expositores: nome fantasia opcional (vazio não apaga em upsert de venda).
ALTER FUNCTION public.upsert_commercial_exhibitor(uuid,text,text,text,text) RENAME TO upsert_commercial_exhibitor_core;
REVOKE EXECUTE ON FUNCTION public.upsert_commercial_exhibitor_core(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.upsert_commercial_exhibitor(p_project_id uuid, p_name text, p_document text, p_phone text, p_email text, p_trade_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.upsert_commercial_exhibitor_core(p_project_id, p_name, p_document, p_phone, p_email);
  IF nullif(btrim(p_trade_name), '') IS NOT NULL THEN
    UPDATE public.commercial_exhibitors SET trade_name = btrim(p_trade_name), updated_at = now() WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.upsert_commercial_exhibitor(uuid,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_commercial_exhibitor(uuid,text,text,text,text,text) TO authenticated;

-- Edição autenticada da identificação do expositor em venda OPEN/CONFIRMED.
CREATE OR REPLACE FUNCTION public.update_sale_exhibitor_identity(
  p_lot_sale_id uuid, p_expected_status text, p_expected_buyer_name text,
  p_buyer_name text, p_buyer_trade_name text, p_document text, p_phone text, p_email text,
  p_update_exhibitor boolean DEFAULT false, p_request_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale public.lot_sales%ROWTYPE; v_lot public.commercial_lots%ROWTYPE; v_org uuid;
  v_order public.lot_sale_orders%ROWTYPE; v_has_order boolean := false;
  v_name text := btrim(coalesce(p_buyer_name, '')); v_trade text := nullif(btrim(p_buyer_trade_name), '');
  v_doc text := nullif(btrim(p_document), ''); v_phone text := nullif(btrim(p_phone), ''); v_email text := nullif(btrim(p_email), '');
  v_sale_ids uuid[]; v_lot_ids uuid[]; v_prev jsonb; v_exhibitor_updated boolean := false; v_done jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF length(v_name) < 3 THEN RAISE EXCEPTION 'BUYER_REQUIRED'; END IF;
  IF p_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('sale_identity:' || p_request_id));
    SELECT after_state INTO v_done FROM public.map_activity_logs
     WHERE action = 'SALE_EXHIBITOR_EDITED' AND after_state->>'request_id' = p_request_id LIMIT 1;
    IF v_done IS NOT NULL THEN RETURN v_done || jsonb_build_object('replayed', true); END IF;
  END IF;

  SELECT * INTO v_sale FROM public.lot_sales WHERE id = p_lot_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = v_sale.lot_id;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;

  SELECT o.* INTO v_order FROM public.lot_sale_order_items i JOIN public.lot_sale_orders o ON o.id = i.order_id
   WHERE i.sale_id = p_lot_sale_id LIMIT 1;
  v_has_order := FOUND;
  IF v_has_order THEN
    PERFORM 1 FROM public.lot_sale_orders WHERE id = v_order.id FOR UPDATE;
    SELECT array_agg(s.id ORDER BY s.id), array_agg(s.lot_id ORDER BY s.id) INTO v_sale_ids, v_lot_ids
      FROM public.lot_sale_order_items i JOIN public.lot_sales s ON s.id = i.sale_id
     WHERE i.order_id = v_order.id AND s.status IN ('OPEN','CONFIRMED');
    PERFORM 1 FROM public.lot_sales WHERE id = ANY(v_sale_ids) ORDER BY id FOR UPDATE;
  ELSE
    v_sale_ids := ARRAY[p_lot_sale_id]; v_lot_ids := ARRAY[v_sale.lot_id];
    PERFORM 1 FROM public.lot_sales WHERE id = p_lot_sale_id FOR UPDATE;
  END IF;

  -- Re-lê após o bloqueio: confirmação/cancelamento concorrente gera conflito.
  SELECT * INTO v_sale FROM public.lot_sales WHERE id = p_lot_sale_id;
  IF v_sale.status NOT IN ('OPEN','CONFIRMED') THEN RAISE EXCEPTION 'SALE_NOT_EDITABLE'; END IF;
  IF v_sale.status IS DISTINCT FROM p_expected_status OR v_sale.buyer_name IS DISTINCT FROM p_expected_buyer_name THEN
    RAISE EXCEPTION 'SALE_EDIT_CONFLICT';
  END IF;

  v_prev := jsonb_build_object('buyer_name', v_sale.buyer_name, 'buyer_trade_name', v_sale.buyer_trade_name,
    'document_number', v_sale.document_number,
    'phone', CASE WHEN v_has_order THEN v_order.phone END, 'email', CASE WHEN v_has_order THEN v_order.email END);

  UPDATE public.lot_sales SET buyer_name = v_name, buyer_trade_name = v_trade, document_number = v_doc
   WHERE id = ANY(v_sale_ids);
  IF v_has_order THEN
    UPDATE public.lot_sale_orders SET buyer_name = v_name, buyer_trade_name = v_trade, document_number = v_doc,
      phone = v_phone, email = v_email, updated_at = now() WHERE id = v_order.id;
    IF p_update_exhibitor AND v_order.exhibitor_id IS NOT NULL THEN
      UPDATE public.commercial_exhibitors SET name = v_name, trade_name = v_trade,
        phone = coalesce(v_phone, phone), email = coalesce(v_email, email), updated_by = auth.uid(), updated_at = now()
       WHERE id = v_order.exhibitor_id AND org_id = v_org;
      v_exhibitor_updated := FOUND;
    END IF;
  END IF;

  v_done := jsonb_build_object('request_id', p_request_id, 'order_id', CASE WHEN v_has_order THEN v_order.id END,
    'sale_ids', to_jsonb(v_sale_ids), 'lot_ids', to_jsonb(v_lot_ids), 'exhibitor_updated', v_exhibitor_updated,
    'buyer_name', v_name, 'buyer_trade_name', v_trade, 'document_number', v_doc, 'phone', v_phone, 'email', v_email);
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org, v_lot.project_id, v_lot.entity_id, v_lot.id, 'SALE_EXHIBITOR_EDITED', v_prev, v_done, 'Correção dos dados do expositor', auth.uid());
  RETURN v_done;
END $$;
REVOKE EXECUTE ON FUNCTION public.update_sale_exhibitor_identity(uuid,text,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_sale_exhibitor_identity(uuid,text,text,text,text,text,text,text,boolean,text) TO authenticated;

-- Links públicos: somente o nome de exibição autorizado (SOLD + CONFIRMED), incluído na revisão.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.public_map_inventory(text,text)'::regprocedure);
  IF position('THEN s.buyer_name ELSE' in d) = 0 THEN RAISE EXCEPTION 'inventory pattern missing'; END IF;
  EXECUTE replace(d, 'THEN s.buyer_name ELSE', 'THEN public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name) ELSE');
  d := pg_get_functiondef('public.public_map_lot(text,text,uuid)'::regprocedure);
  IF position('nullif(trim(s.buyer_name), '''')' in d) = 0 THEN RAISE EXCEPTION 'lot pattern missing'; END IF;
  EXECUTE replace(d, 'nullif(trim(s.buyer_name), '''')', 'public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name)');
  d := pg_get_functiondef('public.public_map_scope_revision(text,text)'::regprocedure);
  IF position('s.buyer_name, s.created_at' in d) = 0 OR position('concat_ws('':'', id, status, buyer_name)' in d) = 0 THEN RAISE EXCEPTION 'revision pattern missing'; END IF;
  d := replace(d, 's.buyer_name, s.created_at', 's.buyer_name, s.buyer_trade_name, s.created_at');
  EXECUTE replace(d, 'concat_ws('':'', id, status, buyer_name)', 'concat_ws('':'', id, status, buyer_name, buyer_trade_name)');
END $$;

NOTIFY pgrst, 'reload schema';