BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('team.view'), ('team.manage') ON CONFLICT DO NOTHING;

CREATE TABLE soja_store_private.team_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  person_id uuid NOT NULL,
  person_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('shift', 'training')),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  location_id uuid,
  location_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  completed_on date,
  notes text CHECK (length(notes) BETWEEN 1 AND 600),
  status text NOT NULL CHECK (status IN ('active', 'cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id),
  FOREIGN KEY (commission_id, person_id) REFERENCES public.commission_responsibles(commission_id, person_id),
  FOREIGN KEY (person_id, org_id) REFERENCES public.commission_people(id, org_id),
  FOREIGN KEY (org_id, commission_id, location_id) REFERENCES soja_store_private.locations(org_id, commission_id, id),
  CHECK ((kind = 'shift' AND starts_at IS NOT NULL AND ends_at > starts_at AND completed_on IS NULL)
      OR (kind = 'training' AND starts_at IS NULL AND ends_at IS NULL AND location_id IS NULL AND completed_on IS NOT NULL)),
  CHECK ((location_id IS NULL) = (location_name IS NULL))
);
CREATE INDEX soja_store_team_records_scope ON soja_store_private.team_records
  (org_id, commission_id, kind, created_at DESC, id);
CREATE INDEX soja_store_team_records_overlap ON soja_store_private.team_records
  (org_id, commission_id, person_id, starts_at, ends_at) WHERE kind = 'shift' AND status = 'active';

ALTER TABLE soja_store_private.team_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.team_records FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.soja_store_team(
  _org_id uuid, _commission_id uuid, _kind text DEFAULT 'shift', _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'team.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  IF _kind IS NULL OR _kind NOT IN ('shift', 'training') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TEAM_KIND';
  END IF;
  RETURN (
    WITH matching AS MATERIALIZED (
      SELECT r.* FROM soja_store_private.team_records r
      WHERE r.org_id = _org_id AND r.commission_id = _commission_id AND r.kind = _kind
    ), page AS (
      SELECT * FROM matching ORDER BY coalesce(starts_at, completed_on::timestamp AT TIME ZONE 'America/Sao_Paulo') DESC, id
      LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM matching),
      'items', coalesce((SELECT jsonb_agg(to_jsonb(p) - ARRAY['org_id','commission_id','created_by','updated_by']
        ORDER BY coalesce(p.starts_at, p.completed_on::timestamp AT TIME ZONE 'America/Sao_Paulo') DESC, p.id) FROM page p), '[]'::jsonb),
      'people', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) ORDER BY p.display_name, p.id)
        FROM public.commission_people p JOIN public.commission_responsibles m
        ON m.org_id = p.org_id AND m.person_id = p.id AND m.commission_id = _commission_id
        WHERE p.org_id = _org_id AND m.active AND m.responsible_type = 'pessoa'), '[]'::jsonb),
      'locations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) ORDER BY l.name, l.id)
        FROM soja_store_private.locations l WHERE l.org_id = _org_id AND l.commission_id = _commission_id
          AND l.status = 'active' AND l.kind IN ('point','temporary')), '[]'::jsonb)
    )
  );
END;
$$;

CREATE FUNCTION public.soja_store_save_team_record(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash bytea;
  v_result jsonb;
  v_previous jsonb;
  v_record soja_store_private.team_records;
  v_id uuid;
  v_person_id uuid;
  v_person_name text;
  v_location_id uuid;
  v_location_name text;
  v_kind text;
  v_status text;
  v_title text;
  v_notes text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_completed_on date;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'team.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY[
    'id','person_id','kind','title','location_id','starts_local','ends_local','completed_on','notes','status']);
  v_hash := soja_store_private.request_hash('save_team_record', _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  -- Store-scoped lock serializes conflicting shifts and keeps versions deterministic.
  PERFORM 1 FROM soja_store_private.scopes
    WHERE org_id = _org_id AND commission_id = _commission_id FOR UPDATE;

  v_id := (_payload->>'id')::uuid;
  v_person_id := (_payload->>'person_id')::uuid;
  v_location_id := (_payload->>'location_id')::uuid;
  v_kind := _payload->>'kind';
  v_status := _payload->>'status';
  v_title := btrim(_payload->>'title');
  v_notes := nullif(btrim(_payload->>'notes'), '');

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_record FROM soja_store_private.team_records
      WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_TEAM_NOT_FOUND'; END IF;
    IF _expected_version IS DISTINCT FROM v_record.version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    IF v_kind IS DISTINCT FROM v_record.kind THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TEAM_KIND';
    END IF;
    v_previous := to_jsonb(v_record);
  ELSIF _expected_version IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_VERSION';
  END IF;

  SELECT p.display_name INTO v_person_name
  FROM public.commission_people p JOIN public.commission_responsibles m
    ON m.org_id = p.org_id AND m.person_id = p.id AND m.commission_id = _commission_id
  WHERE p.org_id = _org_id AND p.id = v_person_id AND m.active AND m.responsible_type = 'pessoa';
  IF NOT FOUND THEN
    IF v_id IS NOT NULL AND v_person_id = v_record.person_id AND v_status = 'cancelled' THEN
      v_person_name := v_record.person_name;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_TEAM_PERSON_UNAVAILABLE';
    END IF;
  END IF;

  IF v_location_id IS NOT NULL THEN
    SELECT name INTO v_location_name FROM soja_store_private.locations
      WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_location_id
        AND status = 'active' AND kind IN ('point','temporary');
    IF NOT FOUND THEN
      IF v_id IS NOT NULL AND v_location_id = v_record.location_id AND v_status = 'cancelled' THEN
        v_location_name := v_record.location_name;
      ELSE
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_TEAM_LOCATION_UNAVAILABLE';
      END IF;
    END IF;
  END IF;

  IF v_kind = 'shift' THEN
    IF coalesce(_payload->>'starts_local', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'
      OR coalesce(_payload->>'ends_local', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'
      OR _payload->>'completed_on' IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TEAM_TIME';
    END IF;
    v_starts_at := (_payload->>'starts_local')::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_ends_at := (_payload->>'ends_local')::timestamp AT TIME ZONE 'America/Sao_Paulo';
    IF v_ends_at <= v_starts_at THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TEAM_TIME';
    END IF;
    IF v_status = 'active' AND EXISTS (
      SELECT 1 FROM soja_store_private.team_records r
      WHERE r.org_id = _org_id AND r.commission_id = _commission_id AND r.person_id = v_person_id
        AND r.kind = 'shift' AND r.status = 'active' AND r.id IS DISTINCT FROM v_id
        AND r.starts_at < v_ends_at AND v_starts_at < r.ends_at
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_TEAM_SHIFT_OVERLAP';
    END IF;
  ELSIF v_kind = 'training' THEN
    v_completed_on := soja_store_private.purchase_date(_payload->>'completed_on');
    IF v_completed_on IS NULL OR v_completed_on > (now() AT TIME ZONE 'America/Sao_Paulo')::date
      OR _payload->>'starts_local' IS NOT NULL OR _payload->>'ends_local' IS NOT NULL OR v_location_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TEAM_TIME';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO soja_store_private.team_records (
      org_id, commission_id, person_id, person_name, kind, title, location_id, location_name,
      starts_at, ends_at, completed_on, notes, status, created_by, updated_by
    ) VALUES (
      _org_id, _commission_id, v_person_id, v_person_name, v_kind, v_title, v_location_id, v_location_name,
      v_starts_at, v_ends_at, v_completed_on, v_notes, v_status, auth.uid(), auth.uid()
    ) RETURNING * INTO v_record;
  ELSE
    UPDATE soja_store_private.team_records
    SET person_id = v_person_id, person_name = v_person_name, title = v_title, location_id = v_location_id,
      location_name = v_location_name, starts_at = v_starts_at, ends_at = v_ends_at, completed_on = v_completed_on,
      notes = v_notes, status = v_status, version = version + 1, updated_by = auth.uid(), updated_at = now()
    WHERE id = v_id RETURNING * INTO v_record;
  END IF;

  v_result := jsonb_build_object('id', v_record.id, 'version', v_record.version, 'status', v_record.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, 'save_team_record', 'team.manage',
    v_hash, v_record.id, v_previous, to_jsonb(v_record), v_result);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TEAM_RECORD';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soja_store_team(uuid, uuid, text, integer, integer),
  public.soja_store_save_team_record(uuid, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_team(uuid, uuid, text, integer, integer),
  public.soja_store_save_team_record(uuid, uuid, uuid, integer, jsonb) TO authenticated;

COMMIT;
