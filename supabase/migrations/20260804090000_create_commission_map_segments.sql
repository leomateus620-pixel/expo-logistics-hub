-- Dedicated Commercial Map scopes for the Exporural and Industry commissions.
-- Additive and rollback-safe: existing full-map rows/routes remain valid, while
-- unknown entities keep segment_id NULL and are therefore excluded fail-closed.

CREATE TABLE IF NOT EXISTS public.map_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  display_name text NOT NULL,
  source_reference text NOT NULL,
  boundary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  camera_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_capability text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_segments_project_slug_unique UNIQUE (project_id, slug),
  CONSTRAINT map_segments_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT map_segments_boundary_object_check CHECK (jsonb_typeof(boundary_data) = 'object'),
  CONSTRAINT map_segments_camera_object_check CHECK (jsonb_typeof(camera_config) = 'object'),
  CONSTRAINT map_segments_visual_object_check CHECK (jsonb_typeof(visual_config) = 'object')
);

ALTER TABLE public.map_entities
  ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES public.map_segments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS map_segments_project_active_idx
  ON public.map_segments(project_id, is_active, slug);
CREATE INDEX IF NOT EXISTS map_entities_segment_idx
  ON public.map_entities(segment_id, project_id)
  WHERE segment_id IS NOT NULL AND is_archived = false;

CREATE UNIQUE INDEX IF NOT EXISTS map_segments_id_project_unique
  ON public.map_segments(id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS map_entities_id_project_unique
  ON public.map_entities(id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS map_layers_id_project_unique
  ON public.map_layers(id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'map_entities_segment_project_fk'
      AND conrelid = 'public.map_entities'::regclass
  ) THEN
    ALTER TABLE public.map_entities
      ADD CONSTRAINT map_entities_segment_project_fk
      FOREIGN KEY (segment_id, project_id)
      REFERENCES public.map_segments(id, project_id)
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'map_entities_layer_project_fk'
      AND conrelid = 'public.map_entities'::regclass
  ) THEN
    ALTER TABLE public.map_entities
      ADD CONSTRAINT map_entities_layer_project_fk
      FOREIGN KEY (layer_id, project_id)
      REFERENCES public.map_layers(id, project_id)
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'map_geometries_entity_project_fk'
      AND conrelid = 'public.map_entity_geometries'::regclass
  ) THEN
    ALTER TABLE public.map_entity_geometries
      ADD CONSTRAINT map_geometries_entity_project_fk
      FOREIGN KEY (entity_id, project_id)
      REFERENCES public.map_entities(id, project_id)
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commercial_lots_entity_project_fk'
      AND conrelid = 'public.commercial_lots'::regclass
  ) THEN
    ALTER TABLE public.commercial_lots
      ADD CONSTRAINT commercial_lots_entity_project_fk
      FOREIGN KEY (entity_id, project_id)
      REFERENCES public.map_entities(id, project_id)
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.map_entities
  VALIDATE CONSTRAINT map_entities_segment_project_fk;
ALTER TABLE public.map_entities
  VALIDATE CONSTRAINT map_entities_layer_project_fk;
ALTER TABLE public.map_entity_geometries
  VALIDATE CONSTRAINT map_geometries_entity_project_fk;
ALTER TABLE public.commercial_lots
  VALIDATE CONSTRAINT commercial_lots_entity_project_fk;

CREATE OR REPLACE FUNCTION public.enforce_map_entity_segment_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  segment_project_id uuid;
BEGIN
  IF NEW.segment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project_id INTO segment_project_id
  FROM public.map_segments
  WHERE id = NEW.segment_id;

  IF segment_project_id IS NULL OR segment_project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'MAP_SEGMENT_PROJECT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS map_entity_segment_project_guard ON public.map_entities;
CREATE TRIGGER map_entity_segment_project_guard
  BEFORE INSERT OR UPDATE OF segment_id, project_id ON public.map_entities
  FOR EACH ROW EXECUTE FUNCTION public.enforce_map_entity_segment_project();

DROP TRIGGER IF EXISTS map_segments_set_updated_at ON public.map_segments;
CREATE TRIGGER map_segments_set_updated_at
  BEFORE UPDATE ON public.map_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.map_has_explicit_capability(
  _org_id uuid,
  _capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.role() = 'service_role'
    OR (
      public.is_org_member(auth.uid(), _org_id)
      AND (
      public.get_user_org_role(auth.uid(), _org_id) IN ('admin', 'gestor')
      OR EXISTS (
        SELECT 1
        FROM public.user_capabilities capability
        WHERE capability.user_id = auth.uid()
          AND capability.org_id = _org_id
          AND capability.capability IN (_capability, 'map.admin', 'full_access')
      )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.map_has_explicit_capability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_has_explicit_capability(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_has_explicit_capability(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_commission_map_segments(_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.map_projects WHERE id = _project_id) THEN
    RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND';
  END IF;

  INSERT INTO public.map_segments (
    project_id,
    slug,
    name,
    display_name,
    source_reference,
    boundary_data,
    camera_config,
    visual_config,
    required_capability
  )
  VALUES
    (
      _project_id,
      'exporural',
      'Exporural',
      'Exporural',
      'Perímetro cadastral Exporural 2026.3',
      '{"resolution":"explicit-entity-union","expectedEntityCount":116,"expectedLotCount":95,"blockIdentifiers":["QUADRA-R","QUADRA-S"],"perimeter":["Rua Ubiretama","Rua Bruno Schwartz","Rua Gustavo Bessel","Rua Emanuel Brachmann"],"excludedIdentifiers":["B7","B8","D3"]}'::jsonb
        || jsonb_build_object('lineageBaselineAt', transaction_timestamp()),
      '{"direction":[0.62,0.72,0.46],"padding":1.08,"minDistanceRatio":0.12,"maxDistanceRatio":2.2,"bounds":{"minX":-2.9,"maxX":57.8,"minZ":-37.6,"maxZ":-7.7}}'::jsonb,
      '{"surface":"#657F3F","edge":"#405527","accent":"#A8BE72","foreground":"#1F2C16"}'::jsonb,
      'exporural_access'
    ),
    (
      _project_id,
      'industria-comercio-servicos',
      'Indústria, Comércio e Serviços',
      'Indústria, Comércio e Serviços',
      'Anexo 2 — contorno azul do núcleo comercial',
      '{"resolution":"explicit-entity-union","expectedEntityCount":140,"expectedLotCount":103,"blockIdentifiers":["QUADRA-M","QUADRA-G","QUADRA-L","QUADRA-F","QUADRA-J","QUADRA-E","QUADRA-I","QUADRA-D"],"excludedIdentifiers":["Q-G-03","Q-G-04","QUADRA-N","B7","B28","D4","QUADRA-C","QUADRA-B","QUADRA-A","C1","B11","B12","B13","B14","B15","B18","B21","B25","B26","B27","B30","B31","B32","B42-02","G","B8","B9","B10","B39"]}'::jsonb
        || jsonb_build_object('lineageBaselineAt', transaction_timestamp()),
      '{"direction":[0.58,0.7,0.64],"padding":1.12,"minDistanceRatio":0.1,"maxDistanceRatio":2.05,"bounds":{"minX":-24.4582,"maxX":16.3636,"minZ":-11.6727,"maxZ":25.4182}}'::jsonb,
      '{"surface":"#347786","edge":"#173F4A","accent":"#70A9B4","foreground":"#10292F"}'::jsonb,
      'industria_comercio_servicos_access'
    )
  ON CONFLICT (project_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    source_reference = EXCLUDED.source_reference,
    boundary_data = EXCLUDED.boundary_data || jsonb_build_object(
      'lineageBaselineAt',
      COALESCE(
        map_segments.boundary_data->'lineageBaselineAt',
        EXCLUDED.boundary_data->'lineageBaselineAt'
      )
    ),
    camera_config = EXCLUDED.camera_config,
    visual_config = EXCLUDED.visual_config,
    required_capability = EXCLUDED.required_capability,
    is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_commission_map_segments(uuid) TO service_role;

SELECT public.ensure_commission_map_segments(project.id)
FROM public.map_projects project;

CREATE OR REPLACE FUNCTION public.ensure_commission_map_segments_for_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.ensure_commission_map_segments(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_commission_map_segments_for_project() FROM PUBLIC;

DROP TRIGGER IF EXISTS map_project_commission_segments ON public.map_projects;
CREATE TRIGGER map_project_commission_segments
  AFTER INSERT ON public.map_projects
  FOR EACH ROW EXECUTE FUNCTION public.ensure_commission_map_segments_for_project();

-- Rebuild only these two canonical assignments when the migration is replayed.
-- Removing the mirrored metadata prevents a stale client-side classification
-- from reopening an entity that the persisted segment no longer includes.
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

-- Exporural: exact R/S cadastral units, seven internal roads and confirmed
-- support structures. Protected neighbours remain explicitly excluded.
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

-- Industry, Commerce & Services: the eight explicit commercial blocks and
-- the confirmed structures enclosed by Annex 2. Automobile and rural units
-- are never inferred geometrically.
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

-- Lineage is a structural invariant and may only be written by the audited
-- SECURITY DEFINER split/merge RPCs. Direct client inserts could forge a
-- segment inheritance edge without running the topology checks in those RPCs.
DROP POLICY IF EXISTS map_lot_lineage_insert ON public.map_lot_lineage;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.map_lot_lineage
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_commission_map_lineage(_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed_count integer;
BEGIN
  LOOP
    WITH inherited AS (
      SELECT
        target_lot.entity_id,
        min(source_entity.segment_id::text)::uuid AS segment_id,
        min(segment.slug) AS segment_slug
      FROM public.map_lot_lineage lineage
      JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
      JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
      JOIN public.commercial_lots target_lot ON target_lot.id = lineage.target_lot_id
      JOIN public.map_segments segment ON segment.id = source_entity.segment_id
      WHERE target_lot.project_id = _project_id
        AND source_lot.project_id = target_lot.project_id
      GROUP BY target_lot.entity_id
      HAVING count(*) = count(source_entity.segment_id)
        AND count(DISTINCT source_entity.segment_id) = 1
    )
    UPDATE public.map_entities target_entity
    SET segment_id = inherited.segment_id
    FROM inherited
    WHERE target_entity.id = inherited.entity_id
      AND (
        target_entity.segment_id IS DISTINCT FROM inherited.segment_id
        OR target_entity.metadata->>'segmentId' IS DISTINCT FROM inherited.segment_slug
      );

    GET DIAGNOSTICS changed_count = ROW_COUNT;
    EXIT WHEN changed_count = 0;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        target_lot.entity_id,
        count(*) AS lineage_count,
        count(source_entity.segment_id) AS classified_count,
        count(DISTINCT source_entity.segment_id) AS segment_count,
        count(*) FILTER (
          WHERE source_lot.project_id = target_lot.project_id
            AND source_entity.project_id = target_lot.project_id
        ) AS same_project_count
      FROM public.map_lot_lineage lineage
      JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
      JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
      JOIN public.commercial_lots target_lot ON target_lot.id = lineage.target_lot_id
      WHERE target_lot.project_id = _project_id
      GROUP BY target_lot.entity_id
    ) lineage_state
    WHERE lineage_state.same_project_count <> lineage_state.lineage_count
      OR (
        lineage_state.classified_count > 0
        AND (
          lineage_state.classified_count <> lineage_state.lineage_count
          OR lineage_state.segment_count <> 1
        )
      )
  ) THEN
    RAISE EXCEPTION 'MAP_SEGMENT_HISTORICAL_LINEAGE_CONFLICT';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_commission_map_lineage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_commission_map_lineage(uuid) FROM authenticated;

SELECT public.reconcile_commission_map_lineage(project.id)
FROM public.map_projects project;

CREATE OR REPLACE FUNCTION public.keep_map_segment_project_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'MAP_SEGMENT_PROJECT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_map_segment_project_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS map_segment_project_immutable ON public.map_segments;
CREATE TRIGGER map_segment_project_immutable
  BEFORE UPDATE OF project_id ON public.map_segments
  FOR EACH ROW EXECUTE FUNCTION public.keep_map_segment_project_immutable();

CREATE OR REPLACE FUNCTION public.map_segment_baseline_count(
  _boundary_data jsonb,
  _key text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _boundary_data->>_key ~ '^[1-9][0-9]{0,8}$'
      THEN (_boundary_data->>_key)::integer
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.map_segment_baseline_count(jsonb, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.map_segment_lineage_baseline(_boundary_data jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  parsed_baseline timestamptz;
BEGIN
  IF jsonb_typeof(_boundary_data->'lineageBaselineAt') <> 'string' THEN
    RETURN NULL;
  END IF;

  BEGIN
    parsed_baseline := (_boundary_data->>'lineageBaselineAt')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN parsed_baseline;
END;
$$;

REVOKE ALL ON FUNCTION public.map_segment_lineage_baseline(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.map_segment_lineage_inventory_delta(_segment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH segment_scope AS (
    SELECT
      segment.id,
      segment.project_id,
      public.map_segment_lineage_baseline(segment.boundary_data) AS baseline_at
    FROM public.map_segments segment
    WHERE segment.id = _segment_id
      AND public.map_segment_lineage_baseline(segment.boundary_data) IS NOT NULL
  ),
  operations AS (
    SELECT
      lineage.relationship,
      CASE
        WHEN lineage.relationship = 'SPLIT_FROM' THEN lineage.source_lot_id
        ELSE lineage.target_lot_id
      END AS operation_id,
      count(*)::integer AS link_count,
      count(*) FILTER (
        WHERE source_lot.project_id = scope.project_id
          AND target_lot.project_id = scope.project_id
          AND source_entity.project_id = scope.project_id
          AND target_entity.project_id = scope.project_id
          AND source_entity.segment_id = scope.id
          AND target_entity.segment_id = scope.id
      )::integer AS scoped_link_count
    FROM segment_scope scope
    JOIN public.map_lot_lineage lineage
      ON lineage.relationship IN ('SPLIT_FROM', 'MERGED_FROM')
    JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
    JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
    JOIN public.commercial_lots target_lot ON target_lot.id = lineage.target_lot_id
    JOIN public.map_entities target_entity ON target_entity.id = target_lot.entity_id
    WHERE lineage.created_at > scope.baseline_at
      AND NOT (
        source_entity.metadata->>'migrationSnapshotId' IS NOT NULL
        AND source_entity.metadata->>'archivedByReferenceRevision' IS NOT NULL
        AND jsonb_typeof(source_entity.metadata->'replacementLotIdentifiers') = 'array'
        AND source_entity.metadata->'replacementLotIdentifiers' ? upper(target_lot.public_identifier)
      )
      AND (
        source_entity.segment_id = scope.id
        OR target_entity.segment_id = scope.id
      )
    GROUP BY lineage.relationship, operation_id
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM segment_scope) THEN NULL
    WHEN COALESCE(bool_and(link_count = 2 AND scoped_link_count = 2), true)
      THEN COALESCE(sum(CASE relationship WHEN 'SPLIT_FROM' THEN 1 ELSE -1 END), 0)::integer
    ELSE NULL
  END
  FROM operations;
$$;

REVOKE ALL ON FUNCTION public.map_segment_lineage_inventory_delta(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.map_segment_is_complete(_segment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    baseline.entity_count IS NOT NULL
      AND baseline.lot_count IS NOT NULL
      AND baseline.entity_count >= baseline.lot_count
      AND lineage.delta IS NOT NULL
      AND inventory.entity_count = baseline.entity_count + lineage.delta
      AND inventory.lot_count = baseline.lot_count + lineage.delta
      AND inventory.lot_count > 0
      AND inventory.current_geometry_count = inventory.entity_count,
    false
  )
  FROM public.map_segments segment
  CROSS JOIN LATERAL (
    SELECT
      public.map_segment_baseline_count(segment.boundary_data, 'expectedEntityCount') AS entity_count,
      public.map_segment_baseline_count(segment.boundary_data, 'expectedLotCount') AS lot_count
  ) baseline
  CROSS JOIN LATERAL (
    SELECT public.map_segment_lineage_inventory_delta(segment.id) AS delta
  ) lineage
  CROSS JOIN LATERAL (
    SELECT
      (
        SELECT count(*)
        FROM public.map_entities entity
        WHERE entity.segment_id = segment.id
          AND entity.project_id = segment.project_id
          AND entity.is_archived = false
      ) AS entity_count,
      (
        SELECT count(*)
        FROM public.commercial_lots lot
        JOIN public.map_entities entity ON entity.id = lot.entity_id
        WHERE entity.segment_id = segment.id
          AND entity.project_id = segment.project_id
          AND lot.project_id = segment.project_id
          AND entity.is_archived = false
          AND lot.archived_at IS NULL
      ) AS lot_count,
      (
        SELECT count(*)
        FROM public.map_entity_geometries geometry
        JOIN public.map_entities entity ON entity.id = geometry.entity_id
        WHERE entity.segment_id = segment.id
          AND entity.project_id = segment.project_id
          AND geometry.project_id = segment.project_id
          AND entity.is_archived = false
          AND geometry.is_current = true
      ) AS current_geometry_count
  ) inventory
  WHERE segment.id = _segment_id
    AND segment.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.map_segment_is_complete(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.map_can_access_segment(_segment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.map_segments segment
    JOIN public.map_projects project ON project.id = segment.project_id
    WHERE segment.id = _segment_id
      AND segment.is_active = true
      AND public.map_segment_is_complete(segment.id)
      AND project.is_archived = false
      AND public.is_org_member(auth.uid(), project.org_id)
      AND (
        public.get_user_org_role(auth.uid(), project.org_id) IN ('admin', 'gestor')
        OR EXISTS (
          SELECT 1
          FROM public.user_capabilities capability
          WHERE capability.user_id = auth.uid()
            AND capability.org_id = project.org_id
            AND capability.capability IN (
              segment.required_capability,
              'full_access',
              'admin_access'
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.map_can_view_any_segment(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.map_segments segment
    WHERE segment.project_id = _project_id
      AND public.map_can_access_segment(segment.id)
  );
$$;

REVOKE ALL ON FUNCTION public.map_can_access_segment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_can_view_any_segment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_can_access_segment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_can_view_any_segment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_commission_map_segment_inventory(
  p_segment_id uuid
)
RETURNS TABLE (
  expected_entity_count integer,
  expected_lot_count integer,
  lineage_delta integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.map_can_access_segment(p_segment_id) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    (baseline.entity_count + adjustment.delta)::integer,
    (baseline.lot_count + adjustment.delta)::integer,
    adjustment.delta
  FROM public.map_segments segment
  CROSS JOIN LATERAL (
    SELECT
      public.map_segment_baseline_count(segment.boundary_data, 'expectedEntityCount') AS entity_count,
      public.map_segment_baseline_count(segment.boundary_data, 'expectedLotCount') AS lot_count
  ) baseline
  CROSS JOIN LATERAL (
    SELECT public.map_segment_lineage_inventory_delta(segment.id) AS delta
  ) adjustment
  WHERE segment.id = p_segment_id
    AND segment.is_active = true
    AND adjustment.delta IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_commission_map_segment_inventory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_commission_map_segment_inventory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_commission_segment_reservations(
  p_segment_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  segment_project_id uuid;
  segment_org_id uuid;
  expired record;
  expired_count integer := 0;
BEGIN
  IF NOT public.map_can_access_segment(p_segment_id) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  SELECT segment.project_id, project.org_id
  INTO STRICT segment_project_id, segment_org_id
  FROM public.map_segments segment
  JOIN public.map_projects project ON project.id = segment.project_id
  WHERE segment.id = p_segment_id
    AND segment.is_active = true
    AND project.is_archived = false;

  FOR expired IN
    SELECT
      reservation.id AS reservation_id,
      lot.id AS lot_id,
      lot.entity_id,
      lot.status
    FROM public.lot_reservations reservation
    JOIN public.commercial_lots lot ON lot.id = reservation.lot_id
    JOIN public.map_entities entity ON entity.id = lot.entity_id
    WHERE entity.segment_id = p_segment_id
      AND entity.project_id = segment_project_id
      AND lot.project_id = segment_project_id
      AND entity.is_archived = false
      AND lot.archived_at IS NULL
      AND reservation.status = 'ACTIVE'
      AND reservation.expires_at <= now()
    FOR UPDATE OF reservation, lot SKIP LOCKED
  LOOP
    UPDATE public.lot_reservations
    SET status = 'EXPIRED', updated_at = now()
    WHERE id = expired.reservation_id
      AND status = 'ACTIVE';

    IF FOUND THEN
      IF expired.status = 'RESERVED' THEN
        UPDATE public.commercial_lots
        SET status = 'AVAILABLE', updated_at = now()
        WHERE id = expired.lot_id;
        INSERT INTO public.lot_status_history (
          lot_id,
          previous_status,
          new_status,
          reason,
          changed_by
        ) VALUES (
          expired.lot_id,
          'RESERVED',
          'AVAILABLE',
          'Expiração automática da reserva no portal da comissão',
          auth.uid()
        );
      END IF;

      INSERT INTO public.map_activity_logs (
        org_id,
        project_id,
        entity_id,
        lot_id,
        action,
        before_state,
        after_state,
        reason,
        actor_user_id
      ) VALUES (
        segment_org_id,
        segment_project_id,
        expired.entity_id,
        expired.lot_id,
        'RESERVATION_EXPIRED',
        jsonb_build_object('reservationId', expired.reservation_id, 'status', 'ACTIVE'),
        jsonb_build_object('reservationId', expired.reservation_id, 'status', 'EXPIRED'),
        'Prazo de reserva encerrado automaticamente no segmento',
        auth.uid()
      );
      expired_count := expired_count + 1;
    END IF;
  END LOOP;

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_commission_segment_reservations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_commission_segment_reservations(uuid) TO authenticated;

ALTER TABLE public.map_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS map_segments_select ON public.map_segments;
CREATE POLICY map_segments_select ON public.map_segments
  FOR SELECT TO authenticated
  USING (
    public.can_view_commercial_map((SELECT project.org_id FROM public.map_projects project WHERE project.id = project_id))
    OR public.map_can_access_segment(id)
  );

DROP POLICY IF EXISTS map_segments_manage ON public.map_segments;
CREATE POLICY map_segments_manage ON public.map_segments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_projects project
      WHERE project.id = project_id
        AND public.map_has_explicit_capability(project.org_id, 'map.admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.map_projects project
      WHERE project.id = project_id
        AND public.map_has_explicit_capability(project.org_id, 'map.admin')
    )
  );

-- These policies are additive (PostgreSQL combines permissive policies with
-- OR). Full-map permissions stay unchanged; commission-only users receive
-- project metadata plus rows assigned to their exact segment capability.
DROP POLICY IF EXISTS map_projects_commission_segment_select ON public.map_projects;
CREATE POLICY map_projects_commission_segment_select ON public.map_projects
  FOR SELECT TO authenticated
  USING (public.map_can_view_any_segment(id));

DROP POLICY IF EXISTS map_calibrations_commission_segment_select ON public.map_calibrations;
-- No replacement policy: calibrations may contain the complete park reference
-- image and therefore stay behind the existing full-map permission.

DROP POLICY IF EXISTS map_layers_commission_segment_select ON public.map_layers;
CREATE POLICY map_layers_commission_segment_select ON public.map_layers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_entities entity
      WHERE entity.layer_id = map_layers.id
        AND entity.project_id = map_layers.project_id
        AND entity.is_archived = false
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS map_entities_commission_segment_select ON public.map_entities;
CREATE POLICY map_entities_commission_segment_select ON public.map_entities
  FOR SELECT TO authenticated
  USING (
    is_archived = false
    AND segment_id IS NOT NULL
    AND public.map_can_access_segment(segment_id)
  );

DROP POLICY IF EXISTS map_geometries_commission_segment_select ON public.map_entity_geometries;
CREATE POLICY map_geometries_commission_segment_select ON public.map_entity_geometries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_entities entity
      WHERE entity.id = map_entity_geometries.entity_id
        AND entity.project_id = map_entity_geometries.project_id
        AND entity.is_archived = false
        AND map_entity_geometries.is_current = true
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS commercial_lots_commission_segment_select ON public.commercial_lots;
CREATE POLICY commercial_lots_commission_segment_select ON public.commercial_lots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_entities entity
      WHERE entity.id = commercial_lots.entity_id
        AND entity.project_id = commercial_lots.project_id
        AND entity.is_archived = false
        AND commercial_lots.archived_at IS NULL
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS lot_prices_commission_segment_select ON public.lot_prices;
CREATE POLICY lot_prices_commission_segment_select ON public.lot_prices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.commercial_lots lot
      JOIN public.map_entities entity ON entity.id = lot.entity_id
      WHERE lot.id = lot_prices.lot_id
        AND lot.project_id = entity.project_id
        AND lot.archived_at IS NULL
        AND entity.is_archived = false
        AND lot_prices.is_active = true
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS lot_reservations_commission_segment_select ON public.lot_reservations;
CREATE POLICY lot_reservations_commission_segment_select ON public.lot_reservations
  FOR SELECT TO authenticated
  USING (
    status = 'ACTIVE'
    AND EXISTS (
      SELECT 1
      FROM public.commercial_lots lot
      JOIN public.map_entities entity ON entity.id = lot.entity_id
      WHERE lot.id = lot_reservations.lot_id
        AND lot.project_id = entity.project_id
        AND lot.archived_at IS NULL
        AND entity.is_archived = false
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS lot_sales_commission_segment_select ON public.lot_sales;
CREATE POLICY lot_sales_commission_segment_select ON public.lot_sales
  FOR SELECT TO authenticated
  USING (
    status = 'CONFIRMED'
    AND EXISTS (
      SELECT 1
      FROM public.commercial_lots lot
      JOIN public.map_entities entity ON entity.id = lot.entity_id
      WHERE lot.id = lot_sales.lot_id
        AND lot.project_id = entity.project_id
        AND lot.archived_at IS NULL
        AND entity.is_archived = false
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS map_activity_commission_segment_select ON public.map_activity_logs;
CREATE POLICY map_activity_commission_segment_select ON public.map_activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_entities entity
      WHERE entity.id = map_activity_logs.entity_id
        AND entity.project_id = map_activity_logs.project_id
        AND entity.is_archived = false
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

GRANT SELECT ON public.map_segments TO authenticated;
GRANT ALL ON public.map_segments TO service_role;

CREATE OR REPLACE FUNCTION public.validate_commercial_map_segments(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  project_org_id uuid;
  report jsonb;
BEGIN
  SELECT org_id INTO project_org_id
  FROM public.map_projects
  WHERE id = _project_id;

  IF project_org_id IS NULL
    OR NOT public.map_has_explicit_capability(project_org_id, 'map.admin')
  THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  SELECT jsonb_build_object(
    'projectId', _project_id,
    'segments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'slug', segment.slug,
        'expectedEntityCount', public.map_segment_baseline_count(segment.boundary_data, 'expectedEntityCount'),
        'expectedLotCount', public.map_segment_baseline_count(segment.boundary_data, 'expectedLotCount'),
        'lineageDelta', public.map_segment_lineage_inventory_delta(segment.id),
        'effectiveExpectedEntityCount',
          public.map_segment_baseline_count(segment.boundary_data, 'expectedEntityCount')
            + public.map_segment_lineage_inventory_delta(segment.id),
        'effectiveExpectedLotCount',
          public.map_segment_baseline_count(segment.boundary_data, 'expectedLotCount')
            + public.map_segment_lineage_inventory_delta(segment.id),
        'entityCount', (
          SELECT count(*) FROM public.map_entities entity
          WHERE entity.segment_id = segment.id AND entity.is_archived = false
        ),
        'lotCount', (
          SELECT count(*)
          FROM public.commercial_lots lot
          JOIN public.map_entities entity ON entity.id = lot.entity_id
          WHERE entity.segment_id = segment.id AND lot.archived_at IS NULL
        ),
        'currentGeometryCount', (
          SELECT count(*)
          FROM public.map_entity_geometries geometry
          JOIN public.map_entities entity ON entity.id = geometry.entity_id
          WHERE entity.segment_id = segment.id
            AND entity.is_archived = false
            AND geometry.is_current = true
        ),
        'complete', public.map_segment_is_complete(segment.id)
      ) ORDER BY segment.slug)
      FROM public.map_segments segment
      WHERE segment.project_id = _project_id AND segment.is_active = true
    ), '[]'::jsonb),
    'unclassifiedEntities', (
      SELECT count(*) FROM public.map_entities entity
      WHERE entity.project_id = _project_id
        AND entity.is_archived = false
        AND entity.segment_id IS NULL
    ),
    'unclassifiedLots', (
      SELECT count(*)
      FROM public.commercial_lots lot
      JOIN public.map_entities entity ON entity.id = lot.entity_id
      WHERE lot.project_id = _project_id
        AND lot.archived_at IS NULL
        AND entity.segment_id IS NULL
    ),
    'exclusiveAssignmentConflicts', 0,
    'invalidSegmentReferences', (
      SELECT count(*)
      FROM public.map_entities entity
      JOIN public.map_segments segment ON segment.id = entity.segment_id
      WHERE entity.project_id = _project_id
        AND segment.project_id <> entity.project_id
    )
  ) INTO report;

  RETURN report;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_commercial_map_segments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_commercial_map_segments(uuid) TO authenticated;

COMMENT ON TABLE public.map_segments IS
  'Exclusive, permission-aware Commercial Map scopes. Unknown entities remain outside commission portals.';
COMMENT ON COLUMN public.map_entities.segment_id IS
  'Canonical exclusive segment membership; NULL means unclassified and fail-closed in commission views.';
COMMENT ON FUNCTION public.validate_commercial_map_segments(uuid) IS
  'Development/admin validation report; not exposed by the production UI.';
