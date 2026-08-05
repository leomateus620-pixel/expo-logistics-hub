CREATE OR REPLACE FUNCTION public.expire_commercial_reservations(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record record;
  v_count integer := 0;
BEGIN
  IF NOT public.can_view_commercial_map(p_org_id) THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  FOR v_record IN
    SELECT r.id AS reservation_id, r.lot_id, l.project_id, l.entity_id, l.status
    FROM public.lot_reservations r
    JOIN public.commercial_lots l ON l.id = r.lot_id
    JOIN public.map_projects p ON p.id = l.project_id
    WHERE p.org_id = p_org_id AND r.status = 'ACTIVE' AND r.expires_at <= now()
    FOR UPDATE OF r, l SKIP LOCKED
  LOOP
    UPDATE public.lot_reservations
    SET status = 'EXPIRED', updated_at = now()
    WHERE id = v_record.reservation_id AND status = 'ACTIVE';
    IF FOUND THEN
      IF v_record.status = 'RESERVED' THEN
        UPDATE public.commercial_lots SET status = 'AVAILABLE', updated_at = now() WHERE id = v_record.lot_id;
        INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
        VALUES (v_record.lot_id, 'RESERVED', 'AVAILABLE', 'Expiração automática da reserva', auth.uid());
      END IF;
      INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
      VALUES (
        p_org_id, v_record.project_id, v_record.entity_id, v_record.lot_id, 'RESERVATION_EXPIRED',
        jsonb_build_object('reservationId', v_record.reservation_id, 'status', 'ACTIVE'),
        jsonb_build_object('reservationId', v_record.reservation_id, 'status', 'EXPIRED'),
        'Prazo de reserva encerrado automaticamente', auth.uid()
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_commercial_lot(
  p_lot_id uuid,
  p_company_name text,
  p_document_number text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_expires_at timestamptz,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_reservation_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.status NOT IN ('AVAILABLE', 'IN_NEGOTIATION') THEN RAISE EXCEPTION 'LOT_NOT_AVAILABLE'; END IF;
  IF coalesce(trim(p_company_name), '') = '' OR coalesce(trim(p_contact_name), '') = '' THEN RAISE EXCEPTION 'RESERVATION_CONTACT_REQUIRED'; END IF;
  IF p_expires_at <= now() THEN RAISE EXCEPTION 'INVALID_RESERVATION_EXPIRY'; END IF;
  INSERT INTO public.lot_reservations (lot_id, company_name, document_number, contact_name, phone, email, expires_at, responsible_user_id, notes)
  VALUES (p_lot_id, trim(p_company_name), nullif(trim(p_document_number), ''), trim(p_contact_name), p_phone, p_email, p_expires_at, auth.uid(), p_notes)
  RETURNING id INTO v_reservation_id;
  UPDATE public.lot_negotiations SET status = 'CANCELLED', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.commercial_lots SET status = 'RESERVED', updated_by = auth.uid(), updated_at = now() WHERE id = p_lot_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (p_lot_id, v_lot.status, 'RESERVED', p_notes, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, 'RESERVATION_CREATED', jsonb_build_object('status', v_lot.status), jsonb_build_object('status', 'RESERVED', 'reservation_id', v_reservation_id), p_notes, auth.uid());
  RETURN v_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_commercial_negotiation(
  p_lot_id uuid,
  p_company_name text,
  p_document_number text,
  p_contact_name text,
  p_proposed_value numeric,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_negotiation_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.status NOT IN ('AVAILABLE', 'RESERVED') THEN RAISE EXCEPTION 'LOT_NOT_NEGOTIABLE'; END IF;
  IF coalesce(trim(p_company_name), '') = '' THEN RAISE EXCEPTION 'NEGOTIATION_COMPANY_REQUIRED'; END IF;
  UPDATE public.lot_reservations SET status = 'CANCELLED', cancelled_at = now(), updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  INSERT INTO public.lot_negotiations (lot_id, company_name, document_number, contact_name, proposed_value, notes, responsible_user_id)
  VALUES (p_lot_id, trim(p_company_name), nullif(trim(p_document_number), ''), nullif(trim(p_contact_name), ''), p_proposed_value, p_notes, auth.uid())
  RETURNING id INTO v_negotiation_id;
  UPDATE public.commercial_lots SET status = 'IN_NEGOTIATION', updated_by = auth.uid(), updated_at = now() WHERE id = p_lot_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (p_lot_id, v_lot.status, 'IN_NEGOTIATION', p_notes, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, 'NEGOTIATION_STARTED', jsonb_build_object('status', v_lot.status), jsonb_build_object('status', 'IN_NEGOTIATION', 'negotiation_id', v_negotiation_id), p_notes, auth.uid());
  RETURN v_negotiation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_commercial_sale(
  p_lot_id uuid,
  p_buyer_name text,
  p_document_number text,
  p_negotiated_value numeric,
  p_sale_date date,
  p_salesperson_name text,
  p_contract_number text,
  p_payment_status text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_sale_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.status NOT IN ('RESERVED', 'IN_NEGOTIATION', 'AVAILABLE') THEN RAISE EXCEPTION 'LOT_CANNOT_BE_SOLD'; END IF;
  IF coalesce(trim(p_buyer_name), '') = '' OR coalesce(trim(p_salesperson_name), '') = '' THEN RAISE EXCEPTION 'SALE_PARTIES_REQUIRED'; END IF;
  IF p_negotiated_value < 0 THEN RAISE EXCEPTION 'INVALID_SALE_VALUE'; END IF;
  INSERT INTO public.lot_sales (lot_id, buyer_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, contract_number, payment_status, internal_notes)
  VALUES (p_lot_id, trim(p_buyer_name), nullif(trim(p_document_number), ''), p_negotiated_value, p_sale_date, auth.uid(), trim(p_salesperson_name), nullif(trim(p_contract_number), ''), p_payment_status, p_notes)
  RETURNING id INTO v_sale_id;
  UPDATE public.lot_reservations SET status = 'CONVERTED', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.lot_negotiations SET status = 'WON', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.commercial_lots SET status = 'SOLD', updated_by = auth.uid(), updated_at = now() WHERE id = p_lot_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (p_lot_id, v_lot.status, 'SOLD', p_notes, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, 'LOT_SOLD', jsonb_build_object('status', v_lot.status), jsonb_build_object('status', 'SOLD', 'sale_id', v_sale_id), p_notes, auth.uid());
  RETURN v_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_lot_contract_version(
  p_lot_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_file_size bigint,
  p_contract_number text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_contract_id uuid; v_version integer; v_version_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_contracts') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_storage_path NOT LIKE v_org_id::text || '/' || p_lot_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'map-contracts' AND name = p_storage_path) THEN RAISE EXCEPTION 'CONTRACT_OBJECT_NOT_FOUND'; END IF;
  SELECT id, active_version INTO v_contract_id, v_version FROM public.lot_contracts WHERE lot_id = p_lot_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.lot_contracts (lot_id, contract_number, active_version, created_by) VALUES (p_lot_id, nullif(trim(p_contract_number), ''), 1, auth.uid()) RETURNING id, active_version INTO v_contract_id, v_version;
  ELSE
    v_version := v_version + 1;
    UPDATE public.lot_contract_versions SET superseded_at = now() WHERE contract_id = v_contract_id AND superseded_at IS NULL;
    UPDATE public.lot_contracts SET active_version = v_version, contract_number = coalesce(nullif(trim(p_contract_number), ''), contract_number), updated_at = now() WHERE id = v_contract_id;
  END IF;
  INSERT INTO public.lot_contract_versions (contract_id, version, storage_path, original_name, mime_type, file_size, uploaded_by)
  VALUES (v_contract_id, v_version, p_storage_path, p_original_name, p_mime_type, p_file_size, auth.uid()) RETURNING id INTO v_version_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, after_state, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, CASE WHEN v_version = 1 THEN 'CONTRACT_UPLOADED' ELSE 'CONTRACT_REPLACED' END, jsonb_build_object('contract_id', v_contract_id, 'version', v_version), auth.uid());
  RETURN v_version_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_map_geometry(uuid, jsonb, numeric, numeric, numeric, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_commercial_map(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_commercial_lot(uuid, uuid, uuid, text, text, text, text, jsonb, numeric, numeric, text, text, text, numeric, text, numeric, numeric, text, numeric, numeric, numeric, numeric, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.split_commercial_lot(uuid, text, text, jsonb, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_commercial_lots(uuid[], text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_polygon_from_geojson(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_geometry_overlaps_sellable(uuid, jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_map_layer_geometry_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_map_layer_lock(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_map_entity_verification(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_commercial_map(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_map_calibration(uuid, text, numeric, boolean, numeric, numeric, numeric, numeric, numeric, jsonb, jsonb, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_commercial_lot(uuid, timestamptz, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_commercial_reservations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_commercial_lot(uuid, text, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_commercial_negotiation(uuid, text, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_commercial_sale(uuid, text, text, numeric, date, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_lot_contract_version(uuid, text, text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_map_geometry(uuid, jsonb, numeric, numeric, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_commercial_map(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_commercial_lot(uuid, uuid, uuid, text, text, text, text, jsonb, numeric, numeric, text, text, text, numeric, text, numeric, numeric, text, numeric, numeric, numeric, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_commercial_lot(uuid, text, text, jsonb, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_commercial_lots(uuid[], text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_map_layer_lock(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_map_entity_verification(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_commercial_map(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_map_calibration(uuid, text, numeric, boolean, numeric, numeric, numeric, numeric, numeric, jsonb, jsonb, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_commercial_lot(uuid, timestamptz, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_commercial_reservations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_commercial_lot(uuid, text, text, text, text, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_commercial_negotiation(uuid, text, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_commercial_sale(uuid, text, text, numeric, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_lot_contract_version(uuid, text, text, text, bigint, text) TO authenticated;

DROP TRIGGER IF EXISTS map_projects_updated ON public.map_projects;
CREATE TRIGGER map_projects_updated BEFORE UPDATE ON public.map_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS map_layers_updated ON public.map_layers;
CREATE TRIGGER map_layers_updated BEFORE UPDATE ON public.map_layers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS map_entities_updated ON public.map_entities;
CREATE TRIGGER map_entities_updated BEFORE UPDATE ON public.map_entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS commercial_lots_updated ON public.commercial_lots;
CREATE TRIGGER commercial_lots_updated BEFORE UPDATE ON public.commercial_lots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS lot_reservations_updated ON public.lot_reservations;
CREATE TRIGGER lot_reservations_updated BEFORE UPDATE ON public.lot_reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS lot_negotiations_updated ON public.lot_negotiations;
CREATE TRIGGER lot_negotiations_updated BEFORE UPDATE ON public.lot_negotiations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS lot_contracts_updated ON public.lot_contracts;
CREATE TRIGGER lot_contracts_updated BEFORE UPDATE ON public.lot_contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS map_contract_storage_select ON storage.objects;
CREATE POLICY map_contract_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'map-contracts' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.manage_contracts'));
DROP POLICY IF EXISTS map_contract_storage_insert ON storage.objects;
CREATE POLICY map_contract_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'map-contracts' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.manage_contracts'));
DROP POLICY IF EXISTS map_contract_storage_delete ON storage.objects;
CREATE POLICY map_contract_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'map-contracts' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.manage_contracts'));
DROP POLICY IF EXISTS map_reference_storage_select ON storage.objects;
CREATE POLICY map_reference_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'map-references' AND public.can_view_commercial_map(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS map_reference_storage_insert ON storage.objects;
CREATE POLICY map_reference_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'map-references' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.edit_geometry'));
DROP POLICY IF EXISTS map_reference_storage_delete ON storage.objects;
CREATE POLICY map_reference_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'map-references' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.admin'));

COMMENT ON TABLE public.map_entities IS 'Explicitly classified physical and commercial entities; only SELLABLE_LOT and INTERNAL_STAND may be sellable.';
COMMENT ON COLUMN public.map_entity_geometries.geometry IS 'GeoJSON-compatible Polygon in the project local coordinate system; independent from Three.js render objects.';
COMMENT ON TABLE public.map_geometry_versions IS 'Immutable superseded geometry snapshots used for audit and restoration.';
COMMENT ON TABLE public.lot_contract_versions IS 'Metadata only; files live in the private map-contracts bucket and are served with short-lived signed URLs.';