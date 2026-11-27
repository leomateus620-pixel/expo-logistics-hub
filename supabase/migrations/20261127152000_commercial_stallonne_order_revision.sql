BEGIN;

-- Only the reconciliation RPC can open this transaction-scoped gate. It also
-- closes it before returning, including when called inside a larger transaction.
CREATE TABLE app_private.commercial_package_revision_locks (
  transaction_id bigint PRIMARY KEY,
  affected_ids uuid[] NOT NULL
);
REVOKE ALL ON app_private.commercial_package_revision_locks FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE app_private.commercial_package_revision_receipts (
  order_id uuid PRIMARY KEY REFERENCES public.lot_sale_orders(id),
  storage_path text NOT NULL,
  schedule jsonb NOT NULL,
  registration jsonb NOT NULL
);
REVOKE ALL ON app_private.commercial_package_revision_receipts FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.commercial_package_revision_in_progress(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM app_private.commercial_package_revision_locks
    WHERE transaction_id = txid_current_if_assigned() AND p_id = ANY(affected_ids))
$$;

DROP TRIGGER commercial_package_identity_guard ON public.commercial_lots;
CREATE TRIGGER commercial_package_identity_guard BEFORE INSERT OR UPDATE ON public.commercial_lots
FOR EACH ROW WHEN (NEW.commercial_package_role IS NULL OR NOT public.commercial_package_revision_in_progress(NEW.id))
EXECUTE FUNCTION public.guard_commercial_package_identity();
DROP TRIGGER commercial_package_entity_guard ON public.map_entities;
CREATE TRIGGER commercial_package_entity_guard BEFORE UPDATE OF metadata, project_id, public_identifier,
  classification, parent_entity_id, is_archived ON public.map_entities
FOR EACH ROW WHEN (NOT public.commercial_package_revision_in_progress(NEW.id))
EXECUTE FUNCTION public.guard_commercial_package_entity();
DROP TRIGGER commercial_package_sale_guard ON public.lot_sales;
CREATE TRIGGER commercial_package_sale_guard BEFORE INSERT OR UPDATE OF lot_id, status, negotiated_value ON public.lot_sales
FOR EACH ROW WHEN (NEW.status <> 'REVERTED' OR NOT public.commercial_package_revision_in_progress(NEW.lot_id))
EXECUTE FUNCTION public.guard_commercial_package_sale();

CREATE OR REPLACE FUNCTION public.guard_commercial_package_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role text;
  v_order public.lot_sale_orders%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.lot_id IS DISTINCT FROM OLD.lot_id
    AND EXISTS (SELECT 1 FROM public.commercial_lots WHERE id = OLD.lot_id AND commercial_package_role IS NOT NULL) THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_IDENTITY_LOCKED';
  END IF;
  SELECT commercial_package_role INTO v_role FROM public.commercial_lots WHERE id = NEW.lot_id;
  IF v_role = 'COMPONENT' THEN
    IF TG_OP = 'UPDATE' AND NEW.contract_state = 'CANCELLED'
      AND public.commercial_package_revision_in_progress(NEW.lot_id) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_COMPONENT';
  END IF;
  IF v_role IS DISTINCT FROM 'PRINCIPAL' AND NEW.commercial_unit = 'FIXED_PACKAGE' THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_ITEM_INVALID';
  END IF;
  IF v_role = 'PRINCIPAL' THEN
    IF NEW.commercial_unit <> 'FIXED_PACKAGE' OR NEW.item_total IS DISTINCT FROM 252280.00
      OR (TG_OP = 'UPDATE' AND (NEW.order_id, NEW.lot_id, NEW.sale_id)
        IS DISTINCT FROM (OLD.order_id, OLD.lot_id, OLD.sale_id)) THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_ITEM_INVALID';
    END IF;
    SELECT * INTO STRICT v_order FROM public.lot_sale_orders WHERE id = NEW.order_id FOR UPDATE;
    IF coalesce(v_order.fee_admin, 0) <> 0 OR coalesce(v_order.fee_ppci, 0) <> 0
      OR coalesce(v_order.fee_cleaning_license, 0) <> 0 OR coalesce(v_order.fees_total, 0) <> 0 THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_NO_EXTRA_FEES';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lot_sale_order_items i WHERE i.order_id = NEW.order_id AND i.id <> NEW.id AND i.contract_state <> 'CANCELLED') THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_EXCLUSIVE_CHECKOUT';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.lot_sale_order_items i
    WHERE i.order_id = NEW.order_id AND i.commercial_unit = 'FIXED_PACKAGE') THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_EXCLUSIVE_CHECKOUT';
  END IF;
  RETURN NEW;
END;
$$;

-- Preserve the deployed sale detail projection. Only order-scoped contract
-- coverage includes the three snapshotted children of an active package.
DO $coverage$
DECLARE
  current_sql text := pg_get_functiondef('public.get_commercial_sale_order_detail(uuid,uuid)'::regprocedure);
  original constant text := 'cl.removed_at IS NULL AND cl.lot_id=ANY(v_active_lots)';
  revised constant text := 'cl.removed_at IS NULL AND (cl.lot_id=ANY(v_active_lots) OR EXISTS (
    SELECT 1 FROM public.commercial_package_order_components pc JOIN public.lot_sale_order_items pi ON pi.id=pc.order_item_id
    WHERE pi.order_id=p_order_id AND pi.contract_state<>''CANCELLED'' AND pc.component_lot_id=cl.lot_id))';
BEGIN
  IF cardinality(string_to_array(current_sql,original))<>2 THEN RAISE EXCEPTION 'PACKAGE_DETAIL_DEFINITION_CHANGED'; END IF;
  EXECUTE replace(current_sql,original,revised);
END $coverage$;

-- Show only the signed-in operator and the count of possible overlaps in the
-- commercial workflow. Financial rows and other buyers are not returned.
CREATE FUNCTION public.get_commercial_package_revision_review(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  ord public.lot_sale_orders%ROWTYPE; org uuid; edition uuid; actor_name text; matches integer;
  park_pattern constant text := '(stall?onn?e|par(k|que) de divers)';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO STRICT ord FROM public.lot_sale_orders WHERE id=p_order_id;
  SELECT org_id INTO STRICT org FROM public.map_projects WHERE id=ord.project_id;
  IF public.map_has_explicit_capability(org,'map.manage_sales') IS NOT TRUE
    OR public.map_has_explicit_capability(org,'map.manage_contracts') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id
    WHERE i.order_id=p_order_id AND l.commercial_package_role IS NOT NULL) THEN RAISE EXCEPTION 'PACKAGE_ORIGIN_CHANGED'; END IF;
  SELECT s.edition_id INTO STRICT edition FROM public.financial_scenario_sources s JOIN public.financial_editions e ON e.id=s.edition_id
    WHERE s.project_id=ord.project_id AND s.org_id=org AND e.org_id=org AND e.code=2028;
  SELECT full_name INTO actor_name FROM public.profiles WHERE user_id=auth.uid();
  SELECT count(*) INTO matches FROM (
    SELECT 1 FROM public.financial_revenues r WHERE r.org_id=org AND r.edition_id=edition AND r.status<>'cancelada'
      AND (concat_ws(' ',r.description,r.counterparty,r.notes) ~* park_pattern
        OR r.projected_cents IN (5228000,20000000,25228000) OR r.confirmed_cents IN (5228000,20000000,25228000))
    UNION ALL SELECT 1 FROM public.financial_sponsorships s WHERE s.org_id=org AND s.edition_id=edition
      AND s.negotiation_status<>'cancelado' AND s.name ~* park_pattern
    UNION ALL SELECT 1 FROM public.financial_obligations f WHERE f.org_id=org AND f.edition_id=edition AND f.direction='receber'
      AND (f.description ~* park_pattern OR f.source_id IN (SELECT id FROM public.lot_sale_installments WHERE order_id=p_order_id))
    UNION ALL SELECT 1 FROM public.financial_movements m WHERE m.org_id=org AND m.edition_id=edition
      AND m.direction='entrada' AND concat_ws(' ',m.notes,m.reference) ~* park_pattern
    UNION ALL SELECT 1 FROM public.lot_sales s JOIN public.commercial_lots l ON l.id=s.lot_id WHERE l.project_id=ord.project_id
      AND s.status IN ('OPEN','CONFIRMED') AND (concat_ws(' ',s.buyer_name,s.buyer_trade_name) ~* park_pattern OR
        (nullif(regexp_replace(ord.document_number,'[^0-9]','','g'),'')=regexp_replace(s.document_number,'[^0-9]','','g')))
      AND NOT EXISTS(SELECT 1 FROM public.lot_sale_order_items i WHERE i.order_id=p_order_id AND i.sale_id=s.id)
  ) candidates;
  RETURN jsonb_build_object('operator',actor_name,'updatedAt',ord.updated_at,'possibleOverlaps',matches);
END $$;
REVOKE ALL ON FUNCTION public.get_commercial_package_revision_review(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_package_revision_review(uuid) TO authenticated;

-- This overload revises the existing order in place. No billing or bank API is called.
CREATE FUNCTION public.revise_sale_order_items(
  p_order_id uuid, p_expected_updated_at timestamptz, p_installments jsonb,
  p_storage_path text, p_original_name text, p_mime_type text, p_file_size bigint,
  p_reconciliation_checked boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  ord public.lot_sale_orders%ROWTYPE;
  principal public.commercial_lots%ROWTYPE;
  actor uuid := auth.uid(); org uuid; component_ids uuid[]; plan_dates date[]; plan_amounts numeric[];
  receipt jsonb; history jsonb; old_plan jsonb; old_sales uuid[]; new_sale uuid; new_item uuid;
  old_item record; pos integer; revision_id uuid := gen_random_uuid();
  reason constant text := 'Conciliação dos três pontos com o contrato assinado do Parque Stallonne';
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO STRICT ord FROM public.lot_sale_orders WHERE id=p_order_id FOR UPDATE;
  SELECT org_id INTO STRICT org FROM public.map_projects WHERE id=ord.project_id;
  IF NOT (public.map_has_explicit_capability(org,'map.manage_sales') IS TRUE
      AND public.map_has_explicit_capability(org,'map.manage_contracts') IS TRUE) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF ord.status <> 'CONFIRMED' OR ord.reverted_at IS NOT NULL THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;
  IF p_reconciliation_checked IS DISTINCT FROM true THEN RAISE EXCEPTION 'RECONCILIATION_REQUIRED'; END IF;
  IF jsonb_typeof(p_installments) IS DISTINCT FROM 'array' OR jsonb_array_length(p_installments) <> 17 THEN
    RAISE EXCEPTION 'PACKAGE_PLAN_INVALID';
  END IF;
  SELECT array_agg((v->>'due_date')::date ORDER BY n), array_agg((v->>'amount')::numeric ORDER BY n)
    INTO plan_dates,plan_amounts FROM jsonb_array_elements(p_installments) WITH ORDINALITY entries(v,n);
  IF EXISTS (SELECT 1 FROM generate_subscripts(plan_dates,1) i WHERE plan_dates[i] IS NULL
      OR (i>1 AND plan_dates[i]<=plan_dates[i-1]) OR plan_amounts[i] IS NULL OR plan_amounts[i]<=0
      OR plan_amounts[i]<>round(plan_amounts[i],2))
    OR (SELECT sum(x) FROM unnest(plan_amounts) x) <> 252280 THEN RAISE EXCEPTION 'PACKAGE_PLAN_INVALID'; END IF;

  SELECT to_jsonb(r) INTO history FROM app_private.commercial_package_revision_receipts r WHERE r.order_id=p_order_id;
  IF FOUND THEN
    IF history->>'storage_path' IS DISTINCT FROM p_storage_path OR history->'schedule' IS DISTINCT FROM p_installments THEN
      RAISE EXCEPTION 'ORDER_ALREADY_RECONCILED';
    END IF;
    RETURN history->'registration';
  END IF;
  IF (public.get_commercial_package_revision_review(p_order_id)->>'possibleOverlaps')::int IS DISTINCT FROM 0
    THEN RAISE EXCEPTION 'PACKAGE_FINANCIAL_CONFLICT'; END IF;
  IF p_expected_updated_at IS NULL OR date_trunc('milliseconds',ord.updated_at)
      <> date_trunc('milliseconds',p_expected_updated_at) THEN RAISE EXCEPTION 'ORDER_CHANGED'; END IF;
  SELECT * INTO STRICT principal FROM public.commercial_lots WHERE project_id=ord.project_id
    AND commercial_package_role='PRINCIPAL' AND commercial_unit='FIXED_PACKAGE' AND archived_at IS NULL FOR UPDATE;
  IF NOT principal.commercial_package_reconciliation_pending OR principal.status<>'BLOCKED' THEN
    RAISE EXCEPTION 'PACKAGE_ORIGIN_CHANGED';
  END IF;
  SELECT array_agg(component_lot_id ORDER BY component_lot_id) INTO component_ids
    FROM public.commercial_package_components WHERE principal_lot_id=principal.id;
  IF cardinality(component_ids) IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'PACKAGE_ORIGIN_CHANGED'; END IF;
  PERFORM 1 FROM public.commercial_lots WHERE id=ANY(component_ids) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.lot_sales WHERE lot_id=ANY(component_ids || principal.id) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.lot_sale_installments WHERE order_id=p_order_id ORDER BY id FOR UPDATE;
  IF ord.negotiated_total<>52280 OR ord.spaces_subtotal IS DISTINCT FROM 52280 OR ord.fees_total<>0
    OR ord.fee_admin+ord.fee_ppci+ord.fee_cleaning_license<>0 OR ord.installment_count<>15
    OR (SELECT array_agg(lot_id ORDER BY lot_id) FROM public.lot_sale_order_items WHERE order_id=p_order_id
        AND contract_state<>'CANCELLED') IS DISTINCT FROM component_ids
    OR (SELECT count(*) FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id
        JOIN public.commercial_package_components c ON c.component_lot_id=l.id JOIN public.lot_sales s ON s.id=i.sale_id
        WHERE i.order_id=p_order_id AND i.contract_state='SIGNED' AND i.signed_at IS NOT NULL AND l.status='SOLD'
          AND s.lot_id=l.id AND s.status='CONFIRMED' AND i.item_total=c.composition_amount
          AND s.negotiated_value=c.composition_amount AND s.payment_status='PENDING'
          AND nullif(btrim(s.contract_number),'') IS NULL) <> 3
    OR (SELECT count(*) FROM public.lot_sales WHERE lot_id=ANY(component_ids || principal.id)
        AND status IN ('OPEN','CONFIRMED')) <> 3
    OR EXISTS (SELECT 1 FROM public.lot_reservations WHERE lot_id=ANY(component_ids || principal.id) AND status='ACTIVE')
    OR EXISTS (SELECT 1 FROM public.lot_negotiations WHERE lot_id=ANY(component_ids || principal.id) AND status='ACTIVE')
    OR EXISTS (SELECT 1 FROM public.lot_contracts c LEFT JOIN public.lot_contract_lots l ON l.contract_id=c.id
      WHERE c.is_active AND (c.order_id=p_order_id OR c.lot_id=ANY(component_ids || principal.id)
        OR (l.removed_at IS NULL AND l.lot_id=ANY(component_ids || principal.id))))
    THEN RAISE EXCEPTION 'PACKAGE_ORIGIN_CHANGED'; END IF;
  SELECT array_agg(sale_id) INTO old_sales FROM public.lot_sale_order_items
    WHERE order_id=p_order_id AND contract_state='SIGNED';
  IF EXISTS (SELECT 1 FROM public.financial_scenario_revenue_links WHERE origin_id=ANY(old_sales || p_order_id))
    OR EXISTS (SELECT 1 FROM public.lot_sale_installments i JOIN public.financial_obligations f
      ON f.source_type='parcela_comercial' AND f.source_id=i.id WHERE i.order_id=p_order_id)
    OR EXISTS (SELECT 1 FROM public.lot_sale_installments WHERE order_id=p_order_id AND
      (payment_status<>'PENDING' OR paid_at IS NOT NULL OR nullif(trim(notes),'') IS NOT NULL OR NOT due_date=ANY(plan_dates)))
    OR (SELECT count(DISTINCT due_date)=15 AND count(*)=15 AND sum(amount)=ord.negotiated_total
      AND min(installment_number)=1 AND max(installment_number)=15
      FROM public.lot_sale_installments WHERE order_id=p_order_id) IS NOT TRUE
    THEN RAISE EXCEPTION 'PACKAGE_FINANCIAL_CONFLICT'; END IF;

  SELECT jsonb_agg(to_jsonb(i) ORDER BY installment_number) INTO old_plan
    FROM public.lot_sale_installments i WHERE order_id=p_order_id;
  INSERT INTO app_private.commercial_package_revision_locks VALUES(txid_current(),component_ids || principal.id || principal.entity_id);
  FOR old_item IN SELECT * FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state='SIGNED' LOOP
    UPDATE public.lot_sale_order_items SET contract_state='CANCELLED',cancelled_at=now(),cancelled_by=actor WHERE id=old_item.id;
    UPDATE public.lot_sales SET status='REVERTED',reverted_at=now(),reverted_by=actor WHERE id=old_item.sale_id;
    UPDATE public.commercial_lots SET status='BLOCKED',updated_by=actor WHERE id=old_item.lot_id;
    INSERT INTO public.lot_status_history(lot_id,previous_status,new_status,reason,changed_by)
      VALUES(old_item.lot_id,'SOLD','BLOCKED',reason,actor);
  END LOOP;
  UPDATE public.commercial_lots SET commercial_package_reconciliation_pending=false,status='AVAILABLE',updated_by=actor WHERE id=principal.id;
  UPDATE public.map_entities SET metadata=metadata || '{"commercialPackageReconciliationPending":false}'::jsonb WHERE id=principal.entity_id;
  INSERT INTO public.lot_sales(lot_id,buyer_name,buyer_trade_name,document_number,negotiated_value,sale_date,
      salesperson_user_id,salesperson_name,payment_status,status)
    VALUES(principal.id,ord.buyer_name,ord.buyer_trade_name,ord.document_number,252280,
      (SELECT min(sale_date) FROM public.lot_sales WHERE id=ANY(old_sales)),actor,
      coalesce((SELECT nullif(btrim(full_name),'') FROM public.profiles WHERE user_id=actor),'Equipe comercial'),'PENDING','OPEN')
    RETURNING id INTO new_sale;
  INSERT INTO public.lot_sale_order_items(order_id,lot_id,public_identifier,commercial_unit,pricing_stage,item_total,
      original_status,sale_id,contract_state)
    VALUES(p_order_id,principal.id,principal.public_identifier,'FIXED_PACKAGE',ord.stage,252280,'AVAILABLE',new_sale,'PENDING_SIGNATURE')
    RETURNING id INTO new_item;
  UPDATE public.commercial_lots SET status='SALE_OPEN',updated_by=actor WHERE id=principal.id;
  INSERT INTO public.lot_status_history(lot_id,previous_status,new_status,reason,changed_by)
    VALUES(principal.id,'BLOCKED','SALE_OPEN',reason,actor);
  -- Preserve each existing installment ID by due date; add just the two missing maturities.
  UPDATE public.lot_sale_installments SET installment_number=installment_number+17 WHERE order_id=p_order_id;
  FOR pos IN 1..17 LOOP
    UPDATE public.lot_sale_installments SET installment_number=pos,amount=plan_amounts[pos],updated_at=now()
      WHERE order_id=p_order_id AND due_date=plan_dates[pos];
    IF NOT FOUND THEN
      INSERT INTO public.lot_sale_installments(order_id,installment_number,due_date,amount)
        VALUES(p_order_id,pos,plan_dates[pos],plan_amounts[pos]);
    END IF;
  END LOOP;
  UPDATE public.lot_sale_orders SET spaces_subtotal=252280,negotiated_total=252280,installment_count=17,
    payment_method='BOLETO_PARCELADO',payment_type='INSTALLMENTS',first_due_date=plan_dates[1],updated_at=now() WHERE id=p_order_id;
  receipt := public.attach_order_contract(p_order_id,ARRAY[principal.id],p_storage_path,p_original_name,p_mime_type,p_file_size);
  IF (public.confirm_sale_order_items(p_order_id,ARRAY[new_item])->>'confirmed')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'PACKAGE_SIGNATURE_NOT_CONFIRMED';
  END IF;
  INSERT INTO public.lot_sale_order_revisions(id,order_id,added_lot_ids,removed_lot_ids,before_state,after_state,reason,actor_user_id)
    VALUES(revision_id,p_order_id,ARRAY[principal.id],component_ids,
      jsonb_build_object('negotiated_total',ord.negotiated_total,'installment_count',ord.installment_count,
        'sale_ids',old_sales,'lots',(SELECT array_agg(public_identifier ORDER BY public_identifier) FROM public.commercial_lots WHERE id=ANY(component_ids)),
        'schedule',old_plan),
      jsonb_build_object('operation','package_reconciliation','negotiated_total',252280,'installment_count',17,
        'lots',ARRAY[principal.public_identifier],'schedule',p_installments),
      reason,actor);
  INSERT INTO app_private.commercial_package_revision_receipts VALUES(p_order_id,p_storage_path,p_installments,receipt);
  DELETE FROM app_private.commercial_package_revision_locks WHERE transaction_id=txid_current();
  RETURN receipt;
END $$;

REVOKE ALL ON FUNCTION public.revise_sale_order_items(uuid,timestamptz,jsonb,text,text,text,bigint,boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.revise_sale_order_items(uuid,timestamptz,jsonb,text,text,text,bigint,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
