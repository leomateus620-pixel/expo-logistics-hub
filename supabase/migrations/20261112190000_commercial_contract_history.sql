-- Keep each version in the originating sale and route commercial audit writes
-- through the existing security-definer workflows.

REVOKE INSERT, UPDATE, DELETE ON public.lot_contracts, public.lot_contract_versions, public.lot_contract_lots FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.commercial_contract_audit_action(p_action text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_action IN ('CONTRACT_UPLOADED', 'CONTRACT_REPLACED', 'ORDER_CONTRACT_UPLOADED',
    'ORDER_CONTRACT_REPLACED', 'CONTRACT_METADATA_UPDATED');
$$;

DROP POLICY IF EXISTS map_activity_logs_insert ON public.map_activity_logs;
CREATE POLICY map_activity_logs_insert ON public.map_activity_logs FOR INSERT TO authenticated
WITH CHECK (public.can_view_commercial_map(org_id) AND actor_user_id = auth.uid()
  AND NOT public.commercial_contract_audit_action(action)
  AND action NOT IN ('LOT_SALE_OPEN', 'LOT_SOLD', 'SALE_REGISTERED', 'LOT_SALE_REGISTERED', 'LOT_SALE_CONFIRMED',
    'LOT_SALE_CANCELLED', 'LOT_SALE_ITEM_ADDED', 'LOT_SALE_ITEM_REMOVED', 'LOT_SALE_ORDER_REVISED'));

-- A private document number or filename can occur in these records. Restrictive
-- RLS composes with the existing read policies, including commission access.
DROP POLICY IF EXISTS map_contract_audit_select ON public.map_activity_logs;
CREATE POLICY map_contract_audit_select ON public.map_activity_logs AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT public.commercial_contract_audit_action(action)
  OR org_id IN (SELECT public.map_capable_org_ids('map.manage_contracts')));

CREATE OR REPLACE FUNCTION public.commercial_signed_food_point_sale(p_lot public.commercial_lots)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT s.id
  FROM public.lot_sales s
  WHERE p_lot.commercial_unit = 'FOOD_POINT' AND p_lot.status = 'SOLD' AND p_lot.archived_at IS NULL
    AND s.lot_id = p_lot.id AND s.status = 'CONFIRMED'
    AND EXISTS (SELECT 1 FROM public.map_entities e WHERE e.id = p_lot.entity_id AND e.project_id = p_lot.project_id AND NOT e.is_archived)
    AND (NOT EXISTS (SELECT 1 FROM public.lot_sale_order_items i WHERE i.sale_id = s.id)
      OR EXISTS (
        SELECT 1 FROM public.lot_sale_order_items i
        JOIN public.lot_sale_orders o ON o.id = i.order_id AND o.project_id = p_lot.project_id AND o.status = 'CONFIRMED'
        WHERE i.sale_id = s.id AND i.lot_id = p_lot.id AND i.contract_state = 'SIGNED'
      ));
$$;
REVOKE ALL ON FUNCTION public.commercial_signed_food_point_sale(public.commercial_lots) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lock_commercial_contract_upload(p_storage_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM storage.objects
  WHERE bucket_id = 'map-contracts' AND name = p_storage_path AND owner_id = auth.uid()::text
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_OBJECT_NOT_FOUND'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_commercial_contract_upload(text) FROM PUBLIC, anon, authenticated;

-- The storage read policy uses this set once. Authenticated users can only
-- see paths in organizations where they have explicit contract permission.
CREATE OR REPLACE FUNCTION public.commercial_registered_contract_paths()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT v.storage_path FROM public.lot_contract_versions v
  WHERE split_part(v.storage_path, '/', 1) IN (SELECT id::text FROM public.map_capable_org_ids('map.manage_contracts') AS orgs(id));
$$;
REVOKE ALL ON FUNCTION public.commercial_registered_contract_paths() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_registered_contract_paths() TO authenticated;

DROP POLICY IF EXISTS map_contract_storage_delete ON storage.objects;
CREATE POLICY map_contract_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'map-contracts' AND owner_id = auth.uid()::text
  AND split_part(name, '/', 1) IN (SELECT id::text FROM public.map_capable_org_ids('map.manage_contracts') AS orgs(id))
  AND name NOT IN (SELECT public.commercial_registered_contract_paths()));

-- A delete can start before another transaction registers the same object.
-- Recheck after DELETE has acquired the row lock also used by registration.
CREATE OR REPLACE FUNCTION public.preserve_registered_contract_object()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lot_contract_versions v WHERE v.storage_path = OLD.name) THEN
    RAISE EXCEPTION 'CONTRACT_OBJECT_REGISTERED';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_registered_contract_object() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS preserve_registered_contract_object ON storage.objects;
CREATE TRIGGER preserve_registered_contract_object BEFORE DELETE ON storage.objects
FOR EACH ROW WHEN (OLD.bucket_id = 'map-contracts') EXECUTE FUNCTION public.preserve_registered_contract_object();

CREATE OR REPLACE FUNCTION public.attach_order_contract(p_order_id uuid, p_lot_ids uuid[], p_storage_path text, p_original_name text, p_mime_type text, p_file_size bigint, p_contract_number text DEFAULT NULL::text, p_contract_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_order public.lot_sale_orders%ROWTYPE; v_org uuid; v_contract uuid; v_version int; v_version_id uuid; v_lot uuid; v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_lot_ids IS NULL OR array_length(p_lot_ids,1) IS NULL THEN RAISE EXCEPTION 'NO_ITEMS_SELECTED'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_order.project_id;
  IF public.map_has_explicit_capability(v_org, 'map.manage_contracts') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_lot_ids) AS requested(lot_id) WHERE NOT EXISTS (
      SELECT 1 FROM public.lot_sale_order_items i
      JOIN public.commercial_lots l ON l.id = i.lot_id AND l.project_id = v_order.project_id
      JOIN public.lot_sales s ON s.id = i.sale_id AND s.lot_id = l.id
      WHERE i.order_id = p_order_id AND i.lot_id = requested.lot_id AND l.archived_at IS NULL
        AND ((i.contract_state = 'PENDING_SIGNATURE' AND s.status = 'OPEN' AND l.status = 'SALE_OPEN')
          OR (i.contract_state IN ('SIGNED', 'LEGACY_UNVERIFIED') AND s.status = 'CONFIRMED' AND l.status = 'SOLD'))
    )
  ) THEN RAISE EXCEPTION 'ITEM_NOT_IN_ORDER'; END IF;
  p_lot_ids := ARRAY(SELECT DISTINCT id FROM unnest(p_lot_ids) AS selected(id) ORDER BY id);
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE v_org::text || '/orders/' || p_order_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  PERFORM public.lock_commercial_contract_upload(p_storage_path);
  IF p_mime_type IS NULL OR p_file_size IS NULL OR p_mime_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR p_file_size <= 0 OR p_file_size > 15728640 THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_FILE'; END IF;

  IF p_contract_id IS NOT NULL THEN
    SELECT c.id, c.active_version, jsonb_build_object('contract_id', c.id, 'order_id', p_order_id,
      'version', c.active_version, 'contract_number', c.contract_number,
      'lot_ids', ARRAY(SELECT cl.lot_id FROM public.lot_contract_lots cl WHERE cl.contract_id = c.id AND cl.removed_at IS NULL ORDER BY cl.lot_id))
    INTO v_contract, v_version, v_before
    FROM public.lot_contracts c
    WHERE c.id = p_contract_id AND c.scope = 'ORDER_ITEMS' AND c.order_id = p_order_id AND c.is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
    v_version := v_version + 1;
    UPDATE public.lot_contract_versions SET superseded_at = now() WHERE contract_id = v_contract AND superseded_at IS NULL;
    UPDATE public.lot_contracts SET active_version = v_version, contract_number = coalesce(nullif(trim(p_contract_number),''), contract_number), updated_at = now() WHERE id = v_contract;
    UPDATE public.lot_contract_lots SET removed_at=now()
      WHERE contract_id=v_contract AND lot_id<>ALL(p_lot_ids) AND removed_at IS NULL;
  ELSE
    INSERT INTO public.lot_contracts (lot_id, order_id, scope, contract_number, active_version, created_by)
    VALUES (NULL, p_order_id, 'ORDER_ITEMS', nullif(trim(p_contract_number),''), 1, auth.uid()) RETURNING id, active_version INTO v_contract, v_version;
  END IF;
  FOREACH v_lot IN ARRAY p_lot_ids LOOP
    INSERT INTO public.lot_contract_lots (contract_id, lot_id, created_by) VALUES (v_contract, v_lot, auth.uid()) ON CONFLICT (contract_id, lot_id) DO UPDATE SET removed_at=NULL;
  END LOOP;
  INSERT INTO public.lot_contract_versions (contract_id, version, storage_path, original_name, mime_type, file_size, uploaded_by, covered_lot_ids)
  VALUES (v_contract, v_version, p_storage_path, p_original_name, p_mime_type, p_file_size, auth.uid(), ARRAY(SELECT DISTINCT id FROM unnest(p_lot_ids) id ORDER BY id)) RETURNING id INTO v_version_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, before_state, after_state, actor_user_id)
  SELECT v_org, v_order.project_id, CASE WHEN v_version = 1 THEN 'ORDER_CONTRACT_UPLOADED' ELSE 'ORDER_CONTRACT_REPLACED' END,
    v_before, jsonb_build_object('order_id', p_order_id, 'contract_id', v_contract, 'version', v_version,
      'version_id', v_version_id, 'lot_ids', p_lot_ids, 'contract_number', c.contract_number, 'original_name', p_original_name), auth.uid()
  FROM public.lot_contracts c WHERE c.id = v_contract;
  RETURN jsonb_build_object('contractId', v_contract, 'version', v_version, 'versionId', v_version_id);
END $function$;

CREATE OR REPLACE FUNCTION public.register_lot_contract_version(p_lot_id uuid, p_storage_path text, p_original_name text, p_mime_type text,
  p_file_size bigint, p_contract_number text, p_expected_sale_id uuid, p_contract_id uuid, p_expected_version integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_contract_id uuid; v_version integer; v_version_id uuid; v_sale_id uuid; v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF public.map_has_explicit_capability(v_org_id, 'map.manage_contracts') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE v_org_id::text || '/' || p_lot_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  PERFORM public.lock_commercial_contract_upload(p_storage_path);
  IF p_mime_type IS NULL OR p_mime_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    OR p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 15728640 THEN RAISE EXCEPTION 'INVALID_CONTRACT_FILE'; END IF;
  IF v_lot.commercial_unit = 'FOOD_POINT' THEN
    SELECT s.id INTO v_sale_id FROM public.lot_sales s WHERE s.lot_id = p_lot_id AND s.status IN ('OPEN','CONFIRMED');
    IF v_sale_id IS NULL THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
    IF p_expected_sale_id IS DISTINCT FROM v_sale_id THEN RAISE EXCEPTION 'SALE_CHANGED'; END IF;
    IF public.commercial_signed_food_point_sale(v_lot) IS DISTINCT FROM v_sale_id THEN RAISE EXCEPTION 'SALE_NOT_SIGNED'; END IF;
    UPDATE public.lot_contracts SET is_active = false, updated_at = now()
    WHERE lot_id = p_lot_id AND scope = 'LOT' AND is_active AND sale_id IS DISTINCT FROM v_sale_id;
  END IF;
  SELECT c.id, c.active_version, jsonb_build_object('contract_id', c.id, 'sale_id', c.sale_id,
    'version', c.active_version, 'contract_number', c.contract_number, 'original_name', v.original_name, 'version_id', v.id)
  INTO v_contract_id, v_version, v_before
  FROM public.lot_contracts c
  LEFT JOIN public.lot_contract_versions v ON v.contract_id = c.id AND v.version = c.active_version
  WHERE c.lot_id = p_lot_id AND c.scope = 'LOT' AND c.is_active FOR UPDATE OF c;
  IF (p_contract_id IS NOT NULL OR p_expected_version IS NOT NULL)
    AND (v_contract_id IS NULL OR v_contract_id IS DISTINCT FROM p_contract_id OR v_version IS DISTINCT FROM p_expected_version) THEN
    RAISE EXCEPTION 'CONTRACT_CHANGED';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.lot_contracts (lot_id, contract_number, active_version, created_by, sale_id) VALUES (p_lot_id, nullif(trim(p_contract_number), ''), 1, auth.uid(), v_sale_id) RETURNING id, active_version INTO v_contract_id, v_version;
  ELSE
    v_version := v_version + 1;
    UPDATE public.lot_contract_versions SET superseded_at = now() WHERE contract_id = v_contract_id AND superseded_at IS NULL;
    UPDATE public.lot_contracts SET active_version = v_version, contract_number = coalesce(nullif(trim(p_contract_number), ''), contract_number), updated_at = now() WHERE id = v_contract_id;
  END IF;
  INSERT INTO public.lot_contract_versions (contract_id, version, storage_path, original_name, mime_type, file_size, uploaded_by, covered_lot_ids)
  VALUES (v_contract_id, v_version, p_storage_path, p_original_name, p_mime_type, p_file_size, auth.uid(), ARRAY[p_lot_id]) RETURNING id INTO v_version_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, actor_user_id)
  SELECT v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, CASE WHEN v_version = 1 THEN 'CONTRACT_UPLOADED' ELSE 'CONTRACT_REPLACED' END,
    v_before, jsonb_build_object('contract_id', v_contract_id, 'sale_id', v_sale_id, 'version', v_version,
      'version_id', v_version_id, 'contract_number', c.contract_number, 'original_name', p_original_name), auth.uid()
  FROM public.lot_contracts c WHERE c.id = v_contract_id;
  RETURN v_version_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.register_lot_contract_version(uuid,text,text,text,bigint,text,uuid,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_lot_contract_version(uuid,text,text,text,bigint,text,uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_lot_contract_version(p_lot_id uuid, p_storage_path text, p_original_name text,
  p_mime_type text, p_file_size bigint, p_contract_number text, p_expected_sale_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.register_lot_contract_version(p_lot_id, p_storage_path, p_original_name, p_mime_type,
    p_file_size, p_contract_number, p_expected_sale_id, NULL::uuid, NULL::integer);
$$;

-- Lock the order before locking a point, matching the revision and signature paths.
CREATE OR REPLACE FUNCTION public.lock_food_point_order_contract(
  p_lot_id uuid, p_expected_sale_id uuid, p_contract_id uuid, p_expected_version integer
) RETURNS public.lot_contracts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_lot public.commercial_lots%ROWTYPE;
  v_contract public.lot_contracts%ROWTYPE;
  v_order public.lot_sale_orders%ROWTYPE;
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT c.* INTO v_contract FROM public.lot_contracts c WHERE c.id = p_contract_id AND c.scope = 'ORDER_ITEMS';
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  SELECT o.* INTO v_order FROM public.lot_sale_orders o WHERE o.id = v_contract.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT p.org_id INTO v_org FROM public.map_projects p WHERE p.id = v_order.project_id;
  IF public.map_has_explicit_capability(v_org, 'map.manage_contracts') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  SELECT l.* INTO v_lot FROM public.commercial_lots l WHERE l.id = p_lot_id AND l.project_id = v_order.project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_IN_PROJECT'; END IF;
  SELECT c.* INTO v_contract FROM public.lot_contracts c WHERE c.id = p_contract_id AND c.is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  IF v_contract.active_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'CONTRACT_CHANGED'; END IF;
  IF p_expected_sale_id IS NULL OR public.commercial_signed_food_point_sale(v_lot) IS DISTINCT FROM p_expected_sale_id THEN
    RAISE EXCEPTION 'SALE_CHANGED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lot_sale_order_items i JOIN public.lot_contract_lots cl
      ON cl.lot_id = i.lot_id AND cl.contract_id = v_contract.id AND cl.removed_at IS NULL
    WHERE i.order_id = v_order.id AND i.lot_id = p_lot_id AND i.sale_id = p_expected_sale_id AND i.contract_state = 'SIGNED'
  ) THEN RAISE EXCEPTION 'ITEM_NOT_IN_CONTRACT'; END IF;
  RETURN v_contract;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_food_point_order_contract(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.replace_lot_order_contract(
  p_lot_id uuid, p_expected_sale_id uuid, p_contract_id uuid, p_expected_version integer,
  p_storage_path text, p_original_name text, p_mime_type text, p_file_size bigint,
  p_contract_number text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contract public.lot_contracts%ROWTYPE;
  v_lot_ids uuid[];
BEGIN
  v_contract := public.lock_food_point_order_contract(p_lot_id, p_expected_sale_id, p_contract_id, p_expected_version);
  SELECT array_agg(cl.lot_id ORDER BY cl.lot_id) INTO v_lot_ids FROM public.lot_contract_lots cl
  WHERE cl.contract_id = v_contract.id AND cl.removed_at IS NULL;
  RETURN public.attach_order_contract(v_contract.order_id, v_lot_ids, p_storage_path, p_original_name,
    p_mime_type, p_file_size, p_contract_number, v_contract.id);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_lot_order_contract(uuid, uuid, uuid, integer, text, text, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_lot_order_contract(uuid, uuid, uuid, integer, text, text, text, bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_commercial_contract_metadata(
  p_contract_id uuid, p_contract_number text, p_expected_version integer,
  p_lot_id uuid DEFAULT NULL, p_expected_sale_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contract public.lot_contracts%ROWTYPE;
  v_lot public.commercial_lots%ROWTYPE;
  v_order public.lot_sale_orders%ROWTYPE;
  v_project uuid;
  v_org uuid;
  v_lot_ids uuid[];
  v_number text := nullif(btrim(p_contract_number), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT c.* INTO v_contract FROM public.lot_contracts c WHERE c.id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
  IF v_contract.scope = 'ORDER_ITEMS' THEN
    SELECT o.* INTO v_order FROM public.lot_sale_orders o WHERE o.id = v_contract.order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
    v_project := v_order.project_id;
  ELSE
    SELECT l.* INTO v_lot FROM public.commercial_lots l WHERE l.id = v_contract.lot_id AND l.archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
    v_project := v_lot.project_id;
  END IF;
  SELECT p.org_id INTO v_org FROM public.map_projects p WHERE p.id = v_project;
  IF public.map_has_explicit_capability(v_org, 'map.manage_contracts') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;

  IF v_contract.scope = 'ORDER_ITEMS' AND (p_lot_id IS NOT NULL OR p_expected_sale_id IS NOT NULL) THEN
    v_contract := public.lock_food_point_order_contract(p_lot_id, p_expected_sale_id, p_contract_id, p_expected_version);
  ELSE
    SELECT c.* INTO v_contract FROM public.lot_contracts c WHERE c.id = p_contract_id AND c.is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
    IF v_contract.active_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'CONTRACT_CHANGED'; END IF;
  END IF;
  IF v_contract.scope = 'LOT' THEN
    IF p_lot_id IS NOT NULL AND p_lot_id IS DISTINCT FROM v_lot.id THEN RAISE EXCEPTION 'ITEM_NOT_IN_CONTRACT'; END IF;
    IF v_lot.commercial_unit = 'FOOD_POINT' AND (p_expected_sale_id IS NULL OR p_expected_sale_id IS DISTINCT FROM v_contract.sale_id
      OR p_expected_sale_id IS DISTINCT FROM public.commercial_signed_food_point_sale(v_lot)) THEN
      RAISE EXCEPTION 'SALE_CHANGED';
    END IF;
    v_lot_ids := ARRAY[v_lot.id];
  ELSE
    IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;
    SELECT array_agg(cl.lot_id ORDER BY cl.lot_id) INTO v_lot_ids FROM public.lot_contract_lots cl
    JOIN public.lot_sale_order_items i ON i.order_id = v_order.id AND i.lot_id = cl.lot_id AND i.contract_state <> 'CANCELLED'
    JOIN public.commercial_lots l ON l.id = i.lot_id AND l.project_id = v_project AND l.archived_at IS NULL
    WHERE cl.contract_id = v_contract.id AND cl.removed_at IS NULL;
    IF v_lot_ids IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_IN_CONTRACT'; END IF;
  END IF;
  IF v_number IS DISTINCT FROM v_contract.contract_number THEN
    UPDATE public.lot_contracts SET contract_number = v_number, updated_at = now() WHERE id = v_contract.id;
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, actor_user_id)
    VALUES (v_org, v_project, v_lot.entity_id, v_lot.id, 'CONTRACT_METADATA_UPDATED',
      jsonb_build_object('contract_number', v_contract.contract_number),
      jsonb_build_object('contract_number', v_number, 'contract_id', v_contract.id, 'sale_id', v_contract.sale_id,
        'order_id', v_contract.order_id, 'lot_ids', v_lot_ids, 'version', v_contract.active_version), auth.uid());
  END IF;
  RETURN jsonb_build_object('contractId', v_contract.id, 'contractNumber', v_number, 'activeVersion', v_contract.active_version);
END;
$$;
REVOKE ALL ON FUNCTION public.update_commercial_contract_metadata(uuid, text, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_commercial_contract_metadata(uuid, text, integer, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS map_contract_storage_select ON storage.objects;
CREATE POLICY map_contract_storage_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'map-contracts'
  AND split_part(name, '/', 1) IN (SELECT id::text FROM public.map_capable_org_ids('map.manage_contracts') AS orgs(id))
  AND (owner_id = auth.uid()::text OR name IN (SELECT public.commercial_registered_contract_paths())));

-- Point cards show only the versions that actually covered that point. An old
-- version remains accessible after its link leaves the current order coverage.
CREATE OR REPLACE FUNCTION public.commercial_contract_versions_json(p_contract public.lot_contracts, p_lot_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'version', v.version, 'storagePath', v.storage_path, 'originalName', v.original_name,
    'mimeType', v.mime_type, 'fileSize', v.file_size, 'uploadedAt', v.uploaded_at, 'supersededAt', v.superseded_at,
    'coveredLotIds', v.covered_lot_ids, 'uploadedBy', v.uploaded_by, 'uploadedByName', profile.full_name
  ) ORDER BY v.version DESC), '[]'::jsonb)
  FROM public.lot_contract_versions v
  LEFT JOIN public.profiles profile ON profile.user_id = v.uploaded_by
  WHERE v.contract_id = p_contract.id
    AND (p_lot_id IS NULL OR p_contract.scope = 'LOT' OR p_lot_id = ANY(v.covered_lot_ids)
      OR (v.covered_lot_ids IS NULL AND v.version = p_contract.active_version AND EXISTS (
        SELECT 1 FROM public.lot_contract_lots cl WHERE cl.contract_id = v.contract_id AND cl.lot_id = p_lot_id
      )));
$$;
REVOKE ALL ON FUNCTION public.commercial_contract_versions_json(public.lot_contracts, uuid) FROM PUBLIC, anon, authenticated;

-- Project only known fields from commercial activity. Older records can carry
-- free-form notes or customer data, which the point history does not disclose.
CREATE OR REPLACE FUNCTION public.commercial_history_state(p_state jsonb, p_contract_event boolean)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_state IS NULL THEN NULL ELSE (
    SELECT coalesce(jsonb_object_agg(k, val), '{}'::jsonb) FROM jsonb_each(p_state) AS fields(k, val)
    WHERE k IN ('status', 'sale_order_id', 'sale_id', 'item_id', 'stage', 'item_total', 'lots',
      'lots_before', 'lots_after', 'total_before', 'total_after', 'installments_before', 'installments_after',
      'spaces_subtotal', 'fees_total', 'negotiated_total', 'installment_count')
      OR (p_contract_event AND k IN ('order_id', 'contract_id', 'contract_number', 'version', 'version_id', 'lot_ids', 'original_name'))
  ) END;
$$;
REVOKE ALL ON FUNCTION public.commercial_history_state(jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_lot_contract_history(p_lot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_lot public.commercial_lots%ROWTYPE;
  v_org uuid;
  v_sales boolean;
  v_docs boolean;
  v_sale_id uuid;
  v_signed_sale_id uuid;
  v_order_id uuid;
  v_contracts jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT l.* INTO v_lot FROM public.commercial_lots l WHERE l.id = p_lot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT p.org_id INTO v_org FROM public.map_projects p WHERE p.id = v_lot.project_id;
  v_sales := public.map_has_explicit_capability(v_org, 'map.manage_sales') IS TRUE;
  v_docs := public.map_has_explicit_capability(v_org, 'map.manage_contracts') IS TRUE;
  IF NOT (v_sales OR v_docs OR public.can_view_commercial_map(v_org) IS TRUE) THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;

  IF v_docs OR v_sales THEN
    SELECT s.id, i.order_id INTO v_sale_id, v_order_id FROM public.lot_sales s
    LEFT JOIN public.lot_sale_order_items i ON i.sale_id = s.id AND i.lot_id = s.lot_id AND i.contract_state <> 'CANCELLED'
    LEFT JOIN public.lot_sale_orders o ON o.id = i.order_id AND o.project_id = v_lot.project_id AND o.status = 'CONFIRMED'
    WHERE s.lot_id = p_lot_id AND s.status IN ('OPEN', 'CONFIRMED') AND (i.order_id IS NULL OR o.id IS NOT NULL)
    ORDER BY s.created_at DESC LIMIT 1;
  END IF;

  IF v_docs THEN
    v_signed_sale_id := public.commercial_signed_food_point_sale(v_lot);
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'contractId', c.id, 'scope', c.scope, 'contractNumber', c.contract_number, 'activeVersion', c.active_version,
      'createdAt', c.created_at, 'createdBy', c.created_by, 'createdByName', profile.full_name,
      'saleId', c.sale_id, 'orderId', coalesce(c.order_id, originating_order.id), 'isCurrent', coverage.is_current,
      'coverageCount', CASE WHEN c.scope = 'LOT' THEN 1 ELSE (
        SELECT count(*) FROM public.lot_contract_lots covered
        JOIN public.lot_sale_order_items i ON i.order_id = o.id AND i.lot_id = covered.lot_id AND i.contract_state <> 'CANCELLED'
        JOIN public.commercial_lots l ON l.id = i.lot_id AND l.project_id = v_lot.project_id
        WHERE covered.contract_id = c.id AND covered.removed_at IS NULL
      ) END,
      'lotIds', CASE WHEN coverage.is_current THEN to_jsonb(ARRAY[p_lot_id]) ELSE '[]'::jsonb END,
      'historicalLotIds', to_jsonb(ARRAY[p_lot_id]),
      'versions', public.commercial_contract_versions_json(c, p_lot_id)
    ) ORDER BY coverage.is_current DESC, c.created_at DESC, c.id), '[]'::jsonb)
    INTO v_contracts
    FROM public.lot_contracts c
    LEFT JOIN public.profiles profile ON profile.user_id = c.created_by
    LEFT JOIN public.lot_contract_lots cl ON cl.contract_id = c.id AND cl.lot_id = p_lot_id
    LEFT JOIN public.lot_sale_orders o ON o.id = c.order_id AND o.project_id = v_lot.project_id
    LEFT JOIN public.lot_sale_order_items origin ON origin.sale_id = c.sale_id AND origin.lot_id = c.lot_id
    LEFT JOIN public.lot_sale_orders originating_order ON originating_order.id = origin.order_id AND originating_order.project_id = v_lot.project_id
    CROSS JOIN LATERAL (SELECT c.is_active AND coalesce(CASE WHEN c.scope = 'LOT'
      THEN CASE WHEN v_lot.commercial_unit = 'FOOD_POINT' THEN v_sale_id IS NOT NULL AND c.sale_id = v_sale_id ELSE true END
      ELSE cl.removed_at IS NULL AND o.id = v_order_id AND v_sale_id IS NOT NULL END, false) AS is_current) coverage
    WHERE (c.scope = 'LOT' AND c.lot_id = p_lot_id) OR (c.scope = 'ORDER_ITEMS' AND o.id IS NOT NULL AND cl.lot_id = p_lot_id);
  END IF;

  IF v_sales OR v_docs THEN
    WITH activity AS (
      SELECT a.id, a.action, a.actor_user_id, a.created_at, a.before_state, a.after_state
      FROM public.map_activity_logs a
      WHERE a.project_id = v_lot.project_id AND a.org_id = v_org AND (
        (v_sales AND a.lot_id = p_lot_id AND a.action IN ('LOT_SALE_OPEN', 'LOT_SOLD', 'SALE_REGISTERED',
          'LOT_SALE_REGISTERED', 'LOT_SALE_CONFIRMED', 'LOT_SALE_CANCELLED', 'LOT_SALE_ITEM_ADDED', 'LOT_SALE_ITEM_REMOVED'))
        OR (v_docs AND public.commercial_contract_audit_action(a.action) AND (a.lot_id = p_lot_id
          OR (a.before_state->'lot_ids') ? p_lot_id::text OR (a.after_state->'lot_ids') ? p_lot_id::text))
      )
      UNION ALL
      SELECT r.id, 'LOT_SALE_ORDER_REVISED', r.actor_user_id, r.created_at, r.before_state,
        r.after_state || jsonb_build_object('sale_order_id', o.id, 'lots_before', r.before_state->'lots', 'lots_after', r.after_state->'lots',
          'total_before', r.before_state->'negotiated_total', 'total_after', r.after_state->'negotiated_total',
          'installments_before', r.before_state->'installment_count', 'installments_after', r.after_state->'installment_count')
      FROM public.lot_sale_order_revisions r
      JOIN public.lot_sale_orders o ON o.id = r.order_id AND o.project_id = v_lot.project_id
      WHERE v_sales AND EXISTS (SELECT 1 FROM public.lot_sale_order_items i WHERE i.order_id = o.id AND i.lot_id = p_lot_id)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'lotId', p_lot_id, 'entityId', v_lot.entity_id,
      'action', a.action, 'actorUserId', a.actor_user_id, 'actorName', profile.full_name, 'createdAt', a.created_at,
      'beforeState', public.commercial_history_state(a.before_state, public.commercial_contract_audit_action(a.action)),
      'afterState', public.commercial_history_state(a.after_state, public.commercial_contract_audit_action(a.action)), 'reason', NULL
    ) ORDER BY a.created_at DESC, a.id), '[]'::jsonb)
    INTO v_history FROM activity a LEFT JOIN public.profiles profile ON profile.user_id = a.actor_user_id;
  END IF;

  RETURN jsonb_build_object('saleId', v_sale_id, 'orderId', v_order_id,
    'saleReference', CASE WHEN v_order_id IS NOT NULL THEN 'PV-' || upper(left(v_order_id::text, 8))
      WHEN v_sale_id IS NOT NULL THEN 'LG-' || upper(left(v_sale_id::text, 8)) END,
    'canUpload', v_docs AND v_signed_sale_id IS NOT NULL, 'documentsAccessible', v_docs, 'canViewHistory', v_docs OR v_sales,
    'contracts', v_contracts, 'history', v_history);
END;
$$;
REVOKE ALL ON FUNCTION public.get_lot_contract_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lot_contract_history(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_commercial_sale_order_detail(p_order_id uuid DEFAULT NULL::uuid, p_sale_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; v_docs boolean; v_header jsonb; v_items jsonb; v_inst jsonb := '[]'::jsonb; v_lots uuid[]; v_active_lots uuid[]; v_sales uuid[]; v_active_sales uuid[]; v_contracts jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_order_id IS NOT NULL THEN
    SELECT project_id INTO v_project FROM public.lot_sale_orders WHERE id = p_order_id;
  ELSE
    SELECT l.project_id INTO v_project FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE s.id = p_sale_id;
    v_active_lots := v_lots;
    v_sales := ARRAY[p_sale_id];
    v_active_sales := v_sales;
  END IF;
  IF v_project IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_project;
  IF public.map_has_explicit_capability(v_org, 'map.manage_sales') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  v_docs := public.map_has_explicit_capability(v_org, 'map.manage_contracts') IS TRUE;

  IF p_order_id IS NOT NULL THEN
    SELECT jsonb_build_object('kind','ORDER','orderId',o.id,'projectId',o.project_id,'reference','PV-'||upper(left(o.id::text,8)),
      'createdAt',o.created_at,'status',o.status,'buyerName',o.buyer_name,'buyerTradeName',o.buyer_trade_name,
      'documentNumber',o.document_number,'phone',o.phone,'email',o.email,'stage',o.stage,
      'negotiatedTotal',o.negotiated_total,'spacesSubtotal',o.spaces_subtotal,'feeAdmin',o.fee_admin,'feePpci',o.fee_ppci,
      'feeCleaning',o.fee_cleaning_license,'feesTotal',o.fees_total,'paymentMethod',o.payment_method,
      'installmentCount',o.installment_count,'firstDueDate',o.first_due_date,'officialAreaTotal',o.official_area_total)
    INTO v_header FROM public.lot_sale_orders o WHERE o.id = p_order_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',i.id,'saleId',i.sale_id,'lotId',i.lot_id,'entityId',l.entity_id,'publicIdentifier',i.public_identifier,
      'lotNumber',l.lot_number,'displayName',coalesce(i.display_name_snapshot,l.display_name),'areaSnapshot',i.official_area_snapshot,
      'commercialUnit',i.commercial_unit,'unitQuantity',i.unit_quantity_snapshot,
      'structureIdentifier',i.structure_identifier_snapshot,'structureName',i.structure_name_snapshot,'itemTotal',i.item_total,
      'pricingStage',i.pricing_stage,'contractState',i.contract_state,'signedAt',i.signed_at,'cancelledAt',i.cancelled_at,'lotStatus',l.status)
      ORDER BY i.public_identifier, i.created_at), '[]'::jsonb), array_agg(i.lot_id),
      array_agg(i.lot_id) FILTER(WHERE i.contract_state<>'CANCELLED'), array_agg(i.sale_id),
      array_agg(i.sale_id) FILTER(WHERE i.contract_state<>'CANCELLED')
    INTO v_items, v_lots, v_active_lots, v_sales, v_active_sales FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id = i.lot_id WHERE i.order_id = p_order_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('number',n.installment_number,'dueDate',n.due_date,'amount',n.amount,
      'paymentStatus',n.payment_status,'paidAt',n.paid_at) ORDER BY n.installment_number), '[]'::jsonb)
    INTO v_inst FROM public.lot_sale_installments n WHERE n.order_id = p_order_id;
  ELSE
    SELECT jsonb_build_object('kind','LEGACY','saleId',s.id,'projectId',l.project_id,'reference','LG-'||upper(left(s.id::text,8)),
      'createdAt',s.created_at,'status',s.status,'buyerName',s.buyer_name,'buyerTradeName',s.buyer_trade_name,
      'documentNumber',s.document_number,'negotiatedTotal',s.negotiated_value,'paymentStatus',s.payment_status,
      'saleDate',s.sale_date,'contractNumber',s.contract_number),
      jsonb_build_array(jsonb_build_object('itemId',NULL,'lotId',l.id,'entityId',l.entity_id,'publicIdentifier',l.public_identifier,
      'lotNumber',l.lot_number,'displayName',l.display_name,'areaSnapshot',l.official_area_sqm,'itemTotal',s.negotiated_value,
      'contractState','LEGACY_UNVERIFIED','lotStatus',l.status)), ARRAY[l.id]
    INTO v_header, v_items, v_lots FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE s.id = p_sale_id;
    v_active_lots := v_lots;
    v_sales := ARRAY[p_sale_id];
    v_active_sales := v_sales;
  END IF;

  IF v_docs THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',c.id,'scope',c.scope,'contractNumber',c.contract_number,
      'activeVersion',c.active_version,'createdAt',c.created_at,'createdBy',c.created_by,'createdByName',profile.full_name,
      'saleId',c.sale_id,'orderId',c.order_id,
      'lotIds', CASE WHEN c.scope='LOT' THEN
        CASE WHEN c.is_active AND c.lot_id=ANY(v_active_lots) AND (c.sale_id IS NULL OR c.sale_id=ANY(v_active_sales))
          THEN jsonb_build_array(c.lot_id) ELSE '[]'::jsonb END
        ELSE CASE WHEN c.is_active THEN (SELECT coalesce(jsonb_agg(cl.lot_id),'[]'::jsonb) FROM public.lot_contract_lots cl
          WHERE cl.contract_id=c.id AND cl.removed_at IS NULL AND cl.lot_id=ANY(v_active_lots)) ELSE '[]'::jsonb END END,
      'historicalLotIds', CASE WHEN c.scope='LOT' THEN jsonb_build_array(c.lot_id)
        ELSE (SELECT coalesce(jsonb_agg(cl.lot_id),'[]'::jsonb) FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id) END,
      'versions', public.commercial_contract_versions_json(c)) ORDER BY c.created_at, c.id), '[]'::jsonb)
    INTO v_contracts FROM public.lot_contracts c
    LEFT JOIN public.profiles profile ON profile.user_id = c.created_by
    WHERE (c.scope='LOT' AND c.lot_id=ANY(v_lots)
        AND ((c.sale_id IS NULL AND c.is_active) OR c.sale_id=ANY(v_sales)))
      OR (p_order_id IS NOT NULL AND c.scope='ORDER_ITEMS' AND c.order_id=p_order_id);
  END IF;
  RETURN jsonb_build_object('header',v_header,'items',v_items,'installments',v_inst,'contracts',v_contracts,'documentsAccessible',v_docs);
END $function$;
