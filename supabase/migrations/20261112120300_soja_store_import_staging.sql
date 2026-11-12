BEGIN;

CREATE TABLE soja_store_private.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 240),
  file_id text NOT NULL CHECK (length(file_id) BETWEEN 1 AND 240),
  source_version text NOT NULL CHECK (length(source_version) BETWEEN 1 AND 160),
  as_of date,
  sheet text NOT NULL DEFAULT '' CHECK (length(sheet) <= 120),
  classification text NOT NULL CHECK (classification IN ('official', 'proposal', 'minutes', 'estimate', 'historical', 'inspiration', 'unverified')),
  delimiter text NOT NULL CHECK (delimiter IN (';', ',')),
  source_text text NOT NULL CHECK (octet_length(source_text) BETWEEN 1 AND 262144),
  content_hash bytea NOT NULL CHECK (octet_length(content_hash) = 32),
  mapping jsonb NOT NULL CHECK (jsonb_typeof(mapping) = 'object'),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count BETWEEN 0 AND 250),
  flagged_count integer NOT NULL DEFAULT 0 CHECK (flagged_count BETWEEN 0 AND row_count),
  pending_count integer NOT NULL DEFAULT 0 CHECK (pending_count BETWEEN 0 AND row_count),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  review_status text NOT NULL DEFAULT 'staged' CHECK (review_status IN ('staged', 'in_review', 'reviewed')),
  review_reason text CHECK (length(review_reason) BETWEEN 4 AND 600),
  reviewed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, id),
  CONSTRAINT soja_store_import_hash_unique UNIQUE (org_id, commission_id, content_hash),
  CONSTRAINT soja_store_import_version_unique UNIQUE (org_id, commission_id, file_id, source_version, sheet),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id)
);

CREATE INDEX soja_store_import_batches_date ON soja_store_private.import_batches (org_id, commission_id, created_at DESC, id);

CREATE TABLE soja_store_private.import_lines (
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  source_row integer NOT NULL CHECK (source_row >= 2),
  original jsonb NOT NULL CHECK (jsonb_typeof(original) = 'object'),
  normalized jsonb NOT NULL CHECK (jsonb_typeof(normalized) = 'object'),
  warnings text[] NOT NULL,
  PRIMARY KEY (org_id, commission_id, batch_id, source_row),
  FOREIGN KEY (org_id, commission_id, batch_id) REFERENCES soja_store_private.import_batches(org_id, commission_id, id)
);

CREATE TABLE soja_store_private.import_line_reviews (
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  source_row integer NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('pending', 'checked')),
  reviewed_values jsonb NOT NULL CHECK (jsonb_typeof(reviewed_values) = 'object'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 4 AND 600),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, commission_id, batch_id, source_row, version),
  FOREIGN KEY (org_id, commission_id, batch_id, source_row)
    REFERENCES soja_store_private.import_lines(org_id, commission_id, batch_id, source_row)
);

ALTER TABLE soja_store_private.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.import_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.import_line_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.import_batches, soja_store_private.import_lines, soja_store_private.import_line_reviews
FROM PUBLIC, anon, authenticated, service_role;

-- Parse once on the server. Preserve physical row positions, escaped quotes and quoted line breaks.
CREATE FUNCTION soja_store_private.parse_import_csv(_source text, _delimiter text)
RETURNS TABLE(source_row integer, cells text[]) LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_char text;
  v_cell text := '';
  v_state integer := 0;
  v_physical_line integer := 1;
  v_previous_cr boolean := false;
  v_line_started boolean := false;
BEGIN
  source_row := 1;
  cells := ARRAY[]::text[];
  FOR v_char IN SELECT regexp_split_to_table(ltrim(_source, chr(65279)), '') LOOP
    IF v_previous_cr AND v_char = chr(10) AND v_state <> 1 THEN
      v_previous_cr := false;
      CONTINUE;
    END IF;
    IF v_char = chr(13) OR (v_char = chr(10) AND NOT v_previous_cr) THEN
      v_physical_line := v_physical_line + 1;
    END IF;
    v_previous_cr := v_char = chr(13);

    IF v_state = 1 THEN
      IF v_char = '"' THEN v_state := 2; ELSE v_cell := v_cell || v_char; END IF;
    ELSIF v_state = 2 AND v_char = '"' THEN
      v_cell := v_cell || '"';
      v_state := 1;
    ELSIF v_char = _delimiter OR v_char IN (chr(13), chr(10)) THEN
      cells := array_append(cells, v_cell);
      v_cell := '';
      v_state := 0;
      IF cardinality(cells) > 30 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_COLUMN_LIMIT';
      END IF;
      IF v_char <> _delimiter THEN
        IF v_line_started THEN RETURN NEXT; END IF;
        source_row := v_physical_line;
        cells := ARRAY[]::text[];
        v_line_started := false;
      ELSE
        v_line_started := true;
      END IF;
    ELSIF v_state = 2 OR (v_char = '"' AND v_cell <> '') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_CSV', DETAIL = source_row::text;
    ELSIF v_char = '"' THEN
      v_state := 1;
      v_line_started := true;
    ELSE
      v_cell := v_cell || v_char;
      v_line_started := true;
    END IF;
    IF length(v_cell) > 2000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_CELL_LIMIT', DETAIL = source_row::text;
    END IF;
  END LOOP;
  IF v_state = 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_CSV', DETAIL = source_row::text;
  END IF;
  IF v_line_started THEN
    cells := array_append(cells, v_cell);
    IF cardinality(cells) > 30 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_COLUMN_LIMIT';
    END IF;
    RETURN NEXT;
  END IF;
END;
$$;

CREATE FUNCTION soja_store_private.import_batch_json(_batch soja_store_private.import_batches)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (to_jsonb(_batch) - ARRAY['org_id', 'commission_id', 'source_text', 'content_hash', 'created_by']) ||
    jsonb_build_object('sha256', encode(_batch.content_hash, 'hex'), 'status', _batch.review_status);
$$;

CREATE FUNCTION public.soja_store_stage_import(_org_id uuid, _commission_id uuid, _request_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'stage_import';
  v_capability constant text := 'imports.manage';
  v_hash bytea;
  v_result jsonb;
  v_batch soja_store_private.import_batches;
  v_line record;
  v_header text[];
  v_mapping jsonb;
  v_key text;
  v_value text;
  v_original jsonb;
  v_normalized jsonb;
  v_warnings text[];
  v_position integer;
  v_row_count integer := 0;
  v_flagged_count integer := 0;
  v_source text;
  v_constraint text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR octet_length(_payload::text) > 600000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_IMPORT';
  END IF;
  v_hash := soja_store_private.request_hash(v_command, NULL, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  v_source := _payload->>'source_text';
  v_mapping := _payload->'mapping';
  IF jsonb_typeof(v_mapping) IS DISTINCT FROM 'object' OR v_mapping = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_MAPPING_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_mapping) m WHERE m.key NOT IN ('name', 'sku', 'quantity', 'unit_cost')
      OR jsonb_typeof(m.value) <> 'string' OR length(btrim(m.value #>> '{}')) NOT BETWEEN 1 AND 100
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_IMPORT_MAPPING';
  END IF;
  IF _payload->>'as_of' IS NOT NULL AND _payload->>'as_of' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_IMPORT_DATE';
  END IF;

  INSERT INTO soja_store_private.import_batches (
    org_id, commission_id, file_name, file_id, source_version, as_of, sheet,
    classification, delimiter, source_text, content_hash, mapping, created_by
  ) VALUES (
    _org_id, _commission_id, btrim(_payload->>'file_name'), btrim(_payload->>'file_id'), btrim(_payload->>'source_version'),
    (_payload->>'as_of')::date, coalesce(btrim(_payload->>'sheet'), ''), _payload->>'classification',
    _payload->>'delimiter', v_source, sha256(convert_to(v_source, 'UTF8')), v_mapping, auth.uid()
  ) RETURNING * INTO v_batch;

  FOR v_line IN SELECT * FROM soja_store_private.parse_import_csv(v_source, v_batch.delimiter) LOOP
    IF v_header IS NULL THEN
      SELECT array_agg(btrim(c.value) ORDER BY c.ord) INTO v_header
      FROM unnest(v_line.cells) WITH ORDINALITY c(value, ord);
      IF EXISTS (SELECT 1 FROM unnest(v_header) h WHERE length(h) NOT BETWEEN 1 AND 100)
        OR (SELECT count(DISTINCT lower(h)) FROM unnest(v_header) h) <> cardinality(v_header) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_HEADERS';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each_text(v_mapping) m
        WHERE NOT EXISTS (SELECT 1 FROM unnest(v_header) h WHERE lower(h) = lower(btrim(m.value)))) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_HEADER_NOT_FOUND';
      END IF;
      CONTINUE;
    END IF;

    v_row_count := v_row_count + 1;
    IF v_row_count > 250 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_ROW_LIMIT';
    END IF;
    IF cardinality(v_line.cells) <> cardinality(v_header) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_ROW_WIDTH', DETAIL = v_line.source_row::text;
    END IF;

    SELECT jsonb_object_agg(v_header[i], v_line.cells[i]) INTO v_original
    FROM generate_subscripts(v_header, 1) s(i);
    v_normalized := '{}'::jsonb;
    v_warnings := ARRAY[]::text[];
    FOR v_key, v_value IN SELECT key, btrim(value) FROM jsonb_each_text(v_mapping) ORDER BY key LOOP
      SELECT h.ord INTO STRICT v_position
      FROM unnest(v_header) WITH ORDINALITY h(value, ord) WHERE lower(h.value) = lower(v_value);
      v_value := nullif(btrim(v_line.cells[v_position]), '');
      IF v_value IS NULL THEN
        v_warnings := array_append(v_warnings, v_key || ':missing');
      ELSIF v_value ~ '^([=+@]|-[[:space:]]*[A-Za-z])' THEN
        v_warnings := array_append(v_warnings, v_key || ':formula');
        v_value := NULL;
      ELSIF v_key IN ('quantity', 'unit_cost') THEN
        IF v_key = 'unit_cost' THEN v_value := btrim(regexp_replace(v_value, '^R[$][[:space:]]*', '', 'i')); END IF;
        IF v_value ~ '^[0-9]{1,12}(,[0-9]{1,6})?$' THEN
          v_value := replace(v_value, ',', '.');
        ELSE
          v_warnings := array_append(v_warnings, v_key || ':ambiguous_number');
          v_value := NULL;
        END IF;
      ELSIF (v_key = 'sku' AND length(v_value) > 64) OR (v_key = 'name' AND length(v_value) > 160) THEN
        v_warnings := array_append(v_warnings, v_key || ':length');
        v_value := NULL;
      ELSIF v_key = 'sku' THEN
        v_value := upper(v_value);
      END IF;
      v_normalized := v_normalized || jsonb_build_object(v_key, v_value);
    END LOOP;
    IF cardinality(v_warnings) > 0 THEN v_flagged_count := v_flagged_count + 1; END IF;
    INSERT INTO soja_store_private.import_lines (org_id, commission_id, batch_id, source_row, original, normalized, warnings)
    VALUES (_org_id, _commission_id, v_batch.id, v_line.source_row, v_original, v_normalized, v_warnings);
  END LOOP;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_EMPTY';
  END IF;

  UPDATE soja_store_private.import_batches SET row_count = v_row_count, flagged_count = v_flagged_count, pending_count = v_flagged_count
  WHERE id = v_batch.id RETURNING * INTO v_batch;
  v_result := jsonb_build_object('id', v_batch.id, 'version', 1, 'status', 'staged',
    'row_count', v_row_count, 'flagged_count', v_flagged_count);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_batch.id, NULL, soja_store_private.import_batch_json(v_batch), v_result);
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'soja_store_import_hash_unique' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_IMPORT_DUPLICATE_CONTENT';
    ELSIF v_constraint = 'soja_store_import_version_unique' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_IMPORT_DUPLICATE_VERSION';
    END IF;
    RAISE;
  WHEN check_violation OR not_null_violation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_IMPORT';
END;
$$;

CREATE FUNCTION public.soja_store_import_batches(_org_id uuid, _commission_id uuid, _limit integer DEFAULT 30, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'imports.view');
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  RETURN (
    SELECT jsonb_build_object('total', (
      SELECT count(*) FROM soja_store_private.import_batches WHERE org_id = _org_id AND commission_id = _commission_id
    ), 'items', coalesce((
      SELECT jsonb_agg(soja_store_private.import_batch_json(p.batch) ORDER BY (p.batch).created_at DESC, (p.batch).id)
      FROM (
        SELECT b AS batch FROM soja_store_private.import_batches b WHERE b.org_id = _org_id AND b.commission_id = _commission_id
        ORDER BY b.created_at DESC, b.id LIMIT _limit OFFSET _offset
      ) p
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_import_preview(
  _org_id uuid, _commission_id uuid, _batch_id uuid, _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_batch soja_store_private.import_batches;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'imports.view');
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  SELECT * INTO v_batch FROM soja_store_private.import_batches
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = _batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_IMPORT_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('batch', soja_store_private.import_batch_json(v_batch), 'total', v_batch.row_count, 'items', coalesce((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.source_row)
    FROM (
      SELECT l.source_row, l.original, l.normalized, l.warnings,
        CASE WHEN r.version IS NULL THEN NULL ELSE jsonb_build_object(
          'version', r.version, 'status', r.status, 'values', r.reviewed_values, 'reason', r.reason, 'recorded_at', r.recorded_at
        ) END AS review
      FROM soja_store_private.import_lines l
      LEFT JOIN LATERAL (
        SELECT * FROM soja_store_private.import_line_reviews r
        WHERE (r.org_id, r.commission_id, r.batch_id, r.source_row) = (l.org_id, l.commission_id, l.batch_id, l.source_row)
        ORDER BY r.version DESC LIMIT 1
      ) r ON true
      WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.batch_id = _batch_id
      ORDER BY l.source_row LIMIT _limit OFFSET _offset
    ) p
  ), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.soja_store_review_import_line(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'review_import_line';
  v_capability constant text := 'imports.manage';
  v_hash bytea;
  v_result jsonb;
  v_batch soja_store_private.import_batches;
  v_line soja_store_private.import_lines;
  v_previous soja_store_private.import_line_reviews;
  v_review soja_store_private.import_line_reviews;
  v_status text := _payload->>'status';
  v_reason text := btrim(_payload->>'reason');
  v_values jsonb := _payload->'values';
  v_effective jsonb;
  v_key text;
  v_value text;
  v_pending_delta integer := 0;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR octet_length(_payload::text) > 8192
    OR v_status IS NULL OR v_status NOT IN ('pending', 'checked')
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 4 AND 600
    OR jsonb_typeof(v_values) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_REVIEW';
  END IF;
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  SELECT * INTO v_batch FROM soja_store_private.import_batches
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'batch_id')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_IMPORT_NOT_FOUND'; END IF;
  IF v_batch.review_status = 'reviewed' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_IMPORT_REOPEN_REQUIRED';
  END IF;
  SELECT * INTO v_line FROM soja_store_private.import_lines
  WHERE org_id = _org_id AND commission_id = _commission_id AND batch_id = v_batch.id
    AND source_row = (_payload->>'source_row')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_IMPORT_LINE_NOT_FOUND'; END IF;
  SELECT * INTO v_previous FROM soja_store_private.import_line_reviews
  WHERE org_id = _org_id AND commission_id = _commission_id AND batch_id = v_batch.id AND source_row = v_line.source_row
  ORDER BY version DESC LIMIT 1;
  IF _expected_version IS DISTINCT FROM coalesce(v_previous.version, 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_values) f
    WHERE NOT (v_line.normalized ? f.key) OR jsonb_typeof(f.value) NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_REVIEW';
  END IF;

  v_effective := coalesce(v_previous.reviewed_values, v_line.normalized);
  FOR v_key, v_value IN SELECT key, nullif(btrim(value), '') FROM jsonb_each_text(v_values) LOOP
    IF v_value ~ '^[=+@]' OR (v_key = 'sku' AND length(v_value) > 64) OR (v_key = 'name' AND length(v_value) > 160) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_REVIEW_VALUE', DETAIL = v_key;
    END IF;
    IF v_value IS NOT NULL AND v_key IN ('quantity', 'unit_cost') THEN
      IF v_value !~ '^[0-9]{1,12}([,.][0-9]{1,6})?$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_REVIEW_VALUE', DETAIL = v_key;
      END IF;
      v_value := replace(v_value, ',', '.');
    END IF;
    IF v_key = 'sku' THEN v_value := upper(v_value); END IF;
    v_effective := v_effective || jsonb_build_object(v_key, v_value);
  END LOOP;

  INSERT INTO soja_store_private.import_line_reviews
    (org_id, commission_id, batch_id, source_row, version, status, reviewed_values, reason, recorded_by)
  VALUES (_org_id, _commission_id, v_batch.id, v_line.source_row, coalesce(v_previous.version, 0) + 1,
    v_status, v_effective, v_reason, auth.uid())
  RETURNING * INTO v_review;

  v_pending_delta := (v_status = 'pending')::integer - (
    coalesce(v_previous.status, CASE WHEN cardinality(v_line.warnings) > 0 THEN 'pending' ELSE 'checked' END) = 'pending'
  )::integer;
  UPDATE soja_store_private.import_batches SET pending_count = pending_count + v_pending_delta,
    version = version + 1, review_status = 'in_review'
  WHERE id = v_batch.id RETURNING * INTO v_batch;

  v_result := jsonb_build_object('id', v_batch.id, 'version', v_review.version, 'status', v_review.status,
    'source_row', v_line.source_row, 'batch_version', v_batch.version);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_batch.id, CASE WHEN v_previous.version IS NULL THEN NULL ELSE to_jsonb(v_previous) END, to_jsonb(v_review), v_result);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_REVIEW';
END;
$$;

CREATE FUNCTION public.soja_store_review_import_batch(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'review_import_batch';
  v_capability constant text := 'imports.manage';
  v_hash bytea;
  v_result jsonb;
  v_previous jsonb;
  v_batch soja_store_private.import_batches;
  v_action text := _payload->>'action';
  v_reason text := btrim(_payload->>'reason');
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR octet_length(_payload::text) > 4096
    OR v_action IS NULL OR v_action NOT IN ('finish', 'reopen')
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 4 AND 600 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_REVIEW';
  END IF;
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  SELECT * INTO v_batch FROM soja_store_private.import_batches
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'batch_id')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_IMPORT_NOT_FOUND'; END IF;
  IF _expected_version IS DISTINCT FROM v_batch.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  IF (v_action = 'finish' AND (v_batch.pending_count > 0 OR v_batch.review_status = 'reviewed'))
    OR (v_action = 'reopen' AND v_batch.review_status <> 'reviewed') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_IMPORT_REVIEW_STATE';
  END IF;
  v_previous := soja_store_private.import_batch_json(v_batch);

  UPDATE soja_store_private.import_batches
  SET version = version + 1, review_status = CASE WHEN v_action = 'finish' THEN 'reviewed' ELSE 'in_review' END,
    review_reason = v_reason, reviewed_at = CASE WHEN v_action = 'finish' THEN now() ELSE NULL END
  WHERE id = v_batch.id RETURNING * INTO v_batch;
  v_result := jsonb_build_object('id', v_batch.id, 'version', v_batch.version, 'status', v_batch.review_status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_batch.id, v_previous, soja_store_private.import_batch_json(v_batch), v_result);
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_IMPORT_INVALID_REVIEW';
END;
$$;

REVOKE ALL ON FUNCTION
  soja_store_private.parse_import_csv(text, text),
  soja_store_private.import_batch_json(soja_store_private.import_batches),
  public.soja_store_stage_import(uuid, uuid, uuid, jsonb),
  public.soja_store_import_batches(uuid, uuid, integer, integer),
  public.soja_store_import_preview(uuid, uuid, uuid, integer, integer),
  public.soja_store_review_import_line(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_review_import_batch(uuid, uuid, uuid, integer, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.soja_store_stage_import(uuid, uuid, uuid, jsonb),
  public.soja_store_import_batches(uuid, uuid, integer, integer),
  public.soja_store_import_preview(uuid, uuid, uuid, integer, integer),
  public.soja_store_review_import_line(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_review_import_batch(uuid, uuid, uuid, integer, jsonb)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
