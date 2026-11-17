CREATE OR REPLACE FUNCTION public._cancel_sale_order_items_core(p_order_id uuid, p_item_ids uuid[], p_reason text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE
  v_order public.lot_sale_orders%ROWTYPE; v_org_id uuid; v_item record; v_has_food boolean;
  v_cancelled integer := 0; v_skipped integer := 0; v_remaining integer; v_open_items integer;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Venda cancelada');
BEGIN
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN RAISE EXCEPTION 'NO_ITEMS_SELECTED'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_order.project_id;
  IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;

  FOR v_item IN
    SELECT i.*, l.status AS lot_status, l.entity_id, l.project_id AS lot_project_id
      FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id = i.lot_id
     WHERE i.order_id = p_order_id AND i.id = ANY(p_item_ids)
     ORDER BY i.id FOR UPDATE OF i, l
  LOOP
    IF v_item.contract_state = 'CANCELLED' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    IF v_item.lot_status NOT IN ('SALE_OPEN','SOLD') THEN
      RAISE EXCEPTION 'LOT_NOT_SOLD:%', v_item.public_identifier;
    END IF;
    IF EXISTS (SELECT 1 FROM public.lot_sale_order_items o JOIN public.lot_sale_orders so ON so.id=o.order_id
               WHERE o.lot_id=v_item.lot_id AND o.order_id<>p_order_id AND so.status='CONFIRMED'
                 AND o.contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED')) THEN
      RAISE EXCEPTION 'LOT_IN_OTHER_SALE:%', v_item.public_identifier;
    END IF;
    UPDATE public.lot_sale_order_items SET contract_state='CANCELLED', cancelled_at=now(), cancelled_by=p_actor WHERE id=v_item.id;
    UPDATE public.lot_contract_lots cl SET removed_at=now() FROM public.lot_contracts c
     WHERE cl.contract_id=c.id AND c.order_id=p_order_id AND cl.lot_id=v_item.lot_id AND cl.removed_at IS NULL;
    UPDATE public.lot_sales SET status='REVERTED', reverted_at=now(), reverted_by=p_actor
     WHERE id=v_item.sale_id AND status IN ('OPEN','CONFIRMED');
    UPDATE public.commercial_lots SET status='AVAILABLE', updated_by=p_actor, updated_at=now() WHERE id=v_item.lot_id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_item.lot_id, v_item.lot_status, 'AVAILABLE', 'VENDA CANCELADA: ' || v_reason, p_actor);
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org_id, v_item.lot_project_id, v_item.entity_id, v_item.lot_id, 'LOT_SALE_CANCELLED',
      jsonb_build_object('status', v_item.lot_status, 'contract_state', v_item.contract_state, 'buyer', v_order.buyer_name),
      jsonb_build_object('status','AVAILABLE','sale_order_id',p_order_id,'item_id',v_item.id), v_reason, p_actor);
    v_cancelled := v_cancelled + 1;
  END LOOP;

  IF v_cancelled + v_skipped <> array_length(p_item_ids, 1) THEN RAISE EXCEPTION 'ITEM_NOT_IN_ORDER'; END IF;

  SELECT count(*) FILTER (WHERE contract_state='PENDING_SIGNATURE'),
         count(*) FILTER (WHERE contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED'))
    INTO v_remaining, v_open_items FROM public.lot_sale_order_items WHERE order_id=p_order_id;
  SELECT EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND commercial_unit='FOOD_POINT') INTO v_has_food;

  IF v_open_items = 0 THEN
    UPDATE public.lot_sale_installments SET payment_status='CANCELLED', updated_at=now()
     WHERE order_id=p_order_id AND payment_status='PENDING' AND paid_at IS NULL;
    UPDATE public.lot_sale_orders SET status='REVERTED', reverted_at=now(), reverted_by=p_actor, updated_at=now(),
      notes = concat_ws(E'\n', nullif(notes,''), 'CANCELADA: ' || v_reason)
     WHERE id=p_order_id;
  ELSIF v_has_food AND v_cancelled > 0 THEN
    PERFORM public._revise_sale_order_items_core(p_order_id,'{}','{}',coalesce(v_order.fee_admin,0),
      NULL,NULL,NULL,v_reason,NULL,p_actor);
  ELSE
    UPDATE public.lot_sale_orders SET updated_at=now() WHERE id=p_order_id;
  END IF;
  RETURN jsonb_build_object('orderId',p_order_id,'cancelled',v_cancelled,'skipped',v_skipped,'pendingRemaining',v_remaining,'orderCancelled',v_open_items=0);
END;
$function$;
REVOKE ALL ON FUNCTION public._cancel_sale_order_items_core(uuid,uuid[],text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._cancel_sale_order_items_core(uuid,uuid[],text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_sale_order_items(p_order_id uuid, p_item_ids uuid[], p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT p.org_id INTO v_org FROM public.lot_sale_orders o JOIN public.map_projects p ON p.id=o.project_id WHERE o.id=p_order_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  RETURN public._cancel_sale_order_items_core(p_order_id, p_item_ids, p_reason, auth.uid());
END;
$function$;