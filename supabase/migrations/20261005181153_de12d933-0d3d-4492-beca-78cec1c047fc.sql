CREATE OR REPLACE FUNCTION public.lot_sale_order_revision_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_order public.lot_sale_orders%ROWTYPE; v_org uuid; v_summary jsonb;
BEGIN
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = NEW.order_id;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_order.project_id;
  v_summary := jsonb_build_object('revision_id', NEW.id, 'sale_order_id', NEW.order_id,
    'buyer', coalesce(nullif(btrim(v_order.buyer_trade_name),''), v_order.buyer_name),
    'lots_before', NEW.before_state->'lots', 'lots_after', NEW.after_state->'lots',
    'total_before', NEW.before_state->'negotiated_total', 'total_after', NEW.after_state->'negotiated_total',
    'installments_before', NEW.before_state->'installment_count', 'installments_after', NEW.after_state->'installment_count');
  UPDATE public.map_activity_logs SET after_state = coalesce(after_state,'{}'::jsonb) || v_summary
   WHERE action IN ('LOT_SALE_ITEM_ADDED','LOT_SALE_ITEM_REMOVED') AND created_at = now()
     AND after_state->>'sale_order_id' = NEW.order_id::text;
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  SELECT v_org, v_order.project_id, l.entity_id, l.id, 'LOT_SALE_ORDER_REVISED', NULL, v_summary, NEW.reason, NEW.actor_user_id
    FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id = i.lot_id
   WHERE i.order_id = NEW.order_id AND i.contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED')
     AND NOT (i.lot_id = ANY(NEW.added_lot_ids));
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.lot_sale_order_revision_log() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lot_sale_order_revisions_log AFTER INSERT ON public.lot_sale_order_revisions
FOR EACH ROW EXECUTE FUNCTION public.lot_sale_order_revision_log();

CREATE OR REPLACE FUNCTION public.get_sale_order_revisions(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_org uuid; v_updated timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT p.org_id, o.updated_at INTO v_org, v_updated FROM public.lot_sale_orders o JOIN public.map_projects p ON p.id=o.project_id WHERE o.id=p_order_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  RETURN jsonb_build_object('updatedAt', v_updated, 'revisions', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', r.id, 'createdAt', r.created_at, 'reason', r.reason,
      'actorName', pr.full_name, 'before', r.before_state, 'after', r.after_state) ORDER BY r.created_at DESC)
    FROM public.lot_sale_order_revisions r LEFT JOIN public.profiles pr ON pr.user_id = r.actor_user_id
    WHERE r.order_id = p_order_id), '[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.get_sale_order_revisions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sale_order_revisions(uuid) TO authenticated;

-- Retroativo: enriquece os registros das revisões já feitas e marca os lotes que permaneceram.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM public.lot_sale_order_revisions LOOP
    UPDATE public.map_activity_logs SET after_state = after_state || jsonb_build_object('revision_id', r.id,
      'lots_before', r.before_state->'lots', 'lots_after', r.after_state->'lots',
      'total_before', r.before_state->'negotiated_total', 'total_after', r.after_state->'negotiated_total')
     WHERE action IN ('LOT_SALE_ITEM_ADDED','LOT_SALE_ITEM_REMOVED') AND after_state->>'sale_order_id' = r.order_id::text AND NOT after_state ? 'revision_id';
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';