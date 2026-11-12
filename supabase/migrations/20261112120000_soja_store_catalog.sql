BEGIN;

CREATE SCHEMA soja_store_private;
REVOKE ALL ON SCHEMA soja_store_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE soja_store_private.scopes (
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, commission_id),
  UNIQUE (org_id),
  FOREIGN KEY (commission_id, org_id) REFERENCES public.commissions(id, org_id)
);

CREATE TABLE soja_store_private.access_grants (
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  person_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability ~ '^[a-z]+[.][a-z_]+$'),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (org_id, commission_id, person_id, user_id, capability),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id),
  FOREIGN KEY (person_id, org_id) REFERENCES public.commission_people(id, org_id),
  FOREIGN KEY (commission_id, person_id) REFERENCES public.commission_responsibles(commission_id, person_id),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE TABLE soja_store_private.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  category text CHECK (length(category) BETWEEN 1 AND 100),
  description text CHECK (length(description) BETWEEN 1 AND 1600),
  unit text NOT NULL CHECK (length(unit) BETWEEN 1 AND 24),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  collection_year integer CHECK (collection_year BETWEEN 1900 AND 2200),
  source_reference text CHECK (length(source_reference) BETWEEN 1 AND 600),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id)
);

CREATE INDEX soja_store_products_name ON soja_store_private.products (org_id, commission_id, lower(name), id);

CREATE TABLE soja_store_private.variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  product_id uuid NOT NULL,
  sku text NOT NULL CHECK (sku = upper(btrim(sku)) AND length(sku) BETWEEN 1 AND 64),
  barcode text CHECK (length(barcode) BETWEEN 1 AND 64),
  label text CHECK (length(label) BETWEEN 1 AND 120),
  attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object'),
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false CHECK (NOT is_default OR (label IS NULL AND attributes = '{}')),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, sku),
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, product_id) REFERENCES soja_store_private.products(org_id, commission_id, id)
);

CREATE UNIQUE INDEX soja_store_variants_barcode ON soja_store_private.variants (org_id, barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX soja_store_variants_default ON soja_store_private.variants (product_id) WHERE is_default AND active;
CREATE INDEX soja_store_variants_product ON soja_store_private.variants (org_id, commission_id, product_id);

CREATE TABLE soja_store_private.requests (
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  command text NOT NULL,
  capability text NOT NULL,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  result jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, commission_id, actor_id, request_id),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id)
);

CREATE TABLE soja_store_private.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  previous_state jsonb,
  next_state jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, actor_id, request_id),
  FOREIGN KEY (org_id, commission_id, actor_id, request_id)
    REFERENCES soja_store_private.requests(org_id, commission_id, actor_id, request_id)
);

ALTER TABLE soja_store_private.scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA soja_store_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA soja_store_private FROM PUBLIC, anon, authenticated, service_role;

-- Rollout and per-person capabilities are configured separately. No existing role inherits a grant.
CREATE FUNCTION soja_store_private.scope_enabled(_org_id uuid, _commission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM soja_store_private.scopes s
    JOIN public.commissions c ON c.id = s.commission_id AND c.org_id = s.org_id
    JOIN public.org_members m ON m.org_id = s.org_id AND m.user_id = (SELECT auth.uid())
    WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.enabled
      AND c.is_active AND c.unit_type = 'comissao' AND c.slug IN ('soja-store', 'sojastore')
      AND m.is_active
  );
$$;

CREATE FUNCTION soja_store_private.capabilities(_org_id uuid, _commission_id uuid)
RETURNS text[] LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT c.capability ORDER BY c.capability), ARRAY[]::text[])
  FROM (
    SELECT g.capability
    FROM soja_store_private.access_grants g
    JOIN public.commission_people p ON p.id = g.person_id AND p.org_id = g.org_id
    JOIN public.commission_responsibles r ON r.commission_id = g.commission_id
      AND r.org_id = g.org_id AND r.person_id = g.person_id
    WHERE g.org_id = _org_id AND g.commission_id = _commission_id AND g.revoked_at IS NULL
      AND g.user_id = (SELECT auth.uid()) AND p.user_id = g.user_id AND r.active AND r.responsible_type = 'pessoa'
  ) direct
  CROSS JOIN LATERAL unnest(
    CASE WHEN right(direct.capability, 7) = '.manage'
      THEN ARRAY[direct.capability, split_part(direct.capability, '.', 1) || '.view']
      ELSE ARRAY[direct.capability]
    END
  ) c(capability)
  WHERE soja_store_private.scope_enabled(_org_id, _commission_id);
$$;

CREATE FUNCTION soja_store_private.require_capability(_org_id uuid, _commission_id uuid, _capability text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(_capability = ANY(soja_store_private.capabilities(_org_id, _commission_id)), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FORBIDDEN';
  END IF;
END;
$$;

CREATE FUNCTION soja_store_private.request_hash(_command text, _expected_version integer, _payload jsonb)
RETURNS bytea LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT sha256(convert_to(jsonb_build_array(_command, _expected_version, _payload)::text, 'UTF8'));
$$;

CREATE FUNCTION soja_store_private.begin_request(_org_id uuid, _commission_id uuid, _request_id uuid, _payload_hash bytea)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_previous soja_store_private.requests;
BEGIN
  IF _request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_REQUEST_REQUIRED';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'soja-store', _org_id, _commission_id, auth.uid(), _request_id), 0
  ));
  SELECT * INTO v_previous FROM soja_store_private.requests
  WHERE org_id = _org_id AND commission_id = _commission_id AND actor_id = auth.uid() AND request_id = _request_id;
  IF FOUND THEN
    IF v_previous.payload_hash IS DISTINCT FROM _payload_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_REQUEST_CONFLICT';
    END IF;
    RETURN v_previous.result;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION soja_store_private.finish_request(
  _org_id uuid, _commission_id uuid, _request_id uuid, _command text, _capability text, _payload_hash bytea,
  _entity_id uuid, _previous_state jsonb, _next_state jsonb, _result jsonb
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO soja_store_private.requests
    (org_id, commission_id, actor_id, request_id, command, capability, payload_hash, result)
  VALUES (_org_id, _commission_id, auth.uid(), _request_id, _command, _capability, _payload_hash, _result);
  INSERT INTO soja_store_private.audit
    (org_id, commission_id, actor_id, request_id, entity_id, previous_state, next_state)
  VALUES (_org_id, _commission_id, auth.uid(), _request_id, _entity_id, _previous_state, _next_state);
  RETURN _result;
END;
$$;

CREATE FUNCTION public.soja_store_access(_org_id uuid, _commission_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'enabled', soja_store_private.scope_enabled(_org_id, _commission_id),
    'capabilities', soja_store_private.capabilities(_org_id, _commission_id)
  );
$$;

CREATE FUNCTION public.soja_store_request_status(_org_id uuid, _commission_id uuid, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_request soja_store_private.requests;
BEGIN
  IF NOT soja_store_private.scope_enabled(_org_id, _commission_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FORBIDDEN';
  END IF;
  SELECT * INTO v_request FROM soja_store_private.requests
  WHERE org_id = _org_id AND commission_id = _commission_id AND actor_id = auth.uid() AND request_id = _request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_request.capability);
  RETURN v_request.result;
END;
$$;

CREATE FUNCTION soja_store_private.product_json(_product soja_store_private.products)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_jsonb(_product) - ARRAY['org_id', 'commission_id', 'created_by', 'updated_by'] ||
    jsonb_build_object('variants', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'sku', v.sku, 'barcode', v.barcode, 'label', v.label, 'attributes', v.attributes,
        'active', v.active, 'is_default', v.is_default
      ) ORDER BY v.active DESC, v.is_default DESC, v.sku, v.id)
      FROM soja_store_private.variants v
      WHERE v.org_id = _product.org_id AND v.commission_id = _product.commission_id AND v.product_id = _product.id
    ), '[]'::jsonb));
$$;

CREATE FUNCTION public.soja_store_catalog(
  _org_id uuid, _commission_id uuid, _search text DEFAULT NULL, _status text DEFAULT NULL,
  _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'catalog.view');
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _offset IS NULL OR _offset < 0 OR length(v_search) > 160
      OR (_status IS NOT NULL AND _status NOT IN ('draft', 'active', 'archived')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT p.id, lower(p.name) AS sort_name
      FROM soja_store_private.products p
      WHERE p.org_id = _org_id AND p.commission_id = _commission_id
        AND (_status IS NULL OR p.status = _status)
        AND (v_search IS NULL OR strpos(lower(p.name), v_search) > 0
          OR strpos(lower(p.category), v_search) > 0
          OR EXISTS (
            SELECT 1 FROM soja_store_private.variants v
            WHERE v.org_id = p.org_id AND v.commission_id = p.commission_id AND v.product_id = p.id
              AND (strpos(lower(v.sku), v_search) > 0 OR strpos(lower(v.barcode), v_search) > 0
                OR strpos(lower(v.label), v_search) > 0 OR EXISTS (
                  SELECT 1 FROM jsonb_each_text(v.attributes) a WHERE strpos(lower(a.value), v_search) > 0
                ))
          ))
    ), page AS (
      SELECT * FROM matched ORDER BY sort_name, id LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matched), 'items', coalesce((
      SELECT jsonb_agg(soja_store_private.product_json(p) ORDER BY page.sort_name, page.id)
      FROM page JOIN soja_store_private.products p ON p.id = page.id
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_product(_org_id uuid, _commission_id uuid, _product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'catalog.view');
  SELECT soja_store_private.product_json(p) INTO v_result
  FROM soja_store_private.products p
  WHERE p.org_id = _org_id AND p.commission_id = _commission_id AND p.id = _product_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_PRODUCT_NOT_FOUND'; END IF;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.soja_store_save_product(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'save_product';
  v_capability constant text := 'catalog.manage';
  v_hash bytea;
  v_actor uuid := auth.uid();
  v_product soja_store_private.products;
  v_product_id uuid;
  v_previous jsonb;
  v_result jsonb;
  v_variants jsonb;
  v_variant jsonb;
  v_variant_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_active boolean;
  v_attributes jsonb;
  v_label text;
  v_sku text;
  v_barcode text;
  v_constraint text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR octet_length(_payload::text) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PRODUCT';
  END IF;
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  v_product_id := nullif(_payload->>'id', '')::uuid;
  v_variants := _payload->'variants';
  IF jsonb_typeof(v_variants) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VARIANTS';
  END IF;
  IF jsonb_array_length(v_variants) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VARIANTS';
  END IF;

  IF v_product_id IS NULL THEN
    IF _expected_version IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VERSION';
    END IF;
    INSERT INTO soja_store_private.products (
      org_id, commission_id, name, category, description, unit, status, collection_year, source_reference, created_by, updated_by
    ) VALUES (
      _org_id, _commission_id, btrim(_payload->>'name'), nullif(btrim(_payload->>'category'), ''),
      nullif(btrim(_payload->>'description'), ''), btrim(_payload->>'unit'), _payload->>'status',
      nullif(_payload->>'collection_year', '')::integer, nullif(btrim(_payload->>'source_reference'), ''), v_actor, v_actor
    ) RETURNING * INTO v_product;
  ELSE
    SELECT * INTO v_product FROM soja_store_private.products
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_PRODUCT_NOT_FOUND'; END IF;
    IF _expected_version IS DISTINCT FROM v_product.version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    v_previous := soja_store_private.product_json(v_product);
    UPDATE soja_store_private.products
    SET name = btrim(_payload->>'name'), category = nullif(btrim(_payload->>'category'), ''),
      description = nullif(btrim(_payload->>'description'), ''), unit = btrim(_payload->>'unit'),
      status = _payload->>'status', collection_year = nullif(_payload->>'collection_year', '')::integer,
      source_reference = nullif(btrim(_payload->>'source_reference'), ''), version = version + 1,
      updated_at = now(), updated_by = v_actor
    WHERE id = v_product.id RETURNING * INTO v_product;

    -- Clear the default before assigning its successor and retain every historical variant.
    UPDATE soja_store_private.variants SET is_default = false
    WHERE product_id = v_product.id AND is_default;
  END IF;

  FOR v_variant IN SELECT value FROM jsonb_array_elements(v_variants) LOOP
    v_attributes := coalesce(v_variant->'attributes', '{}'::jsonb);
    v_label := nullif(btrim(v_variant->>'label'), '');
    v_sku := upper(btrim(v_variant->>'sku'));
    v_barcode := nullif(btrim(v_variant->>'barcode'), '');
    v_variant_id := nullif(v_variant->>'id', '')::uuid;
    v_active := coalesce((v_variant->>'active')::boolean, true);
    IF jsonb_typeof(v_variant) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_attributes) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VARIANT';
    END IF;
    IF (SELECT count(*) FROM jsonb_each(v_attributes)) > 12 OR EXISTS (
      SELECT 1 FROM jsonb_each(v_attributes) a
      WHERE length(btrim(a.key)) NOT BETWEEN 1 AND 40 OR jsonb_typeof(a.value) <> 'string'
        OR length(btrim(a.value #>> '{}')) NOT BETWEEN 1 AND 80
    ) OR v_variant_id = ANY(v_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VARIANT';
    END IF;

    IF v_variant_id IS NULL THEN
      INSERT INTO soja_store_private.variants (
        org_id, commission_id, product_id, sku, barcode, label, attributes, active, created_by, updated_by
      ) VALUES (_org_id, _commission_id, v_product.id, v_sku, v_barcode, v_label, v_attributes, v_active, v_actor, v_actor)
      RETURNING id INTO v_variant_id;
    ELSE
      UPDATE soja_store_private.variants SET sku = v_sku, barcode = v_barcode, label = v_label,
        attributes = v_attributes, active = v_active, updated_by = v_actor, updated_at = now()
      WHERE id = v_variant_id AND org_id = _org_id AND commission_id = _commission_id AND product_id = v_product.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_VARIANT_NOT_IN_PRODUCT';
      END IF;
    END IF;
    v_ids := array_append(v_ids, v_variant_id);
  END LOOP;

  UPDATE soja_store_private.variants SET active = false, updated_by = v_actor, updated_at = now()
  WHERE product_id = v_product.id AND active AND NOT (id = ANY(v_ids));

  IF (SELECT count(*) FROM soja_store_private.variants WHERE product_id = v_product.id) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_VARIANT_LIMIT';
  END IF;
  IF (SELECT count(*) FROM soja_store_private.variants WHERE product_id = v_product.id AND active) = 1 THEN
    UPDATE soja_store_private.variants SET is_default = true
    WHERE product_id = v_product.id AND active AND label IS NULL AND attributes = '{}'::jsonb;
  ELSIF EXISTS (
    SELECT 1 FROM soja_store_private.variants WHERE product_id = v_product.id AND active AND label IS NULL AND attributes = '{}'::jsonb
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_VARIANT_LABEL_REQUIRED';
  END IF;
  IF v_product.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM soja_store_private.variants WHERE product_id = v_product.id AND active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_ACTIVE_VARIANT_REQUIRED';
  END IF;

  v_result := jsonb_build_object('id', v_product.id, 'version', v_product.version, 'status', v_product.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_product.id, v_previous, soja_store_private.product_json(v_product), v_result);
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'variants_org_id_sku_key' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_DUPLICATE_SKU';
    ELSIF v_constraint = 'soja_store_variants_barcode' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_DUPLICATE_BARCODE';
    END IF;
    RAISE;
  WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PRODUCT';
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA soja_store_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.soja_store_access(uuid, uuid),
  public.soja_store_request_status(uuid, uuid, uuid),
  public.soja_store_catalog(uuid, uuid, text, text, integer, integer),
  public.soja_store_product(uuid, uuid, uuid),
  public.soja_store_save_product(uuid, uuid, uuid, integer, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.soja_store_access(uuid, uuid),
  public.soja_store_request_status(uuid, uuid, uuid),
  public.soja_store_catalog(uuid, uuid, text, text, integer, integer),
  public.soja_store_product(uuid, uuid, uuid),
  public.soja_store_save_product(uuid, uuid, uuid, integer, jsonb)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
