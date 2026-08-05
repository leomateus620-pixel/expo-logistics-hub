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

GRANT SELECT ON public.map_segments TO authenticated;
GRANT ALL ON public.map_segments TO service_role;

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
