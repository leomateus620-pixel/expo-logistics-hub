-- A single statement snapshot avoids pagination races and duplicate monetary totals.
-- The dashboard's unit is an order (or a standalone legacy sale), not a file.
CREATE OR REPLACE FUNCTION public.export_commercial_sale_orders(
  p_project_id uuid, p_search text DEFAULT NULL, p_status text DEFAULT NULL,
  p_has_document boolean DEFAULT NULL, p_payment_method text DEFAULT NULL,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_signature_selection text DEFAULT 'ALL'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_docs boolean; result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id=p_project_id;
  IF v_org IS NULL OR NOT public.map_has_explicit_capability(v_org,'map.manage_sales') THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF p_signature_selection NOT IN ('ALL','SIGNED','PENDING') OR p_signature_selection IS NULL THEN
    RAISE EXCEPTION 'INVALID_SIGNATURE_SELECTION';
  END IF;
  v_docs := public.map_has_explicit_capability(v_org,'map.manage_contracts');
  WITH RECURSIVE walk AS (
    SELECT l.id lot_id,e.id,e.parent_entity_id,e.classification,e.name,e.segment_id,ARRAY[e.id] path,0 depth
    FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
    WHERE l.project_id=p_project_id AND e.project_id=p_project_id
    UNION ALL
    SELECT w.lot_id,e.id,e.parent_entity_id,e.classification,e.name,e.segment_id,w.path||e.id,w.depth+1
    FROM walk w JOIN public.map_entities e ON e.id=w.parent_entity_id AND e.project_id=p_project_id
    WHERE NOT e.id=ANY(w.path) AND w.depth<64
  ), locations AS (
    SELECT w.lot_id,
      (array_agg(w.name ORDER BY w.depth) FILTER (WHERE w.depth>0 AND w.classification='PAVILION'))[1] pavilion_name,
      (array_agg(w.segment_id ORDER BY w.depth) FILTER (WHERE w.segment_id IS NOT NULL))[1] segment_id
    FROM walk w GROUP BY w.lot_id
  ), lot_info AS (
    SELECT l.id, nullif(concat_ws(' · ', coalesce(loc.pavilion_name, CASE WHEN l.block ~* '^[A-Z]{1,2}$' THEN 'Quadra '||l.block END),
      CASE WHEN g.display_name IS DISTINCT FROM loc.pavilion_name THEN g.display_name END),'') location,
      coalesce(CASE WHEN l.lot_number IS NOT NULL THEN (CASE WHEN loc.pavilion_name IS NOT NULL THEN 'Módulo ' ELSE 'Lote ' END)||l.lot_number END, nullif(l.display_name,''), nullif(l.public_identifier,'')) lot_label
    FROM public.commercial_lots l LEFT JOIN locations loc ON loc.lot_id=l.id
    LEFT JOIN public.map_segments g ON g.id=loc.segment_id AND g.project_id=p_project_id
    WHERE l.project_id=p_project_id
  ), orders AS (
    SELECT o.id record_id,'ORDER'::text kind,o.id order_id,NULL::uuid sale_id,
      'PV-'||upper(left(o.id::text,8)) reference,o.created_at,o.buyer_name,o.buyer_trade_name,o.document_number,
      CASE WHEN count(i.id) FILTER (WHERE i.contract_state='CANCELLED')>0
        AND o.spaces_subtotal IS DISTINCT FROM sum(i.item_total) FILTER (WHERE i.contract_state<>'CANCELLED')
        THEN NULL ELSE o.negotiated_total END AS negotiated_total,o.payment_method,
      count(i.id)::int item_count,count(i.id) FILTER(WHERE i.contract_state<>'CANCELLED')::int active_count,
      count(i.id) FILTER(WHERE i.contract_state='SIGNED')::int signed_count,
      count(i.id) FILTER(WHERE i.contract_state='PENDING_SIGNATURE')::int pending_count,
      count(i.id) FILTER(WHERE i.contract_state='CANCELLED')::int cancelled_count,
      count(i.id) FILTER(WHERE i.contract_state='LEGACY_UNVERIFIED')::int legacy_count,
      CASE WHEN count(i.id) FILTER(WHERE i.contract_state='SIGNED')=count(i.signed_at) FILTER(WHERE i.contract_state='SIGNED') THEN max(i.signed_at) FILTER(WHERE i.contract_state='SIGNED') END signed_at,
      array_agg(i.lot_id ORDER BY i.public_identifier) FILTER(WHERE i.contract_state<>'CANCELLED') lot_ids,
      string_agg(coalesce(i.public_identifier,'')||' '||coalesce(l.lot_number,'')||' '||coalesce(l.display_name,''),' ') space_text,
      NULL::text legacy_contract_number
    FROM public.lot_sale_orders o JOIN public.lot_sale_order_items i ON i.order_id=o.id
    LEFT JOIN public.commercial_lots l ON l.id=i.lot_id
    WHERE o.project_id=p_project_id AND o.reverted_at IS NULL GROUP BY o.id
  ), legacy AS (
    SELECT s.id,'LEGACY'::text,NULL::uuid,s.id,'LG-'||upper(left(s.id::text,8)),s.created_at,
      s.buyer_name,s.buyer_trade_name,s.document_number,s.negotiated_value,NULL::text,
      1,1,0,0,0,1,NULL::timestamptz,ARRAY[s.lot_id],
      coalesce(l.public_identifier,'')||' '||coalesce(l.lot_number,'')||' '||coalesce(l.display_name,'')||' '||coalesce(s.contract_number,''),s.contract_number
    FROM public.lot_sales s JOIN public.commercial_lots l ON l.id=s.lot_id
    WHERE l.project_id=p_project_id AND s.reverted_at IS NULL AND s.status<>'REVERTED'
      AND NOT EXISTS(SELECT 1 FROM public.lot_sale_order_items i WHERE i.sale_id=s.id)
  ), base AS (SELECT * FROM orders UNION ALL SELECT * FROM legacy), enriched AS (
    SELECT b.*,
      (SELECT count(DISTINCT c.id)::int FROM public.lot_contracts c
        WHERE c.is_active AND EXISTS(SELECT 1 FROM public.lot_contract_versions v WHERE v.contract_id=c.id AND v.superseded_at IS NULL)
          AND ((c.scope='LOT' AND c.lot_id=ANY(b.lot_ids)) OR (c.scope='ORDER_ITEMS' AND c.order_id=b.order_id))) document_count,
      (SELECT string_agg(DISTINCT c.contract_number,' ') FROM public.lot_contracts c
        WHERE c.is_active AND ((c.scope='LOT' AND c.lot_id=ANY(b.lot_ids)) OR (c.scope='ORDER_ITEMS' AND c.order_id=b.order_id))) contract_numbers,
      (SELECT jsonb_agg(jsonb_build_object('location',q.location,'lots',q.lots) ORDER BY q.location NULLS LAST) FROM (
         SELECT li.location,jsonb_agg(li.lot_label ORDER BY li.lot_label) lots
         FROM lot_info li WHERE li.id=ANY(b.lot_ids) GROUP BY li.location
       ) q) locations,
      (SELECT jsonb_build_object('number',min(c.contract_number),'createdAt',min(c.created_at))
       FROM public.lot_contracts c
       WHERE v_docs AND cardinality(b.lot_ids)>0 AND c.is_active AND ((c.scope='LOT' AND c.lot_id=ANY(b.lot_ids)) OR (c.scope='ORDER_ITEMS' AND c.order_id=b.order_id))
       -- LOT documents have no sale/order identity; a resold lot can retain an
       -- older active document. Only an explicit order link can prove ownership.
       HAVING count(*)=1 AND bool_and(
          (c.scope='ORDER_ITEMS' AND c.order_id=b.order_id AND NOT EXISTS(SELECT 1 FROM unnest(b.lot_ids) lot_id WHERE NOT EXISTS(SELECT 1 FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id AND cl.lot_id=lot_id))
           AND NOT EXISTS(SELECT 1 FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id AND NOT cl.lot_id=ANY(b.lot_ids)))
       )) sole_contract
    FROM base b
  ), filtered AS (
    SELECT * FROM enriched e WHERE
      (nullif(trim(coalesce(p_search,'')),'') IS NULL OR lower(concat_ws(' ',e.reference,e.buyer_name,e.buyer_trade_name,e.space_text,e.contract_numbers)) LIKE '%'||lower(trim(p_search))||'%')
      AND (p_status IS NULL OR (p_status='PENDING' AND e.pending_count>0) OR (p_status='SIGNED' AND e.signed_count>0 AND e.pending_count=0)
        OR (p_status='PARTIAL' AND e.signed_count>0 AND e.pending_count>0) OR (p_status='CANCELLED_PARTIAL' AND e.cancelled_count>0)
        OR (p_status='LEGACY' AND (e.kind='LEGACY' OR e.legacy_count>0)))
      AND (p_has_document IS NULL OR p_has_document=(e.document_count>0))
      AND (p_payment_method IS NULL OR e.payment_method=p_payment_method)
      AND (p_from IS NULL OR e.created_at>=p_from::timestamptz)
      AND (p_to IS NULL OR e.created_at<(p_to+1)::timestamptz)
      AND (p_signature_selection='ALL' OR (p_signature_selection='PENDING' AND e.pending_count>0)
        OR (p_signature_selection='SIGNED' AND e.active_count>0 AND e.active_count=e.signed_count))
  )
  SELECT jsonb_build_object('generatedAt',statement_timestamp(),'projectName',(SELECT name FROM public.map_projects WHERE id=p_project_id),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'identification',CASE WHEN f.kind='LEGACY' AND nullif(trim(f.legacy_contract_number),'') IS NOT NULL THEN 'Contrato '||f.legacy_contract_number||' · Registro legado '||f.reference
        WHEN nullif(f.sole_contract->>'number','') IS NOT NULL THEN 'Contrato '||(f.sole_contract->>'number')||' · '||CASE WHEN f.kind='ORDER' THEN 'Pedido ' ELSE 'Registro legado ' END||f.reference
        WHEN f.kind='ORDER' THEN 'Pedido '||f.reference ELSE 'Registro legado '||f.reference END,
      'legalName',f.buyer_name,'tradeName',f.buyer_trade_name,'document',f.document_number,
      'createdAt',f.sole_contract->>'createdAt','value',f.negotiated_total,'locations',coalesce(f.locations,'[]'::jsonb),
      'signatureStatus',CASE WHEN f.active_count=0 THEN 'Cancelado'
        WHEN f.pending_count>0 AND f.signed_count>0 AND f.legacy_count=0 THEN 'Parcialmente assinado'
        WHEN f.pending_count>0 AND f.legacy_count>0 THEN 'Aguardando assinatura · situação de parte dos itens não informada'
        WHEN f.pending_count>0 THEN 'Aguardando assinatura'
        WHEN f.active_count=f.signed_count AND f.signed_count>0 THEN 'Assinado'
        ELSE 'Situação de assinatura não informada' END,
      'signatureCompletedAt',CASE WHEN f.active_count>0 AND f.active_count=f.signed_count THEN f.signed_at END,
      'excludedFromCurrentTotal',f.active_count=0
    ) ORDER BY f.created_at DESC,f.record_id),'[]'::jsonb)) INTO result FROM filtered f;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.export_commercial_sale_orders(uuid,text,text,boolean,text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_commercial_sale_orders(uuid,text,text,boolean,text,date,date,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
