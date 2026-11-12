BEGIN;

CREATE TABLE soja_store_private.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  kind text NOT NULL CHECK (kind IN ('warehouse', 'point', 'temporary')),
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  notes text CHECK (length(notes) BETWEEN 1 AND 600),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id)
);

CREATE UNIQUE INDEX soja_store_locations_name ON soja_store_private.locations (org_id, commission_id, lower(name));

CREATE TABLE soja_store_private.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  kind text NOT NULL CHECK (kind IN ('individual', 'company', 'unspecified')),
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  categories text[] NOT NULL DEFAULT '{}' CHECK (cardinality(categories) <= 20),
  lead_days integer CHECK (lead_days BETWEEN 0 AND 3650),
  terms text CHECK (length(terms) BETWEEN 1 AND 600),
  contact_name text CHECK (length(contact_name) BETWEEN 1 AND 160),
  email text CHECK (length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text CHECK (length(phone) BETWEEN 1 AND 40),
  source_reference text CHECK (length(source_reference) BETWEEN 1 AND 600),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id)
);

CREATE INDEX soja_store_suppliers_name ON soja_store_private.suppliers (org_id, commission_id, lower(name), id);

ALTER TABLE soja_store_private.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.locations, soja_store_private.suppliers FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.soja_store_locations(_org_id uuid, _commission_id uuid, _limit integer DEFAULT 30, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'settings.view');
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  RETURN (
    SELECT jsonb_build_object('total', (
      SELECT count(*) FROM soja_store_private.locations WHERE org_id = _org_id AND commission_id = _commission_id
    ), 'items', coalesce((
      SELECT jsonb_agg(to_jsonb(p) - ARRAY['org_id', 'commission_id', 'created_by', 'updated_by'] ORDER BY lower(p.name), p.id)
      FROM (
        SELECT l.* FROM soja_store_private.locations l
        WHERE l.org_id = _org_id AND l.commission_id = _commission_id
        ORDER BY lower(l.name), l.id LIMIT _limit OFFSET _offset
      ) p
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_suppliers(_org_id uuid, _commission_id uuid, _limit integer DEFAULT 30, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'suppliers.view');
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  RETURN (
    SELECT jsonb_build_object('total', (
      SELECT count(*) FROM soja_store_private.suppliers WHERE org_id = _org_id AND commission_id = _commission_id
    ), 'items', coalesce((
      SELECT jsonb_agg(to_jsonb(p) - ARRAY['org_id', 'commission_id', 'created_by', 'updated_by'] ORDER BY lower(p.name), p.id)
      FROM (
        SELECT s.* FROM soja_store_private.suppliers s
        WHERE s.org_id = _org_id AND s.commission_id = _commission_id
        ORDER BY lower(s.name), s.id LIMIT _limit OFFSET _offset
      ) p
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_save_location(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'save_location';
  v_capability constant text := 'settings.manage';
  v_hash bytea;
  v_actor uuid := auth.uid();
  v_id uuid;
  v_location soja_store_private.locations;
  v_previous jsonb;
  v_result jsonb;
  v_constraint text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR octet_length(_payload::text) > 8192 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_LOCATION';
  END IF;
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  v_id := nullif(_payload->>'id', '')::uuid;
  IF v_id IS NULL THEN
    IF _expected_version IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VERSION';
    END IF;
    INSERT INTO soja_store_private.locations (org_id, commission_id, name, kind, status, notes, created_by, updated_by)
    VALUES (_org_id, _commission_id, btrim(_payload->>'name'), _payload->>'kind', _payload->>'status',
      nullif(btrim(_payload->>'notes'), ''), v_actor, v_actor)
    RETURNING * INTO v_location;
  ELSE
    SELECT * INTO v_location FROM soja_store_private.locations
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_LOCATION_NOT_FOUND'; END IF;
    IF _expected_version IS DISTINCT FROM v_location.version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    v_previous := to_jsonb(v_location);
    UPDATE soja_store_private.locations SET name = btrim(_payload->>'name'), kind = _payload->>'kind',
      status = _payload->>'status', notes = nullif(btrim(_payload->>'notes'), ''), version = version + 1,
      updated_at = now(), updated_by = v_actor
    WHERE id = v_id RETURNING * INTO v_location;
  END IF;

  v_result := jsonb_build_object('id', v_location.id, 'version', v_location.version, 'status', v_location.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_location.id, v_previous, to_jsonb(v_location), v_result);
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'soja_store_locations_name' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_DUPLICATE_LOCATION';
    END IF;
    RAISE;
  WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_LOCATION';
END;
$$;

CREATE FUNCTION public.soja_store_save_supplier(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'save_supplier';
  v_capability constant text := 'suppliers.manage';
  v_hash bytea;
  v_actor uuid := auth.uid();
  v_id uuid;
  v_supplier soja_store_private.suppliers;
  v_previous jsonb;
  v_result jsonb;
  v_categories jsonb;
  v_category_list text[] := ARRAY[]::text[];
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR octet_length(_payload::text) > 16384 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_SUPPLIER';
  END IF;
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  v_categories := coalesce(nullif(_payload->'categories', 'null'::jsonb), '[]'::jsonb);
  IF jsonb_typeof(v_categories) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_SUPPLIER_CATEGORIES';
  END IF;
  IF jsonb_array_length(v_categories) > 20 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_categories) c(value)
    WHERE jsonb_typeof(c.value) <> 'string' OR length(btrim(c.value #>> '{}')) NOT BETWEEN 1 AND 100
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_SUPPLIER_CATEGORIES';
  END IF;
  SELECT ARRAY(
    SELECT DISTINCT ON (lower(btrim(c.value))) btrim(c.value) FROM jsonb_array_elements_text(v_categories) WITH ORDINALITY c(value, ord)
    ORDER BY lower(btrim(c.value)), c.ord
  ) INTO v_category_list;

  v_id := nullif(_payload->>'id', '')::uuid;
  IF v_id IS NULL THEN
    IF _expected_version IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VERSION';
    END IF;
    INSERT INTO soja_store_private.suppliers (org_id, commission_id, name, kind, status, categories, lead_days,
      terms, contact_name, email, phone, source_reference, created_by, updated_by)
    VALUES (_org_id, _commission_id, btrim(_payload->>'name'), _payload->>'kind', _payload->>'status', v_category_list,
      nullif(_payload->>'lead_days', '')::integer, nullif(btrim(_payload->>'terms'), ''), nullif(btrim(_payload->>'contact_name'), ''),
      nullif(lower(btrim(_payload->>'email')), ''), nullif(btrim(_payload->>'phone'), ''),
      nullif(btrim(_payload->>'source_reference'), ''), v_actor, v_actor)
    RETURNING * INTO v_supplier;
  ELSE
    SELECT * INTO v_supplier FROM soja_store_private.suppliers
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_SUPPLIER_NOT_FOUND'; END IF;
    IF _expected_version IS DISTINCT FROM v_supplier.version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    v_previous := to_jsonb(v_supplier);
    UPDATE soja_store_private.suppliers SET name = btrim(_payload->>'name'), kind = _payload->>'kind',
      status = _payload->>'status', categories = v_category_list, lead_days = nullif(_payload->>'lead_days', '')::integer,
      terms = nullif(btrim(_payload->>'terms'), ''), contact_name = nullif(btrim(_payload->>'contact_name'), ''),
      email = nullif(lower(btrim(_payload->>'email')), ''), phone = nullif(btrim(_payload->>'phone'), ''),
      source_reference = nullif(btrim(_payload->>'source_reference'), ''), version = version + 1,
      updated_at = now(), updated_by = v_actor
    WHERE id = v_id RETURNING * INTO v_supplier;
  END IF;

  v_result := jsonb_build_object('id', v_supplier.id, 'version', v_supplier.version, 'status', v_supplier.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_supplier.id, v_previous, to_jsonb(v_supplier), v_result);
EXCEPTION
  WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_SUPPLIER';
END;
$$;

REVOKE ALL ON FUNCTION
  public.soja_store_locations(uuid, uuid, integer, integer),
  public.soja_store_suppliers(uuid, uuid, integer, integer),
  public.soja_store_save_location(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_save_supplier(uuid, uuid, uuid, integer, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.soja_store_locations(uuid, uuid, integer, integer),
  public.soja_store_suppliers(uuid, uuid, integer, integer),
  public.soja_store_save_location(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_save_supplier(uuid, uuid, uuid, integer, jsonb)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
