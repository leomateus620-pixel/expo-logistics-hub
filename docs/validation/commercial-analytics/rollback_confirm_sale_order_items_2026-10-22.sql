-- Rollback: definição de confirm_sale_order_items antes da PR #221 (md5 8eea44244ed5ff1d1c1b384161a9a475)
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
$function$

;
