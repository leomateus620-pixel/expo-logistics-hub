-- Apply once through the transactional migration runner. Refuse to replace a newer confirmation contract.
DO $guard$
BEGIN
  IF to_regprocedure('public.confirm_sale_order_items(uuid,uuid[])') IS NOT NULL
    AND md5(pg_get_functiondef('public.confirm_sale_order_items(uuid,uuid[])'::regprocedure)) <> '8eea44244ed5ff1d1c1b384161a9a475' THEN
    RAISE EXCEPTION 'CONFIRMATION_FUNCTION_CHANGED: inspect the new function before applying this revision';
  END IF;
END $guard$;
-- Commercial analytics: projections only; never creates receipts or changes negotiated amounts.
CREATE TABLE public.commercial_signature_completions (
  order_id uuid NOT NULL REFERENCES public.lot_sale_orders(id),
  cycle integer NOT NULL DEFAULT 1 CHECK (cycle = 1),
  project_id uuid NOT NULL REFERENCES public.map_projects(id),
  registered_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL CHECK (completed_at >= registered_at),
  actor_user_id uuid,
  evidence text NOT NULL CHECK (evidence IN ('CONFIRMATION','SIMPLE_HISTORY')),
  item_ids uuid[] NOT NULL,
  PRIMARY KEY (order_id, cycle)
);
ALTER TABLE public.commercial_signature_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_signature_completions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.commercial_signature_completions TO service_role;

-- Backfill only an unequivocal, unrevised original cycle. Never use now() as historical evidence.
INSERT INTO public.commercial_signature_completions(order_id,project_id,registered_at,completed_at,evidence,item_ids)
SELECT o.id,o.project_id,o.created_at,max(i.signed_at),'SIMPLE_HISTORY',array_agg(i.id ORDER BY i.id)
FROM public.lot_sale_orders o JOIN public.lot_sale_order_items i ON i.order_id=o.id
JOIN public.lot_sales s ON s.id=i.sale_id AND s.lot_id=i.lot_id
WHERE o.status='CONFIRMED'
AND NOT EXISTS(SELECT 1 FROM public.lot_sale_order_revisions r WHERE r.order_id=o.id)
GROUP BY o.id
HAVING bool_and(i.contract_state='SIGNED' AND s.status='CONFIRMED' AND i.signed_at>=o.created_at)
AND max(i.signed_at)<=statement_timestamp()
AND count(*)=count(i.signed_at)
AND count(*)=(SELECT count(*) FROM public.lot_sale_order_items x WHERE x.order_id=o.id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._commercial_analytics_access(p_project uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id=p_project;
  IF v_org IS NULL OR NOT public.map_has_explicit_capability(v_org,'map.manage_sales') THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
END $$;

-- Integer transportation matrix. Every row and every component margin is conserved.
-- Each row allocates proportionally to remaining component balances, then largest
-- remainders (component order breaks ties). Last row consumes the exact remainder.
CREATE OR REPLACE FUNCTION public._commercial_cent_matrix(p_rows bigint[], p_components bigint[])
RETURNS TABLE(row_n integer,component_n integer,cents bigint)
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE balances bigint[]:=p_components; parts bigint[]; fractions numeric[];
  total numeric; row_total bigint; residual bigint; best integer; best_fraction numeric;
  r integer; c integer; n integer:=cardinality(p_components);
BEGIN
  SELECT sum(x) INTO total FROM unnest(p_components) x;
  IF total IS NULL OR total<=0 OR total<>(SELECT sum(x) FROM unnest(p_rows)x)
    OR EXISTS(SELECT 1 FROM unnest(p_rows||p_components)x WHERE x<0) THEN
    RAISE EXCEPTION 'INVALID_ALLOCATION_MARGINS'; END IF;
  FOR r IN 1..cardinality(p_rows) LOOP
    row_total:=p_rows[r]; parts:=array_fill(0::bigint,ARRAY[n]); fractions:=array_fill(0::numeric,ARRAY[n]);
    residual:=row_total;
    FOR c IN 1..n LOOP
      parts[c]:=CASE WHEN total=0 THEN 0 ELSE floor(row_total::numeric*balances[c]/total)::bigint END;
      fractions[c]:=CASE WHEN total=0 THEN 0 ELSE row_total::numeric*balances[c]/total-parts[c] END;
      residual:=residual-parts[c];
    END LOOP;
    WHILE residual>0 LOOP
      best:=NULL; best_fraction:=-1;
      FOR c IN 1..n LOOP
        IF parts[c]<balances[c] AND fractions[c]>best_fraction THEN best:=c;best_fraction:=fractions[c]; END IF;
      END LOOP;
      IF best IS NULL THEN RAISE EXCEPTION 'ALLOCATION_EXHAUSTED'; END IF;
      parts[best]:=parts[best]+1;fractions[best]:=-1;residual:=residual-1;
    END LOOP;
    FOR c IN 1..n LOOP
      row_n:=r;component_n:=c;cents:=parts[c];RETURN NEXT;
      balances[c]:=balances[c]-parts[c];
    END LOOP;
    total:=total-row_total;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS lot_sale_order_items_active_sale_analytics_idx ON public.lot_sale_order_items(sale_id) WHERE contract_state<>'CANCELLED';

-- Private, complete authorized projection. The public RPCs below return only
-- aggregate information or ONE requested page, never this internal document.
CREATE OR REPLACE FUNCTION public._commercial_sales_projection(p_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o record; i record; v_reason text; components bigint[]; signed boolean[]; amounts bigint[];
  v_principal bigint; v_fees bigint; v_total bigint; v_known bigint; v_all_signed boolean;
  v_rows jsonb[]:=ARRAY[]::jsonb[];v_orders jsonb[]:=ARRAY[]::jsonb[]; v_inst jsonb; v_matrix jsonb; v_idx integer;
  v_p bigint; v_f bigint; v_c bigint; v_duplicate boolean;
BEGIN
  FOR o IN SELECT * FROM public.lot_sale_orders WHERE project_id=p_project AND status='CONFIRMED' ORDER BY id LOOP
    v_reason:=NULL;
    SELECT array_agg(round(it.item_total*100)::bigint ORDER BY it.id),
      array_agg(coalesce(it.contract_state='SIGNED' AND s.status='CONFIRMED' AND l.status='SOLD'
        AND l.archived_at IS NULL AND s.lot_id=it.lot_id,false) ORDER BY it.id),
      coalesce(sum(round(it.item_total*100)),0)::bigint,
      bool_and(it.contract_state='SIGNED'),
      coalesce(sum(round(s.negotiated_value*100)) FILTER(WHERE it.contract_state='SIGNED' AND s.status='CONFIRMED'
        AND s.lot_id=it.lot_id AND l.status='SOLD' AND l.archived_at IS NULL),0)::bigint,
      bool_or(it.contract_state='SIGNED' AND (s.id IS NULL OR s.lot_id<>it.lot_id OR s.status<>'CONFIRMED'
        OR (SELECT count(*) FROM public.lot_sales ds WHERE ds.lot_id=it.lot_id AND ds.status='CONFIRMED')<>1
        OR s.negotiated_value IS DISTINCT FROM it.item_total OR l.project_id<>p_project OR l.status<>'SOLD' OR l.archived_at IS NOT NULL))
      INTO components,signed,v_principal,v_all_signed,v_known,v_duplicate
    FROM public.lot_sale_order_items it LEFT JOIN public.lot_sales s ON s.id=it.sale_id
      JOIN public.commercial_lots l ON l.id=it.lot_id
    WHERE it.order_id=o.id AND it.contract_state<>'CANCELLED';
    v_fees:=round(coalesce(o.fees_total,0)*100)::bigint;v_total:=round(o.negotiated_total*100)::bigint;
    IF components IS NULL THEN v_reason:='NO_ACTIVE_ITEMS';
    ELSIF v_duplicate OR EXISTS(SELECT 1 FROM public.lot_sale_order_items a JOIN public.lot_sale_order_items b
       ON a.sale_id=b.sale_id AND a.id<>b.id WHERE a.order_id=o.id AND a.contract_state<>'CANCELLED' AND b.contract_state<>'CANCELLED')
       THEN v_reason:='ITEM_SALE_MISMATCH';
    ELSIF v_principal IS DISTINCT FROM round(o.spaces_subtotal*100)::bigint OR v_principal+v_fees<>v_total
      OR v_fees<>round((o.fee_admin+o.fee_ppci+o.fee_cleaning_license)*100)::bigint OR v_total<=0
      THEN v_reason:='COMPONENT_TOTAL_MISMATCH'; END IF;
    SELECT array_agg(round(amount*100)::bigint ORDER BY installment_number,id),
      coalesce(jsonb_agg(jsonb_build_object('id',id,'number',installment_number,'dueDate',due_date,
        'status',payment_status,'paidAt',paid_at) ORDER BY installment_number,id),'[]') INTO amounts,v_inst
      FROM public.lot_sale_installments WHERE order_id=o.id AND payment_status<>'CANCELLED';
    IF v_reason IS NULL AND (amounts IS NULL OR (SELECT sum(x) FROM unnest(amounts)x)<>v_total) THEN v_reason:='SCHEDULE_TOTAL_MISMATCH'; END IF;
    IF v_reason IS NULL AND EXISTS(SELECT 1 FROM public.lot_sale_installments WHERE order_id=o.id
        AND payment_status='PENDING' AND paid_at IS NOT NULL) THEN v_reason:='PAYMENT_STATE_MISMATCH'; END IF;
    v_orders:=array_append(v_orders,jsonb_build_object('orderId',o.id,'confirmedCents',v_known::text,
      'reason',v_reason,'partial',NOT coalesce(v_all_signed,false),'feesCents',v_fees::text,
      'feesIncluded',v_reason IS NULL AND coalesce(v_all_signed,false)));
    IF v_reason IS NOT NULL THEN CONTINUE; END IF;
    components:=components||v_fees;
    SELECT jsonb_agg(to_jsonb(m)) INTO v_matrix FROM public._commercial_cent_matrix(amounts,components)m;
    FOR v_idx IN 1..jsonb_array_length(v_inst) LOOP
      SELECT coalesce(sum((m->>'cents')::bigint) FILTER(WHERE (m->>'component_n')::int<cardinality(components)
          AND signed[(m->>'component_n')::int]),0)::bigint,
        coalesce(sum((m->>'cents')::bigint) FILTER(WHERE (m->>'component_n')::int=cardinality(components)
          AND v_all_signed),0)::bigint INTO v_p,v_f
      FROM jsonb_array_elements(v_matrix)m WHERE (m->>'row_n')::int=v_idx;
      v_c:=v_p+v_f;
      IF v_c>0 THEN v_rows:=array_append(v_rows,(v_inst->(v_idx-1))||jsonb_build_object(
        'orderId',o.id,'reference','Venda '||upper(left(o.id::text,8)), 'method',o.payment_method,
        'principalCents',v_p::text,'feesCents',v_f::text,'chargeCents',v_c::text,
        'analytic',NOT coalesce(v_all_signed,false))); END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('orders',to_jsonb(v_orders),'rows',to_jsonb(v_rows));
END $$;

CREATE OR REPLACE FUNCTION public._commercial_signature_rows(p_project uuid)
RETURNS TABLE(order_id uuid,reference text,registered_at timestamptz,completed_at timestamptz,seconds numeric,exclusion text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT o.id,'Venda '||upper(left(o.id::text,8)),o.created_at,e.completed_at,
   CASE WHEN e.completed_at>=o.created_at THEN extract(epoch FROM(e.completed_at-o.created_at)) END,
   CASE WHEN o.status<>'CONFIRMED' THEN 'CANCELLED'
     WHEN x.n=0 THEN 'NO_ITEMS'
     WHEN x.legacy>0 THEN 'LEGACY_UNVERIFIED'
     WHEN x.pending>0 THEN 'PENDING_OR_PARTIAL'
     WHEN x.cancelled>0 OR x.invalid>0 THEN 'CANCELLED_OR_INCONSISTENT'
     WHEN e.completed_at IS NULL THEN 'UNPROVEN_COMPLETION'
     WHEN e.registered_at<>o.created_at OR e.completed_at<o.created_at OR e.completed_at>statement_timestamp() THEN 'INVALID_TIMESTAMP'
     ELSE NULL END
 FROM public.lot_sale_orders o LEFT JOIN public.commercial_signature_completions e ON e.order_id=o.id AND e.cycle=1
 CROSS JOIN LATERAL(SELECT count(*) n,count(*) FILTER(WHERE i.contract_state='LEGACY_UNVERIFIED') legacy,
   count(*) FILTER(WHERE i.contract_state='PENDING_SIGNATURE') pending,count(*) FILTER(WHERE i.contract_state='CANCELLED') cancelled,
   count(*) FILTER(WHERE i.contract_state='SIGNED' AND (s.id IS NULL OR s.status<>'CONFIRMED' OR s.lot_id<>i.lot_id)) invalid
   FROM public.lot_sale_order_items i LEFT JOIN public.lot_sales s ON s.id=i.sale_id WHERE i.order_id=o.id)x
 WHERE o.project_id=p_project
$$;

CREATE OR REPLACE FUNCTION public.commercial_sales_analytics_summary(p_project_id uuid,
 p_reference_date date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v jsonb; v_months jsonb; v_signature jsonb; v_known bigint;v_covered bigint;v_fees bigint;
 v_orders jsonb;v_receipts jsonb;
BEGIN
 PERFORM public._commercial_analytics_access(p_project_id);
 IF p_reference_date IS NULL THEN RAISE EXCEPTION 'REFERENCE_DATE_REQUIRED'; END IF;
 v:=public._commercial_sales_projection(p_project_id);
 -- Exactly the same known negotiated-lot basis as the map snapshot (one active sale per lot).
 SELECT coalesce(sum(round(s.negotiated_value*100)),0)::bigint INTO v_known
 FROM public.commercial_lots l JOIN public.lot_sales s ON s.lot_id=l.id AND s.status='CONFIRMED'
 WHERE l.project_id=p_project_id AND l.status='SOLD' AND l.archived_at IS NULL
 AND (SELECT count(*) FROM public.lot_sales x WHERE x.lot_id=l.id AND x.status='CONFIRMED')=1;
 SELECT coalesce(sum((r->>'principalCents')::bigint),0),coalesce(sum((r->>'feesCents')::bigint),0)
 INTO v_covered,v_fees FROM jsonb_array_elements(v->'rows')r;
 WITH rows AS MATERIALIZED(SELECT r, date_trunc('month',(r->>'dueDate')::date)::date AS month FROM jsonb_array_elements(v->'rows')r),
 months AS(SELECT d::date AS month FROM generate_series(date '2026-12-01',date '2028-04-01',interval '1 month')d UNION SELECT month FROM rows)
 SELECT jsonb_agg(jsonb_build_object('month',m.month,'installments',x.n,'analyticInstallments',x.analytic,
   'principal',x.principal,'charge',x.charge) ORDER BY m.month) INTO v_months
 FROM months m CROSS JOIN LATERAL(
  SELECT count(r)::int n,count(r) FILTER(WHERE (r->>'analytic')::boolean)::int analytic,
   jsonb_build_object('scheduledCents',coalesce(sum((r->>'principalCents')::bigint),0)::text,
    'paidCents',coalesce(sum((r->>'principalCents')::bigint) FILTER(WHERE r->>'status'='PAID'),0)::text,
    'outstandingCents',coalesce(sum((r->>'principalCents')::bigint) FILTER(WHERE r->>'status'='PENDING'),0)::text,
    'overdueCents',coalesce(sum((r->>'principalCents')::bigint) FILTER(WHERE r->>'status'='PENDING' AND (r->>'dueDate')::date<p_reference_date),0)::text) principal,
   jsonb_build_object('scheduledCents',coalesce(sum((r->>'chargeCents')::bigint),0)::text,
    'paidCents',coalesce(sum((r->>'chargeCents')::bigint) FILTER(WHERE r->>'status'='PAID'),0)::text,
    'outstandingCents',coalesce(sum((r->>'chargeCents')::bigint) FILTER(WHERE r->>'status'='PENDING'),0)::text,
    'overdueCents',coalesce(sum((r->>'chargeCents')::bigint) FILTER(WHERE r->>'status'='PENDING' AND (r->>'dueDate')::date<p_reference_date),0)::text) charge
  FROM rows WHERE month=m.month)x;
 SELECT jsonb_build_object('count',count(*) FILTER(WHERE exclusion IS NULL),
  'averageSeconds',avg(seconds) FILTER(WHERE exclusion IS NULL)::text,
  'exclusions',coalesce((SELECT jsonb_object_agg(exclusion,n) FROM(SELECT exclusion,count(*) n FROM public._commercial_signature_rows(p_project_id) WHERE exclusion IS NOT NULL GROUP BY exclusion)t),'{}'))
 INTO v_signature FROM public._commercial_signature_rows(p_project_id);
 SELECT coalesce(jsonb_agg(o),'[]') INTO v_orders FROM jsonb_array_elements(v->'orders')o WHERE (o->>'confirmedCents')::bigint>0 AND (o->>'reason' IS NOT NULL OR (o->>'partial')::boolean);
 SELECT coalesce(jsonb_agg(jsonb_build_object('month',month,'principalCents',principal::text,'chargeCents',charge::text)),'[]') INTO v_receipts
 FROM(SELECT date_trunc('month',(r->>'paidAt')::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date AS month,
 sum((r->>'principalCents')::bigint) principal,sum((r->>'chargeCents')::bigint) charge FROM jsonb_array_elements(v->'rows')r
 WHERE r->>'status'='PAID' AND r->>'paidAt' IS NOT NULL GROUP BY 1)t;
 RETURN jsonb_build_object('projectId',p_project_id,'generation',public.commercial_map_revision(p_project_id),
 'referenceDate',p_reference_date,'generatedAt',statement_timestamp(),'months',v_months,'signature',v_signature,
 'reconciliation',jsonb_build_object('confirmedCents',v_known::text,'coveredCents',v_covered::text,
  'undistributedCents',(v_known-v_covered)::text,'includedFeesCents',v_fees::text,
  'excludedFeesCents',(coalesce((SELECT sum((o->>'feesCents')::bigint) FROM jsonb_array_elements(v->'orders')o),0)-v_fees)::text,
  'undistributedOrders',(SELECT count(*) FROM jsonb_array_elements(v->'orders')o WHERE o->>'reason' IS NOT NULL AND (o->>'confirmedCents')::bigint>0),
  'unknownSaleValues',(SELECT count(*) FROM public.commercial_lots l WHERE l.project_id=p_project_id AND l.status='SOLD' AND l.archived_at IS NULL AND
    (SELECT count(*) FROM public.lot_sales s WHERE s.lot_id=l.id AND s.status='CONFIRMED' AND s.negotiated_value IS NOT NULL)<>1),
  'paidWithoutDate',(SELECT count(*) FROM jsonb_array_elements(v->'rows')r WHERE r->>'status'='PAID' AND r->>'paidAt' IS NULL)),
 'issues',v_orders,'receiptsByOccurrence',v_receipts,'settlementModel','INSTALLMENT_FULL_STATUS');
END $$;

CREATE OR REPLACE FUNCTION public.commercial_sales_cashflow_month(p_project_id uuid,p_month date,p_generation text,
 p_limit integer DEFAULT 20,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v jsonb;v_generation text;v_rows jsonb;v_n integer;
BEGIN
 PERFORM public._commercial_analytics_access(p_project_id);
 IF p_month IS NULL OR extract(day FROM p_month)<>1 OR p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'INVALID_PAGE'; END IF;
 v_generation:=public.commercial_map_revision(p_project_id);
 IF p_generation IS DISTINCT FROM v_generation THEN RAISE EXCEPTION 'ANALYTICS_CHANGED'; END IF;
 v:=public._commercial_sales_projection(p_project_id);
 SELECT count(*) INTO v_n FROM jsonb_array_elements(v->'rows')r WHERE date_trunc('month',(r->>'dueDate')::date)::date=p_month;
 SELECT coalesce(jsonb_agg(r),'[]') INTO v_rows FROM(SELECT r FROM jsonb_array_elements(v->'rows')r
  WHERE date_trunc('month',(r->>'dueDate')::date)::date=p_month ORDER BY r->>'dueDate',r->>'orderId',r->>'id' LIMIT p_limit OFFSET p_offset)t;
 RETURN jsonb_build_object('generation',v_generation,'total',v_n,'rows',v_rows);
END $$;

CREATE OR REPLACE FUNCTION public.commercial_sales_signature_details(p_project_id uuid,p_generation text,
 p_limit integer DEFAULT 20,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_rows jsonb;v_n integer;v_generation text;
BEGIN
 PERFORM public._commercial_analytics_access(p_project_id);
 IF p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'INVALID_PAGE'; END IF;
 v_generation:=public.commercial_map_revision(p_project_id);
 IF p_generation IS DISTINCT FROM v_generation THEN RAISE EXCEPTION 'ANALYTICS_CHANGED'; END IF;
 SELECT count(*) INTO v_n FROM public._commercial_signature_rows(p_project_id) WHERE exclusion IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO v_rows FROM(SELECT * FROM public._commercial_signature_rows(p_project_id)
  WHERE exclusion IS NULL ORDER BY completed_at DESC,order_id LIMIT p_limit OFFSET p_offset)t;
 RETURN jsonb_build_object('generation',v_generation,'total',v_n,'rows',v_rows);
END $$;
REVOKE ALL ON FUNCTION public._commercial_analytics_access(uuid),public._commercial_cent_matrix(bigint[],bigint[]),
 public._commercial_sales_projection(uuid),public._commercial_signature_rows(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.commercial_sales_analytics_summary(uuid,date),public.commercial_sales_cashflow_month(uuid,date,text,integer,integer),
 public.commercial_sales_signature_details(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commercial_sales_analytics_summary(uuid,date),public.commercial_sales_cashflow_month(uuid,date,text,integer,integer),
 public.commercial_sales_signature_details(uuid,text,integer,integer) TO authenticated;

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

  -- Only an actual confirmation can conclude the original unrevised cycle.
  -- Cancelling a pending item or inheriting SIGNED in a revision cannot emit it.
  IF v_confirmed > 0 AND NOT EXISTS (SELECT 1 FROM public.lot_sale_order_revisions WHERE order_id=p_order_id)
    AND NOT EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state<>'SIGNED') THEN
    INSERT INTO public.commercial_signature_completions(order_id,project_id,registered_at,completed_at,actor_user_id,evidence,item_ids)
    SELECT p_order_id,v_order.project_id,v_order.created_at,max(signed_at),auth.uid(),'CONFIRMATION',array_agg(id ORDER BY id)
    FROM public.lot_sale_order_items WHERE order_id=p_order_id
    HAVING min(signed_at)>=v_order.created_at AND count(*)=count(signed_at)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('orderId', p_order_id, 'confirmed', v_confirmed, 'skipped', v_skipped, 'pendingRemaining', v_remaining);
END;
$function$
