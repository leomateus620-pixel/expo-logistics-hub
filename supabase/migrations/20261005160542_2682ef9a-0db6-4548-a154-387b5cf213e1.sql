CREATE TABLE public.lot_sale_order_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.lot_sale_orders(id) ON DELETE CASCADE,
  added_lot_ids uuid[] NOT NULL DEFAULT '{}',
  removed_lot_ids uuid[] NOT NULL DEFAULT '{}',
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lot_sale_order_revisions TO authenticated;
GRANT ALL ON public.lot_sale_order_revisions TO service_role;
ALTER TABLE public.lot_sale_order_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales managers read order revisions" ON public.lot_sale_order_revisions
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.lot_sale_orders o JOIN public.map_projects p ON p.id = o.project_id
  WHERE o.id = order_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')));

CREATE OR REPLACE FUNCTION public._revise_sale_order_items_core(
  p_order_id uuid, p_add_lot_ids uuid[], p_remove_item_ids uuid[],
  p_fee_admin numeric, p_fee_ppci numeric, p_fee_cleaning numeric,
  p_installment_count integer, p_reason text, p_expected_updated_at timestamptz, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_order public.lot_sale_orders%ROWTYPE; v_org uuid; v_item record; v_lot record;
  v_add uuid[] := coalesce(p_add_lot_ids, '{}'); v_rem uuid[] := coalesce(p_remove_item_ids, '{}');
  v_removed_lots uuid[] := '{}'; v_new_state text; v_new_status text; v_price numeric; v_ppsqm numeric;
  v_rule uuid; v_rule_label text; v_sale_id uuid; v_ref record; v_before jsonb; v_after jsonb;
  v_subtotal numeric; v_area numeric; v_fees numeric; v_total numeric; v_paid numeric; v_paid_n int;
  v_count int; v_open_n int; v_last_due date; v_cents bigint; v_each bigint; v_i int; v_n int; v_reason text;
  v_active int;
BEGIN
  v_reason := nullif(btrim(coalesce(p_reason,'')), '');
  IF v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF array_length(v_add,1) IS NULL AND array_length(v_rem,1) IS NULL
     AND p_fee_admin IS NULL AND p_fee_ppci IS NULL AND p_fee_cleaning IS NULL AND p_installment_count IS NULL THEN
    RAISE EXCEPTION 'NOTHING_TO_CHANGE'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;
  IF p_expected_updated_at IS NOT NULL AND date_trunc('milliseconds', v_order.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) THEN
    RAISE EXCEPTION 'ORDER_CHANGED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_order.project_id;

  v_before := jsonb_build_object('lots', (SELECT jsonb_agg(public_identifier ORDER BY public_identifier) FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED')),
    'spaces_subtotal', v_order.spaces_subtotal, 'fees_total', v_order.fees_total, 'negotiated_total', v_order.negotiated_total, 'installment_count', v_order.installment_count);

  -- estado herdado pelos lotes novos
  IF EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state='PENDING_SIGNATURE' AND NOT (id = ANY(v_rem))) THEN
    v_new_state := 'PENDING_SIGNATURE'; v_new_status := 'SALE_OPEN';
  ELSIF EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('SIGNED','LEGACY_UNVERIFIED') AND NOT (id = ANY(v_rem))) THEN
    v_new_state := 'SIGNED'; v_new_status := 'SOLD';
  ELSE v_new_state := 'PENDING_SIGNATURE'; v_new_status := 'SALE_OPEN'; END IF;

  -- remoções
  v_n := 0;
  FOR v_item IN SELECT i.*, l.status lot_status, l.entity_id FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id
     WHERE i.order_id=p_order_id AND i.id = ANY(v_rem) ORDER BY i.id FOR UPDATE OF i, l LOOP
    v_n := v_n + 1;
    IF v_item.contract_state NOT IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED') THEN RAISE EXCEPTION 'ITEM_NOT_ACTIVE:%', v_item.public_identifier; END IF;
    UPDATE public.lot_sale_order_items SET contract_state='CANCELLED', cancelled_at=now(), cancelled_by=p_actor WHERE id=v_item.id;
    UPDATE public.lot_sales SET status='REVERTED', reverted_at=now(), reverted_by=p_actor WHERE id=v_item.sale_id AND status IN ('OPEN','CONFIRMED');
    UPDATE public.commercial_lots SET status='AVAILABLE', updated_by=p_actor, updated_at=now() WHERE id=v_item.lot_id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (v_item.lot_id, v_item.lot_status, 'AVAILABLE', 'Retirado da venda: '||v_reason, p_actor);
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org, v_order.project_id, v_item.entity_id, v_item.lot_id, 'LOT_SALE_ITEM_REMOVED', jsonb_build_object('status', v_item.lot_status),
      jsonb_build_object('status','AVAILABLE','sale_order_id',p_order_id,'item_id',v_item.id), v_reason, p_actor);
    DELETE FROM public.lot_contract_lots cl USING public.lot_contracts c WHERE cl.contract_id=c.id AND c.order_id=p_order_id AND c.scope='ORDER_ITEMS' AND cl.lot_id=v_item.lot_id;
    v_removed_lots := v_removed_lots || v_item.lot_id;
  END LOOP;
  IF v_n <> coalesce(array_length(v_rem,1),0) THEN RAISE EXCEPTION 'ITEM_NOT_IN_ORDER'; END IF;

  -- adições
  SELECT * INTO v_ref FROM public.lot_sales s WHERE s.id = (SELECT sale_id FROM public.lot_sale_order_items WHERE order_id=p_order_id AND sale_id IS NOT NULL ORDER BY created_at LIMIT 1);
  v_n := 0;
  FOR v_lot IN SELECT l.*, pr.renovacao_total, pr.renovacao_price_per_sqm, pr.renovacao_rule_id, pr.renovacao_rule_label,
        pr.segunda_total, pr.segunda_price_per_sqm, pr.segunda_rule_id, pr.segunda_rule_label
      FROM public.commercial_lots l LEFT JOIN public.commercial_lot_pricing_2028 pr ON pr.lot_id=l.id
     WHERE l.id = ANY(v_add) ORDER BY l.id FOR UPDATE OF l LOOP
    v_n := v_n + 1;
    IF v_lot.project_id <> v_order.project_id OR v_lot.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_NOT_IN_PROJECT:%', v_lot.public_identifier; END IF;
    IF v_lot.status <> 'AVAILABLE' THEN RAISE EXCEPTION 'LOT_NOT_AVAILABLE:%', v_lot.public_identifier; END IF;
    IF v_order.stage = 'RENOVACAO' THEN v_price := v_lot.renovacao_total; v_ppsqm := v_lot.renovacao_price_per_sqm; v_rule := v_lot.renovacao_rule_id; v_rule_label := v_lot.renovacao_rule_label;
    ELSE v_price := v_lot.segunda_total; v_ppsqm := v_lot.segunda_price_per_sqm; v_rule := v_lot.segunda_rule_id; v_rule_label := v_lot.segunda_rule_label; END IF;
    IF v_price IS NULL THEN RAISE EXCEPTION 'LOT_PRICE_UNAVAILABLE:%', v_lot.public_identifier; END IF;
    INSERT INTO public.lot_sales (lot_id, buyer_name, buyer_trade_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, internal_notes, payment_status, status)
    VALUES (v_lot.id, v_order.buyer_name, v_order.buyer_trade_name, v_order.document_number, v_price, coalesce(v_ref.sale_date, current_date),
      coalesce(v_ref.salesperson_user_id, v_order.salesperson_user_id), v_ref.salesperson_name, v_ref.internal_notes, 'PENDING',
      CASE WHEN v_new_state='SIGNED' THEN 'CONFIRMED' ELSE 'OPEN' END) RETURNING id INTO v_sale_id;
    INSERT INTO public.lot_sale_order_items (order_id, lot_id, public_identifier, official_area_snapshot, price_per_sqm_snapshot, pricing_rule_id, pricing_rule_label, pricing_stage, item_total, original_status, sale_id, contract_state, signed_at, signed_by)
    VALUES (p_order_id, v_lot.id, v_lot.public_identifier, v_lot.official_area_sqm, v_ppsqm, v_rule, v_rule_label, v_order.stage, v_price, 'AVAILABLE', v_sale_id,
      v_new_state, CASE WHEN v_new_state='SIGNED' THEN now() END, CASE WHEN v_new_state='SIGNED' THEN p_actor END);
    UPDATE public.commercial_lots SET status=v_new_status, updated_by=p_actor, updated_at=now() WHERE id=v_lot.id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (v_lot.id, 'AVAILABLE', v_new_status, 'Adicionado à venda: '||v_reason, p_actor);
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org, v_order.project_id, v_lot.entity_id, v_lot.id, 'LOT_SALE_ITEM_ADDED', jsonb_build_object('status','AVAILABLE'),
      jsonb_build_object('status',v_new_status,'sale_order_id',p_order_id), v_reason, p_actor);
    INSERT INTO public.lot_contract_lots (contract_id, lot_id, created_by)
      SELECT c.id, v_lot.id, p_actor FROM public.lot_contracts c WHERE c.order_id=p_order_id AND c.scope='ORDER_ITEMS' ON CONFLICT DO NOTHING;
  END LOOP;
  IF v_n <> coalesce(array_length(v_add,1),0) THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;

  SELECT count(*) INTO v_active FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED');
  IF v_active = 0 THEN RAISE EXCEPTION 'ORDER_WOULD_BE_EMPTY'; END IF;

  -- totais
  SELECT coalesce(sum(item_total),0), coalesce(sum(official_area_snapshot),0) INTO v_subtotal, v_area
    FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED');
  UPDATE public.lot_sale_orders SET
    fee_admin = coalesce(p_fee_admin, fee_admin), fee_ppci = coalesce(p_fee_ppci, fee_ppci), fee_cleaning_license = coalesce(p_fee_cleaning, fee_cleaning_license)
   WHERE id=p_order_id RETURNING * INTO v_order;
  v_fees := coalesce(v_order.fee_admin,0)+coalesce(v_order.fee_ppci,0)+coalesce(v_order.fee_cleaning_license,0);
  v_total := v_subtotal + v_fees;

  -- parcelas
  SELECT coalesce(sum(amount),0), count(*) INTO v_paid, v_paid_n FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PAID';
  SELECT count(*), max(due_date) INTO v_open_n, v_last_due FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PENDING';
  v_count := coalesce(p_installment_count, v_order.installment_count, v_paid_n + v_open_n);
  IF v_count < v_paid_n + 1 AND v_total > v_paid THEN RAISE EXCEPTION 'INVALID_INSTALLMENT_COUNT'; END IF;
  IF v_total < v_paid THEN RAISE EXCEPTION 'TOTAL_BELOW_PAID'; END IF;
  IF (v_open_n + v_paid_n) > 0 AND (v_total <> v_order.negotiated_total OR v_count <> v_paid_n + v_open_n) THEN
    -- remove excedentes e cria faltantes mantendo vencimentos existentes
    DELETE FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PENDING' AND installment_number > v_count;
    v_last_due := coalesce((SELECT max(due_date) FROM public.lot_sale_installments WHERE order_id=p_order_id), v_order.first_due_date, current_date);
    FOR v_i IN (SELECT coalesce(max(installment_number),0)+1 FROM public.lot_sale_installments WHERE order_id=p_order_id)..v_count LOOP
      v_last_due := (v_last_due + interval '1 month')::date;
      INSERT INTO public.lot_sale_installments (order_id, installment_number, due_date, amount, payment_status) VALUES (p_order_id, v_i, v_last_due, 0, 'PENDING');
    END LOOP;
    SELECT count(*) INTO v_open_n FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PENDING';
    IF v_open_n > 0 THEN
      v_cents := round((v_total - v_paid) * 100);
      v_each := v_cents / v_open_n;
      UPDATE public.lot_sale_installments SET amount = v_each / 100.0, updated_at = now() WHERE order_id=p_order_id AND payment_status='PENDING';
      UPDATE public.lot_sale_installments SET amount = (v_each + (v_cents - v_each * v_open_n)) / 100.0
       WHERE id = (SELECT id FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PENDING' ORDER BY installment_number DESC LIMIT 1);
    END IF;
    v_count := v_paid_n + v_open_n;
  END IF;

  UPDATE public.lot_sale_orders SET spaces_subtotal=v_subtotal, official_area_total=v_area, fees_total=v_fees, negotiated_total=v_total,
    installment_count = CASE WHEN (v_open_n + v_paid_n) > 0 THEN v_count ELSE installment_count END, updated_at=now()
   WHERE id=p_order_id RETURNING * INTO v_order;

  v_after := jsonb_build_object('lots', (SELECT jsonb_agg(public_identifier ORDER BY public_identifier) FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED')),
    'spaces_subtotal', v_order.spaces_subtotal, 'fees_total', v_order.fees_total, 'negotiated_total', v_order.negotiated_total, 'installment_count', v_order.installment_count);
  INSERT INTO public.lot_sale_order_revisions (order_id, added_lot_ids, removed_lot_ids, before_state, after_state, reason, actor_user_id)
  VALUES (p_order_id, v_add, v_removed_lots, v_before, v_after, v_reason, p_actor);
  RETURN jsonb_build_object('orderId', p_order_id, 'before', v_before, 'after', v_after, 'updatedAt', v_order.updated_at);
END; $$;
REVOKE ALL ON FUNCTION public._revise_sale_order_items_core(uuid,uuid[],uuid[],numeric,numeric,numeric,integer,text,timestamptz,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.revise_sale_order_items(
  p_order_id uuid, p_add_lot_ids uuid[] DEFAULT '{}', p_remove_item_ids uuid[] DEFAULT '{}',
  p_fee_admin numeric DEFAULT NULL, p_fee_ppci numeric DEFAULT NULL, p_fee_cleaning numeric DEFAULT NULL,
  p_installment_count integer DEFAULT NULL, p_reason text DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT p.org_id INTO v_org FROM public.lot_sale_orders o JOIN public.map_projects p ON p.id=o.project_id WHERE o.id=p_order_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  RETURN public._revise_sale_order_items_core(p_order_id, p_add_lot_ids, p_remove_item_ids, p_fee_admin, p_fee_ppci, p_fee_cleaning, p_installment_count, p_reason, p_expected_updated_at, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.revise_sale_order_items(uuid,uuid[],uuid[],numeric,numeric,numeric,integer,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_sale_order_items(uuid,uuid[],uuid[],numeric,numeric,numeric,integer,text,timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';