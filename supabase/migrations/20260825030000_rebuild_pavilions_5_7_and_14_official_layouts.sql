-- Pavilhões 5, 7 e 14 — enquadramento métrico e inventário oficial 2026.
-- B2/B8 preservam suas 267 identidades existentes. B10 materializa os 171
-- módulos independentes desenhados no croqui, sem converter o total legado de
-- 57 grupos em atividade comercial implícita.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('commercial-map:pavilions-5-7-14:2026.4', 0)
);

CREATE TEMP TABLE _p5714_specs (
  pavilion_identifier text PRIMARY KEY,
  pavilion_number integer NOT NULL,
  official_name text NOT NULL,
  commercial_block text NOT NULL,
  module_count integer NOT NULL,
  metric_width numeric NOT NULL,
  metric_depth numeric NOT NULL,
  coordinate_transform text NOT NULL,
  align_x text NOT NULL,
  align_z text NOT NULL,
  facing_radians numeric NOT NULL,
  layout_revision text NOT NULL,
  previous_revision text,
  source_reference text NOT NULL,
  source_interpretation text NOT NULL,
  total_area_sqm numeric NOT NULL,
  modular_area_sqm numeric NOT NULL,
  exhibition_area_sqm numeric,
  segment_slug text,
  source_declared_module_count integer,
  source_discrepancy jsonb,
  official_aliases jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _p5714_specs VALUES
  ('B2', 14, 'Pavilhão 14 — Artesanato e Comércio', 'P14', 186,
    35.00, 33.00, 'quarter-turn-clockwise', 'center', 'center', pi() / 2,
    '2026.4-p14.2', '2026.4-p14.1',
    'WhatsApp Image 2026-08-25 at 03.11.58.jpeg',
    'official-reference-runs', 1155.00, 616.16, NULL,
    'industria-comercio-servicos', NULL, NULL,
    '["Pavilhão 14 — Comércio e Artesanato"]'::jsonb),
  ('B8', 5, 'Pavilhão 5 — Veterinária, Pequenos Animais e Rações', 'P5', 81,
    25.50, 43.50, 'identity', 'center', 'end', 0,
    '2026.4-p5.2', '2026.4-p5.1',
    'Croqui Pavilhão 5 - Fenasoja 2026.pdf',
    'official-reference-runs', 841.53, 244.50, 508.95,
    NULL, NULL,
    '{"module28":"printed-shading-without-commercial-legend"}'::jsonb,
    '["Pavilhão 5 — Floriculturas"]'::jsonb),
  ('B10', 7, 'Pavilhão 7 — Agroindústrias', 'P7', 171,
    49.90, 18.30, 'identity', 'center', 'end', 0,
    '2026.4-p7.1', NULL,
    'Croqui Pavilhão 7 - Fenasoja 2026_page-0001.jpg',
    'official-reference-runs', 918.66, 427.50, NULL,
    NULL, 57,
    '{"kind":"declared-count-conflicts-with-drawn-inventory","declaredModuleCount":57,"drawnModuleCount":171,"resolution":"drawn-inventory-and-aggregate-area-prevail","centralIslandPlacement":"centered-manual-confirmation-required"}'::jsonb,
    '["Pavilhão 7 — Agricultura Familiar","Pavilhão 7 — Agricultura familiar / soja e derivados"]'::jsonb);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.map_projects project WHERE project.is_archived = false
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_ACTIVE_PROJECT_PRECONDITION_FAILED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p5714_specs spec
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities pavilion
        WHERE pavilion.project_id = project.id
          AND pavilion.public_identifier = spec.pavilion_identifier
          AND pavilion.classification = 'PAVILION'
          AND pavilion.is_archived = false
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_PARENT_PRECONDITION_FAILED';
  END IF;

  -- B2 e B8 só podem ser corrigidos depois das reconstruções p14.1/p5.1.
  -- A revisão corrente também é aceita para tornar a migration idempotente.
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p5714_specs spec
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = spec.pavilion_identifier
      AND pavilion.classification = 'PAVILION'
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND spec.pavilion_identifier IN ('B2', 'B8')
      AND (
        SELECT count(DISTINCT entity.id)
        FROM public.map_entities entity
        JOIN public.commercial_lots lot
          ON lot.project_id = entity.project_id
          AND lot.entity_id = entity.id
          AND lot.archived_at IS NULL
        JOIN public.map_entity_geometries geometry
          ON geometry.project_id = entity.project_id
          AND geometry.entity_id = entity.id
          AND geometry.is_current = true
        WHERE entity.project_id = project.id
          AND entity.parent_entity_id = pavilion.id
          AND entity.classification = 'INTERNAL_STAND'
          AND entity.is_archived = false
          AND entity.public_identifier LIKE spec.pavilion_identifier || '-M%'
          AND entity.metadata->>'layoutRevision'
            IN (spec.previous_revision, spec.layout_revision)
      ) <> spec.module_count
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_14_PREVIOUS_REVISION_PRECONDITION_FAILED';
  END IF;

  -- Qualquer entidade B10 não canônica falha antes de reinterpretar identidades.
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = 'B10'
      AND pavilion.classification = 'PAVILION'
      AND pavilion.is_archived = false
    JOIN public.map_entities entity
      ON entity.project_id = project.id
      AND (
        entity.parent_entity_id = pavilion.id
        OR upper(entity.public_identifier) LIKE 'B10-M%'
        OR upper(COALESCE(entity.metadata->>'pavilionPublicIdentifier', '')) = 'B10'
      )
    WHERE project.is_archived = false
      AND entity.is_archived = false
      AND (
        entity.parent_entity_id IS DISTINCT FROM pavilion.id
        OR entity.classification <> 'INTERNAL_STAND'
        OR upper(entity.public_identifier)
          !~ '^B10-M(00[1-9]|0[1-9][0-9]|1[0-6][0-9]|17[01])$'
      )
  ) THEN
    RAISE EXCEPTION 'PAVILION_7_LEGACY_IDENTITY_INCOMPATIBLE';
  END IF;

  -- Um inventário legado de 57 grupos só pode ceder suas identidades se for
  -- integralmente neutro. Qualquer atividade real exige reconciliação humana.
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_entities entity
      ON entity.project_id = project.id
      AND upper(entity.public_identifier)
        ~ '^B10-M(00[1-9]|0[1-9][0-9]|1[0-6][0-9]|17[01])$'
      AND entity.is_archived = false
    JOIN public.commercial_lots lot
      ON lot.project_id = project.id
      AND lot.entity_id = entity.id
      AND lot.archived_at IS NULL
    WHERE project.is_archived = false
      AND COALESCE(entity.metadata->>'layoutRevision', '') <> '2026.4-p7.1'
      AND (
        lot.status <> 'BLOCKED'
        OR lot.official_area_sqm IS NOT NULL
        OR lot.calculated_area_sqm IS NOT NULL
        OR lot.frontage_meters IS NOT NULL
        OR lot.depth_meters IS NOT NULL
        OR COALESCE((entity.metadata->>'buyerDataImported')::boolean, false)
        OR entity.metadata ?| ARRAY['exhibitorId', 'buyerId', 'responsibleExhibitor']
        OR EXISTS (
          SELECT 1 FROM public.lot_prices price
          WHERE price.lot_id = lot.id
            AND (price.pricing_mode <> 'NOT_FOR_SALE'
              OR price.base_price IS NOT NULL
              OR price.price_per_sqm IS NOT NULL
              OR price.asking_price IS NOT NULL
              OR price.minimum_price IS NOT NULL)
        )
        OR EXISTS (SELECT 1 FROM public.lot_reservations row WHERE row.lot_id = lot.id)
        OR EXISTS (SELECT 1 FROM public.lot_negotiations row WHERE row.lot_id = lot.id)
        OR EXISTS (SELECT 1 FROM public.lot_sales row WHERE row.lot_id = lot.id)
        OR EXISTS (SELECT 1 FROM public.lot_contracts row WHERE row.lot_id = lot.id)
      )
  ) THEN
    RAISE EXCEPTION 'PAVILION_7_LEGACY_COMMERCIAL_ACTIVITY_INCOMPATIBLE';
  END IF;
END;
$$;

CREATE TEMP TABLE _p5714_runs (
  pavilion_identifier text NOT NULL,
  run_id text NOT NULL,
  label text NOT NULL,
  role text NOT NULL,
  start_number integer NOT NULL,
  end_number integer NOT NULL,
  left_m numeric NOT NULL,
  top_m numeric NOT NULL,
  width_m numeric NOT NULL,
  depth_m numeric NOT NULL,
  sequence_orientation text NOT NULL,
  module_orientation text NOT NULL,
  group_key text NOT NULL,
  cluster_key text NOT NULL,
  source_precision text NOT NULL DEFAULT 'official-metric',
  PRIMARY KEY (pavilion_identifier, run_id)
) ON COMMIT DROP;

INSERT INTO _p5714_runs (
  pavilion_identifier, run_id, label, role, start_number, end_number,
  left_m, top_m, width_m, depth_m, sequence_orientation,
  module_orientation, group_key, cluster_key
) VALUES
  ('B2', 'south-perimeter-01-35', 'Faixa sul · 01–35', 'perimeter', 1, 35,
    0, 30, 35, 3, 'x-increasing', 'north-south', 'south-perimeter', 'south-perimeter-01-35'),
  ('B2', 'lower-island-south-36-64', 'Ilha inferior · 36–64', 'island', 36, 64,
    3, 22.5, 29, 3.5, 'x-decreasing', 'north-south', 'lower-island', 'lower-island-south-36-64'),
  ('B2', 'lower-island-north-65-93', 'Ilha inferior · 65–93', 'island', 65, 93,
    3, 19, 29, 3.5, 'x-increasing', 'north-south', 'lower-island', 'lower-island-north-65-93'),
  ('B2', 'central-island-south-94-122', 'Ilha central · 94–122', 'island', 94, 122,
    3, 10.5, 29, 3.5, 'x-decreasing', 'north-south', 'central-island', 'central-island-south-94-122'),
  ('B2', 'central-island-north-123-151', 'Ilha central · 123–151', 'island', 123, 151,
    3, 7, 29, 3.5, 'x-increasing', 'north-south', 'central-island', 'central-island-north-123-151'),
  ('B2', 'north-perimeter-152-186', 'Faixa norte · 152–186', 'perimeter', 152, 186,
    0, 0, 35, 3, 'x-decreasing', 'north-south', 'north-perimeter', 'north-perimeter-152-186'),

  ('B8', 'east-bottom-01', 'Módulo 01', 'gallery', 1, 1,
    8.7, 42, 3, 1.5, 'z-increasing', 'east-west', 'commercial-u', 'east-bottom-01'),
  ('B8', 'east-02-43', 'Módulos 02–43', 'gallery', 2, 43,
    8.7, 0, 3, 42, 'z-decreasing', 'east-west', 'commercial-u', 'east-02-43'),
  ('B8', 'west-north-44-62', 'Módulos 44–62', 'gallery', 44, 62,
    0, 0, 3, 19, 'z-increasing', 'east-west', 'commercial-u', 'west-north-44-62'),
  ('B8', 'west-south-63-81', 'Módulos 63–81', 'gallery', 63, 81,
    0, 24.5, 3, 19, 'z-increasing', 'east-west', 'commercial-u', 'west-south-63-81'),

  ('B10', 'south-west-01-21', 'Módulos 01–21', 'perimeter', 1, 21,
    0.2, 15.6, 21, 2.5, 'x-increasing', 'north-south', 'perimeter-south', 'south-01-42'),
  ('B10', 'south-east-22-42', 'Módulos 22–42', 'perimeter', 22, 42,
    28.7, 15.6, 21, 2.5, 'x-increasing', 'north-south', 'perimeter-south', 'south-01-42'),
  ('B10', 'central-south-43-84', 'Módulos 43–84', 'island', 43, 84,
    3.95, 9.15, 42, 2.5, 'x-increasing', 'north-south', 'central-pair', 'central-43-126'),
  ('B10', 'central-north-85-126', 'Módulos 85–126', 'island', 85, 126,
    3.95, 6.65, 42, 2.5, 'x-decreasing', 'north-south', 'central-pair', 'central-43-126'),
  ('B10', 'north-127-171', 'Módulos 127–171', 'perimeter', 127, 171,
    4.7, 0.2, 45, 2.5, 'x-increasing', 'north-south', 'perimeter-north', 'north-127-171');

CREATE TEMP TABLE _p5714_cells (
  pavilion_identifier text NOT NULL,
  module_number integer NOT NULL,
  public_identifier text NOT NULL,
  pavilion_module_key text NOT NULL,
  lot_number text NOT NULL,
  run_id text NOT NULL,
  group_key text NOT NULL,
  cluster_key text NOT NULL,
  sequence_orientation text NOT NULL,
  module_orientation text NOT NULL,
  source_precision text NOT NULL,
  source_discrepancy text,
  center_x numeric NOT NULL,
  center_z numeric NOT NULL,
  width numeric NOT NULL,
  depth numeric NOT NULL,
  normalized_ring jsonb NOT NULL,
  normalized_label_anchor jsonb NOT NULL,
  render_parts jsonb NOT NULL,
  PRIMARY KEY (pavilion_identifier, module_number),
  UNIQUE (public_identifier),
  UNIQUE (pavilion_module_key)
) ON COMMIT DROP;

WITH expanded AS (
  SELECT
    spec.metric_width,
    spec.metric_depth,
    run.*,
    module_number,
    run.end_number - run.start_number + 1 AS module_count,
    CASE WHEN run.sequence_orientation IN ('x-decreasing', 'z-decreasing')
      THEN run.end_number - module_number
      ELSE module_number - run.start_number
    END AS spatial_index
  FROM _p5714_runs run
  JOIN _p5714_specs spec USING (pavilion_identifier)
  CROSS JOIN LATERAL generate_series(run.start_number, run.end_number) module_number
), measured AS (
  SELECT
    *,
    CASE WHEN sequence_orientation LIKE 'x-%'
      THEN width_m / module_count ELSE width_m END AS cell_width_m,
    CASE WHEN sequence_orientation LIKE 'z-%'
      THEN depth_m / module_count ELSE depth_m END AS cell_depth_m
  FROM expanded
), placed AS (
  SELECT
    *,
    CASE WHEN sequence_orientation LIKE 'x-%'
      THEN left_m + spatial_index * cell_width_m + cell_width_m / 2
      ELSE left_m + width_m / 2 END AS center_x_m,
    CASE WHEN sequence_orientation LIKE 'z-%'
      THEN top_m + spatial_index * cell_depth_m + cell_depth_m / 2
      ELSE top_m + depth_m / 2 END AS center_z_m
  FROM measured
), normalized AS (
  SELECT
    *,
    center_x_m / metric_width AS cell_center_x,
    center_z_m / metric_depth AS cell_center_z,
    cell_width_m / metric_width AS cell_width,
    cell_depth_m / metric_depth AS cell_depth
  FROM placed
)
INSERT INTO _p5714_cells
SELECT
  pavilion_identifier,
  module_number,
  pavilion_identifier || '-M' || lpad(module_number::text, 3, '0'),
  pavilion_identifier || ':module:' || lpad(module_number::text, 3, '0'),
  CASE WHEN module_number < 100
    THEN lpad(module_number::text, 2, '0') ELSE module_number::text END,
  run_id,
  group_key,
  cluster_key,
  sequence_orientation,
  module_orientation,
  source_precision,
  CASE
    WHEN pavilion_identifier = 'B8' AND module_number = 28
      THEN 'manual-confirmation-required'
    ELSE NULL
  END,
  cell_center_x,
  cell_center_z,
  cell_width,
  cell_depth,
  jsonb_build_array(
    jsonb_build_array(greatest(least(cell_center_x - cell_width / 2, 1), 0), greatest(least(cell_center_z - cell_depth / 2, 1), 0)),
    jsonb_build_array(greatest(least(cell_center_x + cell_width / 2, 1), 0), greatest(least(cell_center_z - cell_depth / 2, 1), 0)),
    jsonb_build_array(greatest(least(cell_center_x + cell_width / 2, 1), 0), greatest(least(cell_center_z + cell_depth / 2, 1), 0)),
    jsonb_build_array(greatest(least(cell_center_x - cell_width / 2, 1), 0), greatest(least(cell_center_z + cell_depth / 2, 1), 0)),
    jsonb_build_array(greatest(least(cell_center_x - cell_width / 2, 1), 0), greatest(least(cell_center_z - cell_depth / 2, 1), 0))
  ),
  jsonb_build_array(cell_center_x, cell_center_z),
  jsonb_build_array(jsonb_build_object(
    'centerX', cell_center_x,
    'centerZ', cell_center_z,
    'width', cell_width,
    'depth', cell_depth
  ))
FROM normalized;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p5714_cells) <> 438
    OR EXISTS (
      SELECT 1 FROM _p5714_specs spec
      WHERE (SELECT count(*) FROM _p5714_cells cell
        WHERE cell.pavilion_identifier = spec.pavilion_identifier) <> spec.module_count
    )
    OR EXISTS (
      SELECT 1 FROM _p5714_cells cell
      WHERE cell.width <= 0 OR cell.depth <= 0
        OR jsonb_array_length(cell.normalized_ring) <> 5
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(cell.normalized_ring) point
          WHERE (point->>0)::numeric < 0 OR (point->>0)::numeric > 1
             OR (point->>1)::numeric < 0 OR (point->>1)::numeric > 1
        )
    )
  THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_OFFICIAL_CELL_INVENTORY_INVALID';
  END IF;

  IF (SELECT sum(width_m * depth_m) FROM _p5714_runs WHERE pavilion_identifier = 'B2')
      IS DISTINCT FROM 616.00::numeric
    OR (SELECT sum(width_m * depth_m) FROM _p5714_runs WHERE pavilion_identifier = 'B8')
      IS DISTINCT FROM 244.50::numeric
    OR (SELECT sum(width_m * depth_m) FROM _p5714_runs WHERE pavilion_identifier = 'B10')
      IS DISTINCT FROM 427.50::numeric
  THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_MODULAR_AREA_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _p5714_corridors (
  pavilion_identifier text NOT NULL,
  corridor_id text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,
  left_m numeric NOT NULL,
  top_m numeric NOT NULL,
  width_m numeric NOT NULL,
  depth_m numeric NOT NULL,
  source_precision text NOT NULL DEFAULT 'official-metric',
  PRIMARY KEY (pavilion_identifier, corridor_id)
) ON COMMIT DROP;

INSERT INTO _p5714_corridors (
  pavilion_identifier, corridor_id, label, kind,
  left_m, top_m, width_m, depth_m
) VALUES
  ('B2', 'north-distribution', 'Circulação norte', 'main', 0, 3, 35, 4),
  ('B2', 'central-distribution', 'Circulação central', 'main', 0, 14, 35, 5),
  ('B2', 'south-distribution', 'Circulação sul', 'main', 0, 26, 35, 4),
  ('B2', 'west-upper-access', 'Afastamento lateral oeste superior', 'perimeter', 0, 7, 3, 7),
  ('B2', 'east-upper-access', 'Afastamento lateral leste superior', 'perimeter', 32, 7, 3, 7),
  ('B2', 'west-lower-access', 'Afastamento lateral oeste inferior', 'perimeter', 0, 19, 3, 7),
  ('B2', 'east-lower-access', 'Afastamento lateral leste inferior', 'perimeter', 32, 19, 3, 7),

  ('B8', 'central-commercial-aisle', 'Corredor comercial central', 'main', 3, 0, 5.7, 43.5),
  ('B8', 'west-cross-access', 'Acesso transversal oeste', 'cross', 0, 19, 3, 5.5),
  ('B8', 'support-north-access', 'Acesso às estruturas permanentes', 'access', 11.7, 0, 13.8, 8),
  ('B8', 'support-south-access', 'Circulação de serviço', 'access', 11.7, 32.1, 13.8, 11.4),

  ('B10', 'north-main-aisle', 'Corredor principal norte', 'main', 0.2, 2.7, 49.5, 3.95),
  ('B10', 'south-main-aisle', 'Corredor principal sul', 'main', 0.2, 11.65, 49.5, 3.95),
  ('B10', 'west-island-circulation', 'Circulação lateral oeste', 'perimeter', 0.2, 6.65, 3.75, 5),
  ('B10', 'east-island-circulation', 'Circulação lateral leste', 'perimeter', 45.95, 6.65, 3.75, 5),
  ('B10', 'south-central-entrance', 'Acesso principal', 'access', 21.2, 15.6, 7.5, 2.5),
  ('B10', 'northwest-access', 'Entrada e saída norte', 'access', 0.2, 0.2, 4.5, 2.5);

CREATE TEMP TABLE _p5714_support_spaces (
  pavilion_identifier text NOT NULL,
  support_id text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,
  left_m numeric NOT NULL,
  top_m numeric NOT NULL,
  width_m numeric NOT NULL,
  depth_m numeric NOT NULL,
  source_precision text NOT NULL,
  PRIMARY KEY (pavilion_identifier, support_id)
) ON COMMIT DROP;

INSERT INTO _p5714_support_spaces VALUES
  ('B8', 'deposito-fenasoja', 'Depósito Fenasoja', 'storage', 11.7, 8, 7.8, 15.4, 'official-metric'),
  ('B8', 'deposito-hortigranjeiros', 'Depósito Hortigranjeiros', 'storage', 11.7, 23.4, 7.8, 8.7, 'official-metric'),
  ('B8', 'alojamento-peoes', 'Alojamento Peões', 'accommodation', 19.5, 8, 6, 14.1, 'official-metric'),
  ('B8', 'alojamento-peoas', 'Alojamento Peoas', 'accommodation', 19.5, 22.1, 6, 10, 'official-metric'),
  ('B10', 'cozinha-pavilhao-7', 'Cozinha do Pavilhão 7', 'kitchen', 17, -3.7, 4.5, 3.7, 'plan-traced'),
  ('B10', 'banheiros-pavilhao-7', 'Banheiros do Pavilhão 7', 'sanitary', 21.5, -3.7, 10.3, 3.7, 'plan-traced');

CREATE TEMP TABLE _p5714_wall_accesses (
  pavilion_identifier text NOT NULL,
  access_id text NOT NULL,
  label text NOT NULL,
  source_precision text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (pavilion_identifier, access_id)
) ON COMMIT DROP;

INSERT INTO _p5714_wall_accesses VALUES
  ('B2', 'north-transverse-access', 'Acesso transversal norte', 'official-metric',
    '{"corridorId":"north-distribution","edges":["front","rear"],"kind":"entrance"}'::jsonb),
  ('B2', 'central-transverse-access', 'Acesso transversal central', 'official-metric',
    '{"corridorId":"central-distribution","edges":["front","rear"],"kind":"entrance"}'::jsonb),
  ('B2', 'south-transverse-access', 'Acesso transversal sul', 'official-metric',
    '{"corridorId":"south-distribution","edges":["front","rear"],"kind":"entrance"}'::jsonb),
  ('B10', 'front-central-door', 'Entrada principal', 'official-metric',
    '{"wall":"front","centerAlongWallM":24.95,"openingWidthM":3,"openingHeightM":3.5,"kind":"entrance"}'::jsonb),
  ('B10', 'rear-west-door', 'Entrada e saída norte', 'plan-traced',
    '{"wall":"rear","centerAlongWallM":2.45,"openingWidthM":2.4,"openingHeightM":2.1,"kind":"entrance"}'::jsonb),
  ('B10', 'right-north-isolated-gate', 'Portão isolado norte', 'plan-traced',
    '{"wall":"right","centerAlongWallM":4.675,"openingWidthM":3.5,"openingHeightM":3.3,"kind":"gate","connectsTo":"PAVILION_11_SHEET_02"}'::jsonb),
  ('B10', 'right-south-isolated-gate', 'Portão isolado sul', 'plan-traced',
    '{"wall":"right","centerAlongWallM":13.625,"openingWidthM":3.5,"openingHeightM":3.3,"kind":"gate","connectsTo":"PAVILION_11_SHEET_02"}'::jsonb);

CREATE TEMP TABLE _p5714_frames ON COMMIT DROP AS
WITH parent_bounds AS (
  SELECT
    project.id AS project_id,
    project.org_id,
    pavilion.id AS pavilion_id,
    pavilion.metadata AS pavilion_metadata,
    layer.id AS layer_id,
    segment.id AS segment_id,
    parent_geometry.geometry AS parent_geometry,
    parent_geometry.elevation,
    parent_geometry.calibration_version,
    spec.*,
    min((point->>0)::numeric) AS min_x,
    max((point->>0)::numeric) AS max_x,
    min((point->>1)::numeric) AS min_z,
    max((point->>1)::numeric) AS max_z
  FROM public.map_projects project
  CROSS JOIN _p5714_specs spec
  JOIN public.map_entities pavilion
    ON pavilion.project_id = project.id
    AND pavilion.public_identifier = spec.pavilion_identifier
    AND pavilion.classification = 'PAVILION'
    AND pavilion.is_archived = false
  JOIN public.map_entity_geometries parent_geometry
    ON parent_geometry.project_id = project.id
    AND parent_geometry.entity_id = pavilion.id
    AND parent_geometry.is_current = true
  JOIN public.map_layers layer
    ON layer.project_id = project.id
    AND layer.layer_key = 'commercial'
  LEFT JOIN public.map_segments segment
    ON spec.segment_slug IS NOT NULL
    AND segment.project_id = project.id
    AND segment.slug = spec.segment_slug
    AND segment.is_active = true
  CROSS JOIN LATERAL jsonb_array_elements(parent_geometry.geometry->'coordinates'->0) point
  WHERE project.is_archived = false
  GROUP BY
    project.id, project.org_id, pavilion.id, pavilion.metadata,
    layer.id, segment.id, parent_geometry.geometry,
    parent_geometry.elevation, parent_geometry.calibration_version,
    spec.pavilion_identifier, spec.pavilion_number, spec.official_name,
    spec.commercial_block, spec.module_count, spec.metric_width,
    spec.metric_depth, spec.coordinate_transform, spec.align_x, spec.align_z,
    spec.facing_radians, spec.layout_revision, spec.previous_revision,
    spec.source_reference, spec.source_interpretation, spec.total_area_sqm,
    spec.modular_area_sqm, spec.exhibition_area_sqm, spec.segment_slug,
    spec.source_declared_module_count, spec.source_discrepancy
), clear_bounds AS (
  SELECT
    *,
    (min_x + max_x) / 2 AS pavilion_center_x,
    (min_z + max_z) / 2 AS pavilion_center_z,
    CASE WHEN abs(sin(facing_radians::double precision)) > 0.5
      THEN max_z - min_z ELSE max_x - min_x END AS model_width,
    CASE WHEN abs(sin(facing_radians::double precision)) > 0.5
      THEN max_x - min_x ELSE max_z - min_z END AS model_depth,
    LEAST(max_x - min_x, max_z - min_z) AS short_side,
    CASE WHEN coordinate_transform = 'quarter-turn-clockwise'
      THEN metric_depth ELSE metric_width END AS oriented_metric_width,
    CASE WHEN coordinate_transform = 'quarter-turn-clockwise'
      THEN metric_width ELSE metric_depth END AS oriented_metric_depth
  FROM parent_bounds
), available AS (
  SELECT
    *,
    model_width - 2 * short_side * 0.025 - 2 * short_side * 0.065 AS clear_width,
    model_depth - 2 * short_side * 0.025 - 2 * short_side * 0.065 AS clear_depth
  FROM clear_bounds
), scaled AS (
  SELECT
    *,
    LEAST(
      clear_width / oriented_metric_width,
      clear_depth / oriented_metric_depth
    ) AS uniform_scale
  FROM available
), aligned AS (
  SELECT
    *,
    oriented_metric_width * uniform_scale AS frame_width,
    oriented_metric_depth * uniform_scale AS frame_depth,
    CASE align_x
      WHEN 'start' THEN -(clear_width - oriented_metric_width * uniform_scale) / 2
      WHEN 'end' THEN (clear_width - oriented_metric_width * uniform_scale) / 2
      ELSE 0
    END AS local_frame_offset_x,
    CASE align_z
      WHEN 'start' THEN -(clear_depth - oriented_metric_depth * uniform_scale) / 2
      WHEN 'end' THEN (clear_depth - oriented_metric_depth * uniform_scale) / 2
      ELSE 0
    END AS local_frame_offset_z,
    cos(facing_radians::double precision)::numeric AS cosine,
    sin(facing_radians::double precision)::numeric AS sine
  FROM scaled
)
SELECT
  *,
  pavilion_center_x
    + local_frame_offset_x * cosine
    + local_frame_offset_z * sine AS frame_center_x,
  pavilion_center_z
    - local_frame_offset_x * sine
    + local_frame_offset_z * cosine AS frame_center_z
FROM aligned;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p5714_frames)
      <> 3 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT 1 FROM _p5714_frames
      WHERE clear_width <= 0 OR clear_depth <= 0 OR uniform_scale <= 0
        OR (segment_slug IS NOT NULL AND segment_id IS NULL)
        OR frame_width > clear_width + 0.00000001
        OR frame_depth > clear_depth + 0.00000001
        OR abs(frame_width / frame_depth
          - oriented_metric_width / oriented_metric_depth) > 0.0000000001
    )
  THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_METRIC_FRAME_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _p5714_staged ON COMMIT DROP AS
WITH projected AS (
  SELECT
    frame.*,
    cell.module_number,
    cell.public_identifier,
    cell.pavilion_module_key,
    cell.lot_number,
    cell.run_id,
    cell.group_key,
    cell.cluster_key,
    cell.sequence_orientation,
    cell.module_orientation,
    cell.source_precision,
    cell.source_discrepancy AS module_source_discrepancy,
    cell.center_x,
    cell.center_z,
    cell.width,
    cell.depth,
    cell.normalized_ring,
    cell.normalized_label_anchor,
    cell.render_parts,
    world.world_ring,
    label.world_label_x,
    label.world_label_z
  FROM _p5714_frames frame
  JOIN _p5714_cells cell USING (pavilion_identifier)
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_array(
        frame.frame_center_x
          + ((CASE WHEN frame.coordinate_transform = 'quarter-turn-clockwise'
              THEN 1 - (point->>1)::numeric ELSE (point->>0)::numeric END
            - 0.5) * frame.frame_width) * frame.cosine
          + ((CASE WHEN frame.coordinate_transform = 'quarter-turn-clockwise'
              THEN (point->>0)::numeric ELSE (point->>1)::numeric END
            - 0.5) * frame.frame_depth) * frame.sine,
        frame.frame_center_z
          - ((CASE WHEN frame.coordinate_transform = 'quarter-turn-clockwise'
              THEN 1 - (point->>1)::numeric ELSE (point->>0)::numeric END
            - 0.5) * frame.frame_width) * frame.sine
          + ((CASE WHEN frame.coordinate_transform = 'quarter-turn-clockwise'
              THEN (point->>0)::numeric ELSE (point->>1)::numeric END
            - 0.5) * frame.frame_depth) * frame.cosine
      ) ORDER BY ordinality
    ) AS world_ring
    FROM jsonb_array_elements(cell.normalized_ring)
      WITH ORDINALITY ring_point(point, ordinality)
  ) world
  CROSS JOIN LATERAL (
    SELECT
      frame.frame_center_x
        + ((CASE WHEN frame.coordinate_transform = 'quarter-turn-clockwise'
            THEN 1 - (cell.normalized_label_anchor->>1)::numeric
            ELSE (cell.normalized_label_anchor->>0)::numeric END
          - 0.5) * frame.frame_width) * frame.cosine
        + ((CASE WHEN frame.coordinate_transform = 'quarter-turn-clockwise'
            THEN (cell.normalized_label_anchor->>0)::numeric
            ELSE (cell.normalized_label_anchor->>1)::numeric END
          - 0.5) * frame.frame_depth) * frame.sine AS world_label_x,
      frame.frame_center_z
        - ((CASE WHEN frame.coordinate_transform = 'quarter-turn-clockwise'
            THEN 1 - (cell.normalized_label_anchor->>1)::numeric
            ELSE (cell.normalized_label_anchor->>0)::numeric END
          - 0.5) * frame.frame_width) * frame.sine
        + ((CASE WHEN frame.coordinate_transform = 'quarter-turn-clockwise'
            THEN (cell.normalized_label_anchor->>0)::numeric
            ELSE (cell.normalized_label_anchor->>1)::numeric END
          - 0.5) * frame.frame_depth) * frame.cosine AS world_label_z
  ) label
)
SELECT
  projected.*,
  jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(world_ring)
  ) AS geometry,
  jsonb_build_object(
    'seedManaged', true,
    'sourceRevision', '2026.4',
    'layoutRevision', layout_revision,
    'source', source_reference,
    'sourceInterpretation', source_interpretation,
    'sourcePrecision', source_precision,
    'cartographicConfidence', 'official_metric_reference',
    'planCoordinateTransform', coordinate_transform,
    'projectionFit', 'metric-contain',
    'projectionAlignment', jsonb_build_object('x', align_x, 'z', align_z),
    'metricReference', jsonb_build_object(
      'widthM', metric_width, 'depthM', metric_depth, 'inset', 0
    ),
    'projectionFrame', jsonb_build_object(
      'width', frame_width, 'depth', frame_depth,
      'uniformScale', uniform_scale,
      'centerX', frame_center_x, 'centerZ', frame_center_z
    ),
    'parentPublicIdentifier', pavilion_identifier,
    'pavilionPublicIdentifier', pavilion_identifier,
    'pavilionModuleKey', pavilion_module_key,
    'pavilionNumber', pavilion_number,
    'commercialBlock', commercial_block,
    'moduleNumber', module_number,
    'lotNumber', lot_number,
    'orientation', module_orientation,
    'sequenceOrientation', sequence_orientation,
    'group', group_key,
    'cluster', cluster_key,
    'sortOrder', module_number,
    'type', 'commercial-lot',
    'moduleType', 'commercial-lot',
    'areaM2', NULL,
    'areaAssignment', 'unassigned',
    'officialMeasurements', false,
    'normalizedFootprint', jsonb_build_object(
      'centerX', center_x, 'centerZ', center_z,
      'width', width, 'depth', depth
    ),
    'normalizedFootprintPolygon', normalized_ring,
    'normalizedLabelAnchor', normalized_label_anchor,
    'renderParts', render_parts,
    'labelAnchor', jsonb_build_array(world_label_x, world_label_z)
  )
  || CASE WHEN module_source_discrepancy IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('sourceDiscrepancy', module_source_discrepancy) END
  || CASE WHEN segment_slug IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object(
      'segmentId', 'industria-comercio-servicos',
      'segmentCode', 'INDUSTRIA_COMERCIO_SERVICOS',
      'segmentName', 'Indústria, Comércio e Serviços'
    ) END AS structural_metadata
FROM projected;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p5714_staged)
      <> 438 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT 1 FROM _p5714_staged staged
      WHERE NOT extensions.ST_IsValid(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(staged.geometry::text), 0)
      )
        OR NOT extensions.ST_Covers(
          extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(staged.parent_geometry::text), 0),
          extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(staged.geometry::text), 0)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM _p5714_staged left_module
      JOIN _p5714_staged right_module
        ON right_module.project_id = left_module.project_id
        AND right_module.pavilion_identifier = left_module.pavilion_identifier
        AND right_module.module_number > left_module.module_number
      WHERE extensions.ST_Area(extensions.ST_Intersection(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(left_module.geometry::text), 0),
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(right_module.geometry::text), 0)
      )) > 0.00000001
    )
  THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_STAGED_GEOMETRY_INVALID';
  END IF;
END;
$$;

-- Conflitos de identidade falham. Nada é reaproveitado por proximidade,
-- renomeado, apagado ou arquivado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _p5714_staged staged
      ON staged.project_id = entity.project_id
      AND upper(staged.public_identifier) = upper(entity.public_identifier)
    WHERE entity.public_identifier <> staged.public_identifier
      OR entity.is_archived = true
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR (entity.metadata->>'pavilionPublicIdentifier' IS NOT NULL
        AND upper(entity.metadata->>'pavilionPublicIdentifier') <> staged.pavilion_identifier)
      OR (entity.metadata->>'pavilionModuleKey' IS NOT NULL
        AND upper(entity.metadata->>'pavilionModuleKey') <> upper(staged.pavilion_module_key))
      OR (entity.metadata->>'moduleNumber' IS NOT NULL
        AND entity.metadata->>'moduleNumber' <> staged.module_number::text)
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_ENTITY_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _p5714_staged staged
      ON staged.project_id = entity.project_id
      AND upper(COALESCE(entity.metadata->>'pavilionModuleKey', ''))
        = upper(staged.pavilion_module_key)
    WHERE entity.public_identifier IS DISTINCT FROM staged.public_identifier
      OR entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_MODULE_KEY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p5714_frames frame
    JOIN public.map_entities entity
      ON entity.project_id = frame.project_id
      AND entity.parent_entity_id = frame.pavilion_id
      AND entity.classification = 'INTERNAL_STAND'
      AND entity.is_archived = false
    LEFT JOIN _p5714_staged staged
      ON staged.project_id = entity.project_id
      AND staged.public_identifier = entity.public_identifier
    WHERE staged.public_identifier IS NULL
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_UNEXPECTED_INTERNAL_STAND_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_lots lot
    JOIN _p5714_staged staged
      ON staged.project_id = lot.project_id
      AND upper(staged.public_identifier) = upper(lot.public_identifier)
    LEFT JOIN public.map_entities entity
      ON entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
    WHERE lot.public_identifier <> staged.public_identifier
      OR lot.archived_at IS NOT NULL
      OR entity.id IS NULL
      OR lot.entity_id IS DISTINCT FROM entity.id
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_LOT_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p5714_staged staged
    JOIN public.map_entities entity
      ON entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
    JOIN public.commercial_lots lot ON lot.entity_id = entity.id
    WHERE lot.project_id IS DISTINCT FROM staged.project_id
      OR lot.public_identifier IS DISTINCT FROM staged.public_identifier
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
      OR lot.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_ENTITY_LOT_LINK_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT entity.id
    FROM _p5714_staged staged
    JOIN public.map_entities entity
      ON entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
    JOIN public.commercial_lots lot
      ON lot.project_id = staged.project_id
      AND lot.entity_id = entity.id
      AND lot.archived_at IS NULL
    WHERE staged.pavilion_identifier IN ('B2', 'B8')
    GROUP BY entity.id
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_14_LOT_CARDINALITY_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _p5714_existing_entities ON COMMIT DROP AS
SELECT entity.id AS entity_id
FROM _p5714_staged staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier;

SELECT entity.id
FROM public.map_entities entity
JOIN _p5714_existing_entities target ON target.entity_id = entity.id
FOR UPDATE;

CREATE TEMP TABLE _p5714_entity_snapshot ON COMMIT DROP AS
SELECT
  entity.id AS entity_id,
  to_jsonb(entity) - 'metadata' - 'updated_at' - 'segment_id' AS row_state,
  COALESCE(entity.metadata, '{}'::jsonb) - ARRAY[
    'seedManaged', 'sourceRevision', 'layoutRevision', 'source',
    'sourceInterpretation', 'sourcePrecision', 'cartographicConfidence',
    'planCoordinateTransform', 'projectionFit', 'projectionAlignment',
    'metricReference', 'projectionFrame', 'parentPublicIdentifier',
    'pavilionPublicIdentifier', 'pavilionModuleKey', 'pavilionNumber',
    'commercialBlock', 'moduleNumber', 'lotNumber', 'orientation',
    'sequenceOrientation', 'group', 'cluster', 'sortOrder', 'type',
    'moduleType', 'areaM2', 'areaAssignment', 'officialMeasurements',
    'normalizedFootprint', 'normalizedFootprintPolygon',
    'normalizedLabelAnchor', 'renderParts', 'labelAnchor',
    'segmentId', 'segmentCode', 'segmentName', 'sourceDiscrepancy'
  ] AS non_structural_metadata
FROM public.map_entities entity
JOIN _p5714_existing_entities target ON target.entity_id = entity.id;

CREATE TEMP TABLE _p5714_parent_snapshot ON COMMIT DROP AS
SELECT
  pavilion.id AS pavilion_id,
  to_jsonb(pavilion) - 'metadata' - 'updated_at' - 'name' AS row_state,
  COALESCE(pavilion.metadata, '{}'::jsonb) - ARRAY[
    'internalOfficialPlan', 'internalPlanRuns', 'internalCorridors',
    'internalSupportSpaces', 'internalWallAccesses', 'aliases'
  ] AS non_structural_metadata
FROM _p5714_frames frame
JOIN public.map_entities pavilion ON pavilion.id = frame.pavilion_id;

CREATE TEMP TABLE _p5714_existing_lots ON COMMIT DROP AS
SELECT lot.id AS lot_id
FROM _p5714_staged staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
JOIN public.commercial_lots lot
  ON lot.project_id = staged.project_id
  AND lot.entity_id = entity.id
  AND lot.archived_at IS NULL;

SELECT lot.id
FROM public.commercial_lots lot
JOIN _p5714_existing_lots target ON target.lot_id = lot.id
FOR UPDATE;

CREATE TEMP TABLE _p5714_commercial_snapshot ON COMMIT DROP AS
SELECT
  lot.id AS lot_id,
  to_jsonb(lot) AS lot_state,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_prices row WHERE row.lot_id = lot.id), '[]'::jsonb) AS prices,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_reservations row WHERE row.lot_id = lot.id), '[]'::jsonb) AS reservations,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_negotiations row WHERE row.lot_id = lot.id), '[]'::jsonb) AS negotiations,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_sales row WHERE row.lot_id = lot.id), '[]'::jsonb) AS sales,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_contracts row WHERE row.lot_id = lot.id), '[]'::jsonb) AS contracts,
  COALESCE((SELECT jsonb_agg(to_jsonb(version) ORDER BY version.id)
    FROM public.lot_contracts contract
    JOIN public.lot_contract_versions version ON version.contract_id = contract.id
    WHERE contract.lot_id = lot.id), '[]'::jsonb) AS contract_versions,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_status_history row WHERE row.lot_id = lot.id), '[]'::jsonb) AS status_history,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.map_lot_lineage row
    WHERE row.source_lot_id = lot.id OR row.target_lot_id = lot.id), '[]'::jsonb) AS lineage
FROM public.commercial_lots lot
JOIN _p5714_existing_lots target ON target.lot_id = lot.id;

CREATE TEMP TABLE _p5714_created_entities (entity_id uuid PRIMARY KEY) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.map_entities (
    id, project_id, layer_id, parent_entity_id, public_identifier,
    name, description, classification, verification_status,
    is_sellable, is_archived, segment_id, metadata,
    created_by, updated_by, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), staged.project_id, staged.layer_id, staged.pavilion_id,
    staged.public_identifier, 'Módulo ' || staged.lot_number,
    'Módulo independente neutro do Pavilhão 7; inventário desenhado sujeito à confirmação oficial.',
    'INTERNAL_STAND', 'NEEDS_REVIEW', true, false, NULL,
    staged.structural_metadata || jsonb_build_object('buyerDataImported', false),
    NULL, NULL, transaction_timestamp(), transaction_timestamp()
  FROM _p5714_staged staged
  WHERE staged.pavilion_identifier = 'B10'
    AND NOT EXISTS (
      SELECT 1 FROM public.map_entities entity
      WHERE entity.project_id = staged.project_id
        AND entity.public_identifier = staged.public_identifier
    )
  ON CONFLICT (project_id, public_identifier) DO NOTHING
  RETURNING id
)
INSERT INTO _p5714_created_entities SELECT id FROM inserted;

-- Apenas segmentação e metadata estrutural são corrigidas. Nome, verificação,
-- responsáveis e qualquer metadata comercial existente são preservados.
UPDATE public.map_entities entity
SET
  segment_id = staged.segment_id,
  metadata = (
    COALESCE(entity.metadata, '{}'::jsonb) - ARRAY[
      'seedManaged', 'sourceRevision', 'layoutRevision', 'source',
      'sourceInterpretation', 'sourcePrecision', 'cartographicConfidence',
      'planCoordinateTransform', 'projectionFit', 'projectionAlignment',
      'metricReference', 'projectionFrame', 'parentPublicIdentifier',
      'pavilionPublicIdentifier', 'pavilionModuleKey', 'pavilionNumber',
      'commercialBlock', 'moduleNumber', 'lotNumber', 'orientation',
      'sequenceOrientation', 'group', 'cluster', 'sortOrder', 'type',
      'moduleType', 'areaM2', 'areaAssignment', 'officialMeasurements',
      'normalizedFootprint', 'normalizedFootprintPolygon',
      'normalizedLabelAnchor', 'renderParts', 'labelAnchor',
      'segmentId', 'segmentCode', 'segmentName', 'sourceDiscrepancy'
    ]
  ) || staged.structural_metadata,
  updated_at = transaction_timestamp()
FROM _p5714_staged staged
WHERE entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND (
    entity.segment_id IS DISTINCT FROM staged.segment_id
    OR entity.metadata IS DISTINCT FROM (
      COALESCE(entity.metadata, '{}'::jsonb) - ARRAY[
        'seedManaged', 'sourceRevision', 'layoutRevision', 'source',
        'sourceInterpretation', 'sourcePrecision', 'cartographicConfidence',
        'planCoordinateTransform', 'projectionFit', 'projectionAlignment',
        'metricReference', 'projectionFrame', 'parentPublicIdentifier',
        'pavilionPublicIdentifier', 'pavilionModuleKey', 'pavilionNumber',
        'commercialBlock', 'moduleNumber', 'lotNumber', 'orientation',
        'sequenceOrientation', 'group', 'cluster', 'sortOrder', 'type',
        'moduleType', 'areaM2', 'areaAssignment', 'officialMeasurements',
        'normalizedFootprint', 'normalizedFootprintPolygon',
        'normalizedLabelAnchor', 'renderParts', 'labelAnchor',
        'segmentId', 'segmentCode', 'segmentName', 'sourceDiscrepancy'
      ]
    ) || staged.structural_metadata
  );

-- Runs, circulação, acessos e apoios são infraestrutura descritiva do pai.
-- Eles nunca geram lotes, preços, estados comerciais ou alvos de seleção.
WITH run_payload AS (
  SELECT
    spec.pavilion_identifier,
    jsonb_agg(jsonb_build_object(
      'id', run.run_id,
      'label', run.label,
      'role', run.role,
      'numberRange', jsonb_build_array(run.start_number, run.end_number),
      'orientation', run.module_orientation,
      'sequenceOrientation', run.sequence_orientation,
      'group', run.group_key,
      'cluster', run.cluster_key,
      'sourcePrecision', run.source_precision,
      'normalizedFootprint', jsonb_build_object(
        'centerX', (run.left_m + run.width_m / 2) / spec.metric_width,
        'centerZ', (run.top_m + run.depth_m / 2) / spec.metric_depth,
        'width', run.width_m / spec.metric_width,
        'depth', run.depth_m / spec.metric_depth
      )
    ) ORDER BY run.start_number) AS payload
  FROM _p5714_specs spec
  JOIN _p5714_runs run USING (pavilion_identifier)
  GROUP BY spec.pavilion_identifier
), corridor_payload AS (
  SELECT
    spec.pavilion_identifier,
    jsonb_agg(jsonb_build_object(
      'id', corridor.corridor_id,
      'label', corridor.label,
      'kind', corridor.kind,
      'sourcePrecision', corridor.source_precision,
      'normalizedFootprint', jsonb_build_object(
        'centerX', (corridor.left_m + corridor.width_m / 2) / spec.metric_width,
        'centerZ', (corridor.top_m + corridor.depth_m / 2) / spec.metric_depth,
        'width', corridor.width_m / spec.metric_width,
        'depth', corridor.depth_m / spec.metric_depth
      )
    ) ORDER BY corridor.corridor_id) AS payload
  FROM _p5714_specs spec
  JOIN _p5714_corridors corridor USING (pavilion_identifier)
  GROUP BY spec.pavilion_identifier
), support_payload AS (
  SELECT
    spec.pavilion_identifier,
    jsonb_agg(jsonb_build_object(
      'id', support.support_id,
      'label', support.label,
      'kind', support.kind,
      'type', 'permanent-non-commercial',
      'sourcePrecision', support.source_precision,
      'normalizedFootprint', jsonb_build_object(
        'centerX', (support.left_m + support.width_m / 2) / spec.metric_width,
        'centerZ', (support.top_m + support.depth_m / 2) / spec.metric_depth,
        'width', support.width_m / spec.metric_width,
        'depth', support.depth_m / spec.metric_depth
      )
    ) ORDER BY support.support_id) AS payload
  FROM _p5714_specs spec
  JOIN _p5714_support_spaces support USING (pavilion_identifier)
  GROUP BY spec.pavilion_identifier
), access_payload AS (
  SELECT
    access.pavilion_identifier,
    jsonb_agg(
      jsonb_build_object(
        'id', access.access_id,
        'label', access.label,
        'sourcePrecision', access.source_precision
      ) || access.payload
      ORDER BY access.access_id
    ) AS payload
  FROM _p5714_wall_accesses access
  GROUP BY access.pavilion_identifier
), parent_payload AS (
  SELECT
    spec.pavilion_identifier,
    spec.official_name,
    spec.official_aliases,
    jsonb_build_object(
      'officialName', spec.official_name,
      'layoutRevision', spec.layout_revision,
      'source', spec.source_reference,
      'sourceInterpretation', spec.source_interpretation,
      'moduleCount', spec.module_count,
      'totalAreaM2', spec.total_area_sqm,
      'modularAreaM2', spec.modular_area_sqm,
      'nominalGeometricAreaM2', CASE
        WHEN spec.pavilion_identifier = 'B2' THEN 616.00
        ELSE spec.modular_area_sqm
      END,
      'exhibitionAreaM2', spec.exhibition_area_sqm,
      'sourceDeclaredModuleCount', spec.source_declared_module_count,
      'sourceDiscrepancy', spec.source_discrepancy,
      'projection', jsonb_build_object(
        'coordinateTransform', spec.coordinate_transform,
        'fit', 'metric-contain',
        'metricWidthM', spec.metric_width,
        'metricDepthM', spec.metric_depth,
        'alignX', spec.align_x,
        'alignZ', spec.align_z
      )
    ) AS plan_payload,
    runs.payload AS runs_payload,
    corridors.payload AS corridors_payload,
    COALESCE(supports.payload, '[]'::jsonb) AS supports_payload,
    COALESCE(accesses.payload, '[]'::jsonb) AS accesses_payload
  FROM _p5714_specs spec
  JOIN run_payload runs USING (pavilion_identifier)
  JOIN corridor_payload corridors USING (pavilion_identifier)
  LEFT JOIN support_payload supports USING (pavilion_identifier)
  LEFT JOIN access_payload accesses USING (pavilion_identifier)
)
UPDATE public.map_entities pavilion
SET
  name = parent_payload.official_name,
  metadata = (
    COALESCE(pavilion.metadata, '{}'::jsonb) - ARRAY[
      'internalOfficialPlan', 'internalPlanRuns', 'internalCorridors',
      'internalSupportSpaces', 'internalWallAccesses'
    ]
  ) || jsonb_build_object(
    'internalOfficialPlan', parent_payload.plan_payload,
    'internalPlanRuns', parent_payload.runs_payload,
    'internalCorridors', parent_payload.corridors_payload,
    'internalSupportSpaces', parent_payload.supports_payload,
    'internalWallAccesses', parent_payload.accesses_payload,
    'aliases', (
      SELECT COALESCE(jsonb_agg(alias_value ORDER BY alias_value), '[]'::jsonb)
      FROM (
        SELECT DISTINCT alias_value
        FROM (
          SELECT jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(pavilion.metadata->'aliases') = 'array'
                THEN pavilion.metadata->'aliases'
              ELSE '[]'::jsonb
            END
          ) AS alias_value
          UNION ALL
          SELECT jsonb_array_elements_text(parent_payload.official_aliases) AS alias_value
          UNION ALL
          SELECT pavilion.name AS alias_value
        ) alias_candidates
        WHERE btrim(alias_value) <> ''
          AND alias_value <> parent_payload.official_name
      ) aliases
    )
  ),
  updated_at = transaction_timestamp()
FROM public.map_projects project
JOIN parent_payload ON true
WHERE project.is_archived = false
  AND pavilion.project_id = project.id
  AND pavilion.public_identifier = parent_payload.pavilion_identifier
  AND pavilion.classification = 'PAVILION'
  AND pavilion.is_archived = false
  AND (
    pavilion.name IS DISTINCT FROM parent_payload.official_name
    OR pavilion.metadata->'aliases' IS DISTINCT FROM (
      SELECT COALESCE(jsonb_agg(alias_value ORDER BY alias_value), '[]'::jsonb)
      FROM (
        SELECT DISTINCT alias_value
        FROM (
          SELECT jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(pavilion.metadata->'aliases') = 'array'
                THEN pavilion.metadata->'aliases'
              ELSE '[]'::jsonb
            END
          ) AS alias_value
          UNION ALL
          SELECT jsonb_array_elements_text(parent_payload.official_aliases) AS alias_value
          UNION ALL
          SELECT pavilion.name AS alias_value
        ) alias_candidates
        WHERE btrim(alias_value) <> ''
          AND alias_value <> parent_payload.official_name
      ) aliases
    )
    OR pavilion.metadata->'internalOfficialPlan' IS DISTINCT FROM parent_payload.plan_payload
    OR pavilion.metadata->'internalPlanRuns' IS DISTINCT FROM parent_payload.runs_payload
    OR pavilion.metadata->'internalCorridors' IS DISTINCT FROM parent_payload.corridors_payload
    OR pavilion.metadata->'internalSupportSpaces' IS DISTINCT FROM parent_payload.supports_payload
    OR pavilion.metadata->'internalWallAccesses' IS DISTINCT FROM parent_payload.accesses_payload
  );

CREATE TEMP TABLE _p5714_entity_map ON COMMIT DROP AS
SELECT staged.*, entity.id AS entity_id
FROM _p5714_staged staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND entity.is_archived = false;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p5714_entity_map) <> (SELECT count(*) FROM _p5714_staged)
  THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_ENTITY_BACKFILL_INCOMPLETE';
  END IF;
END;
$$;

-- O trigger de histórico permanece ativo; apenas a trava de edição interativa
-- é suspensa transacionalmente. Geometrias idênticas não ganham nova versão.
ALTER TABLE public.map_entity_geometries
  DISABLE TRIGGER map_geometry_layer_lock_before_write;

INSERT INTO public.map_entity_geometries (
  id, project_id, entity_id, geometry, elevation, extrusion_height,
  rotation, calibration_version, version, is_current, change_reason,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid(), staged.project_id, staged.entity_id, staged.geometry,
  staged.elevation, 0, staged.facing_radians, staged.calibration_version,
  COALESCE((
    SELECT max(previous.version) + 1
    FROM public.map_entity_geometries previous
    WHERE previous.entity_id = staged.entity_id
  ), 1),
  true,
  'Plantas oficiais dos Pavilhões 5, 7 e 14 — Fenasoja 2026',
  NULL, transaction_timestamp(), transaction_timestamp()
FROM _p5714_entity_map staged
WHERE NOT EXISTS (
  SELECT 1 FROM public.map_entity_geometries geometry
  WHERE geometry.project_id = staged.project_id
    AND geometry.entity_id = staged.entity_id
    AND geometry.is_current = true
);

UPDATE public.map_entity_geometries geometry
SET
  geometry = staged.geometry,
  elevation = staged.elevation,
  extrusion_height = 0,
  rotation = staged.facing_radians,
  calibration_version = staged.calibration_version,
  version = geometry.version + 1,
  change_reason = 'Plantas oficiais dos Pavilhões 5, 7 e 14 — Fenasoja 2026',
  updated_at = transaction_timestamp()
FROM _p5714_entity_map staged
WHERE geometry.project_id = staged.project_id
  AND geometry.entity_id = staged.entity_id
  AND geometry.is_current = true
  AND (
    geometry.geometry IS DISTINCT FROM staged.geometry
    OR geometry.elevation IS DISTINCT FROM staged.elevation
    OR geometry.extrusion_height IS DISTINCT FROM 0::numeric
    OR geometry.rotation IS DISTINCT FROM staged.facing_radians
    OR geometry.calibration_version IS DISTINCT FROM staged.calibration_version
  );

ALTER TABLE public.map_entity_geometries
  ENABLE TRIGGER map_geometry_layer_lock_before_write;

CREATE TEMP TABLE _p5714_created_lots (
  lot_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  entity_id uuid NOT NULL
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.commercial_lots (
    id, project_id, entity_id, public_identifier, block, lot_number,
    level_label, display_name, description, status,
    official_area_sqm, calculated_area_sqm, area_validation_status,
    frontage_meters, depth_meters, infrastructure,
    has_electricity, has_water, has_internet, is_corner, is_covered,
    accessibility_notes, commercial_notes, internal_notes,
    archived_at, superseded_by_lot_id, created_by, updated_by,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), staged.project_id, staged.entity_id,
    staged.public_identifier, staged.commercial_block, staged.lot_number,
    NULL, 'Módulo ' || staged.lot_number, NULL, 'BLOCKED',
    NULL, NULL, 'UNVALIDATED', NULL, NULL, '[]'::jsonb,
    false, false, false, false, true,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    transaction_timestamp(), transaction_timestamp()
  FROM _p5714_entity_map staged
  WHERE staged.pavilion_identifier = 'B10'
    AND NOT EXISTS (
      SELECT 1 FROM public.commercial_lots lot
      WHERE lot.entity_id = staged.entity_id
        OR (lot.project_id = staged.project_id
          AND lot.public_identifier = staged.public_identifier)
    )
  ON CONFLICT DO NOTHING
  RETURNING id, project_id, entity_id
)
INSERT INTO _p5714_created_lots SELECT id, project_id, entity_id FROM inserted;

INSERT INTO public.lot_prices (
  id, lot_id, pricing_mode, base_price, price_per_sqm,
  asking_price, minimum_price, is_active, valid_from, valid_until,
  created_by, created_at
)
SELECT
  gen_random_uuid(), created.lot_id, 'NOT_FOR_SALE',
  NULL, NULL, NULL, NULL, true, transaction_timestamp(), NULL,
  NULL, transaction_timestamp()
FROM _p5714_created_lots created;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _p5714_created_lots created
    JOIN public.commercial_lots lot ON lot.id = created.lot_id
    JOIN public.map_entities entity ON entity.id = created.entity_id
    WHERE lot.status <> 'BLOCKED'
      OR lot.official_area_sqm IS NOT NULL
      OR lot.calculated_area_sqm IS NOT NULL
      OR lot.frontage_meters IS NOT NULL
      OR lot.depth_meters IS NOT NULL
      OR lot.area_validation_status <> 'UNVALIDATED'
      OR lot.commercial_notes IS NOT NULL
      OR lot.internal_notes IS NOT NULL
      OR lot.accessibility_notes IS NOT NULL
      OR COALESCE((entity.metadata->>'buyerDataImported')::boolean, false)
      OR entity.metadata ?| ARRAY['exhibitorId', 'buyerId', 'responsibleExhibitor']
  ) OR EXISTS (
    SELECT 1
    FROM _p5714_created_lots created
    LEFT JOIN public.lot_prices price
      ON price.lot_id = created.lot_id AND price.is_active = true
    WHERE price.id IS NULL
      OR price.pricing_mode <> 'NOT_FOR_SALE'
      OR price.base_price IS NOT NULL
      OR price.price_per_sqm IS NOT NULL
      OR price.asking_price IS NOT NULL
      OR price.minimum_price IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM _p5714_created_lots created
    WHERE EXISTS (SELECT 1 FROM public.lot_reservations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_negotiations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_sales row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_contracts row WHERE row.lot_id = created.lot_id)
  ) THEN
    RAISE EXCEPTION 'PAVILION_7_NEW_LOT_NEUTRALITY_INVALID';
  END IF;
END;
$$;

-- Validação final de inventário, projeção, infraestrutura e preservação.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p5714_specs spec
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = spec.pavilion_identifier
      AND pavilion.classification = 'PAVILION'
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities entity
        JOIN public.commercial_lots lot
          ON lot.project_id = entity.project_id
          AND lot.entity_id = entity.id
          AND lot.archived_at IS NULL
        JOIN public.map_entity_geometries geometry
          ON geometry.project_id = entity.project_id
          AND geometry.entity_id = entity.id
          AND geometry.is_current = true
        WHERE entity.project_id = project.id
          AND entity.parent_entity_id = pavilion.id
          AND entity.classification = 'INTERNAL_STAND'
          AND entity.is_archived = false
          AND entity.public_identifier LIKE spec.pavilion_identifier || '-M%'
          AND entity.metadata->>'layoutRevision' = spec.layout_revision
          AND entity.metadata->>'pavilionModuleKey'
            = spec.pavilion_identifier || ':module:'
              || lpad((entity.metadata->>'moduleNumber')::integer::text, 3, '0')
          AND entity.metadata->'areaM2' = 'null'::jsonb
          AND entity.segment_id IS NOT DISTINCT FROM CASE
            WHEN spec.segment_slug IS NULL THEN NULL
            ELSE (SELECT segment.id FROM public.map_segments segment
              WHERE segment.project_id = project.id
                AND segment.slug = spec.segment_slug
                AND segment.is_active = true)
          END
      ) <> spec.module_count
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_FINAL_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p5714_entity_snapshot snapshot
    JOIN public.map_entities entity ON entity.id = snapshot.entity_id
    WHERE snapshot.row_state IS DISTINCT FROM
        to_jsonb(entity) - 'metadata' - 'updated_at' - 'segment_id'
      OR snapshot.non_structural_metadata IS DISTINCT FROM (
        COALESCE(entity.metadata, '{}'::jsonb) - ARRAY[
          'seedManaged', 'sourceRevision', 'layoutRevision', 'source',
          'sourceInterpretation', 'sourcePrecision', 'cartographicConfidence',
          'planCoordinateTransform', 'projectionFit', 'projectionAlignment',
          'metricReference', 'projectionFrame', 'parentPublicIdentifier',
          'pavilionPublicIdentifier', 'pavilionModuleKey', 'pavilionNumber',
          'commercialBlock', 'moduleNumber', 'lotNumber', 'orientation',
          'sequenceOrientation', 'group', 'cluster', 'sortOrder', 'type',
          'moduleType', 'areaM2', 'areaAssignment', 'officialMeasurements',
          'normalizedFootprint', 'normalizedFootprintPolygon',
          'normalizedLabelAnchor', 'renderParts', 'labelAnchor',
          'segmentId', 'segmentCode', 'segmentName', 'sourceDiscrepancy'
        ]
      )
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_NON_STRUCTURAL_ENTITY_STATE_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p5714_parent_snapshot snapshot
    JOIN public.map_entities pavilion ON pavilion.id = snapshot.pavilion_id
    WHERE snapshot.row_state IS DISTINCT FROM
        to_jsonb(pavilion) - 'metadata' - 'updated_at' - 'name'
      OR snapshot.non_structural_metadata IS DISTINCT FROM (
        COALESCE(pavilion.metadata, '{}'::jsonb) - ARRAY[
          'internalOfficialPlan', 'internalPlanRuns', 'internalCorridors',
          'internalSupportSpaces', 'internalWallAccesses', 'aliases'
        ]
      )
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_NON_STRUCTURAL_PARENT_STATE_CHANGED';
  END IF;

  IF EXISTS (
    WITH current_state AS (
      SELECT
        lot.id AS lot_id,
        to_jsonb(lot) AS lot_state,
        COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
          FROM public.lot_prices row WHERE row.lot_id = lot.id), '[]'::jsonb) AS prices,
        COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
          FROM public.lot_reservations row WHERE row.lot_id = lot.id), '[]'::jsonb) AS reservations,
        COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
          FROM public.lot_negotiations row WHERE row.lot_id = lot.id), '[]'::jsonb) AS negotiations,
        COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
          FROM public.lot_sales row WHERE row.lot_id = lot.id), '[]'::jsonb) AS sales,
        COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
          FROM public.lot_contracts row WHERE row.lot_id = lot.id), '[]'::jsonb) AS contracts,
        COALESCE((SELECT jsonb_agg(to_jsonb(version) ORDER BY version.id)
          FROM public.lot_contracts contract
          JOIN public.lot_contract_versions version ON version.contract_id = contract.id
          WHERE contract.lot_id = lot.id), '[]'::jsonb) AS contract_versions,
        COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
          FROM public.lot_status_history row WHERE row.lot_id = lot.id), '[]'::jsonb) AS status_history,
        COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
          FROM public.map_lot_lineage row
          WHERE row.source_lot_id = lot.id OR row.target_lot_id = lot.id), '[]'::jsonb) AS lineage
      FROM public.commercial_lots lot
      JOIN _p5714_existing_lots target ON target.lot_id = lot.id
    )
    SELECT 1
    FROM _p5714_commercial_snapshot previous
    LEFT JOIN current_state current USING (lot_id)
    WHERE current.lot_id IS NULL
      OR current.lot_state IS DISTINCT FROM previous.lot_state
      OR current.prices IS DISTINCT FROM previous.prices
      OR current.reservations IS DISTINCT FROM previous.reservations
      OR current.negotiations IS DISTINCT FROM previous.negotiations
      OR current.sales IS DISTINCT FROM previous.sales
      OR current.contracts IS DISTINCT FROM previous.contracts
      OR current.contract_versions IS DISTINCT FROM previous.contract_versions
      OR current.status_history IS DISTINCT FROM previous.status_history
      OR current.lineage IS DISTINCT FROM previous.lineage
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_COMMERCIAL_STATE_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p5714_frames frame
    JOIN public.map_entities pavilion ON pavilion.id = frame.pavilion_id
    WHERE jsonb_array_length(pavilion.metadata->'internalPlanRuns')
        IS DISTINCT FROM CASE frame.pavilion_identifier
          WHEN 'B2' THEN 6 WHEN 'B8' THEN 4 ELSE 5 END
      OR jsonb_array_length(pavilion.metadata->'internalCorridors')
        IS DISTINCT FROM CASE frame.pavilion_identifier
          WHEN 'B2' THEN 7 WHEN 'B8' THEN 4 ELSE 6 END
      OR jsonb_array_length(pavilion.metadata->'internalSupportSpaces')
        IS DISTINCT FROM CASE frame.pavilion_identifier
          WHEN 'B2' THEN 0 WHEN 'B8' THEN 4 ELSE 2 END
      OR jsonb_array_length(pavilion.metadata->'internalWallAccesses')
        IS DISTINCT FROM CASE frame.pavilion_identifier
          WHEN 'B2' THEN 3 WHEN 'B8' THEN 0 ELSE 4 END
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_5_7_14_PARENT_METADATA_INVALID';
  END IF;
END;
$$;

COMMIT;
