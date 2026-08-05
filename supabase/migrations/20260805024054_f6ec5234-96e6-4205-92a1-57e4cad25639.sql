UPDATE public.map_entities entity
SET
  segment_id = NULL,
  metadata = COALESCE(entity.metadata, '{}'::jsonb)
    - 'segmentId'
    - 'segmentCode'
    - 'segmentName'
FROM public.map_segments segment
WHERE segment.id = entity.segment_id
  AND segment.slug IN ('exporural', 'industria-comercio-servicos');

UPDATE public.map_entities entity
SET
  segment_id = segment.id,
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE(entity.metadata, '{}'::jsonb), '{segmentId}', to_jsonb(segment.slug), true),
      '{segmentCode}', '"EXPORURAL"'::jsonb,
      true
    ),
    '{segmentName}', to_jsonb(segment.display_name), true
  )
FROM public.map_segments segment
WHERE segment.project_id = entity.project_id
  AND segment.slug = 'exporural'
  AND entity.public_identifier <> ALL (ARRAY['B7', 'B8', 'D3'])
  AND (
    entity.public_identifier IN (
      'EXPORURAL', 'QUADRA-R', 'QUADRA-S',
      'RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL',
      'RUA-15-NOVEMBRO', 'RUA-EMANUEL-BRACHMANN',
      'RUA-PASTOR-ALBERT-LEHENBAUER', 'RUA-UBIRETAMA',
      'B35', 'B36', 'B37', 'B38', 'C4', 'D6-01', 'D6-02', 'D6-03',
      'E-01', 'E-02', 'E-06'
    )
    OR entity.public_identifier ~ '^Q-[RS]-[0-9]{2}$'
    OR upper(COALESCE(entity.metadata->>'block', '')) IN ('R', 'S')
    OR EXISTS (
      SELECT 1
      FROM public.commercial_lots lot
      WHERE lot.entity_id = entity.id
        AND upper(COALESCE(lot.block, '')) IN ('R', 'S')
    )
  );

UPDATE public.map_entities entity
SET
  segment_id = segment.id,
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE(entity.metadata, '{}'::jsonb), '{segmentId}', to_jsonb(segment.slug), true),
      '{segmentCode}', '"INDUSTRIA_COMERCIO_SERVICOS"'::jsonb,
      true
    ),
    '{segmentName}', to_jsonb(segment.display_name), true
  )
FROM public.map_segments segment
WHERE segment.project_id = entity.project_id
  AND segment.slug = 'industria-comercio-servicos'
  AND entity.segment_id IS NULL
  AND entity.public_identifier <> ALL (ARRAY[
    'Q-G-03', 'Q-G-04', 'QUADRA-N', 'B7', 'B28', 'D4',
    'QUADRA-C', 'QUADRA-B', 'QUADRA-A', 'C1',
    'B11', 'B12', 'B13', 'B14', 'B15', 'B18', 'B21',
    'B25', 'B26', 'B27', 'B30', 'B31', 'B32', 'B42-02',
    'G', 'B8', 'B9', 'B10', 'B39'
  ])
  AND (
    entity.public_identifier IN (
      'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
      'B16', 'B17', 'B19', 'B23', 'B24', 'B33', 'B34', 'B40', 'B41',
      'C2', 'C3', 'D1', 'D2', 'D3',
      'E-18', 'E-19', 'E-20', 'E-22', 'E-23', 'E-24',
      'RUA-URUGUAI', 'RUA-MONTEVIDEU', 'CALCADA-ARVOREDO'
    )
    OR entity.public_identifier ~ '^QUADRA-(M|G|L|F|J|E|I|D)$'
    OR entity.public_identifier ~ '^Q-(M|G|L|F|J|E|I|D)-[0-9]{2}$'
    OR upper(COALESCE(entity.metadata->>'block', '')) IN ('M', 'G', 'L', 'F', 'J', 'E', 'I', 'D')
    OR EXISTS (
      SELECT 1
      FROM public.commercial_lots lot
      WHERE lot.entity_id = entity.id
        AND upper(COALESCE(lot.block, '')) IN ('M', 'G', 'L', 'F', 'J', 'E', 'I', 'D')
    )
  );

UPDATE public.map_entities entity
SET metadata = jsonb_set(
  COALESCE(entity.metadata, '{}'::jsonb),
  '{block}',
  to_jsonb(lot.block_code),
  true
)
FROM (
  SELECT
    commercial_lot.entity_id,
    max(upper(commercial_lot.block)) AS block_code
  FROM public.commercial_lots commercial_lot
  WHERE commercial_lot.block IS NOT NULL
  GROUP BY commercial_lot.entity_id
  HAVING count(DISTINCT upper(commercial_lot.block)) = 1
) lot
WHERE lot.entity_id = entity.id
  AND entity.segment_id IS NOT NULL
  AND COALESCE(entity.metadata->>'block', '') = '';

CREATE OR REPLACE FUNCTION public.resolve_commission_map_segment_slug(
  _public_identifier text,
  _metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _public_identifier <> ALL (ARRAY['B7', 'B8', 'D3'])
      AND (
        _public_identifier IN (
          'EXPORURAL', 'QUADRA-R', 'QUADRA-S',
          'RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL',
          'RUA-15-NOVEMBRO', 'RUA-EMANUEL-BRACHMANN',
          'RUA-PASTOR-ALBERT-LEHENBAUER', 'RUA-UBIRETAMA',
          'B35', 'B36', 'B37', 'B38', 'C4', 'D6-01', 'D6-02', 'D6-03',
          'E-01', 'E-02', 'E-06'
        )
        OR _public_identifier ~ '^Q-[RS]-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('R', 'S')
        OR COALESCE(_metadata->>'areaCode', '') = 'EXPORURAL'
      )
    THEN 'exporural'
    WHEN _public_identifier <> ALL (ARRAY[
      'Q-G-03', 'Q-G-04', 'QUADRA-N', 'B7', 'B28', 'D4',
      'QUADRA-C', 'QUADRA-B', 'QUADRA-A', 'C1',
      'B11', 'B12', 'B13', 'B14', 'B15', 'B18', 'B21',
      'B25', 'B26', 'B27', 'B30', 'B31', 'B32', 'B42-02',
      'G', 'B8', 'B9', 'B10', 'B39'
    ])
      AND (
        _public_identifier IN (
          'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
          'B16', 'B17', 'B19', 'B23', 'B24', 'B33', 'B34', 'B40', 'B41',
          'C2', 'C3', 'D1', 'D2', 'D3',
          'E-18', 'E-19', 'E-20', 'E-22', 'E-23', 'E-24',
          'RUA-URUGUAI', 'RUA-MONTEVIDEU', 'CALCADA-ARVOREDO'
        )
        OR _public_identifier ~ '^QUADRA-(M|G|L|F|J|E|I|D)$'
        OR _public_identifier ~ '^Q-(M|G|L|F|J|E|I|D)-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('M', 'G', 'L', 'F', 'J', 'E', 'I', 'D')
      )
    THEN 'industria-comercio-servicos'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.map_entity_inherits_segment(
  _entity_id uuid,
  _segment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    count(*) > 0
      AND bool_and(source_entity.segment_id = _segment_id),
    false
  )
  FROM public.commercial_lots target_lot
  JOIN public.map_lot_lineage lineage ON lineage.target_lot_id = target_lot.id
  JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
  JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
  WHERE target_lot.entity_id = _entity_id;
$$;

REVOKE ALL ON FUNCTION public.map_entity_inherits_segment(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.set_map_entity_canonical_segment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  canonical_slug text;
  canonical_segment public.map_segments%ROWTYPE;
  inherited_segment_id uuid;
  lineage_count integer;
  classified_lineage_count integer;
  distinct_lineage_segments integer;
  lineage_assignment boolean := false;
  project_org_id uuid;
BEGIN
  IF (
    SELECT count(*)
    FROM public.map_segments segment
    WHERE segment.project_id = NEW.project_id
      AND segment.slug IN ('exporural', 'industria-comercio-servicos')
  ) <> 2 THEN
    PERFORM public.ensure_commission_map_segments(NEW.project_id);
  END IF;
  SELECT
    count(*),
    count(source_entity.segment_id),
    count(DISTINCT source_entity.segment_id),
    min(source_entity.segment_id::text)::uuid
  INTO
    lineage_count,
    classified_lineage_count,
    distinct_lineage_segments,
    inherited_segment_id
  FROM public.commercial_lots target_lot
  JOIN public.map_lot_lineage lineage ON lineage.target_lot_id = target_lot.id
  JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
  JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
  WHERE target_lot.entity_id = NEW.id;

  IF lineage_count > 0 AND classified_lineage_count > 0 THEN
    IF classified_lineage_count <> lineage_count
      OR distinct_lineage_segments <> 1
    THEN
      RAISE EXCEPTION 'MAP_SEGMENT_LINEAGE_CONFLICT';
    END IF;

    SELECT segment.* INTO STRICT canonical_segment
    FROM public.map_segments segment
    WHERE segment.id = inherited_segment_id
      AND segment.project_id = NEW.project_id
      AND segment.is_active = true;
    lineage_assignment := true;
  ELSE
    canonical_slug := public.resolve_commission_map_segment_slug(
      NEW.public_identifier,
      COALESCE(NEW.metadata, '{}'::jsonb)
    );

    IF canonical_slug IS NOT NULL THEN
      SELECT segment.* INTO STRICT canonical_segment
      FROM public.map_segments segment
      WHERE segment.project_id = NEW.project_id
        AND segment.slug = canonical_slug
        AND segment.is_active = true;
    ELSIF TG_OP = 'INSERT' AND NEW.segment_id IS NOT NULL THEN
      RAISE EXCEPTION 'MAP_SEGMENT_ASSIGNMENT_INVALID';
    ELSIF TG_OP = 'UPDATE'
      AND NEW.segment_id IS NOT NULL
      AND NEW.segment_id IS DISTINCT FROM OLD.segment_id
    THEN
      RAISE EXCEPTION 'MAP_SEGMENT_ASSIGNMENT_INVALID';
    ELSE
      IF TG_OP = 'UPDATE'
        AND OLD.segment_id IS NOT NULL
        AND NOT lineage_assignment
        AND auth.uid() IS NOT NULL
      THEN
        SELECT project.org_id INTO STRICT project_org_id
        FROM public.map_projects project
        WHERE project.id = NEW.project_id;
        IF NOT public.map_has_explicit_capability(project_org_id, 'map.admin') THEN
          RAISE EXCEPTION 'MAP_SEGMENT_BOUNDARY_ADMIN_REQUIRED';
        END IF;
      END IF;
      NEW.segment_id := NULL;
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
        - 'segmentId'
        - 'segmentCode'
        - 'segmentName';
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.segment_id IS NOT NULL
    AND canonical_segment.id IS DISTINCT FROM OLD.segment_id
    AND NOT lineage_assignment
    AND auth.uid() IS NOT NULL
  THEN
    SELECT project.org_id INTO STRICT project_org_id
    FROM public.map_projects project
    WHERE project.id = NEW.project_id;
    IF NOT public.map_has_explicit_capability(project_org_id, 'map.admin') THEN
      RAISE EXCEPTION 'MAP_SEGMENT_BOUNDARY_ADMIN_REQUIRED';
    END IF;
  END IF;

  NEW.segment_id := canonical_segment.id;
  NEW.metadata := jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(NEW.metadata, '{}'::jsonb),
        '{segmentId}',
        to_jsonb(canonical_segment.slug),
        true
      ),
      '{segmentCode}',
      to_jsonb(CASE canonical_segment.slug
        WHEN 'exporural' THEN 'EXPORURAL'
        ELSE 'INDUSTRIA_COMERCIO_SERVICOS'
      END),
      true
    ),
    '{segmentName}',
    to_jsonb(canonical_segment.display_name),
    true
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_map_entity_canonical_segment() FROM PUBLIC;

DROP TRIGGER IF EXISTS map_entity_canonical_segment ON public.map_entities;
CREATE TRIGGER map_entity_canonical_segment
  BEFORE INSERT OR UPDATE OF project_id, public_identifier, metadata, segment_id
  ON public.map_entities
  FOR EACH ROW EXECUTE FUNCTION public.set_map_entity_canonical_segment();

CREATE OR REPLACE FUNCTION public.protect_commission_segment_entity_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  project_org_id uuid;
  has_valid_successor boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_archived IS NOT DISTINCT FROM OLD.is_archived THEN
    RETURN NEW;
  END IF;

  IF OLD.segment_id IS NULL OR auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT project.org_id INTO STRICT project_org_id
  FROM public.map_projects project
  WHERE project.id = OLD.project_id;

  IF public.map_has_explicit_capability(project_org_id, 'map.admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.is_archived = true
    AND OLD.is_archived = false
  THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.commercial_lots source_lot
      JOIN public.map_lot_lineage lineage ON lineage.source_lot_id = source_lot.id
      JOIN public.commercial_lots target_lot ON target_lot.id = lineage.target_lot_id
      JOIN public.map_entities target_entity ON target_entity.id = target_lot.entity_id
      WHERE source_lot.entity_id = OLD.id
        AND source_lot.project_id = OLD.project_id
        AND target_lot.project_id = OLD.project_id
        AND target_entity.project_id = OLD.project_id
        AND target_entity.segment_id = OLD.segment_id
    ) INTO has_valid_successor;
  END IF;

  IF NOT has_valid_successor THEN
    RAISE EXCEPTION 'MAP_SEGMENT_BOUNDARY_ADMIN_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_commission_segment_entity_lifecycle() FROM PUBLIC;

DROP TRIGGER IF EXISTS map_entity_segment_lifecycle_guard ON public.map_entities;
CREATE TRIGGER map_entity_segment_lifecycle_guard
  BEFORE UPDATE OF is_archived OR DELETE ON public.map_entities
  FOR EACH ROW EXECUTE FUNCTION public.protect_commission_segment_entity_lifecycle();

CREATE OR REPLACE FUNCTION public.sync_map_entity_segment_from_lot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.map_entities entity
  SET metadata = CASE
    WHEN NEW.block IS NULL OR trim(NEW.block) = ''
      THEN COALESCE(entity.metadata, '{}'::jsonb) - 'block'
    ELSE jsonb_set(
      COALESCE(entity.metadata, '{}'::jsonb),
      '{block}',
      to_jsonb(upper(trim(NEW.block))),
      true
    )
  END
  WHERE entity.id = NEW.entity_id
    AND entity.project_id = NEW.project_id
    AND entity.is_archived = false;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_map_entity_segment_from_lot() FROM PUBLIC;

DROP TRIGGER IF EXISTS commercial_lot_segment_sync ON public.commercial_lots;
CREATE TRIGGER commercial_lot_segment_sync
  AFTER INSERT OR UPDATE OF block, entity_id ON public.commercial_lots
  FOR EACH ROW EXECUTE FUNCTION public.sync_map_entity_segment_from_lot();

CREATE OR REPLACE FUNCTION public.inherit_map_segment_from_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  source_segment_id uuid;
  source_project_id uuid;
  target_entity_id uuid;
  target_segment_id uuid;
  target_project_id uuid;
  lineage_count integer;
  classified_count integer;
  distinct_segment_count integer;
BEGIN
  SELECT source_entity.segment_id, source_lot.project_id
  INTO STRICT source_segment_id, source_project_id
  FROM public.commercial_lots source_lot
  JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
  WHERE source_lot.id = NEW.source_lot_id;

  SELECT target_lot.entity_id, target_entity.segment_id, target_lot.project_id
  INTO STRICT target_entity_id, target_segment_id, target_project_id
  FROM public.commercial_lots target_lot
  JOIN public.map_entities target_entity ON target_entity.id = target_lot.entity_id
  WHERE target_lot.id = NEW.target_lot_id;

  IF source_project_id <> target_project_id THEN
    RAISE EXCEPTION 'MAP_SEGMENT_LINEAGE_PROJECT_MISMATCH';
  END IF;

  SELECT
    count(*),
    count(source_entity.segment_id),
    count(DISTINCT source_entity.segment_id)
  INTO lineage_count, classified_count, distinct_segment_count
  FROM public.map_lot_lineage lineage
  JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
  JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
  WHERE lineage.target_lot_id = NEW.target_lot_id;

  IF lineage_count > 1
    AND classified_count > 0
    AND (
      classified_count <> lineage_count
      OR distinct_segment_count <> 1
    )
  THEN
    RAISE EXCEPTION 'MAP_SEGMENT_MERGE_CONFLICT';
  END IF;

  IF source_segment_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF target_segment_id IS NOT NULL AND target_segment_id <> source_segment_id THEN
    RAISE EXCEPTION 'MAP_SEGMENT_MERGE_CONFLICT';
  END IF;

  UPDATE public.map_entities
  SET segment_id = source_segment_id
  WHERE id = target_entity_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.inherit_map_segment_from_lineage() FROM PUBLIC;

DROP TRIGGER IF EXISTS map_lot_lineage_segment_inheritance ON public.map_lot_lineage;
CREATE TRIGGER map_lot_lineage_segment_inheritance
  AFTER INSERT ON public.map_lot_lineage
  FOR EACH ROW EXECUTE FUNCTION public.inherit_map_segment_from_lineage();

DROP POLICY IF EXISTS map_lot_lineage_insert ON public.map_lot_lineage;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.map_lot_lineage
  FROM PUBLIC, anon, authenticated;
