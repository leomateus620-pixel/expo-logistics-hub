BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('customers.view'), ('customers.manage') ON CONFLICT DO NOTHING;

CREATE TABLE soja_store_private.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('individual', 'company')),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  email text CHECK (length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text CHECK (length(phone) BETWEEN 1 AND 40),
  city text CHECK (length(city) BETWEEN 1 AND 100),
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  communication_consent boolean NOT NULL,
  consent_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (communication_consent = (consent_at IS NOT NULL)),
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id)
);

CREATE INDEX soja_store_customers_name ON soja_store_private.customers (org_id, commission_id, lower(name), id);

CREATE TABLE soja_store_private.customer_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_name text NOT NULL,
  sku text NOT NULL,
  variant_label text,
  quantity numeric(18,6) CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  notes text CHECK (length(notes) BETWEEN 1 AND 600),
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, commission_id, customer_id) REFERENCES soja_store_private.customers(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, variant_id) REFERENCES soja_store_private.variants(org_id, commission_id, id)
);

CREATE INDEX soja_store_customer_interests_customer ON soja_store_private.customer_interests (org_id, commission_id, customer_id, created_at DESC);
CREATE UNIQUE INDEX soja_store_customer_interest_active ON soja_store_private.customer_interests (customer_id, variant_id) WHERE status = 'open';

ALTER TABLE soja_store_private.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.customer_interests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.customers, soja_store_private.customer_interests FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION soja_store_private.customer_json(_customer soja_store_private.customers)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_jsonb(_customer) - ARRAY['org_id', 'commission_id', 'created_by', 'updated_by', 'consent_at'];
$$;

CREATE FUNCTION soja_store_private.interest_json(_interest soja_store_private.customer_interests)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (to_jsonb(_interest) - ARRAY['org_id', 'commission_id', 'created_by', 'updated_by'])
    || jsonb_build_object('quantity', _interest.quantity::text);
$$;

CREATE FUNCTION public.soja_store_customers(
  _org_id uuid, _commission_id uuid, _search text DEFAULT NULL, _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'customers.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  IF length(v_search) > 160 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER'; END IF;
  RETURN (
    WITH matching AS MATERIALIZED (
      SELECT c AS customer, c.id, lower(c.name) AS sort_name FROM soja_store_private.customers c
      WHERE c.org_id = _org_id AND c.commission_id = _commission_id
        AND (v_search IS NULL OR strpos(lower(c.name), v_search) > 0 OR strpos(c.email, v_search) > 0
          OR strpos(c.phone, v_search) > 0 OR strpos(lower(c.city), v_search) > 0)
    ), page AS (
      SELECT * FROM matching ORDER BY sort_name, id LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM matching),
      'items', coalesce((SELECT jsonb_agg((soja_store_private.customer_json(p.customer)
        - ARRAY['email','phone','communication_consent'])
        ORDER BY p.sort_name, p.id) FROM page p), '[]'::jsonb)
    )
  );
END;
$$;

CREATE FUNCTION public.soja_store_customer(_org_id uuid, _commission_id uuid, _customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_customer soja_store_private.customers;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'customers.view');
  SELECT * INTO v_customer FROM soja_store_private.customers
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = _customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_CUSTOMER_NOT_FOUND'; END IF;
  RETURN soja_store_private.customer_json(v_customer) || jsonb_build_object('interests', coalesce((
    SELECT jsonb_agg(soja_store_private.interest_json(i) ORDER BY i.status DESC, i.created_at DESC, i.id)
    FROM soja_store_private.customer_interests i
    WHERE i.org_id = _org_id AND i.commission_id = _commission_id AND i.customer_id = _customer_id
  ), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.soja_store_save_customer(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'save_customer';
  v_capability constant text := 'customers.manage';
  v_hash bytea;
  v_result jsonb;
  v_previous jsonb;
  v_customer soja_store_private.customers;
  v_id uuid;
  v_consent boolean;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(_payload,
    ARRAY['id','kind','name','email','phone','city','status','communication_consent']);
  IF jsonb_typeof(_payload->'communication_consent') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_CUSTOMER';
  END IF;
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_id := (_payload->>'id')::uuid;
  v_consent := (_payload->>'communication_consent')::boolean;

  IF v_id IS NULL THEN
    IF _expected_version IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VERSION'; END IF;
    INSERT INTO soja_store_private.customers (
      org_id, commission_id, kind, name, email, phone, city, status, communication_consent, consent_at, created_by, updated_by
    ) VALUES (
      _org_id, _commission_id, _payload->>'kind', btrim(_payload->>'name'), nullif(lower(btrim(_payload->>'email')), ''),
      nullif(btrim(_payload->>'phone'), ''), nullif(btrim(_payload->>'city'), ''), _payload->>'status', v_consent,
      CASE WHEN v_consent THEN now() END, auth.uid(), auth.uid()
    ) RETURNING * INTO v_customer;
  ELSE
    SELECT * INTO v_customer FROM soja_store_private.customers
      WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_CUSTOMER_NOT_FOUND'; END IF;
    IF v_customer.version IS DISTINCT FROM _expected_version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    v_previous := to_jsonb(v_customer);
    UPDATE soja_store_private.customers
    SET kind = _payload->>'kind', name = btrim(_payload->>'name'), email = nullif(lower(btrim(_payload->>'email')), ''),
      phone = nullif(btrim(_payload->>'phone'), ''), city = nullif(btrim(_payload->>'city'), ''), status = _payload->>'status',
      communication_consent = v_consent, consent_at = CASE WHEN v_consent THEN coalesce(consent_at, now()) END,
      version = version + 1, updated_by = auth.uid(), updated_at = now()
    WHERE id = v_id RETURNING * INTO v_customer;
  END IF;

  v_result := jsonb_build_object('id', v_customer.id, 'version', v_customer.version, 'status', v_customer.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_customer.id, v_previous, to_jsonb(v_customer), v_result);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_CUSTOMER';
END;
$$;

CREATE FUNCTION public.soja_store_save_interest(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'save_interest';
  v_capability constant text := 'customers.manage';
  v_hash bytea;
  v_result jsonb;
  v_previous jsonb;
  v_customer soja_store_private.customers;
  v_interest soja_store_private.customer_interests;
  v_variant record;
  v_id uuid;
  v_variant_id uuid;
  v_quantity numeric;
  v_status text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(_payload,
    ARRAY['id','customer_id','variant_id','quantity','status','notes']);
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_id := (_payload->>'id')::uuid;
  v_variant_id := (_payload->>'variant_id')::uuid;
  v_status := _payload->>'status';
  IF _payload->>'quantity' IS NOT NULL THEN
    v_quantity := soja_store_private.purchase_decimal(_payload->>'quantity', false);
  END IF;
  SELECT * INTO v_customer FROM soja_store_private.customers
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'customer_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_CUSTOMER_NOT_FOUND'; END IF;
  IF v_customer.status <> 'active' AND (v_id IS NULL OR v_status <> 'closed') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_CUSTOMER_ARCHIVED';
  END IF;

  IF v_id IS NULL THEN
    IF _expected_version IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VERSION'; END IF;
    SELECT v.sku, v.label, p.name INTO v_variant
    FROM soja_store_private.variants v JOIN soja_store_private.products p
      ON p.id = v.product_id AND p.org_id = v.org_id AND p.commission_id = v.commission_id
    WHERE v.org_id = _org_id AND v.commission_id = _commission_id AND v.id = v_variant_id AND v.active AND p.status = 'active'
    FOR SHARE OF p, v;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INTEREST_VARIANT_UNAVAILABLE'; END IF;
    INSERT INTO soja_store_private.customer_interests (
      org_id, commission_id, customer_id, variant_id, product_name, sku, variant_label, quantity, status, notes, created_by, updated_by
    ) VALUES (
      _org_id, _commission_id, v_customer.id, v_variant_id, v_variant.name, v_variant.sku, v_variant.label, v_quantity,
      v_status, nullif(btrim(_payload->>'notes'), ''), auth.uid(), auth.uid()
    ) RETURNING * INTO v_interest;
  ELSE
    SELECT * INTO v_interest FROM soja_store_private.customer_interests
      WHERE org_id = _org_id AND commission_id = _commission_id AND customer_id = v_customer.id AND id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_INTEREST_NOT_FOUND'; END IF;
    IF v_interest.version IS DISTINCT FROM _expected_version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    IF v_interest.variant_id IS DISTINCT FROM v_variant_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INTEREST_VARIANT_IMMUTABLE';
    END IF;
    v_previous := to_jsonb(v_interest);
    UPDATE soja_store_private.customer_interests
    SET quantity = v_quantity, status = v_status, notes = nullif(btrim(_payload->>'notes'), ''),
      version = version + 1, updated_by = auth.uid(), updated_at = now()
    WHERE id = v_id RETURNING * INTO v_interest;
  END IF;

  v_result := jsonb_build_object('id', v_interest.id, 'version', v_interest.version, 'status', v_interest.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_interest.id, v_previous, to_jsonb(v_interest), v_result);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_INTEREST_ALREADY_OPEN';
WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_INTEREST';
END;
$$;

REVOKE EXECUTE ON FUNCTION soja_store_private.customer_json(soja_store_private.customers),
  soja_store_private.interest_json(soja_store_private.customer_interests) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.soja_store_customers(uuid, uuid, text, integer, integer),
  public.soja_store_customer(uuid, uuid, uuid),
  public.soja_store_save_customer(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_save_interest(uuid, uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_customers(uuid, uuid, text, integer, integer),
  public.soja_store_customer(uuid, uuid, uuid),
  public.soja_store_save_customer(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_save_interest(uuid, uuid, uuid, integer, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
