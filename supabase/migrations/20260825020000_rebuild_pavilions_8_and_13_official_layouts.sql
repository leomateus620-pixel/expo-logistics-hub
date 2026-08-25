-- Pavilhoes 8 (B4) e 13 (B5) -- reconstrucoes internas oficiais 2026.
--
-- A planta e armazenada no referencial visual do croqui (origem noroeste,
-- entradas publicas no bordo sul). Os lotes permanecem neutros: nenhuma area
-- individual, empresa, preco, reserva, venda ou contrato e inferido.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('commercial-map:pavilions-8-13:2026.4', 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.map_projects project WHERE project.is_archived = false
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_ACTIVE_PROJECT_PRECONDITION_FAILED';
  END IF;
END;
$$;

CREATE TEMP TABLE _p813_specs (
  pavilion_identifier text PRIMARY KEY,
  pavilion_number integer NOT NULL,
  official_name text NOT NULL,
  commercial_block text NOT NULL,
  module_count integer NOT NULL,
  metric_width numeric NOT NULL,
  metric_depth numeric NOT NULL,
  metric_inset numeric NOT NULL,
  facing_radians numeric NOT NULL,
  align_x text NOT NULL CHECK (align_x IN ('start', 'center', 'end')),
  align_z text NOT NULL CHECK (align_z IN ('start', 'center', 'end')),
  total_area_sqm numeric NOT NULL,
  modular_area_sqm numeric NOT NULL,
  layout_revision text NOT NULL,
  source_reference text NOT NULL,
  source_interpretation text NOT NULL
) ON COMMIT DROP;

INSERT INTO _p813_specs VALUES
  (
    'B4', 8, 'Pavilhão 8 — Indústria e Comércio', 'P8', 114,
    21.70, 35.40, 0.00, round(pi()::numeric, 6), 'center', 'end',
    760.20, 438.50, '2026.4-p8.1',
    'Croqui Pavilhão 8- Fenasoja 2026 com cozinha_page-0001 (2).jpg',
    'official-reference-runs'
  ),
  (
    'B5', 13, 'Pavilhão 13 — Indústria e Comércio', 'P13', 103,
    21.00, 35.35, 0.00, round(pi()::numeric, 6), 'center', 'end',
    709.05, 351.30, '2026.4-p13.1',
    'Croqui Pavilhão 13 - Fenasoja 2026_page-0001.jpg',
    'official-metric-polygons'
  );

CREATE TEMP TABLE _p813_runs (
  pavilion_identifier text NOT NULL REFERENCES _p813_specs(pavilion_identifier),
  run_id text NOT NULL,
  start_number integer NOT NULL,
  end_number integer NOT NULL,
  left_m numeric NOT NULL,
  top_m numeric NOT NULL,
  width_m numeric NOT NULL,
  depth_m numeric NOT NULL,
  sequence_orientation text NOT NULL CHECK (
    sequence_orientation IN ('x-increasing', 'x-decreasing', 'z-increasing', 'z-decreasing')
  ),
  module_orientation text NOT NULL CHECK (
    module_orientation IN ('east-west', 'north-south')
  ),
  role text NOT NULL CHECK (role IN ('perimeter', 'island')),
  group_key text NOT NULL,
  cluster_key text NOT NULL,
  reference_area_sqm numeric NOT NULL,
  PRIMARY KEY (pavilion_identifier, run_id),
  CHECK (start_number > 0 AND end_number >= start_number),
  CHECK (width_m > 0 AND depth_m > 0 AND reference_area_sqm > 0)
) ON COMMIT DROP;

-- B4/P8 -- 21,70 m x 35,40 m, com o sul voltado para as entradas publicas.
INSERT INTO _p813_runs VALUES
  ('B4', 'east-lower-01-20',    1,  20, 17.70, 14.00,  4.00, 20.00, 'z-decreasing', 'east-west',   'perimeter', 'perimeter-east',  'east-lower-01-20',   80.00),
  ('B4', 'east-upper-21-25',   21,  25, 17.70,  5.00,  4.00,  5.00, 'z-decreasing', 'east-west',   'perimeter', 'perimeter-east',  'east-upper-21-25',   20.00),
  ('B4', 'north-26-37',        26,  37,  5.50,  0.00, 12.00,  3.00, 'x-decreasing', 'north-south', 'perimeter', 'perimeter-north', 'north-26-37',        36.00),
  ('B4', 'central-east-38-63', 38,  63, 10.85,  5.00,  3.50, 26.00, 'z-increasing', 'east-west',   'island',    'central-pair',     'central-east-38-63', 91.00),
  ('B4', 'central-west-64-89', 64,  89,  7.35,  5.00,  3.50, 26.00, 'z-decreasing', 'east-west',   'island',    'central-pair',     'central-west-64-89', 91.00),
  ('B4', 'northwest-90',       90,  90,  0.00,  0.00,  5.50,  5.00, 'z-increasing', 'east-west',   'perimeter', 'perimeter-west',  'northwest-90',       24.50),
  ('B4', 'west-upper-91-100',  91, 100,  0.00,  5.00,  4.00, 10.00, 'z-increasing', 'east-west',   'perimeter', 'perimeter-west',  'west-upper-91-100',  40.00),
  ('B4', 'west-lower-101-114',101, 114,  0.00, 19.00,  4.00, 14.00, 'z-increasing', 'east-west',   'perimeter', 'perimeter-west',  'west-lower-101-114', 56.00);

-- B5/P13 -- 21,00 m x 35,35 m. Os quatro modulos de canto sao poligonais.
INSERT INTO _p813_runs VALUES
  ('B5', 'east-lower-01-15',         1,  15, 18.00, 20.35, 3.00, 15.00, 'z-decreasing', 'east-west',   'perimeter', 'perimeter-east',  'east-01-26',   45.00),
  ('B5', 'east-upper-16-24',        16,  24, 18.00,  5.65, 3.00,  9.00, 'z-decreasing', 'east-west',   'perimeter', 'perimeter-east',  'east-01-26',   27.00),
  ('B5', 'northeast-irregular-25',  25,  25, 18.00,  0.00, 3.00,  5.65, 'z-increasing', 'east-west',   'perimeter', 'perimeter-east',  'east-01-26',   12.45),
  ('B5', 'northeast-irregular-26',  26,  26, 14.60,  0.00, 6.40,  3.00, 'x-increasing', 'north-south', 'perimeter', 'perimeter-east',  'east-01-26',   14.70),
  ('B5', 'north-27-29',             27,  29,  9.00,  0.00, 3.00,  3.00, 'x-decreasing', 'north-south', 'perimeter', 'perimeter-north', 'north-27-29',   9.00),
  ('B5', 'central-east-30-53',      30,  53, 10.50,  6.80, 3.00, 24.00, 'z-increasing', 'east-west',   'island',    'central-pair',     'central-30-77',72.00),
  ('B5', 'central-west-54-77',      54,  77,  7.50,  6.80, 3.00, 24.00, 'z-decreasing', 'east-west',   'island',    'central-pair',     'central-30-77',72.00),
  ('B5', 'northwest-irregular-78',  78,  78,  0.00,  0.00, 6.40,  3.00, 'x-increasing', 'north-south', 'perimeter', 'perimeter-west',  'west-78-103',  14.70),
  ('B5', 'northwest-irregular-79',  79,  79,  0.00,  0.00, 3.00,  5.65, 'z-increasing', 'east-west',   'perimeter', 'perimeter-west',  'west-78-103',  12.45),
  ('B5', 'west-upper-80-88',        80,  88,  0.00,  5.65, 3.00,  9.00, 'z-increasing', 'east-west',   'perimeter', 'perimeter-west',  'west-78-103',  27.00),
  ('B5', 'west-lower-89-103',       89, 103,  0.00, 20.35, 3.00, 15.00, 'z-increasing', 'east-west',   'perimeter', 'perimeter-west',  'west-78-103',  45.00);

CREATE TEMP TABLE _p813_shapes (
  pavilion_identifier text NOT NULL,
  module_number integer NOT NULL,
  metric_ring jsonb NOT NULL,
  metric_render_parts jsonb NOT NULL,
  label_x_m numeric NOT NULL,
  label_z_m numeric NOT NULL,
  source_precision text NOT NULL,
  PRIMARY KEY (pavilion_identifier, module_number)
) ON COMMIT DROP;

INSERT INTO _p813_shapes VALUES
  (
    'B4', 90,
    '[[0,0],[5.5,0],[5.5,3],[4,3],[4,5],[0,5],[0,0]]'::jsonb,
    '[{"left":0,"top":0,"width":4,"depth":5},{"left":4,"top":0,"width":1.5,"depth":3}]'::jsonb,
    2.00, 2.50, 'official-metric'
  );

-- As diagonais de B5 usam os mesmos 12 cortes leves da referencia TypeScript;
-- a geometria cadastral permanece o poligono exato, nao a soma dos cortes.
WITH shape_specs AS (
  SELECT * FROM (VALUES
    ('B5'::text, 25, 'east-lower'::text,
      '[[21,0],[21,5.65],[18,5.65],[18,3],[21,0]]'::jsonb, 19.50::numeric, 3.75::numeric),
    ('B5', 26, 'east-upper',
      '[[14.6,0],[21,0],[18,3],[14.6,3],[14.6,0]]'::jsonb, 17.50, 1.45),
    ('B5', 78, 'west-upper',
      '[[0,0],[6.4,0],[6.4,3],[3,3],[0,0]]'::jsonb, 3.50, 1.45),
    ('B5', 79, 'west-lower',
      '[[0,0],[3,3],[3,5.65],[0,5.65],[0,0]]'::jsonb, 1.50, 3.75)
  ) value(pavilion_identifier, module_number, side, metric_ring, label_x_m, label_z_m)
), diagonal_parts AS (
  SELECT
    spec.*,
    index,
    index * 0.25::numeric AS top_m,
    index * 0.25::numeric + 0.125::numeric AS midpoint_z
  FROM shape_specs spec
  CROSS JOIN generate_series(0, 11) index
), aggregated AS (
  SELECT
    pavilion_identifier,
    module_number,
    side,
    metric_ring,
    label_x_m,
    label_z_m,
    jsonb_agg(
      jsonb_build_object(
        'left', CASE side
          WHEN 'west-upper' THEN midpoint_z
          WHEN 'west-lower' THEN 0
          WHEN 'east-upper' THEN 14.6
          ELSE 21 - midpoint_z
        END,
        'top', top_m,
        'width', CASE
          WHEN side IN ('west-upper', 'east-upper') THEN 6.4 - midpoint_z
          ELSE midpoint_z
        END,
        'depth', 0.25
      )
      ORDER BY index
    ) AS diagonal_parts
  FROM diagonal_parts
  GROUP BY pavilion_identifier, module_number, side, metric_ring, label_x_m, label_z_m
)
INSERT INTO _p813_shapes
SELECT
  pavilion_identifier,
  module_number,
  metric_ring,
  diagonal_parts || CASE side
    WHEN 'west-lower' THEN '[{"left":0,"top":3,"width":3,"depth":2.65}]'::jsonb
    WHEN 'east-lower' THEN '[{"left":18,"top":3,"width":3,"depth":2.65}]'::jsonb
    ELSE '[]'::jsonb
  END,
  label_x_m,
  label_z_m,
  'official-metric'
FROM aggregated;

CREATE TEMP TABLE _p813_cells (
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
    spec.metric_inset,
    run.*,
    module_number,
    run.end_number - run.start_number + 1 AS module_count,
    CASE WHEN run.sequence_orientation IN ('x-decreasing', 'z-decreasing')
      THEN run.end_number - module_number
      ELSE module_number - run.start_number
    END AS spatial_index
  FROM _p813_runs run
  JOIN _p813_specs spec USING (pavilion_identifier)
  CROSS JOIN LATERAL generate_series(run.start_number, run.end_number) module_number
  WHERE NOT EXISTS (
    SELECT 1 FROM _p813_shapes shape
    WHERE shape.pavilion_identifier = run.pavilion_identifier
      AND shape.module_number = module_number
  )
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
      ELSE top_m + depth_m / 2 END AS center_z_m,
    1 - metric_inset * 2 AS usable
  FROM measured
), normalized AS (
  SELECT
    *,
    metric_inset + (center_x_m / metric_width) * usable AS cell_center_x,
    metric_inset + (center_z_m / metric_depth) * usable AS cell_center_z,
    (cell_width_m / metric_width) * usable AS cell_width,
    (cell_depth_m / metric_depth) * usable AS cell_depth
  FROM placed
)
INSERT INTO _p813_cells
SELECT
  pavilion_identifier,
  module_number,
  pavilion_identifier || '-M' || lpad(module_number::text, 3, '0'),
  pavilion_identifier || ':module:' || lpad(module_number::text, 3, '0'),
  CASE WHEN module_number < 100 THEN lpad(module_number::text, 2, '0') ELSE module_number::text END,
  run_id,
  group_key,
  cluster_key,
  sequence_orientation,
  module_orientation,
  'official-metric',
  cell_center_x,
  cell_center_z,
  cell_width,
  cell_depth,
  jsonb_build_array(
    jsonb_build_array(cell_center_x - cell_width / 2, cell_center_z - cell_depth / 2),
    jsonb_build_array(cell_center_x + cell_width / 2, cell_center_z - cell_depth / 2),
    jsonb_build_array(cell_center_x + cell_width / 2, cell_center_z + cell_depth / 2),
    jsonb_build_array(cell_center_x - cell_width / 2, cell_center_z + cell_depth / 2),
    jsonb_build_array(cell_center_x - cell_width / 2, cell_center_z - cell_depth / 2)
  ),
  jsonb_build_array(cell_center_x, cell_center_z),
  jsonb_build_array(jsonb_build_object(
    'centerX', cell_center_x,
    'centerZ', cell_center_z,
    'width', cell_width,
    'depth', cell_depth
  ))
FROM normalized;

WITH source AS (
  SELECT
    shape.pavilion_identifier,
    shape.module_number,
    shape.metric_ring,
    shape.metric_render_parts,
    shape.label_x_m,
    shape.label_z_m,
    shape.source_precision,
    spec.metric_width,
    spec.metric_depth,
    spec.metric_inset,
    run.run_id,
    run.group_key,
    run.cluster_key,
    run.sequence_orientation,
    run.module_orientation,
    1 - spec.metric_inset * 2 AS usable
  FROM _p813_shapes shape
  JOIN _p813_specs spec USING (pavilion_identifier)
  JOIN _p813_runs run
    ON run.pavilion_identifier = shape.pavilion_identifier
    AND shape.module_number BETWEEN run.start_number AND run.end_number
), normalized AS (
  SELECT
    source.*,
    ring.normalized_ring,
    parts.render_parts,
    metric_inset + (label_x_m / metric_width) * usable AS label_x,
    metric_inset + (label_z_m / metric_depth) * usable AS label_z,
    bounds.min_x,
    bounds.max_x,
    bounds.min_z,
    bounds.max_z
  FROM source
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_array(
        source.metric_inset + ((point->>0)::numeric / source.metric_width) * source.usable,
        source.metric_inset + ((point->>1)::numeric / source.metric_depth) * source.usable
      ) ORDER BY ordinality
    ) AS normalized_ring
    FROM jsonb_array_elements(source.metric_ring)
      WITH ORDINALITY ring_point(point, ordinality)
  ) ring
  CROSS JOIN LATERAL (
    SELECT
      min((point->>0)::numeric) AS min_x,
      max((point->>0)::numeric) AS max_x,
      min((point->>1)::numeric) AS min_z,
      max((point->>1)::numeric) AS max_z
    FROM jsonb_array_elements(source.metric_ring) point
  ) bounds
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'centerX', source.metric_inset
          + (((part->>'left')::numeric + (part->>'width')::numeric / 2)
            / source.metric_width) * source.usable,
        'centerZ', source.metric_inset
          + (((part->>'top')::numeric + (part->>'depth')::numeric / 2)
            / source.metric_depth) * source.usable,
        'width', ((part->>'width')::numeric / source.metric_width) * source.usable,
        'depth', ((part->>'depth')::numeric / source.metric_depth) * source.usable
      ) ORDER BY ordinality
    ) AS render_parts
    FROM jsonb_array_elements(source.metric_render_parts)
      WITH ORDINALITY render_part(part, ordinality)
  ) parts
)
INSERT INTO _p813_cells
SELECT
  pavilion_identifier,
  module_number,
  pavilion_identifier || '-M' || lpad(module_number::text, 3, '0'),
  pavilion_identifier || ':module:' || lpad(module_number::text, 3, '0'),
  CASE WHEN module_number < 100 THEN lpad(module_number::text, 2, '0') ELSE module_number::text END,
  run_id,
  group_key,
  cluster_key,
  sequence_orientation,
  module_orientation,
  source_precision,
  metric_inset + (((min_x + max_x) / 2) / metric_width) * usable,
  metric_inset + (((min_z + max_z) / 2) / metric_depth) * usable,
  ((max_x - min_x) / metric_width) * usable,
  ((max_z - min_z) / metric_depth) * usable,
  normalized_ring,
  jsonb_build_array(label_x, label_z),
  render_parts
FROM normalized;

CREATE TEMP TABLE _p813_corridors (
  pavilion_identifier text NOT NULL,
  corridor_id text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,
  left_m numeric NOT NULL,
  top_m numeric NOT NULL,
  width_m numeric NOT NULL,
  depth_m numeric NOT NULL,
  PRIMARY KEY (pavilion_identifier, corridor_id)
) ON COMMIT DROP;

INSERT INTO _p813_corridors VALUES
  ('B4', 'west-commercial-aisle', 'Corredor comercial esquerdo', 'main',   4.00,  5.00,  3.35, 29.00),
  ('B4', 'east-commercial-aisle', 'Corredor comercial direito',  'main',  14.35,  5.00,  3.35, 30.00),
  ('B4', 'north-distribution',     'Acesso à porta de emergência','access', 5.50,  3.00, 12.20,  2.00),
  ('B4', 'west-cross-access',      'Acesso lateral ao Pavilhão 13','cross', 0.00, 15.00,  7.35,  4.00),
  ('B4', 'east-cross-access',      'Acesso lateral ao Pavilhão 12','cross',14.35, 10.00,  7.35,  4.00),
  ('B4', 'south-entrance',         'Entradas e saídas principais','access', 4.00, 31.00, 13.70,  4.40),
  ('B5', 'northwest-entry',        'Acesso norte',                 'access', 6.40,  0.00,  2.60,  3.00),
  ('B5', 'northeast-entry',        'Acesso norte',                 'access',12.00,  0.00,  2.60,  3.00),
  ('B5', 'north-distribution',     'Circulação norte',             'cross',  3.00,  3.00, 15.00,  3.80),
  ('B5', 'west-main-aisle',        'Corredor principal oeste',     'main',   3.00,  6.80,  4.50, 24.00),
  ('B5', 'east-main-aisle',        'Corredor principal leste',     'main',  13.50,  6.80,  4.50, 24.00),
  ('B5', 'west-cross-access',      'Acesso lateral oeste',         'access', 0.00, 15.50,  7.50,  4.00),
  ('B5', 'east-cross-access',      'Acesso lateral leste',         'access',13.50, 15.50,  7.50,  4.00),
  ('B5', 'south-distribution',     'Circulação e acessos sul',     'main',   3.00, 30.80, 15.00,  4.55);

CREATE TEMP TABLE _p813_support_spaces (
  pavilion_identifier text NOT NULL,
  support_id text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,
  source_precision text NOT NULL,
  left_m numeric NOT NULL,
  top_m numeric NOT NULL,
  width_m numeric NOT NULL,
  depth_m numeric NOT NULL,
  PRIMARY KEY (pavilion_identifier, support_id)
) ON COMMIT DROP;

INSERT INTO _p813_support_spaces VALUES
  ('B4', 'sanitarios',    'Sanitários',       'sanitary', 'plan-traced', 0.00, -7.40,  7.10, 7.40),
  ('B4', 'cozinha',       'Cozinha',          'kitchen',  'plan-traced', 7.10, -7.40, 11.90, 7.40),
  ('B4', 'apoio-cozinha', 'Apoio de serviço', 'service',  'plan-traced',19.00, -6.40,  2.70, 6.40);

DO $$
BEGIN
  IF (SELECT count(*) FROM _p813_cells) <> 217
    OR EXISTS (
      SELECT 1
      FROM _p813_specs spec
      WHERE (SELECT count(*) FROM _p813_cells cell
        WHERE cell.pavilion_identifier = spec.pavilion_identifier) <> spec.module_count
    )
    OR EXISTS (
      SELECT 1 FROM _p813_cells
      WHERE width <= 0 OR depth <= 0
        OR jsonb_array_length(normalized_ring) < 5
        OR jsonb_array_length(render_parts) < 1
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(normalized_ring) point
          WHERE (point->>0)::numeric < 0 OR (point->>0)::numeric > 1
             OR (point->>1)::numeric < 0 OR (point->>1)::numeric > 1
        )
    )
    OR EXISTS (
      SELECT 1
      FROM _p813_specs spec
      WHERE (SELECT sum(reference_area_sqm) FROM _p813_runs run
        WHERE run.pavilion_identifier = spec.pavilion_identifier)
        IS DISTINCT FROM spec.modular_area_sqm
    )
    OR EXISTS (
      SELECT 1
      FROM _p813_specs spec
      WHERE abs(
        (
          SELECT sum(extensions.ST_Area(
            extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(
              jsonb_build_object(
                'type', 'Polygon',
                'coordinates', jsonb_build_array(cell.normalized_ring)
              )::text
            ), 0)
          ))
          FROM _p813_cells cell
          WHERE cell.pavilion_identifier = spec.pavilion_identifier
        )
          * spec.metric_width * spec.metric_depth
          / power(1 - spec.metric_inset * 2, 2)
          - spec.modular_area_sqm
      ) > 0.00000001
    )
    OR (SELECT count(*) FROM _p813_shapes) <> 5
    OR (SELECT count(*) FROM _p813_support_spaces) <> 3
  THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_OFFICIAL_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p813_cells left_module
    JOIN _p813_cells right_module
      ON right_module.pavilion_identifier = left_module.pavilion_identifier
      AND right_module.module_number > left_module.module_number
    WHERE extensions.ST_Area(extensions.ST_Intersection(
      extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(
        jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(left_module.normalized_ring))::text
      ), 0),
      extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(
        jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(right_module.normalized_ring))::text
      ), 0)
    )) > 0.00000001
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_NORMALIZED_OVERLAP_INVALID';
  END IF;
END;
$$;

-- Pais, camada comercial e segmento devem existir de forma canonica. A
-- migration falha fechada diante de aliases ou duplicatas e nunca os renomeia.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p813_specs spec
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities pavilion
        WHERE pavilion.project_id = project.id
          AND upper(pavilion.public_identifier) = spec.pavilion_identifier
          AND pavilion.classification = 'PAVILION'
          AND pavilion.is_archived = false
      ) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p813_specs spec
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND upper(pavilion.public_identifier) = spec.pavilion_identifier
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND pavilion.public_identifier <> spec.pavilion_identifier
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_PARENT_IDENTITY_PRECONDITION_FAILED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    WHERE project.is_archived = false
      AND (SELECT count(*) FROM public.map_layers layer
        WHERE layer.project_id = project.id AND layer.layer_key = 'commercial') <> 1
  ) OR EXISTS (
    SELECT 1
    FROM public.map_projects project
    WHERE project.is_archived = false
      AND (SELECT count(*) FROM public.map_segments segment
        WHERE segment.project_id = project.id
          AND segment.slug = 'industria-comercio-servicos'
          AND segment.is_active = true) <> 1
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_MAP_INFRASTRUCTURE_PRECONDITION_FAILED';
  END IF;
END;
$$;

CREATE TEMP TABLE _p813_frames ON COMMIT DROP AS
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
  CROSS JOIN _p813_specs spec
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
  JOIN public.map_segments segment
    ON segment.project_id = project.id
    AND segment.slug = 'industria-comercio-servicos'
    AND segment.is_active = true
  CROSS JOIN LATERAL jsonb_array_elements(parent_geometry.geometry->'coordinates'->0) point
  WHERE project.is_archived = false
  GROUP BY
    project.id, project.org_id, pavilion.id,
    pavilion.metadata, layer.id, segment.id, parent_geometry.geometry,
    parent_geometry.elevation, parent_geometry.calibration_version,
    spec.pavilion_identifier, spec.pavilion_number, spec.official_name,
    spec.commercial_block, spec.module_count, spec.metric_width,
    spec.metric_depth, spec.metric_inset, spec.facing_radians,
    spec.align_x, spec.align_z, spec.total_area_sqm,
    spec.modular_area_sqm, spec.layout_revision, spec.source_reference,
    spec.source_interpretation
), clear_bounds AS (
  SELECT
    *,
    (min_x + max_x) / 2 AS pavilion_center_x,
    (min_z + max_z) / 2 AS pavilion_center_z,
    CASE WHEN abs(sin(facing_radians::double precision)) > 0.5
      THEN max_z - min_z ELSE max_x - min_x END AS model_width,
    CASE WHEN abs(sin(facing_radians::double precision)) > 0.5
      THEN max_x - min_x ELSE max_z - min_z END AS model_depth,
    LEAST(max_x - min_x, max_z - min_z) AS short_side
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
    LEAST(clear_width / metric_width, clear_depth / metric_depth) AS uniform_scale
  FROM available
), aligned AS (
  SELECT
    *,
    metric_width * uniform_scale AS frame_width,
    metric_depth * uniform_scale AS frame_depth,
    CASE align_x
      WHEN 'start' THEN -(clear_width - metric_width * uniform_scale) / 2
      WHEN 'end' THEN (clear_width - metric_width * uniform_scale) / 2
      ELSE 0
    END AS local_frame_offset_x,
    CASE align_z
      WHEN 'start' THEN -(clear_depth - metric_depth * uniform_scale) / 2
      WHEN 'end' THEN (clear_depth - metric_depth * uniform_scale) / 2
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
  IF (SELECT count(*) FROM _p813_frames)
      <> 2 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT 1 FROM _p813_frames
      WHERE clear_width <= 0 OR clear_depth <= 0 OR uniform_scale <= 0
        OR frame_width > clear_width + 0.00000001
        OR frame_depth > clear_depth + 0.00000001
        OR abs(frame_width / frame_depth - metric_width / metric_depth) > 0.0000000001
    )
  THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_METRIC_FRAME_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _p813_staged ON COMMIT DROP AS
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
    cell.center_x,
    cell.center_z,
    cell.width,
    cell.depth,
    cell.normalized_ring,
    cell.normalized_label_anchor,
    cell.render_parts,
    world.world_ring,
    frame.frame_center_x
      + (((cell.normalized_label_anchor->>0)::numeric - 0.5) * frame.frame_width)
        * frame.cosine
      + (((cell.normalized_label_anchor->>1)::numeric - 0.5) * frame.frame_depth)
        * frame.sine AS world_label_x,
    frame.frame_center_z
      - (((cell.normalized_label_anchor->>0)::numeric - 0.5) * frame.frame_width)
        * frame.sine
      + (((cell.normalized_label_anchor->>1)::numeric - 0.5) * frame.frame_depth)
        * frame.cosine AS world_label_z
  FROM _p813_frames frame
  JOIN _p813_cells cell USING (pavilion_identifier)
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_array(
        frame.frame_center_x
          + (((point->>0)::numeric - 0.5) * frame.frame_width) * frame.cosine
          + (((point->>1)::numeric - 0.5) * frame.frame_depth) * frame.sine,
        frame.frame_center_z
          - (((point->>0)::numeric - 0.5) * frame.frame_width) * frame.sine
          + (((point->>1)::numeric - 0.5) * frame.frame_depth) * frame.cosine
      ) ORDER BY ordinality
    ) AS world_ring
    FROM jsonb_array_elements(cell.normalized_ring)
      WITH ORDINALITY ring_point(point, ordinality)
  ) world
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
    'planCoordinateTransform', 'identity',
    'projectionFit', 'metric-contain',
    'projectionAlignment', jsonb_build_object('x', align_x, 'z', align_z),
    'metricReference', jsonb_build_object(
      'widthM', metric_width,
      'depthM', metric_depth,
      'inset', metric_inset
    ),
    'projectionFrame', jsonb_build_object(
      'width', frame_width,
      'depth', frame_depth,
      'uniformScale', uniform_scale,
      'centerX', frame_center_x,
      'centerZ', frame_center_z
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
      'centerX', center_x,
      'centerZ', center_z,
      'width', width,
      'depth', depth
    ),
    'normalizedFootprintPolygon', normalized_ring,
    'normalizedLabelAnchor', normalized_label_anchor,
    'renderParts', render_parts,
    'labelAnchor', jsonb_build_array(world_label_x, world_label_z),
    'segmentId', 'industria-comercio-servicos',
    'segmentCode', 'INDUSTRIA_COMERCIO_SERVICOS',
    'segmentName', 'Indústria, Comércio e Serviços'
  ) AS structural_metadata
FROM projected;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p813_staged)
      <> 217 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT 1 FROM _p813_staged staged
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
      FROM _p813_staged left_module
      JOIN _p813_staged right_module
        ON right_module.project_id = left_module.project_id
        AND right_module.pavilion_identifier = left_module.pavilion_identifier
        AND right_module.module_number > left_module.module_number
      WHERE extensions.ST_Area(extensions.ST_Intersection(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(left_module.geometry::text), 0),
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(right_module.geometry::text), 0)
      )) > 0.00000001
    )
  THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_STAGED_GEOMETRY_INVALID';
  END IF;
END;
$$;

-- Conflitos de identidade falham. Nenhuma entidade ou lote e reaproveitado por
-- proximidade, renomeado, apagado ou arquivado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _p813_staged staged
      ON staged.project_id = entity.project_id
      AND upper(staged.public_identifier) = upper(entity.public_identifier)
    WHERE entity.public_identifier <> staged.public_identifier
      OR entity.is_archived = true
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR entity.metadata->>'pavilionPublicIdentifier' IS NOT NULL
        AND upper(entity.metadata->>'pavilionPublicIdentifier') <> staged.pavilion_identifier
      OR entity.metadata->>'pavilionModuleKey' IS NOT NULL
        AND upper(entity.metadata->>'pavilionModuleKey') <> upper(staged.pavilion_module_key)
      OR entity.metadata->>'moduleNumber' IS NOT NULL
        AND entity.metadata->>'moduleNumber' <> staged.module_number::text
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_ENTITY_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _p813_staged staged
      ON staged.project_id = entity.project_id
      AND upper(COALESCE(entity.metadata->>'pavilionModuleKey', ''))
        = upper(staged.pavilion_module_key)
    WHERE entity.public_identifier IS DISTINCT FROM staged.public_identifier
      OR entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_MODULE_KEY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p813_frames frame
    JOIN public.map_entities entity
      ON entity.project_id = frame.project_id
      AND entity.parent_entity_id = frame.pavilion_id
      AND entity.classification = 'INTERNAL_STAND'
      AND entity.is_archived = false
    LEFT JOIN _p813_staged staged
      ON staged.project_id = entity.project_id
      AND staged.public_identifier = entity.public_identifier
    WHERE staged.public_identifier IS NULL
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_UNEXPECTED_INTERNAL_STAND_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_lots lot
    JOIN _p813_staged staged
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
    RAISE EXCEPTION 'PAVILIONS_8_13_LOT_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p813_staged staged
    JOIN public.map_entities entity
      ON entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
    JOIN public.commercial_lots lot ON lot.entity_id = entity.id
    WHERE lot.project_id IS DISTINCT FROM staged.project_id
      OR lot.public_identifier IS DISTINCT FROM staged.public_identifier
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
      OR lot.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_ENTITY_LOT_LINK_CONFLICT';
  END IF;
END;
$$;

CREATE TEMP TABLE _p813_existing_entities ON COMMIT DROP AS
SELECT entity.id AS entity_id
FROM _p813_staged staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier;

SELECT entity.id
FROM public.map_entities entity
JOIN _p813_existing_entities target ON target.entity_id = entity.id
FOR UPDATE;

CREATE TEMP TABLE _p813_entity_snapshot ON COMMIT DROP AS
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
JOIN _p813_existing_entities target ON target.entity_id = entity.id;

CREATE TEMP TABLE _p813_existing_lots ON COMMIT DROP AS
SELECT lot.id AS lot_id
FROM _p813_staged staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
JOIN public.commercial_lots lot
  ON lot.project_id = staged.project_id
  AND lot.entity_id = entity.id
  AND lot.archived_at IS NULL;

SELECT lot.id
FROM public.commercial_lots lot
JOIN _p813_existing_lots target ON target.lot_id = lot.id
FOR UPDATE;

CREATE TEMP TABLE _p813_commercial_snapshot ON COMMIT DROP AS
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
JOIN _p813_existing_lots target ON target.lot_id = lot.id;

CREATE TEMP TABLE _p813_geometry_snapshot ON COMMIT DROP AS
SELECT
  geometry.id AS geometry_id,
  geometry.entity_id,
  geometry.geometry,
  geometry.elevation,
  geometry.extrusion_height,
  geometry.rotation,
  geometry.calibration_version,
  geometry.version,
  geometry.change_reason,
  geometry.created_by,
  geometry.created_at,
  (
    geometry.geometry IS DISTINCT FROM staged.geometry
    OR geometry.elevation IS DISTINCT FROM staged.elevation
    OR geometry.extrusion_height IS DISTINCT FROM 0::numeric
    OR geometry.rotation IS DISTINCT FROM staged.facing_radians
    OR geometry.calibration_version IS DISTINCT FROM staged.calibration_version
  ) AS must_version
FROM _p813_staged staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
JOIN public.map_entity_geometries geometry
  ON geometry.project_id = staged.project_id
  AND geometry.entity_id = entity.id
  AND geometry.is_current = true;

SELECT geometry.id
FROM public.map_entity_geometries geometry
JOIN _p813_geometry_snapshot snapshot ON snapshot.geometry_id = geometry.id
FOR UPDATE;

CREATE TEMP TABLE _p813_created_entities (
  entity_id uuid PRIMARY KEY
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.map_entities (
    id, project_id, layer_id, parent_entity_id, public_identifier,
    name, description, classification, verification_status,
    is_sellable, is_archived, segment_id, metadata,
    created_by, updated_by, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), staged.project_id, staged.layer_id, staged.pavilion_id,
    staged.public_identifier, 'Módulo ' || staged.lot_number, NULL,
    'INTERNAL_STAND', 'NEEDS_REVIEW', true, false, staged.segment_id,
    staged.structural_metadata || jsonb_build_object('buyerDataImported', false),
    NULL, NULL, transaction_timestamp(), transaction_timestamp()
  FROM _p813_staged staged
  WHERE NOT EXISTS (
    SELECT 1 FROM public.map_entities entity
    WHERE entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
  )
  ON CONFLICT (project_id, public_identifier) DO NOTHING
  RETURNING id
)
INSERT INTO _p813_created_entities SELECT id FROM inserted;

-- Apenas identidade espacial/segmentacao e metadata estrutural sao reparadas.
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
FROM _p813_staged staged
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

-- Runs, corredores e apoios ficam no pai como infraestrutura descritiva. Eles
-- nao criam entidades vendaveis, lotes, precos ou alvos de raycast.
WITH run_payload AS (
  SELECT
    spec.pavilion_identifier,
    jsonb_agg(
      jsonb_build_object(
        'id', run.run_id,
        'numberRange', jsonb_build_array(run.start_number, run.end_number),
        'role', run.role,
        'group', run.group_key,
        'cluster', run.cluster_key,
        'sequenceOrientation', run.sequence_orientation,
        'orientation', run.module_orientation,
        'normalizedFootprint', jsonb_build_object(
          'centerX', spec.metric_inset
            + ((run.left_m + run.width_m / 2) / spec.metric_width)
              * (1 - spec.metric_inset * 2),
          'centerZ', spec.metric_inset
            + ((run.top_m + run.depth_m / 2) / spec.metric_depth)
              * (1 - spec.metric_inset * 2),
          'width', (run.width_m / spec.metric_width) * (1 - spec.metric_inset * 2),
          'depth', (run.depth_m / spec.metric_depth) * (1 - spec.metric_inset * 2)
        )
      ) ORDER BY run.start_number
    ) AS payload
  FROM _p813_specs spec
  JOIN _p813_runs run USING (pavilion_identifier)
  GROUP BY spec.pavilion_identifier
), corridor_payload AS (
  SELECT
    spec.pavilion_identifier,
    jsonb_agg(
      jsonb_build_object(
        'id', corridor.corridor_id,
        'label', corridor.label,
        'kind', corridor.kind,
        'type', 'circulation-non-commercial',
        'normalizedFootprint', jsonb_build_object(
          'centerX', spec.metric_inset
            + ((corridor.left_m + corridor.width_m / 2) / spec.metric_width)
              * (1 - spec.metric_inset * 2),
          'centerZ', spec.metric_inset
            + ((corridor.top_m + corridor.depth_m / 2) / spec.metric_depth)
              * (1 - spec.metric_inset * 2),
          'width', (corridor.width_m / spec.metric_width) * (1 - spec.metric_inset * 2),
          'depth', (corridor.depth_m / spec.metric_depth) * (1 - spec.metric_inset * 2)
        )
      ) ORDER BY corridor.corridor_id
    ) AS payload
  FROM _p813_specs spec
  JOIN _p813_corridors corridor USING (pavilion_identifier)
  GROUP BY spec.pavilion_identifier
), support_payload AS (
  SELECT
    spec.pavilion_identifier,
    jsonb_agg(
      jsonb_build_object(
        'id', support.support_id,
        'label', support.label,
        'kind', support.kind,
        'type', 'permanent-non-commercial',
        'sourcePrecision', support.source_precision,
        'normalizedFootprint', jsonb_build_object(
          'centerX', spec.metric_inset
            + ((support.left_m + support.width_m / 2) / spec.metric_width)
              * (1 - spec.metric_inset * 2),
          'centerZ', spec.metric_inset
            + ((support.top_m + support.depth_m / 2) / spec.metric_depth)
              * (1 - spec.metric_inset * 2),
          'width', (support.width_m / spec.metric_width) * (1 - spec.metric_inset * 2),
          'depth', (support.depth_m / spec.metric_depth) * (1 - spec.metric_inset * 2)
        )
      ) ORDER BY support.support_id
    ) AS payload
  FROM _p813_specs spec
  JOIN _p813_support_spaces support USING (pavilion_identifier)
  GROUP BY spec.pavilion_identifier
), parent_payload AS (
  SELECT
    spec.pavilion_identifier,
    jsonb_build_object(
      'layoutRevision', spec.layout_revision,
      'source', spec.source_reference,
      'interpretation', spec.source_interpretation,
      'projection', jsonb_build_object(
        'coordinateTransform', 'identity',
        'fit', 'metric-contain',
        'metricWidthM', spec.metric_width,
        'metricDepthM', spec.metric_depth,
        'alignX', spec.align_x,
        'alignZ', spec.align_z
      ),
      'stats', jsonb_build_object(
        'pavilionNumber', spec.pavilion_number,
        'moduleCount', spec.module_count,
        'totalAreaM2', spec.total_area_sqm,
        'modularAreaM2', spec.modular_area_sqm,
        'individualAreaM2', NULL
      ),
      'legendNumberRanges', CASE spec.pavilion_identifier
        WHEN 'B4' THEN '[[1,20],[21,37],[38,89],[90,114]]'::jsonb
        ELSE '[[1,26],[27,29],[30,77],[78,103]]'::jsonb
      END
    ) AS plan_payload,
    run_payload.payload AS runs_payload,
    corridor_payload.payload AS corridors_payload,
    COALESCE(support_payload.payload, '[]'::jsonb) AS supports_payload
  FROM _p813_specs spec
  JOIN run_payload USING (pavilion_identifier)
  JOIN corridor_payload USING (pavilion_identifier)
  LEFT JOIN support_payload USING (pavilion_identifier)
)
UPDATE public.map_entities pavilion
SET
  metadata = COALESCE(pavilion.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'internalOfficialPlan', parent_payload.plan_payload,
      'internalPlanRuns', parent_payload.runs_payload,
      'internalCorridors', parent_payload.corridors_payload,
      'internalSupportSpaces', parent_payload.supports_payload
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
    pavilion.metadata->'internalOfficialPlan' IS DISTINCT FROM parent_payload.plan_payload
    OR pavilion.metadata->'internalPlanRuns' IS DISTINCT FROM parent_payload.runs_payload
    OR pavilion.metadata->'internalCorridors' IS DISTINCT FROM parent_payload.corridors_payload
    OR pavilion.metadata->'internalSupportSpaces' IS DISTINCT FROM parent_payload.supports_payload
  );

CREATE TEMP TABLE _p813_entity_map ON COMMIT DROP AS
SELECT staged.*, entity.id AS entity_id
FROM _p813_staged staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND entity.is_archived = false;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p813_entity_map) <> (SELECT count(*) FROM _p813_staged)
  THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_ENTITY_BACKFILL_INCOMPLETE';
  END IF;
END;
$$;

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
  true, 'Plantas oficiais dos Pavilhões 8 e 13 — Fenasoja 2026',
  NULL, transaction_timestamp(), transaction_timestamp()
FROM _p813_entity_map staged
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
  change_reason = 'Plantas oficiais dos Pavilhões 8 e 13 — Fenasoja 2026',
  updated_at = transaction_timestamp()
FROM _p813_entity_map staged
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

CREATE TEMP TABLE _p813_created_lots (
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
  FROM _p813_entity_map staged
  WHERE NOT EXISTS (
    SELECT 1 FROM public.commercial_lots lot
    WHERE lot.entity_id = staged.entity_id
      OR (lot.project_id = staged.project_id
        AND lot.public_identifier = staged.public_identifier)
  )
  ON CONFLICT DO NOTHING
  RETURNING id, project_id, entity_id
)
INSERT INTO _p813_created_lots SELECT id, project_id, entity_id FROM inserted;

INSERT INTO public.lot_prices (
  id, lot_id, pricing_mode, base_price, price_per_sqm,
  asking_price, minimum_price, is_active, valid_from, valid_until,
  created_by, created_at
)
SELECT
  gen_random_uuid(), created.lot_id, 'NOT_FOR_SALE',
  NULL, NULL, NULL, NULL, true, transaction_timestamp(), NULL,
  NULL, transaction_timestamp()
FROM _p813_created_lots created;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _p813_created_lots created
    JOIN public.commercial_lots lot ON lot.id = created.lot_id
    WHERE lot.status <> 'BLOCKED'
      OR lot.official_area_sqm IS NOT NULL
      OR lot.calculated_area_sqm IS NOT NULL
      OR lot.frontage_meters IS NOT NULL
      OR lot.depth_meters IS NOT NULL
      OR lot.area_validation_status <> 'UNVALIDATED'
      OR lot.commercial_notes IS NOT NULL
      OR lot.internal_notes IS NOT NULL
      OR lot.accessibility_notes IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM _p813_created_lots created
    LEFT JOIN public.lot_prices price
      ON price.lot_id = created.lot_id AND price.is_active = true
    WHERE price.id IS NULL
      OR price.pricing_mode <> 'NOT_FOR_SALE'
      OR price.base_price IS NOT NULL
      OR price.price_per_sqm IS NOT NULL
      OR price.asking_price IS NOT NULL
      OR price.minimum_price IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM _p813_created_lots created
    WHERE EXISTS (SELECT 1 FROM public.lot_reservations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_negotiations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_sales row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_contracts row WHERE row.lot_id = created.lot_id)
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_NEW_LOT_NEUTRALITY_INVALID';
  END IF;
END;
$$;

-- O baseline da comissao ganha 217 entidades/lotes (114 de B4 + 103 de B5).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_segments segment
      ON segment.project_id = project.id
      AND segment.slug = 'industria-comercio-servicos'
      AND segment.is_active = true
    WHERE project.is_archived = false
      AND (
        segment.boundary_data->>'expectedEntityCount' NOT IN ('986', '1203')
        OR segment.boundary_data->>'expectedLotCount' NOT IN ('949', '1166')
        OR segment.boundary_data->'lineageBaselineAt' IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_INDUSTRY_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$$;

UPDATE public.map_segments segment
SET
  source_reference =
    'Plantas oficiais dos Pavilhões 1, 3, 5, 8, 12, 13 e 14 — Fenasoja 2026',
  boundary_data = jsonb_set(
    jsonb_set(segment.boundary_data, '{expectedEntityCount}', '1203'::jsonb, true),
    '{expectedLotCount}', '1166'::jsonb, true
  ),
  updated_at = transaction_timestamp()
FROM public.map_projects project
WHERE project.id = segment.project_id
  AND project.is_archived = false
  AND segment.slug = 'industria-comercio-servicos'
  AND segment.is_active = true
  AND (
    segment.source_reference IS DISTINCT FROM
      'Plantas oficiais dos Pavilhões 1, 3, 5, 8, 12, 13 e 14 — Fenasoja 2026'
    OR segment.boundary_data->>'expectedEntityCount' IS DISTINCT FROM '1203'
    OR segment.boundary_data->>'expectedLotCount' IS DISTINCT FROM '1166'
  );

-- Mantem a inicializacao futura no mesmo baseline. A funcao nao e executada
-- nesta migration, portanto nenhum dado Exporural e tocado.
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
    project_id, slug, name, display_name, source_reference, boundary_data,
    camera_config, visual_config, required_capability
  )
  VALUES
    (
      _project_id,
      'exporural',
      'Exporural',
      'Exporural',
      'Perímetro cadastral oficial Exporural 2026.4',
      '{"resolution":"explicit-entity-union","expectedEntityCount":111,"expectedLotCount":95,"blockIdentifiers":["QUADRA-R","QUADRA-S"],"perimeter":["Rua Ubiretama","Rua Bruno Schwartz","Rua Gustavo Bessel","Rua Emanuel Brachmann"],"excludedIdentifiers":["B7","B8","D3","B35","B36","D6-01","D6-02","D6-03"]}'::jsonb
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
      'Plantas oficiais dos Pavilhões 1, 3, 5, 8, 12, 13 e 14 — Fenasoja 2026',
      '{"resolution":"explicit-entity-union","expectedEntityCount":1203,"expectedLotCount":1166,"blockIdentifiers":["QUADRA-M","QUADRA-G","QUADRA-L","QUADRA-F","QUADRA-J","QUADRA-E","QUADRA-I","QUADRA-D"],"excludedIdentifiers":["Q-G-03","Q-G-04","QUADRA-N","B7","B28","D4","QUADRA-C","QUADRA-B","QUADRA-A","C1","B11","B12","B13","B14","B15","B18","B21","B25","B26","B27","B30","B31","B32","B42-02","G","B8","B9","B10","B39"]}'::jsonb
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
      'lineageBaselineAt', COALESCE(
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
REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_commission_map_segments(uuid) TO service_role;

-- Resolver canonico: B4/B5 vencem metadados legados de quadra/Exporural.
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
    WHEN (
      upper(COALESCE(_public_identifier, ''))
        ~ '^B1-M(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B2-M(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B3-M(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B4-M(00[1-9]|0[1-9][0-9]|10[0-9]|11[0-4])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B5-M(00[1-9]|0[1-9][0-9]|10[0-3])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B6-M(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
      OR (
        upper(COALESCE(_public_identifier, '')) IN (
          '', replace(upper(COALESCE(_metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        )
        AND (
          (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B1'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B1:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B2'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B2:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B3'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B3:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B4'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B4:MODULE:(00[1-9]|0[1-9][0-9]|10[0-9]|11[0-4])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B5'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B5:MODULE:(00[1-9]|0[1-9][0-9]|10[0-3])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B6'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B6:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$')
        )
      )
    ) THEN 'industria-comercio-servicos'
    WHEN (
      upper(COALESCE(_public_identifier, ''))
        ~ '^B8-M(00[1-9]|0[1-7][0-9]|08[01])$'
      OR (
        upper(COALESCE(_public_identifier, '')) IN (
          '', replace(upper(COALESCE(_metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        )
        AND upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B8'
        AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
          ~ '^B8:MODULE:(00[1-9]|0[1-7][0-9]|08[01])$'
      )
    ) THEN NULL
    WHEN upper(COALESCE(_public_identifier, '')) = ANY (ARRAY[
      'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
    ]) THEN NULL
    WHEN upper(COALESCE(_public_identifier, '')) <> ALL (ARRAY['B7', 'B8', 'D3'])
      AND (
        upper(COALESCE(_public_identifier, '')) IN (
          'EXPORURAL', 'QUADRA-R', 'QUADRA-S',
          'RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL',
          'RUA-15-NOVEMBRO', 'RUA-EMANUEL-BRACHMANN',
          'RUA-PASTOR-ALBERT-LEHENBAUER', 'RUA-UBIRETAMA',
          'B37', 'B38', 'C4', 'E-01', 'E-02', 'E-06'
        )
        OR upper(COALESCE(_public_identifier, '')) ~ '^Q-[RS]-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('R', 'S')
        OR upper(COALESCE(_metadata->>'areaCode', '')) = 'EXPORURAL'
      )
    THEN 'exporural'
    WHEN upper(COALESCE(_public_identifier, '')) <> ALL (ARRAY[
      'Q-G-03', 'Q-G-04', 'QUADRA-N', 'B7', 'B28', 'D4',
      'QUADRA-C', 'QUADRA-B', 'QUADRA-A', 'C1',
      'B11', 'B12', 'B13', 'B14', 'B15', 'B18', 'B21',
      'B25', 'B26', 'B27', 'B30', 'B31', 'B32', 'B42-02',
      'G', 'B8', 'B9', 'B10', 'B39'
    ])
      AND (
        upper(COALESCE(_public_identifier, '')) IN (
          'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
          'B16', 'B17', 'B19', 'B23', 'B24', 'B33', 'B34', 'B40', 'B41',
          'C2', 'C3', 'D1', 'D2', 'D3',
          'E-18', 'E-19', 'E-20', 'E-22', 'E-23', 'E-24',
          'RUA-URUGUAI', 'RUA-MONTEVIDEU', 'CALCADA-ARVOREDO'
        )
        OR upper(COALESCE(_public_identifier, '')) ~ '^QUADRA-(M|G|L|F|J|E|I|D)$'
        OR upper(COALESCE(_public_identifier, '')) ~ '^Q-(M|G|L|F|J|E|I|D)-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('M', 'G', 'L', 'F', 'J', 'E', 'I', 'D')
      )
    THEN 'industria-comercio-servicos'
    ELSE NULL
  END;
$$;

-- Validacao final: inventario, identidade, geometrias versionadas, neutralidade
-- dos novos lotes e preservacao byte-a-byte dos registros comerciais antigos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p813_specs spec
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = spec.pavilion_identifier
      AND pavilion.classification = 'PAVILION'
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND (
        (SELECT count(*)
          FROM public.map_entities entity
          WHERE entity.project_id = project.id
            AND entity.parent_entity_id = pavilion.id
            AND entity.classification = 'INTERNAL_STAND'
            AND entity.is_archived = false) <> spec.module_count
        OR (SELECT count(*)
          FROM public.commercial_lots lot
          JOIN public.map_entities entity ON entity.id = lot.entity_id
          WHERE entity.project_id = project.id
            AND entity.parent_entity_id = pavilion.id
            AND entity.classification = 'INTERNAL_STAND'
            AND entity.is_archived = false
            AND lot.archived_at IS NULL) <> spec.module_count
      )
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_FINAL_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p813_entity_map staged
    JOIN public.map_entities entity ON entity.id = staged.entity_id
    LEFT JOIN public.map_entity_geometries geometry
      ON geometry.project_id = staged.project_id
      AND geometry.entity_id = staged.entity_id
      AND geometry.is_current = true
    LEFT JOIN public.commercial_lots lot
      ON lot.project_id = staged.project_id
      AND lot.entity_id = staged.entity_id
      AND lot.archived_at IS NULL
    WHERE entity.public_identifier IS DISTINCT FROM staged.public_identifier
      OR entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR entity.segment_id IS DISTINCT FROM staged.segment_id
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR entity.metadata->>'layoutRevision' IS DISTINCT FROM staged.layout_revision
      OR entity.metadata->>'pavilionModuleKey' IS DISTINCT FROM staged.pavilion_module_key
      OR entity.metadata->>'pavilionPublicIdentifier' IS DISTINCT FROM staged.pavilion_identifier
      OR entity.metadata->'areaM2' IS DISTINCT FROM 'null'::jsonb
      OR entity.metadata->'normalizedFootprintPolygon' IS DISTINCT FROM staged.normalized_ring
      OR entity.metadata->'renderParts' IS DISTINCT FROM staged.render_parts
      OR geometry.id IS NULL
      OR geometry.geometry IS DISTINCT FROM staged.geometry
      OR geometry.rotation IS DISTINCT FROM staged.facing_radians
      OR geometry.extrusion_height IS DISTINCT FROM 0::numeric
      OR lot.id IS NULL
      OR lot.public_identifier IS DISTINCT FROM staged.public_identifier
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_PERSISTED_STATE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p813_entity_snapshot snapshot
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
    RAISE EXCEPTION 'PAVILIONS_8_13_NON_STRUCTURAL_ENTITY_STATE_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p813_geometry_snapshot snapshot
    JOIN public.map_entity_geometries current_geometry
      ON current_geometry.id = snapshot.geometry_id
      AND current_geometry.is_current = true
    WHERE (
      snapshot.must_version
      AND (
        current_geometry.version <> snapshot.version + 1
        OR NOT EXISTS (
          SELECT 1
          FROM public.map_geometry_versions history
          WHERE history.entity_id = snapshot.entity_id
            AND history.geometry_id = snapshot.geometry_id
            AND history.version = snapshot.version
            AND history.geometry = snapshot.geometry
            AND history.elevation = snapshot.elevation
            AND history.extrusion_height = snapshot.extrusion_height
            AND history.rotation = snapshot.rotation
            AND history.calibration_version IS NOT DISTINCT FROM snapshot.calibration_version
            AND history.change_reason = snapshot.change_reason
            AND history.created_by IS NOT DISTINCT FROM snapshot.created_by
            AND history.created_at = snapshot.created_at
        )
      )
    ) OR (
      NOT snapshot.must_version
      AND current_geometry.version <> snapshot.version
    )
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_GEOMETRY_VERSIONING_INVALID';
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
      JOIN _p813_existing_lots target ON target.lot_id = lot.id
    )
    SELECT 1
    FROM _p813_commercial_snapshot previous
    FULL JOIN current_state current USING (lot_id)
    WHERE current.lot_id IS NULL
      OR previous.lot_id IS NULL
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
    RAISE EXCEPTION 'PAVILIONS_8_13_COMMERCIAL_STATE_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier IN ('B4', 'B5')
      AND pavilion.classification = 'PAVILION'
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND (
        pavilion.metadata->'internalOfficialPlan'->>'layoutRevision'
          IS DISTINCT FROM CASE pavilion.public_identifier
            WHEN 'B4' THEN '2026.4-p8.1' ELSE '2026.4-p13.1' END
        OR jsonb_array_length(pavilion.metadata->'internalPlanRuns')
          IS DISTINCT FROM CASE pavilion.public_identifier WHEN 'B4' THEN 8 ELSE 11 END
        OR jsonb_array_length(pavilion.metadata->'internalCorridors')
          IS DISTINCT FROM CASE pavilion.public_identifier WHEN 'B4' THEN 6 ELSE 8 END
        OR jsonb_array_length(pavilion.metadata->'internalSupportSpaces')
          IS DISTINCT FROM CASE pavilion.public_identifier WHEN 'B4' THEN 3 ELSE 0 END
      )
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_PARENT_METADATA_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_segments segment
      ON segment.project_id = project.id
      AND segment.slug = 'industria-comercio-servicos'
      AND segment.is_active = true
    WHERE project.is_archived = false
      AND (
        segment.source_reference IS DISTINCT FROM
          'Plantas oficiais dos Pavilhões 1, 3, 5, 8, 12, 13 e 14 — Fenasoja 2026'
        OR segment.boundary_data->>'expectedEntityCount' IS DISTINCT FROM '1203'
        OR segment.boundary_data->>'expectedLotCount' IS DISTINCT FROM '1166'
        OR NOT public.map_segment_is_complete(segment.id)
      )
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_INDUSTRY_SEGMENT_INVALID';
  END IF;

  IF public.resolve_commission_map_segment_slug(
      'B4-M114', jsonb_build_object('block', 'R', 'areaCode', 'EXPORURAL')
    ) IS DISTINCT FROM 'industria-comercio-servicos'
    OR public.resolve_commission_map_segment_slug(
      NULL, jsonb_build_object(
        'pavilionPublicIdentifier', 'B4',
        'pavilionModuleKey', 'B4:module:001',
        'areaCode', 'EXPORURAL'
      )
    ) IS DISTINCT FROM 'industria-comercio-servicos'
    OR public.resolve_commission_map_segment_slug(
      'B5-M103', jsonb_build_object('block', 'S', 'areaCode', 'EXPORURAL')
    ) IS DISTINCT FROM 'industria-comercio-servicos'
    OR public.resolve_commission_map_segment_slug(
      NULL, jsonb_build_object(
        'pavilionPublicIdentifier', 'B5',
        'pavilionModuleKey', 'B5:module:001',
        'areaCode', 'EXPORURAL'
      )
    ) IS DISTINCT FROM 'industria-comercio-servicos'
  THEN
    RAISE EXCEPTION 'PAVILIONS_8_13_CANONICAL_RESOLVER_INVALID';
  END IF;
END;
$$;

COMMIT;
