BEGIN;

CREATE TABLE IF NOT EXISTS public.commercial_space_cessions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.map_projects(id),
  edition integer NOT NULL CHECK (edition = 2028),
  modality text NOT NULL DEFAULT 'NON_COMMERCIAL' CHECK (modality = 'NON_COMMERCIAL'),
  beneficiary text NOT NULL CHECK (length(trim(beneficiary)) BETWEEN 1 AND 200),
  exhibitor_id uuid REFERENCES public.commercial_exhibitors(id),
  purpose text NOT NULL CHECK (length(trim(purpose)) BETWEEN 1 AND 500),
  marker text CHECK (marker = 'FENASOJA'),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total = 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (id,project_id)
);

-- The lot owns its single active assignment. Existing clients already exclude
-- UNAVAILABLE from checkout and the commercial denominator during rollout.
ALTER TABLE public.commercial_lots
  ADD COLUMN IF NOT EXISTS cession_id uuid,
  ADD COLUMN IF NOT EXISTS cession_original_pricing jsonb,
  ADD COLUMN IF NOT EXISTS cession_value numeric(14,2);
ALTER TABLE public.commercial_lots DROP CONSTRAINT IF EXISTS lot_cession_project_fk,
  ADD CONSTRAINT lot_cession_project_fk FOREIGN KEY (cession_id,project_id)
    REFERENCES public.commercial_space_cessions(id,project_id),
  DROP CONSTRAINT IF EXISTS lot_cession_state,
  ADD CONSTRAINT lot_cession_state CHECK (
    (cession_id IS NULL AND cession_original_pricing IS NULL AND cession_value IS NULL)
    OR (cession_id IS NOT NULL AND status='UNAVAILABLE' AND archived_at IS NULL
      AND cession_original_pricing IS NOT NULL AND cession_value IS NOT DISTINCT FROM 0));
CREATE INDEX IF NOT EXISTS commercial_lots_cession_idx ON public.commercial_lots(cession_id) WHERE cession_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.visible_space_cessions()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT DISTINCT cession_id FROM commercial_lots WHERE cession_id IS NOT NULL AND
    (project_id IN (SELECT map_viewable_project_ids()) OR id IN (SELECT map_segment_lot_ids())
     OR id IN (SELECT map_capable_lot_ids('map.manage_sales')) OR id IN (SELECT map_capable_lot_ids('map.manage_contracts')))
$$;
REVOKE ALL ON FUNCTION app_private.visible_space_cessions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.visible_space_cessions() TO authenticated;
ALTER TABLE public.commercial_space_cessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_space_cessions FROM PUBLIC,anon,authenticated;
GRANT SELECT (id,project_id,beneficiary,purpose,marker,modality,edition,total) ON public.commercial_space_cessions TO authenticated;
DROP POLICY IF EXISTS visible_cessions ON public.commercial_space_cessions;
CREATE POLICY visible_cessions ON public.commercial_space_cessions FOR SELECT TO authenticated
  USING (id IN (SELECT app_private.visible_space_cessions()));

ALTER TABLE public.lot_contracts ADD COLUMN IF NOT EXISTS cession_id uuid REFERENCES public.commercial_space_cessions(id);
CREATE UNIQUE INDEX IF NOT EXISTS lot_contracts_cession_idx ON public.lot_contracts(cession_id) WHERE cession_id IS NOT NULL;
ALTER TABLE public.lot_contracts DROP CONSTRAINT IF EXISTS lot_contracts_scope_check,
  ADD CONSTRAINT lot_contracts_scope_check CHECK (scope IN ('LOT','ORDER_ITEMS','CESSION')),
  DROP CONSTRAINT IF EXISTS lot_contracts_target_check,
  ADD CONSTRAINT lot_contracts_target_check CHECK (
    (scope='LOT' AND lot_id IS NOT NULL AND cession_id IS NULL)
    OR (scope='ORDER_ITEMS' AND order_id IS NOT NULL AND cession_id IS NULL)
    OR (scope='CESSION' AND cession_id IS NOT NULL AND order_id IS NULL AND sale_id IS NULL AND lot_id IS NULL));
ALTER TABLE public.lot_contract_versions ADD COLUMN IF NOT EXISTS cession_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cession_signed_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION app_private.guard_cession_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'LOT_CEDED:%',OLD.public_identifier; END IF;
  IF TG_OP='UPDATE' AND OLD.cession_id IS NOT NULL AND
    (NEW.cession_id,NEW.status,NEW.archived_at,NEW.entity_id,NEW.cession_value,NEW.cession_original_pricing)
    IS DISTINCT FROM (OLD.cession_id,OLD.status,OLD.archived_at,OLD.entity_id,OLD.cession_value,OLD.cession_original_pricing)
  THEN RAISE EXCEPTION 'LOT_CEDED:%',OLD.public_identifier; END IF;
  IF NEW.cession_id IS NOT NULL AND current_user IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'USE_CESSION_OPERATION';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_cession_assignment ON public.commercial_lots;
CREATE TRIGGER protect_cession_assignment BEFORE INSERT OR UPDATE OF cession_id,status,archived_at,entity_id,cession_value,cession_original_pricing
  ON public.commercial_lots FOR EACH ROW EXECUTE FUNCTION app_private.guard_cession_assignment();

DROP TRIGGER IF EXISTS protect_cession_delete ON public.commercial_lots;
CREATE TRIGGER protect_cession_delete BEFORE DELETE ON public.commercial_lots
  FOR EACH ROW WHEN (OLD.cession_id IS NOT NULL) EXECUTE FUNCTION app_private.guard_cession_assignment();

CREATE OR REPLACE FUNCTION app_private.guard_cession_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE code text; assignment uuid;
BEGIN
  SELECT public_identifier,cession_id INTO code,assignment FROM commercial_lots WHERE id=NEW.lot_id FOR UPDATE;
  IF assignment IS NOT NULL THEN RAISE EXCEPTION 'LOT_CEDED:%',code; END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lot_sales','lot_sale_order_items','lot_reservations','lot_negotiations','lot_contracts','lot_contract_lots'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS protect_cession_sale ON public.%I',t);
    EXECUTE format('CREATE TRIGGER protect_cession_sale BEFORE INSERT OR UPDATE OF lot_id ON public.%I FOR EACH ROW WHEN (NEW.lot_id IS NOT NULL) EXECUTE FUNCTION app_private.guard_cession_sale()',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app_private.create_space_cession(
  p_id uuid,p_project uuid,p_beneficiary text,p_exhibitor uuid,p_purpose text,p_lots uuid[],p_marker text
) RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE
  org uuid; selected uuid[]; previous commercial_space_cessions%ROWTYPE; conflict text; n integer;
BEGIN
  SELECT org_id INTO STRICT org FROM map_projects WHERE id=p_project AND NOT is_archived;
  selected := ARRAY(SELECT DISTINCT id FROM unnest(p_lots) id ORDER BY id);
  IF cardinality(selected)=0 OR array_position(selected,NULL) IS NOT NULL OR cardinality(selected)<>cardinality(p_lots)
    THEN RAISE EXCEPTION 'Seleção de lotes inválida.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  IF p_exhibitor IS NOT NULL AND NOT EXISTS (SELECT FROM commercial_exhibitors WHERE id=p_exhibitor AND org_id=org)
    THEN RAISE EXCEPTION 'Beneficiário fora do projeto.'; END IF;
  SELECT * INTO previous FROM commercial_space_cessions WHERE id=p_id;
  IF FOUND THEN
    IF (previous.project_id,previous.beneficiary,previous.exhibitor_id,previous.purpose,previous.marker,previous.created_by)
      IS DISTINCT FROM (p_project,trim(p_beneficiary),p_exhibitor,trim(p_purpose),p_marker,auth.uid())
      OR selected <> ARRAY(SELECT id FROM commercial_lots WHERE cession_id=p_id ORDER BY id)
    THEN RAISE EXCEPTION 'IDEMPOTENCY_SCOPE_MISMATCH'; END IF;
    RETURN p_id;
  END IF;
  PERFORM 1 FROM commercial_lots WHERE id=ANY(selected) AND project_id=p_project ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>cardinality(selected) THEN RAISE EXCEPTION 'Lote fora do projeto.'; END IF;
  SELECT string_agg(l.public_identifier||' ('||l.id||')',', ' ORDER BY l.public_identifier) INTO conflict
  FROM commercial_lots l JOIN map_entities e ON e.id=l.entity_id
  WHERE l.id=ANY(selected) AND (l.status<>'AVAILABLE' OR l.archived_at IS NOT NULL OR e.is_archived
    OR l.commercial_unit<>'SQUARE_METER' OR l.cession_id IS NOT NULL
    OR EXISTS(SELECT FROM lot_sales WHERE lot_id=l.id AND status<>'REVERTED')
    OR EXISTS(SELECT FROM lot_reservations WHERE lot_id=l.id AND status='ACTIVE')
    OR EXISTS(SELECT FROM lot_negotiations WHERE lot_id=l.id AND status='ACTIVE')
    OR EXISTS(SELECT FROM lot_sale_order_items i WHERE i.lot_id=l.id AND (i.contract_state<>'CANCELLED'
      OR EXISTS(SELECT FROM lot_sale_installments a WHERE a.order_id=i.order_id AND a.payment_status='PAID')))
    OR EXISTS(SELECT FROM lot_contracts c WHERE c.is_active AND (c.lot_id=l.id OR EXISTS
      (SELECT FROM lot_contract_lots cl WHERE cl.contract_id=c.id AND cl.lot_id=l.id AND cl.removed_at IS NULL))));
  IF conflict IS NOT NULL THEN RAISE EXCEPTION 'Lotes indisponíveis para cessão: %',conflict; END IF;
  INSERT INTO commercial_space_cessions(id,project_id,edition,beneficiary,exhibitor_id,purpose,marker,created_by)
    VALUES(p_id,p_project,2028,trim(p_beneficiary),p_exhibitor,trim(p_purpose),p_marker,auth.uid());
  WITH snapshot AS MATERIALIZED (
    SELECT l.id,l.entity_id,l.status,l.public_identifier,l.official_area_sqm,
      jsonb_build_object('renewal',p.renovacao_total,'second',p.segunda_total,
        'defaultRenewal',p.renovacao_default_total,'defaultSecond',p.segunda_default_total) pricing
    FROM commercial_lots l LEFT JOIN commercial_lot_pricing_2028 p ON p.lot_id=l.id WHERE l.id=ANY(selected)
  ), assigned AS (
    UPDATE commercial_lots l SET status='UNAVAILABLE',cession_id=p_id,cession_value=0,cession_original_pricing=s.pricing
    FROM snapshot s WHERE s.id=l.id RETURNING l.id
  )
  INSERT INTO map_activity_logs(org_id,project_id,lot_id,entity_id,action,reason,before_state,after_state,actor_user_id)
    SELECT org,p_project,s.id,s.entity_id,'SPACE_CEDED',trim(p_purpose),to_jsonb(s),
      jsonb_build_object('cession_id',p_id,'beneficiary',trim(p_beneficiary),'value',0),auth.uid()
    FROM snapshot s JOIN assigned a USING(id);
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION app_private.create_space_cession(uuid,uuid,text,uuid,text,uuid[],text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.register_space_cession(p_id uuid,p_project uuid,p_beneficiary text,p_exhibitor uuid,p_purpose text,p_lots uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT FROM map_projects WHERE id=p_project
    AND map_has_explicit_capability(org_id,'map.manage_sales')) THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  RETURN app_private.create_space_cession(p_id,p_project,p_beneficiary,p_exhibitor,p_purpose,p_lots,NULL);
END $$;

CREATE OR REPLACE FUNCTION public.space_cession_detail(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE op commercial_space_cessions%ROWTYPE; org uuid; files boolean;
BEGIN
  SELECT * INTO STRICT op FROM commercial_space_cessions WHERE id=p_id;
  SELECT org_id INTO org FROM map_projects WHERE id=op.project_id;
  files := map_has_explicit_capability(org,'map.manage_contracts') IS TRUE;
  IF auth.uid() IS NULL OR NOT (files OR map_has_explicit_capability(org,'map.manage_sales') IS TRUE)
    THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  RETURN jsonb_build_object('id',op.id,'beneficiary',op.beneficiary,'purpose',op.purpose,'orgId',org,
    'createdAt',op.created_at,'total',op.total,
    'lots',(SELECT jsonb_agg(jsonb_build_object('id',id,'entityId',entity_id,'code',public_identifier,
      'block',block,'number',lot_number,'area',official_area_sqm,'value',cession_value,'original',cession_original_pricing)
      ORDER BY block,lot_number,public_identifier) FROM commercial_lots WHERE cession_id=op.id),
    'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('version',v.version,'name',CASE WHEN files THEN v.original_name END,
      'path',CASE WHEN files THEN v.storage_path END,'uploadedAt',v.uploaded_at,'signedAt',v.cession_signed_at) ORDER BY v.version DESC)
      FROM lot_contracts c JOIN lot_contract_versions v ON c.id=v.contract_id WHERE c.cession_id=op.id),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.attach_cession_contract(p_id uuid,p_expected_version int,p_storage_path text,p_original_name text,p_mime_type text,p_file_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; project uuid; cid uuid; ver int; vid uuid; ids uuid[];
BEGIN
  SELECT p.org_id,p.id INTO STRICT org,project FROM commercial_space_cessions a JOIN map_projects p ON p.id=a.project_id WHERE a.id=p_id FOR UPDATE OF a;
  IF auth.uid() IS NULL OR map_has_explicit_capability(org,'map.manage_contracts') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE org::text||'/cessions/'||p_id::text||'/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  PERFORM lock_commercial_contract_upload(p_storage_path);
  IF p_mime_type IS NULL OR p_mime_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
     OR p_file_size IS NULL OR p_file_size NOT BETWEEN 1 AND 15728640 OR NOT EXISTS (
       SELECT FROM storage.objects WHERE bucket_id='map-contracts' AND name=p_storage_path AND owner_id=auth.uid()::text
       AND (metadata->>'size')::bigint=p_file_size AND metadata->>'mimetype'=p_mime_type)
    THEN RAISE EXCEPTION 'INVALID_CONTRACT_FILE'; END IF;
  SELECT id,active_version INTO cid,ver FROM lot_contracts WHERE cession_id=p_id;
  IF coalesce(ver,0) IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'CONTRACT_CHANGED'; END IF;
  ver := coalesce(ver,0)+1;
  SELECT array_agg(id ORDER BY id) INTO ids FROM commercial_lots WHERE cession_id=p_id;
  IF cid IS NULL THEN
    INSERT INTO lot_contracts(cession_id,scope,active_version,created_by) VALUES(p_id,'CESSION',ver,auth.uid()) RETURNING id INTO cid;
  ELSE
    UPDATE lot_contract_versions SET superseded_at=now() WHERE contract_id=cid AND superseded_at IS NULL;
    UPDATE lot_contracts SET active_version=ver WHERE id=cid;
  END IF;
  INSERT INTO lot_contract_versions(contract_id,version,storage_path,original_name,mime_type,file_size,uploaded_by,covered_lot_ids)
    VALUES(cid,ver,p_storage_path,p_original_name,p_mime_type,p_file_size,auth.uid(),ids) RETURNING id INTO vid;
  INSERT INTO map_activity_logs(org_id,project_id,action,after_state,actor_user_id) VALUES
    (org,project,'CESSION_CONTRACT_ATTACHED',jsonb_build_object('cession_id',p_id,'version',ver,'lot_ids',ids),auth.uid());
  RETURN jsonb_build_object('contractId',cid,'version',ver,'versionId',vid);
END $$;

CREATE OR REPLACE FUNCTION public.sign_cession_contract(p_id uuid,p_version int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; project uuid;
BEGIN
  SELECT p.org_id,p.id INTO STRICT org,project FROM commercial_space_cessions a JOIN map_projects p ON p.id=a.project_id WHERE a.id=p_id FOR UPDATE OF a;
  IF auth.uid() IS NULL OR map_has_explicit_capability(org,'map.manage_contracts') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF NOT EXISTS(SELECT FROM lot_contracts WHERE cession_id=p_id AND active_version=p_version) THEN RAISE EXCEPTION 'CONTRACT_CHANGED'; END IF;
  UPDATE lot_contract_versions v SET cession_signed_at=now(),cession_signed_by=auth.uid() FROM lot_contracts c
    WHERE c.cession_id=p_id AND v.contract_id=c.id AND v.version=p_version AND v.cession_signed_at IS NULL;
  IF FOUND THEN INSERT INTO map_activity_logs(org_id,project_id,action,after_state,actor_user_id)
    VALUES(org,project,'CESSION_SIGNATURE_CONFIRMED',jsonb_build_object('cession_id',p_id,'version',p_version),auth.uid()); END IF;
END $$;

REVOKE ALL ON FUNCTION public.space_cession_detail(uuid),public.sign_cession_contract(uuid,int),
  public.register_space_cession(uuid,uuid,text,uuid,text,uuid[]),public.attach_cession_contract(uuid,int,text,text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.space_cession_detail(uuid),public.sign_cession_contract(uuid,int),
  public.register_space_cession(uuid,uuid,text,uuid,text,uuid[]),public.attach_cession_contract(uuid,int,text,text,text,bigint) TO authenticated;

-- Only called after the existing token and lot-scope checks. Replace the public
-- commercial pricing object with the effective (zero) value of the assignment.
CREATE OR REPLACE FUNCTION app_private.public_cession_projection(assignment uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT coalesce((SELECT jsonb_build_object('cession',jsonb_build_object('beneficiary',beneficiary,'purpose',purpose,'marker',marker),
    'availability','UNAVAILABLE','pricing',jsonb_build_object('resolutionStatus','EXCLUIDO',
    'renovacaoTotal',0,'segundaTotal',0)) FROM commercial_space_cessions WHERE id=assignment),'{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION app_private.public_cession_projection(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.register_commercial_sale_order_checked(p_project_id uuid, p_operator_id uuid, p_idempotency_key text, p_stage text, p_lot_ids uuid[], p_expected_prices jsonb, p_buyer_name text, p_document_number text, p_phone text, p_email text, p_payment_type text, p_installment_count integer, p_payment_method text, p_first_due_date date, p_installments jsonb, p_expected_total numeric, p_notes text, p_exhibitor_id uuid, p_fee_admin numeric, p_fee_ppci numeric, p_fee_cleaning_license numeric, p_buyer_trade_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_key text := btrim(p_idempotency_key);
  v_existing public.lot_sale_orders%ROWTYPE;
  v_lot_ids uuid[] := ARRAY(SELECT DISTINCT id FROM unnest(p_lot_ids) AS lot(id) ORDER BY id);
  v_lot record;
  v_digest text;
  v_order uuid;
  v_changed_price text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF auth.uid() IS DISTINCT FROM p_operator_id OR v_org IS NULL
    OR public.map_has_explicit_capability(v_org, 'map.manage_sales') IS NOT TRUE THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF coalesce(v_key, '') = '' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF p_stage IS NULL OR p_stage NOT IN ('RENOVACAO', 'SEGUNDA_ETAPA') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  IF cardinality(v_lot_ids) = 0 OR array_position(v_lot_ids, NULL::uuid) IS NOT NULL
    OR cardinality(v_lot_ids) <> cardinality(p_lot_ids) THEN RAISE EXCEPTION 'INVALID_LOT_SELECTION'; END IF;

  v_digest := encode(sha256(convert_to(jsonb_build_array(
    p_project_id, p_operator_id, p_stage, v_lot_ids, p_expected_prices, p_buyer_name, p_document_number,
    p_phone, p_email, p_payment_type, p_installment_count, p_payment_method, p_first_due_date,
    p_installments, p_expected_total, p_notes, p_exhibitor_id, p_fee_admin, p_fee_ppci,
    p_fee_cleaning_license, p_buyer_trade_name
  )::text, 'UTF8')), 'hex');
  PERFORM pg_advisory_xact_lock(hashtext('sale_order:' || v_key));
  SELECT * INTO v_existing FROM public.lot_sale_orders WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.project_id <> p_project_id OR v_existing.salesperson_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
    END IF;
    IF v_existing.submission_digest IS DISTINCT FROM v_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_SCOPE_MISMATCH'; END IF;
    RETURN v_existing.id;
  END IF;

  -- A mesma ordem de bloqueio do checkout normal evita duplicidade entre canais.
  PERFORM 1 FROM public.commercial_lots WHERE id = ANY(v_lot_ids) ORDER BY id FOR UPDATE;
  FOR v_lot IN
    SELECT requested.id, l.public_identifier, l.cession_id, e.is_sellable,
      CASE p_stage WHEN 'RENOVACAO' THEN p.renovacao_total ELSE p.segunda_total END AS total
    FROM unnest(v_lot_ids) AS requested(id)
    LEFT JOIN public.commercial_lots l ON l.id = requested.id AND l.project_id = p_project_id AND l.archived_at IS NULL
    LEFT JOIN public.commercial_sale_eligibility e ON e.lot_id = l.id
    LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
    ORDER BY requested.id
  LOOP
    IF v_lot.public_identifier IS NULL THEN RAISE EXCEPTION 'LOT_UNAVAILABLE_OR_MISSING:%', v_lot.id; END IF;
    IF v_lot.cession_id IS NOT NULL THEN RAISE EXCEPTION 'LOT_CEDED:%',v_lot.public_identifier; END IF;
    IF v_lot.is_sellable IS NOT TRUE THEN RAISE EXCEPTION 'LOT_NOT_SELLABLE:%', v_lot.public_identifier; END IF;
    IF p_expected_prices -> v_lot.id::text IS DISTINCT FROM to_jsonb(v_lot.total)
      OR v_lot.total IS NULL OR v_lot.total <= 0 THEN
      RAISE EXCEPTION 'LOT_PRICE_CHANGED:%', v_lot.public_identifier;
    END IF;
  END LOOP;

  v_order := public.register_commercial_sale_order(v_key, p_stage, p_lot_ids, p_buyer_name,
    p_document_number, p_phone, p_email, p_payment_type, p_installment_count, p_payment_method,
    p_first_due_date, p_installments, p_expected_total, p_notes, p_exhibitor_id,
    p_fee_admin, p_fee_ppci, p_fee_cleaning_license, p_buyer_trade_name);
  SELECT public_identifier INTO v_changed_price FROM public.lot_sale_order_items
  WHERE order_id = v_order AND p_expected_prices -> lot_id::text IS DISTINCT FROM to_jsonb(item_total)
  ORDER BY lot_id LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'LOT_PRICE_CHANGED:%', v_changed_price; END IF;
  UPDATE public.lot_sale_orders SET submitted_lot_ids = v_lot_ids, submission_digest = v_digest WHERE id = v_order;
  RETURN v_order;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.public_map_inventory(_slug text, _token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_link public.public_map_links;
  v_result jsonb;
  v_entity_ids uuid[];
  v_companies jsonb;
  v_no_company constant jsonb := '{"buyerIdentityEligible":false,"buyerGroupKey":null,"buyerTradeName":null}'::jsonb;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  v_entity_ids := ARRAY(SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));
  v_companies := app_private.public_map_sold_company_projection(v_link, v_entity_ids);

  WITH ent AS (
    SELECT e.*, g.geometry, g.elevation, g.extrusion_height, g.rotation, g.version, g.calibration_version, g.id AS geometry_id
      FROM public.map_entities e
      LEFT JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current = true
     WHERE e.id = ANY(v_entity_ids)
  ), lot AS (
    SELECT l.*, p.renovacao_price_per_sqm, p.renovacao_total, p.renovacao_rule_label,
           p.segunda_price_per_sqm, p.segunda_total, p.segunda_rule_label, p.resolution_status,
           CASE WHEN l.status = 'SOLD'
             THEN public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name)
           END AS buyer_name
      FROM public.commercial_lots l
      LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
      LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED' AND l.commercial_package_role IS NULL
     WHERE l.entity_id = ANY(v_entity_ids)
       AND l.archived_at IS NULL
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'slug', v_link.slug,
      'name', v_link.display_name,
      'kind', v_link.scope_kind,
      'lotCount', (SELECT count(*) FROM lot WHERE commercial_package_role IS DISTINCT FROM 'COMPONENT'),
      'officialAreaSqm', (SELECT coalesce(sum(official_area_sqm), 0) FROM lot),
      'pavilionIdentifier', CASE WHEN v_link.scope_kind = 'PAVILION' THEN v_link.scope_key ELSE NULL END,
      'segmentSlug', CASE WHEN v_link.scope_kind LIKE 'SEGMENT%' THEN v_link.scope_key ELSE NULL END
    ),
    'project', (
      SELECT jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'coordinateSystem', pr.coordinate_system,
        'referenceWidth', pr.reference_width, 'referenceHeight', pr.reference_height,
        'activeVersion', pr.active_version, 'referenceRevision', pr.reference_revision
      ) FROM public.map_projects pr WHERE pr.id = v_link.project_id
    ),
    'layers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', la.id, 'projectId', la.project_id, 'key', la.layer_key, 'name', la.name,
        'description', la.description, 'color', la.color, 'opacity', la.opacity,
        'isVisible', la.is_visible, 'isLocked', la.is_locked, 'sortOrder', la.sort_order
      ) ORDER BY la.sort_order)
      FROM public.map_layers la
      WHERE la.id IN (SELECT DISTINCT layer_id FROM ent)
    ), '[]'::jsonb),
    'entities', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'projectId', e.project_id, 'layerId', e.layer_id,
        'parentEntityId', e.parent_entity_id, 'segmentId', e.segment_id,
        'publicIdentifier', e.public_identifier, 'name', e.name, 'description', e.description,
        'classification', e.classification, 'verificationStatus', e.verification_status,
        'isSellable', e.is_sellable, 'isArchived', e.is_archived,
        'metadata', coalesce(e.metadata, '{}'::jsonb),
        'geometry', jsonb_build_object(
          'id', e.geometry_id,
          'type', 'Polygon',
          'coordinates', coalesce(e.geometry->'coordinates', '[]'::jsonb),
          'elevation', coalesce(e.elevation, 0),
          'extrusionHeight', coalesce(e.extrusion_height, 0),
          'rotation', coalesce(e.rotation, 0),
          'geometryVersion', coalesce(e.version, 1),
          'calibrationVersion', e.calibration_version
        )
      )) FROM ent e
    ), '[]'::jsonb),
    'lots', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'entityId', l.entity_id, 'publicIdentifier', l.public_identifier,
        'block', l.block, 'lotNumber', l.lot_number, 'levelLabel', l.level_label,
        'displayName', l.display_name,
        'availability', public.public_map_lot_availability(l.status::text),
        -- Compatibility field for older clients in the external scopes.
        'buyerName', CASE WHEN v_companies IS NULL THEN l.buyer_name
                          ELSE v_companies -> l.id::text ->> 'buyerTradeName' END,
        'officialAreaSqm', l.official_area_sqm,
        'isCorner', l.is_corner, 'isCovered', l.is_covered,
        'infrastructure', coalesce(to_jsonb(l.infrastructure), '[]'::jsonb),
        'hasElectricity', l.has_electricity, 'hasWater', l.has_water, 'hasInternet', l.has_internet,
        'pricing', jsonb_build_object(
          'resolutionStatus', coalesce(l.resolution_status, 'SEM_REGRA'),
          'renovacaoPricePerSqm', l.renovacao_price_per_sqm,
          'renovacaoTotal', l.renovacao_total,
          'renovacaoRuleLabel', l.renovacao_rule_label,
          'segundaPricePerSqm', l.segunda_price_per_sqm,
          'segundaTotal', l.segunda_total,
          'segundaRuleLabel', l.segunda_rule_label
        )
      ) || CASE WHEN v_companies IS NULL THEN '{}'::jsonb
                ELSE coalesce(v_companies -> l.id::text, v_no_company) END
        || app_private.public_map_package_projection(
          l.id, l.commercial_package_role, l.commercial_package_principal_lot_id, v_entity_ids
        ) || app_private.public_cession_projection(l.cession_id) ORDER BY l.id) FROM lot l
    ), '[]'::jsonb),
    'revision', (app_private.public_map_inventory_revision(v_link, v_entity_ids, v_companies)->>'revision')
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.public_map_lot(_slug text, _token text, _lot_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_link public.public_map_links;
  v_result jsonb;
  v_entity_ids uuid[];
  v_companies jsonb;
  v_no_company constant jsonb := '{"buyerIdentityEligible":false,"buyerGroupKey":null,"buyerTradeName":null}'::jsonb;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  v_entity_ids := ARRAY(SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));
  v_companies := app_private.public_map_sold_company_projection(v_link, v_entity_ids);

  SELECT jsonb_build_object(
    'id', l.id, 'entityId', l.entity_id, 'publicIdentifier', l.public_identifier,
    'block', l.block, 'lotNumber', l.lot_number, 'levelLabel', l.level_label,
    'displayName', l.display_name,
    'availability', public.public_map_lot_availability(l.status::text),
    'buyerName', CASE WHEN v_companies IS NOT NULL THEN v_companies -> l.id::text ->> 'buyerTradeName'
                      WHEN l.status = 'SOLD' THEN public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name) END,
    'officialAreaSqm', l.official_area_sqm,
    'isCorner', l.is_corner, 'isCovered', l.is_covered,
    'infrastructure', coalesce(to_jsonb(l.infrastructure), '[]'::jsonb),
    'hasElectricity', l.has_electricity, 'hasWater', l.has_water, 'hasInternet', l.has_internet,
    'pavilion', p.pavilion,
    'pricing', jsonb_build_object(
      'resolutionStatus', coalesce(p.resolution_status, 'SEM_REGRA'),
      'renovacaoPricePerSqm', p.renovacao_price_per_sqm,
      'renovacaoTotal', p.renovacao_total,
      'renovacaoRuleLabel', p.renovacao_rule_label,
      'segundaPricePerSqm', p.segunda_price_per_sqm,
      'segundaTotal', p.segunda_total,
      'segundaRuleLabel', p.segunda_rule_label
    )
  ) || CASE WHEN v_companies IS NULL THEN '{}'::jsonb
            ELSE coalesce(v_companies -> l.id::text, v_no_company) END
    || app_private.public_map_package_projection(
      l.id, l.commercial_package_role, l.commercial_package_principal_lot_id, v_entity_ids
    ) || app_private.public_cession_projection(l.cession_id) INTO v_result
    FROM public.commercial_lots l
    LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
    LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED' AND l.commercial_package_role IS NULL
   WHERE l.id = _lot_id
     AND l.archived_at IS NULL
     AND l.entity_id = ANY(v_entity_ids);

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LOT_OUT_OF_SCOPE' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$
;

DO $seed$
DECLARE
  project constant uuid := '0538d132-34dd-4347-a33c-526edac7339c';
  emater constant uuid := 'e02f21cc-345d-4882-8dd2-a916b937ab64';
  palco constant uuid := '56d3bc54-40d7-4452-859d-02e31ae44028';
  sponsor uuid[]; stage_lots uuid[];
BEGIN
  WITH expected(lot_id,entity_id,block,num,code,segment) AS (VALUES
      ('73fac7d7-224e-457c-8031-4905a28c3850'::uuid,'b42cf206-7e2d-4688-bacf-19f82efc9df6'::uuid,'R','69','Q-R-69','exporural'),
      ('467b0174-db02-4d29-9425-e53955cb20ad'::uuid,'77922177-4ca2-4029-a696-4bef1eaace9a'::uuid,'R','70','Q-R-70','exporural'),
      ('6a848982-f9bf-4d9c-8098-32c123911e04'::uuid,'c321cc12-dc0a-4cdb-a6da-1cc3285c5692'::uuid,'R','71','Q-R-71','exporural'),
      ('39542dee-d9c3-4d07-b17e-e3b29e7b081b'::uuid,'55c7a6ce-8b90-40e0-bbe4-e875ca8f427e'::uuid,'R','72','Q-R-72','exporural'),
      ('a6ec0be5-593e-406f-a2ef-0fda8c3448f2'::uuid,'f90a686a-ed3b-4ca2-b3ca-cc1656488d2c'::uuid,'S','25','Q-S-25','exporural'),
      ('a39b8f10-a566-484b-a563-7dc66a2b2429'::uuid,'e8a68dde-1d1e-4b6e-a472-a18006f5c721'::uuid,'S','26','Q-S-26','exporural'),
      ('57c1ebe7-e652-4b21-897e-c0ed07448cb1'::uuid,'9f66fb52-fe56-4a2c-92e3-d0d0b88897e4'::uuid,'V','01','Q-V-01',NULL),
      ('3b1a50d7-b667-406d-8fb4-1303f7153452'::uuid,'3daeacfb-ea49-4410-b467-0da4296a784f'::uuid,'V','02','Q-V-02',NULL),
      ('784fc3c0-ee5f-4376-8cf4-0aed5fe9f2e6'::uuid,'5dbcb67a-1b2c-4df6-8bb9-65cc2e414b6a'::uuid,'V','03','Q-V-03',NULL),
      ('20868234-dc63-44c4-b14e-40aa2aa4fdf6'::uuid,'9de051d7-8fb8-4aaf-955a-6eef60796282'::uuid,'V','04','Q-V-04',NULL),
      ('dbe9bfb0-f8e3-4808-bd6d-4c807b57aba9'::uuid,'79979e00-1215-47b1-971c-acb2f1873906'::uuid,'V','05','Q-V-05',NULL)
  )
  SELECT array_agg(l.id ORDER BY l.id) FILTER(WHERE l.block IN ('S','V')),
         array_agg(l.id ORDER BY l.id) FILTER(WHERE l.block='R')
  INTO sponsor,stage_lots
  FROM expected x JOIN commercial_lots l ON l.id=x.lot_id AND l.entity_id=x.entity_id AND l.project_id=project
    AND l.block=x.block AND l.public_identifier=x.code AND l.lot_number=x.num AND l.archived_at IS NULL
  JOIN map_entities e ON e.id=x.entity_id AND e.project_id=project AND e.public_identifier=x.code AND NOT e.is_archived
  JOIN map_entities parent ON parent.id=e.parent_entity_id AND parent.public_identifier='QUADRA-'||x.block
  LEFT JOIN map_segments s ON s.id=e.segment_id
  WHERE s.slug IS NOT DISTINCT FROM x.segment AND (x.code<>'Q-R-72' OR l.official_area_sqm=471)
    AND EXISTS(SELECT FROM map_entity_geometries g WHERE g.entity_id=e.id AND g.is_current);
  IF cardinality(sponsor) IS DISTINCT FROM 7 OR cardinality(stage_lots) IS DISTINCT FROM 4
    THEN RAISE EXCEPTION 'Inventário 2028 divergente da conferência por UUID.'; END IF;
  PERFORM app_private.create_space_cession(emater,project,'Emater Ascar',NULL,'Espaço cedido por patrocínio',sponsor,NULL);
  PERFORM app_private.create_space_cession(palco,project,'Fenasoja','7f7b6bea-725e-4efe-bd3e-5cdd0d7b0a48','Espaço Palco Semear',stage_lots,'FENASOJA');
END $seed$;

NOTIFY pgrst,'reload schema';
COMMIT;
