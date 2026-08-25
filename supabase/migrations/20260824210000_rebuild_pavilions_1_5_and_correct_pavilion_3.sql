-- Pavilhões 1, 3 e 5: inventários internos oficiais e comercialmente neutros.
-- Escopo deliberadamente estreito:
--   * B1/Pavilhão 1 integra Indústria, Comércio e Serviços;
--   * B8/Pavilhão 5 permanece fora dos segmentos de comissão;
--   * B6/Pavilhão 3 é corrigido in-place, preservando entidades, lotes e histórico.
-- Nenhuma área individual, empresa ou relação comercial é inferida.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('commercial-map:pavilions-1-3-5:' || project.id::text, 0)
)
FROM public.map_projects project
WHERE project.is_archived = false
ORDER BY project.id;

-- A migração não altera nenhuma linha Exporural. O snapshot final torna essa
-- fronteira verificável, inclusive para metadados, timestamps e configuração.
CREATE TEMP TABLE _p135_exporural_snapshot ON COMMIT DROP AS
SELECT segment.id, to_jsonb(segment) AS row_state
FROM public.map_segments segment
WHERE segment.slug = 'exporural';

-- Mantém a inicialização futura idempotente. O ramo Exporural abaixo é uma
-- cópia literal da definição anterior; apenas a fonte e os totais da indústria
-- incorporam P1/P3/P5/P12/P14. A função não é executada nesta migração.
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
      'Plantas oficiais dos Pavilhões 1, 3, 5, 12 e 14 — Fenasoja 2026',
      '{"resolution":"explicit-entity-union","expectedEntityCount":986,"expectedLotCount":949,"blockIdentifiers":["QUADRA-M","QUADRA-G","QUADRA-L","QUADRA-F","QUADRA-J","QUADRA-E","QUADRA-I","QUADRA-D"],"excludedIdentifiers":["Q-G-03","Q-G-04","QUADRA-N","B7","B28","D4","QUADRA-C","QUADRA-B","QUADRA-A","C1","B11","B12","B13","B14","B15","B18","B21","B25","B26","B27","B30","B31","B32","B42-02","G","B8","B9","B10","B39"]}'::jsonb
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

-- Regras canônicas estritas para filhos de pavilhões. B8 recebe uma guarda
-- explícita NULL antes das regras legadas de Exporural, evitando que areaCode ou
-- block antigos capturem um módulo do Pavilhão 5.
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
        ~ '^B6-M(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
      OR (
        upper(COALESCE(_public_identifier, '')) IN (
          '',
          replace(upper(COALESCE(_metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        )
        AND (
          (
            upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B1'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B1:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$'
          )
          OR (
            upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B2'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B2:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$'
          )
          OR (
            upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B3'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B3:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$'
          )
          OR (
            upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B6'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B6:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
          )
        )
      )
    )
    THEN 'industria-comercio-servicos'
    WHEN (
      upper(COALESCE(_public_identifier, ''))
        ~ '^B8-M(00[1-9]|0[1-7][0-9]|08[01])$'
      OR (
        upper(COALESCE(_public_identifier, '')) IN (
          '',
          replace(upper(COALESCE(_metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        )
        AND upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B8'
        AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
          ~ '^B8:MODULE:(00[1-9]|0[1-7][0-9]|08[01])$'
      )
    )
    THEN NULL
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

CREATE TEMP TABLE _p135_specs (
  pavilion_identifier text PRIMARY KEY,
  pavilion_number integer NOT NULL,
  official_name text NOT NULL,
  commercial_block text NOT NULL,
  module_count integer NOT NULL,
  facing_radians numeric NOT NULL,
  metric_width numeric,
  metric_depth numeric,
  metric_inset numeric NOT NULL DEFAULT 0.02,
  layout_revision text NOT NULL,
  source_reference text NOT NULL,
  segment_slug text
) ON COMMIT DROP;

INSERT INTO _p135_specs VALUES
  ('B1', 1, 'Pavilhão 1 — Indústria, Comércio e Serviços', 'P1', 189,
    round((pi() / 2)::numeric, 6), 52.70, 22.84, 0.02, '2026.4-p1.1',
    'Croqui Pavilhão 1 - Fenasoja 2026.pdf',
    'industria-comercio-servicos'),
  ('B8', 5, 'Pavilhão 5 — Veterinária, Pequenos Animais e Rações', 'P5', 81,
    0, 25.50, 43.50, 0.02, '2026.4-p5.1',
    'Croqui Pavilhão 5 - Fenasoja 2026.pdf',
    NULL),
  ('B6', 3, 'Pavilhão 3 — Indústria e Comércio', 'P3', 214,
    round(pi()::numeric, 6), NULL, NULL, 0.02, '2026.4-p3.3',
    'Croqui Pavilhão 3 - Fenasoja 2026.pdf',
    'industria-comercio-servicos');

CREATE TEMP TABLE _p135_runs (
  pavilion_identifier text NOT NULL REFERENCES _p135_specs(pavilion_identifier),
  run_id text NOT NULL,
  start_number integer NOT NULL,
  end_number integer NOT NULL,
  left_value numeric NOT NULL,
  top_value numeric NOT NULL,
  width_value numeric NOT NULL,
  depth_value numeric NOT NULL,
  coordinate_space text NOT NULL CHECK (coordinate_space IN ('metric', 'normalized')),
  sequence_orientation text NOT NULL CHECK (sequence_orientation IN ('X+', 'X-', 'Z+', 'Z-')),
  module_orientation text NOT NULL CHECK (module_orientation IN ('east-west', 'north-south')),
  group_key text NOT NULL,
  cluster_key text NOT NULL,
  module_gap numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (pavilion_identifier, run_id)
) ON COMMIT DROP;

-- B1 — medidas métricas literais da planta oficial 52,70 m × 22,84 m.
INSERT INTO _p135_runs VALUES
  ('B1', 'west-01-06',          1,   6,  0.00, 13.84,  3.00,  6.00, 'metric', 'Z+', 'east-west',   'perimeter-west',  'west-01-06', 0),
  ('B1', 'south-07-57',         7,  57,  0.00, 19.84, 51.00,  3.00, 'metric', 'X+', 'north-south', 'perimeter-south', 'south-07-57', 0),
  ('B1', 'south-58',           58,  58, 51.00, 19.84,  1.50,  3.00, 'metric', 'X+', 'north-south', 'perimeter-south', 'south-58', 0),
  ('B1', 'east-59-64',         59,  64, 49.20, 13.84,  3.50,  6.00, 'metric', 'Z-', 'east-west',   'perimeter-east',  'east-59-64', 0),
  ('B1', 'central-south-65-102',65,102,  7.35, 11.42, 38.00,  3.00, 'metric', 'X-', 'north-south', 'central-pair',    'central-south-65-102', 0),
  ('B1', 'central-north-103-140',103,140, 7.35,  8.42, 38.00,  3.00, 'metric', 'X+', 'north-south', 'central-pair',    'central-north-103-140', 0),
  ('B1', 'north-142-189',     142, 189,  0.00,  0.00, 48.00,  3.00, 'metric', 'X-', 'north-south', 'perimeter-north', 'north-142-189', 0);

-- B8 — módulos de exposição; depósitos e alojamentos são espaços permanentes
-- não comerciais e são persistidos separadamente no metadata do pavilhão.
INSERT INTO _p135_runs VALUES
  ('B8', 'east-bottom-01',       1,  1, 8.70, 42.00, 3.00,  1.50, 'metric', 'Z+', 'east-west', 'commercial-u', 'east-bottom-01', 0),
  ('B8', 'east-02-43',           2, 43, 8.70,  0.00, 3.00, 42.00, 'metric', 'Z-', 'east-west', 'commercial-u', 'east-02-43', 0),
  ('B8', 'west-north-44-62',    44, 62, 0.00,  0.00, 3.00, 19.00, 'metric', 'Z+', 'east-west', 'commercial-u', 'west-north-44-62', 0),
  ('B8', 'west-south-63-81',    63, 81, 0.00, 24.50, 3.00, 19.00, 'metric', 'Z+', 'east-west', 'commercial-u', 'west-south-63-81', 0);

-- B6 — quatro colunas pareadas de 32 módulos. As demais faixas permanecem
-- idênticas à revisão p3.2.
WITH dimensions AS (
  SELECT
    (0.47::numeric - 0.0015::numeric * 27) / 28 AS standard_cell_depth
), paired AS (
  SELECT standard_cell_depth * 32 + 0.0015::numeric * 31 AS paired_depth
  FROM dimensions
)
INSERT INTO _p135_runs
SELECT * FROM (VALUES
  ('B6', 'perimeter-01-19', 1, 19, 0.0275::numeric, 0.0800::numeric, 0.0750::numeric, 0.3600::numeric, 'normalized', 'Z+', 'east-west', 'perimeter-west', 'perimeter-01-19', 0.0015::numeric),
  ('B6', 'perimeter-20-36', 20, 36, 0.0275, 0.5200, 0.0750, 0.3200, 'normalized', 'Z+', 'east-west', 'perimeter-west', 'perimeter-20-36', 0.0015),
  ('B6', 'perimeter-37-40', 37, 40, 0.1950, 0.8725, 0.1800, 0.0750, 'normalized', 'X+', 'north-south', 'perimeter-south', 'perimeter-37-40', 0.0015),
  ('B6', 'perimeter-41-47', 41, 47, 0.4900, 0.8725, 0.3000, 0.0750, 'normalized', 'X+', 'north-south', 'perimeter-south', 'perimeter-41-47', 0.0015),
  ('B6', 'perimeter-176-214', 176, 214, 0.9025, 0.1000, 0.0750, 0.7600, 'normalized', 'Z+', 'east-west', 'perimeter-east', 'perimeter-176-214', 0.0015)
) AS fixed(
  pavilion_identifier, run_id, start_number, end_number,
  left_value, top_value, width_value, depth_value, coordinate_space,
  sequence_orientation, module_orientation, group_key, cluster_key, module_gap
)
UNION ALL
SELECT * FROM (
  SELECT 'B6', 'island-1-east-column', 48, 79,
    0.4325::numeric - 0.095::numeric / 2, 0.2::numeric, 0.095::numeric, paired_depth,
    'normalized', 'Z-', 'east-west', 'island-1', 'island-1-east-column', 0.0015::numeric
  FROM paired
  UNION ALL
  SELECT 'B6', 'island-1-west-column', 80, 111,
    0.3275 - 0.095 / 2, 0.2, 0.095, paired_depth,
    'normalized', 'Z+', 'east-west', 'island-1', 'island-1-west-column', 0.0015
  FROM paired
  UNION ALL
  SELECT 'B6', 'island-2-east-column', 112, 143,
    0.7025 - 0.095 / 2, 0.2, 0.095, paired_depth,
    'normalized', 'Z-', 'east-west', 'island-2', 'island-2-east-column', 0.0015
  FROM paired
  UNION ALL
  SELECT 'B6', 'island-2-west-column', 144, 175,
    0.5975 - 0.095 / 2, 0.2, 0.095, paired_depth,
    'normalized', 'Z+', 'east-west', 'island-2', 'island-2-west-column', 0.0015
  FROM paired
) paired_runs;

CREATE TEMP TABLE _p135_cells (
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
    CASE
      WHEN run.sequence_orientation IN ('X-', 'Z-')
        THEN run.end_number - module_number
      ELSE module_number - run.start_number
    END AS spatial_index
  FROM _p135_runs run
  JOIN _p135_specs spec USING (pavilion_identifier)
  CROSS JOIN LATERAL generate_series(run.start_number, run.end_number) module_number
), normalized_runs AS (
  SELECT
    *,
    CASE WHEN coordinate_space = 'metric'
      THEN metric_inset + (left_value / metric_width) * (1 - metric_inset * 2)
      ELSE left_value
    END AS normalized_left,
    CASE WHEN coordinate_space = 'metric'
      THEN metric_inset + (top_value / metric_depth) * (1 - metric_inset * 2)
      ELSE top_value
    END AS normalized_top,
    CASE WHEN coordinate_space = 'metric'
      THEN (width_value / metric_width) * (1 - metric_inset * 2)
      ELSE width_value
    END AS normalized_width,
    CASE WHEN coordinate_space = 'metric'
      THEN (depth_value / metric_depth) * (1 - metric_inset * 2)
      ELSE depth_value
    END AS normalized_depth,
    module_gap AS normalized_gap
  FROM expanded
), measured AS (
  SELECT
    *,
    CASE WHEN sequence_orientation LIKE 'X%'
      THEN (normalized_width - normalized_gap * (module_count - 1)) / module_count
      ELSE normalized_width
    END AS cell_width,
    CASE WHEN sequence_orientation LIKE 'Z%'
      THEN (normalized_depth - normalized_gap * (module_count - 1)) / module_count
      ELSE normalized_depth
    END AS cell_depth
  FROM normalized_runs
), placed AS (
  SELECT
    *,
    CASE WHEN sequence_orientation LIKE 'X%'
      THEN normalized_left + spatial_index * (cell_width + normalized_gap) + cell_width / 2
      ELSE normalized_left + normalized_width / 2
    END AS cell_center_x,
    CASE WHEN sequence_orientation LIKE 'Z%'
      THEN normalized_top + spatial_index * (cell_depth + normalized_gap) + cell_depth / 2
      ELSE normalized_top + normalized_depth / 2
    END AS cell_center_z
  FROM measured
)
INSERT INTO _p135_cells
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
    'centerX', cell_center_x, 'centerZ', cell_center_z,
    'width', cell_width, 'depth', cell_depth
  ))
FROM placed;

-- B1-M141 é um único módulo em L; não é aproximado por um retângulo comercial.
WITH spec AS (
  SELECT * FROM _p135_specs WHERE pavilion_identifier = 'B1'
), projected AS (
  SELECT
    metric_inset,
    metric_width,
    metric_depth,
    1 - metric_inset * 2 AS usable
  FROM spec
), points AS (
  SELECT
    metric_inset + (x / metric_width) * usable AS x,
    metric_inset + (z / metric_depth) * usable AS z,
    ordinality
  FROM projected
  CROSS JOIN LATERAL (VALUES
    (48.0::numeric, 0.0::numeric, 1),
    (52.7, 0.0, 2),
    (52.7, 4.5, 3),
    (49.2, 4.5, 4),
    (49.2, 3.0, 5),
    (48.0, 3.0, 6),
    (48.0, 0.0, 7)
  ) point(x, z, ordinality)
), ring AS (
  SELECT jsonb_agg(jsonb_build_array(x, z) ORDER BY ordinality) AS normalized_ring
  FROM points
), dimensions AS (
  SELECT
    metric_inset + (50.35 / metric_width) * usable AS center_x,
    metric_inset + (2.25 / metric_depth) * usable AS center_z,
    metric_inset + (1.50 / metric_depth) * usable AS label_z,
    (4.7 / metric_width) * usable AS width,
    (4.5 / metric_depth) * usable AS depth,
    metric_inset + (48.0 / metric_width) * usable AS part1_left,
    metric_inset + (0.0 / metric_depth) * usable AS part1_top,
    (4.7 / metric_width) * usable AS part1_width,
    (3.0 / metric_depth) * usable AS part1_depth,
    metric_inset + (49.2 / metric_width) * usable AS part2_left,
    metric_inset + (3.0 / metric_depth) * usable AS part2_top,
    (3.5 / metric_width) * usable AS part2_width,
    (1.5 / metric_depth) * usable AS part2_depth
  FROM projected
)
INSERT INTO _p135_cells
SELECT
  'B1', 141, 'B1-M141', 'B1:module:141', '141',
  'northeast-141', 'perimeter-north', 'northeast-141',
  'X+', 'north-south',
  dimensions.center_x, dimensions.center_z, dimensions.width, dimensions.depth,
  ring.normalized_ring,
  jsonb_build_array(dimensions.center_x, dimensions.label_z),
  jsonb_build_array(
    jsonb_build_object(
      'centerX', dimensions.part1_left + dimensions.part1_width / 2,
      'centerZ', dimensions.part1_top + dimensions.part1_depth / 2,
      'width', dimensions.part1_width, 'depth', dimensions.part1_depth
    ),
    jsonb_build_object(
      'centerX', dimensions.part2_left + dimensions.part2_width / 2,
      'centerZ', dimensions.part2_top + dimensions.part2_depth / 2,
      'width', dimensions.part2_width, 'depth', dimensions.part2_depth
    )
  )
FROM ring CROSS JOIN dimensions;

CREATE TEMP TABLE _p135_b8_support_spaces (
  id text PRIMARY KEY,
  label text NOT NULL,
  kind text NOT NULL,
  left_m numeric NOT NULL,
  top_m numeric NOT NULL,
  width_m numeric NOT NULL,
  depth_m numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO _p135_b8_support_spaces VALUES
  ('deposito-fenasoja', 'Depósito Fenasoja', 'storage', 11.7,  8.0, 7.8, 15.4),
  ('deposito-hortigranjeiros', 'Depósito Hortigranjeiros', 'storage', 11.7, 23.4, 7.8, 8.7),
  ('alojamento-peoes', 'Alojamento Peões', 'accommodation', 19.5,  8.0, 6.0, 14.1),
  ('alojamento-peoas', 'Alojamento Peoas', 'accommodation', 19.5, 22.1, 6.0, 10.0);

DO $$
BEGIN
  IF (SELECT count(*) FROM _p135_cells) <> 484
    OR EXISTS (
      SELECT 1
      FROM _p135_specs spec
      WHERE (SELECT count(*) FROM _p135_cells cell
        WHERE cell.pavilion_identifier = spec.pavilion_identifier) <> spec.module_count
    )
    OR EXISTS (
      SELECT 1 FROM _p135_cells
      WHERE width <= 0 OR depth <= 0
        OR jsonb_array_length(normalized_ring) < 4
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(normalized_ring) point
          WHERE (point->>0)::numeric < 0 OR (point->>0)::numeric > 1
             OR (point->>1)::numeric < 0 OR (point->>1)::numeric > 1
        )
    )
  THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_OFFICIAL_CELL_INVENTORY_INVALID';
  END IF;

  -- As áreas abaixo são as somas literais dos blocos métricos da referência,
  -- não áreas atribuídas a lotes individuais. Os gaps são apenas cartográficos.
  IF (
      SELECT sum(width_value * depth_value) + 19.35::numeric
      FROM _p135_runs
      WHERE pavilion_identifier = 'B1'
    ) IS DISTINCT FROM 587.85::numeric
    OR (
      SELECT sum(width_value * depth_value)
      FROM _p135_runs
      WHERE pavilion_identifier = 'B8'
    ) IS DISTINCT FROM 244.50::numeric
  THEN
    RAISE EXCEPTION 'PAVILIONS_1_5_OFFICIAL_MODULAR_AREA_INVALID';
  END IF;

  IF (SELECT count(*) FROM _p135_b8_support_spaces) <> 4
    OR EXISTS (
      SELECT 1
      FROM _p135_b8_support_spaces support
      WHERE support.left_m < 0 OR support.top_m < 0
        OR support.width_m <= 0 OR support.depth_m <= 0
        OR support.left_m + support.width_m > 25.50
        OR support.top_m + support.depth_m > 43.50
    )
    OR EXISTS (
      SELECT 1
      FROM _p135_b8_support_spaces left_space
      JOIN _p135_b8_support_spaces right_space
        ON right_space.id > left_space.id
       AND LEAST(
         left_space.left_m + left_space.width_m,
         right_space.left_m + right_space.width_m
       ) > GREATEST(left_space.left_m, right_space.left_m)
       AND LEAST(
         left_space.top_m + left_space.depth_m,
         right_space.top_m + right_space.depth_m
       ) > GREATEST(left_space.top_m, right_space.top_m)
    )
  THEN
    RAISE EXCEPTION 'PAVILION_5_SUPPORT_SPACE_INVENTORY_INVALID';
  END IF;
END;
$$;

-- A migração requer pais canônicos já existentes. Aliases, duplicatas e
-- classificações divergentes falham fechadas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p135_specs spec
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities pavilion
        WHERE pavilion.project_id = project.id
          AND pavilion.is_archived = false
          AND upper(pavilion.public_identifier) = spec.pavilion_identifier
          AND pavilion.classification = 'PAVILION'
      ) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p135_specs spec
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND upper(pavilion.public_identifier) = spec.pavilion_identifier
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND pavilion.public_identifier <> spec.pavilion_identifier
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_PARENT_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = 'B8'
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND pavilion.segment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAVILION_5_PARENT_SEGMENT_MUST_REMAIN_NULL';
  END IF;
END;
$$;

CREATE TEMP TABLE _p135_footprints ON COMMIT DROP AS
WITH world_bounds AS (
  SELECT
    project.id AS project_id,
    project.org_id,
    pavilion.id AS pavilion_id,
    layer.id AS layer_id,
    industry_segment.id AS industry_segment_id,
    geometry.elevation,
    geometry.calibration_version,
    spec.*,
    min((point->>0)::numeric) AS min_x,
    max((point->>0)::numeric) AS max_x,
    min((point->>1)::numeric) AS min_z,
    max((point->>1)::numeric) AS max_z
  FROM public.map_projects project
  CROSS JOIN _p135_specs spec
  JOIN public.map_entities pavilion
    ON pavilion.project_id = project.id
    AND pavilion.public_identifier = spec.pavilion_identifier
    AND pavilion.classification = 'PAVILION'
    AND pavilion.is_archived = false
  JOIN public.map_layers layer
    ON layer.project_id = project.id
    AND layer.layer_key = 'commercial'
  JOIN public.map_entity_geometries geometry
    ON geometry.project_id = project.id
    AND geometry.entity_id = pavilion.id
    AND geometry.is_current = true
  JOIN public.map_segments industry_segment
    ON industry_segment.project_id = project.id
    AND industry_segment.slug = 'industria-comercio-servicos'
    AND industry_segment.is_active = true
  CROSS JOIN LATERAL jsonb_array_elements(geometry.geometry->'coordinates'->0) point
  WHERE project.is_archived = false
  GROUP BY
    project.id, project.org_id, pavilion.id, layer.id, industry_segment.id,
    geometry.elevation, geometry.calibration_version,
    spec.pavilion_identifier, spec.pavilion_number, spec.official_name,
    spec.commercial_block, spec.module_count, spec.facing_radians,
    spec.metric_width, spec.metric_depth, spec.metric_inset,
    spec.layout_revision, spec.source_reference, spec.segment_slug
), model_bounds AS (
  SELECT
    *,
    (min_x + max_x) / 2 AS pavilion_center_x,
    (min_z + max_z) / 2 AS pavilion_center_z,
    CASE WHEN abs(sin(facing_radians::double precision)) > 0.5
      THEN max_z - min_z ELSE max_x - min_x END AS model_width,
    CASE WHEN abs(sin(facing_radians::double precision)) > 0.5
      THEN max_x - min_x ELSE max_z - min_z END AS model_depth
  FROM world_bounds
)
SELECT
  *,
  model_width - 2 * LEAST(model_width, model_depth) * 0.025
    - 2 * LEAST(model_width, model_depth) * 0.065 AS clear_width,
  model_depth - 2 * LEAST(model_width, model_depth) * 0.025
    - 2 * LEAST(model_width, model_depth) * 0.065 AS clear_depth
FROM model_bounds;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p135_footprints)
      <> 3 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT 1 FROM _p135_footprints
      WHERE clear_width <= 0 OR clear_depth <= 0
    )
  THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_CLEAR_FOOTPRINT_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _p135_staged_modules ON COMMIT DROP AS
WITH projected AS (
  SELECT
    footprint.*,
    cell.*,
    CASE WHEN footprint.segment_slug IS NULL
      THEN NULL ELSE footprint.industry_segment_id END AS segment_id,
    cos(footprint.facing_radians::double precision)::numeric AS cosine,
    sin(footprint.facing_radians::double precision)::numeric AS sine
  FROM _p135_footprints footprint
  JOIN _p135_cells cell USING (pavilion_identifier)
), transformed AS (
  SELECT
    projected.*,
    world.world_ring,
    projected.pavilion_center_x
      + (((projected.normalized_label_anchor->>0)::numeric - 0.5) * projected.clear_width)
        * projected.cosine
      + (((projected.normalized_label_anchor->>1)::numeric - 0.5) * projected.clear_depth)
        * projected.sine AS world_label_x,
    projected.pavilion_center_z
      - (((projected.normalized_label_anchor->>0)::numeric - 0.5) * projected.clear_width)
        * projected.sine
      + (((projected.normalized_label_anchor->>1)::numeric - 0.5) * projected.clear_depth)
        * projected.cosine AS world_label_z
  FROM projected
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_array(
        projected.pavilion_center_x
          + (((point->>0)::numeric - 0.5) * projected.clear_width) * projected.cosine
          + (((point->>1)::numeric - 0.5) * projected.clear_depth) * projected.sine,
        projected.pavilion_center_z
          - (((point->>0)::numeric - 0.5) * projected.clear_width) * projected.sine
          + (((point->>1)::numeric - 0.5) * projected.clear_depth) * projected.cosine
      )
      ORDER BY ordinality
    ) AS world_ring
    FROM jsonb_array_elements(projected.normalized_ring)
      WITH ORDINALITY ring_point(point, ordinality)
  ) world
)
SELECT
  transformed.*,
  jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(world_ring)
  ) AS geometry,
  (
    jsonb_build_object(
      'seedManaged', true,
      'sourceRevision', '2026.4',
      'layoutRevision', layout_revision,
      'source', source_reference,
      'cartographicConfidence', 'official_metric_reference',
      'parentPublicIdentifier', pavilion_identifier,
      'pavilionPublicIdentifier', pavilion_identifier,
      'pavilionModuleKey', pavilion_module_key,
      'pavilionNumber', pavilion_number,
      'commercialBlock', commercial_block,
      'moduleNumber', module_number,
      'lotNumber', lot_number,
      'orientation', module_orientation,
      'sequenceOrientation', CASE sequence_orientation
        WHEN 'X+' THEN 'x-increasing'
        WHEN 'X-' THEN 'x-decreasing'
        WHEN 'Z+' THEN 'z-increasing'
        WHEN 'Z-' THEN 'z-decreasing'
      END,
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
      'renderParts', render_parts,
      'normalizedLabelAnchor', normalized_label_anchor,
      'labelAnchor', jsonb_build_array(world_label_x, world_label_z)
    )
    || CASE WHEN segment_slug IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'segmentId', 'industria-comercio-servicos',
      'segmentCode', 'INDUSTRIA_COMERCIO_SERVICOS',
      'segmentName', 'Indústria, Comércio e Serviços'
    ) END
  ) AS structural_metadata
FROM transformed;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p135_staged_modules)
      <> 484 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT 1
      FROM _p135_staged_modules
      WHERE NOT extensions.ST_IsValid(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry::text), 0)
      )
    )
    OR EXISTS (
      SELECT 1
      FROM _p135_staged_modules left_module
      JOIN _p135_staged_modules right_module
        ON right_module.project_id = left_module.project_id
        AND right_module.pavilion_identifier = left_module.pavilion_identifier
        AND right_module.module_number > left_module.module_number
      WHERE extensions.ST_Area(extensions.ST_Intersection(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(left_module.geometry::text), 0),
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(right_module.geometry::text), 0)
      )) > 0.00000001
    )
  THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_STAGED_GEOMETRY_INVALID';
  END IF;
END;
$$;

-- Preflight de identidade. Nenhuma linha conflitante é renomeada, arquivada,
-- desvinculada ou reaproveitada por aproximação.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _p135_staged_modules staged
      ON staged.project_id = entity.project_id
      AND upper(staged.public_identifier) = upper(entity.public_identifier)
    WHERE entity.public_identifier <> staged.public_identifier
      OR entity.is_archived = true
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR entity.segment_id IS DISTINCT FROM staged.segment_id
      OR entity.metadata->>'pavilionPublicIdentifier' IS NOT NULL
        AND upper(entity.metadata->>'pavilionPublicIdentifier') <> staged.pavilion_identifier
      OR entity.metadata->>'pavilionModuleKey' IS NOT NULL
        AND upper(entity.metadata->>'pavilionModuleKey') <> upper(staged.pavilion_module_key)
      OR entity.metadata->>'moduleNumber' IS NOT NULL
        AND entity.metadata->>'moduleNumber' <> staged.module_number::text
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_ENTITY_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _p135_staged_modules staged
      ON staged.project_id = entity.project_id
      AND upper(COALESCE(entity.metadata->>'pavilionModuleKey', ''))
        = upper(staged.pavilion_module_key)
    WHERE entity.public_identifier IS DISTINCT FROM staged.public_identifier
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_MODULE_KEY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p135_footprints footprint
    JOIN public.map_entities entity
      ON entity.project_id = footprint.project_id
      AND entity.parent_entity_id = footprint.pavilion_id
      AND entity.classification = 'INTERNAL_STAND'
      AND entity.is_archived = false
    LEFT JOIN _p135_staged_modules staged
      ON staged.project_id = entity.project_id
      AND staged.public_identifier = entity.public_identifier
    WHERE staged.public_identifier IS NULL
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_UNEXPECTED_INTERNAL_STAND_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_lots lot
    JOIN _p135_staged_modules staged
      ON staged.project_id = lot.project_id
      AND upper(staged.public_identifier) = upper(lot.public_identifier)
    LEFT JOIN public.map_entities entity
      ON entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
    WHERE lot.public_identifier <> staged.public_identifier
      OR lot.archived_at IS NOT NULL
      OR entity.id IS NULL
      OR lot.entity_id IS DISTINCT FROM entity.id
      OR lot.block IS DISTINCT FROM staged.commercial_block
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_LOT_IDENTITY_CONFLICT';
  END IF;

  -- B6 já foi migrado anteriormente e precisa ser estritamente update in-place.
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities entity
        JOIN public.commercial_lots lot
          ON lot.entity_id = entity.id
          AND lot.project_id = entity.project_id
          AND lot.archived_at IS NULL
        JOIN public.map_entity_geometries geometry
          ON geometry.entity_id = entity.id
          AND geometry.project_id = entity.project_id
          AND geometry.is_current = true
        WHERE entity.project_id = project.id
          AND entity.parent_entity_id = (
            SELECT pavilion.id FROM public.map_entities pavilion
            WHERE pavilion.project_id = project.id
              AND pavilion.public_identifier = 'B6'
              AND pavilion.is_archived = false
          )
          AND entity.classification = 'INTERNAL_STAND'
          AND entity.is_archived = false
      ) <> 214
  ) THEN
    RAISE EXCEPTION 'PAVILION_3_UPDATE_IN_PLACE_PRECONDITION_FAILED';
  END IF;
END;
$$;

CREATE TEMP TABLE _p135_existing_target_lots ON COMMIT DROP AS
SELECT lot.id AS lot_id
FROM _p135_staged_modules staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
JOIN public.commercial_lots lot
  ON lot.entity_id = entity.id
  AND lot.project_id = entity.project_id
  AND lot.archived_at IS NULL;

SELECT lot.id
FROM public.commercial_lots lot
JOIN _p135_existing_target_lots target ON target.lot_id = lot.id
FOR UPDATE;

CREATE TEMP TABLE _p135_commercial_snapshot ON COMMIT DROP AS
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
JOIN _p135_existing_target_lots target ON target.lot_id = lot.id;

CREATE TEMP TABLE _p135_created_entities (entity_id uuid PRIMARY KEY) ON COMMIT DROP;

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
  FROM _p135_staged_modules staged
  WHERE staged.pavilion_identifier IN ('B1', 'B8')
    AND NOT EXISTS (
      SELECT 1 FROM public.map_entities entity
      WHERE entity.project_id = staged.project_id
        AND entity.public_identifier = staged.public_identifier
    )
  ON CONFLICT (project_id, public_identifier) DO NOTHING
  RETURNING id
)
INSERT INTO _p135_created_entities SELECT id FROM inserted;

-- Somente metadata estrutural é reparado. buyerDataImported, verificação e
-- todos os campos comerciais existentes permanecem intactos.
UPDATE public.map_entities entity
SET
  segment_id = staged.segment_id,
  metadata = (
    CASE WHEN staged.pavilion_identifier = 'B8'
      THEN COALESCE(entity.metadata, '{}'::jsonb)
        - 'segmentId' - 'segmentCode' - 'segmentName'
      ELSE COALESCE(entity.metadata, '{}'::jsonb)
    END
    - 'sourceDiscrepancy'
  ) || staged.structural_metadata,
  updated_at = transaction_timestamp()
FROM _p135_staged_modules staged
WHERE entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND (
    entity.segment_id IS DISTINCT FROM staged.segment_id
    OR entity.metadata IS DISTINCT FROM (
      (
        CASE WHEN staged.pavilion_identifier = 'B8'
          THEN COALESCE(entity.metadata, '{}'::jsonb)
            - 'segmentId' - 'segmentCode' - 'segmentName'
          ELSE COALESCE(entity.metadata, '{}'::jsonb)
        END
        - 'sourceDiscrepancy'
      ) || staged.structural_metadata
    )
  );

-- Persistência descritiva dos quatro espaços permanentes de B8; eles não
-- geram map_entities, lotes, preços, raycast ou inventário comercial.
WITH support_payload AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', support.id,
      'label', support.label,
      'kind', support.kind,
      'type', 'permanent-non-commercial',
      'normalizedFootprint', jsonb_build_object(
        'centerX', 0.02 + ((support.left_m + support.width_m / 2) / 25.5) * 0.96,
        'centerZ', 0.02 + ((support.top_m + support.depth_m / 2) / 43.5) * 0.96,
        'width', (support.width_m / 25.5) * 0.96,
        'depth', (support.depth_m / 43.5) * 0.96
      )
    )
    ORDER BY support.id
  ) AS payload
  FROM _p135_b8_support_spaces support
)
UPDATE public.map_entities pavilion
SET
  metadata = COALESCE(pavilion.metadata, '{}'::jsonb)
    || jsonb_build_object('internalSupportSpaces', support_payload.payload),
  updated_at = transaction_timestamp()
FROM public.map_projects project
CROSS JOIN support_payload
WHERE project.is_archived = false
  AND pavilion.project_id = project.id
  AND pavilion.public_identifier = 'B8'
  AND pavilion.classification = 'PAVILION'
  AND pavilion.is_archived = false
  AND pavilion.metadata->'internalSupportSpaces' IS DISTINCT FROM support_payload.payload;

CREATE TEMP TABLE _p135_entity_map ON COMMIT DROP AS
SELECT staged.*, entity.id AS entity_id
FROM _p135_staged_modules staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND entity.is_archived = false;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p135_entity_map)
      <> (SELECT count(*) FROM _p135_staged_modules)
  THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_ENTITY_BACKFILL_INCOMPLETE';
  END IF;
END;
$$;

-- O trigger de histórico permanece ativo. Apenas a trava de edição interativa é
-- suspensa de forma transacional durante a correção oficial.
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
  true, 'Plantas oficiais dos Pavilhões 1, 3 e 5 — Fenasoja 2026',
  NULL, transaction_timestamp(), transaction_timestamp()
FROM _p135_entity_map staged
WHERE staged.pavilion_identifier IN ('B1', 'B8')
  AND NOT EXISTS (
    SELECT 1 FROM public.map_entity_geometries geometry
    WHERE geometry.entity_id = staged.entity_id
      AND geometry.project_id = staged.project_id
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
  change_reason = 'Plantas oficiais dos Pavilhões 1, 3 e 5 — Fenasoja 2026',
  updated_at = transaction_timestamp()
FROM _p135_entity_map staged
WHERE geometry.entity_id = staged.entity_id
  AND geometry.project_id = staged.project_id
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

CREATE TEMP TABLE _p135_created_lots (
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
    gen_random_uuid(), staged.project_id, staged.entity_id, staged.public_identifier,
    staged.commercial_block, staged.lot_number, NULL, 'Módulo ' || staged.lot_number,
    NULL, 'BLOCKED', NULL, NULL, 'UNVALIDATED', NULL, NULL, '[]'::jsonb,
    false, false, false, false, true, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    transaction_timestamp(), transaction_timestamp()
  FROM _p135_entity_map staged
  WHERE staged.pavilion_identifier IN ('B1', 'B8')
    AND NOT EXISTS (
      SELECT 1 FROM public.commercial_lots lot
      WHERE lot.entity_id = staged.entity_id
        OR (lot.project_id = staged.project_id
          AND lot.public_identifier = staged.public_identifier)
    )
  ON CONFLICT DO NOTHING
  RETURNING id, project_id, entity_id
)
INSERT INTO _p135_created_lots SELECT id, project_id, entity_id FROM inserted;

INSERT INTO public.lot_prices (
  id, lot_id, pricing_mode, base_price, price_per_sqm,
  asking_price, minimum_price, is_active, valid_from, valid_until,
  created_by, created_at
)
SELECT
  gen_random_uuid(), created.lot_id, 'NOT_FOR_SALE',
  NULL, NULL, NULL, NULL, true, transaction_timestamp(), NULL, NULL,
  transaction_timestamp()
FROM _p135_created_lots created;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _p135_created_lots created
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
    FROM _p135_created_lots created
    LEFT JOIN public.lot_prices price
      ON price.lot_id = created.lot_id AND price.is_active = true
    WHERE price.id IS NULL
      OR price.pricing_mode <> 'NOT_FOR_SALE'
      OR price.base_price IS NOT NULL
      OR price.price_per_sqm IS NOT NULL
      OR price.asking_price IS NOT NULL
      OR price.minimum_price IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM _p135_created_lots created
    WHERE EXISTS (SELECT 1 FROM public.lot_reservations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_negotiations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_sales row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_contracts row WHERE row.lot_id = created.lot_id)
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_1_5_NEW_LOT_NEUTRALITY_INVALID';
  END IF;
END;
$$;

-- B1 acrescenta 189 entidades/lotes à comissão. B8 permanece sem segmento e
-- B6 não muda a cardinalidade. Todas as demais chaves e a linhagem são mantidas.
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
        segment.boundary_data->>'expectedEntityCount' IS NULL
        OR segment.boundary_data->>'expectedEntityCount' NOT IN ('797', '986')
        OR segment.boundary_data->>'expectedLotCount' IS NULL
        OR segment.boundary_data->>'expectedLotCount' NOT IN ('760', '949')
        OR segment.boundary_data->'lineageBaselineAt' IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'INDUSTRY_SEGMENT_PREVIOUS_BASELINE_INVALID';
  END IF;
END;
$$;

UPDATE public.map_segments segment
SET
  source_reference = 'Plantas oficiais dos Pavilhões 1, 3, 5, 12 e 14 — Fenasoja 2026',
  boundary_data = jsonb_set(
    jsonb_set(segment.boundary_data, '{expectedEntityCount}', '986'::jsonb, true),
    '{expectedLotCount}', '949'::jsonb, true
  ),
  updated_at = transaction_timestamp()
FROM public.map_projects project
WHERE project.id = segment.project_id
  AND project.is_archived = false
  AND segment.slug = 'industria-comercio-servicos'
  AND segment.is_active = true
  AND (
    segment.source_reference IS DISTINCT FROM
      'Plantas oficiais dos Pavilhões 1, 3, 5, 12 e 14 — Fenasoja 2026'
    OR segment.boundary_data->>'expectedEntityCount' IS DISTINCT FROM '986'
    OR segment.boundary_data->>'expectedLotCount' IS DISTINCT FROM '949'
  );

-- Verificação geométrica de módulos oficiais sem inventar área individual.
CREATE OR REPLACE FUNCTION public.set_map_entity_verification(
  p_entity_id uuid,
  p_status text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity public.map_entities%ROWTYPE;
  v_lot public.commercial_lots%ROWTYPE;
  v_org_id uuid;
  v_is_measurement_optional_pavilion_module boolean := false;
BEGIN
  SELECT * INTO v_entity
  FROM public.map_entities
  WHERE id = p_entity_id AND is_archived = false
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_ENTITY_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_entity.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.admin') THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF p_status NOT IN ('NEEDS_REVIEW', 'VERIFIED') THEN
    RAISE EXCEPTION 'INVALID_VERIFICATION_STATUS';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;

  IF p_status = 'VERIFIED' THEN
    IF (SELECT status FROM public.map_calibrations
      WHERE project_id = v_entity.project_id ORDER BY version DESC LIMIT 1)
      IS DISTINCT FROM 'VALIDATED'
    THEN
      RAISE EXCEPTION 'VALIDATED_CALIBRATION_REQUIRED';
    END IF;

    IF v_entity.is_sellable THEN
      SELECT * INTO v_lot
      FROM public.commercial_lots
      WHERE entity_id = v_entity.id AND archived_at IS NULL
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_LOT_NOT_FOUND'; END IF;

      v_is_measurement_optional_pavilion_module :=
        v_entity.classification = 'INTERNAL_STAND'
        AND upper(v_entity.public_identifier)
          = replace(upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        AND (
          (
            upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B1'
            AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
              ~ '^B1:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$'
          ) OR (
            upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B2'
            AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
              ~ '^B2:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$'
          ) OR (
            upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B3'
            AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
              ~ '^B3:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$'
          ) OR (
            upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B6'
            AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
              ~ '^B6:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
          ) OR (
            upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B8'
            AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
              ~ '^B8:MODULE:(00[1-9]|0[1-7][0-9]|08[01])$'
          )
        )
        AND EXISTS (
          SELECT 1
          FROM public.map_entities pavilion
          WHERE pavilion.id = v_entity.parent_entity_id
            AND pavilion.project_id = v_entity.project_id
            AND pavilion.classification = 'PAVILION'
            AND pavilion.is_archived = false
            AND upper(pavilion.public_identifier)
              = upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', ''))
        )
        AND upper(v_lot.public_identifier) = upper(v_entity.public_identifier)
        AND v_lot.lot_number = COALESCE(v_entity.metadata->>'lotNumber', '')
        AND v_lot.area_validation_status = 'UNVALIDATED'
        AND v_lot.official_area_sqm IS NULL
        AND v_lot.calculated_area_sqm IS NULL
        AND v_lot.frontage_meters IS NULL
        AND v_lot.depth_meters IS NULL;

      IF v_lot.area_validation_status <> 'VALIDATED'
        AND NOT v_is_measurement_optional_pavilion_module
      THEN
        RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED_FOR_VERIFICATION';
      END IF;
    END IF;
  END IF;

  UPDATE public.map_entities
  SET verification_status = p_status, updated_by = auth.uid(), updated_at = now()
  WHERE id = v_entity.id;

  INSERT INTO public.map_activity_logs (
    org_id, project_id, entity_id, action,
    before_state, after_state, reason, actor_user_id
  )
  VALUES (
    v_org_id, v_entity.project_id, v_entity.id, 'ENTITY_VERIFICATION_CHANGED',
    jsonb_build_object('status', v_entity.verification_status),
    jsonb_build_object(
      'status', p_status,
      'measurementOptional', v_is_measurement_optional_pavilion_module
    ),
    p_reason, auth.uid()
  );
  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_map_entity_verification(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_map_entity_verification(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_map_entity_verification(uuid, text, text) TO authenticated;

-- Validação final de identidade, geometria, segmentação e preservação.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    CROSS JOIN _p135_specs spec
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = spec.pavilion_identifier
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities entity
        WHERE entity.project_id = project.id
          AND entity.parent_entity_id = pavilion.id
          AND entity.classification = 'INTERNAL_STAND'
          AND entity.is_archived = false
      ) <> spec.module_count
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_FINAL_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p135_entity_map staged
    JOIN public.map_entities entity ON entity.id = staged.entity_id
    LEFT JOIN public.map_entity_geometries geometry
      ON geometry.entity_id = entity.id
      AND geometry.project_id = entity.project_id
      AND geometry.is_current = true
    LEFT JOIN public.commercial_lots lot
      ON lot.entity_id = entity.id
      AND lot.project_id = entity.project_id
      AND lot.archived_at IS NULL
    WHERE entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR entity.segment_id IS DISTINCT FROM staged.segment_id
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR geometry.id IS NULL
      OR geometry.geometry IS DISTINCT FROM staged.geometry
      OR geometry.rotation IS DISTINCT FROM staged.facing_radians
      OR lot.id IS NULL
      OR lot.public_identifier IS DISTINCT FROM staged.public_identifier
      OR lot.block IS DISTINCT FROM staged.commercial_block
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
      OR entity.metadata->'areaM2' IS DISTINCT FROM 'null'::jsonb
      OR (
        staged.pavilion_identifier = 'B8'
        AND (
          entity.segment_id IS NOT NULL
          OR entity.metadata ? 'segmentId'
          OR entity.metadata ? 'segmentCode'
          OR entity.metadata ? 'segmentName'
        )
      )
  ) THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_PERSISTED_STATE_INVALID';
  END IF;

  IF EXISTS (
    WITH expected_support_spaces AS (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', support.id,
          'label', support.label,
          'kind', support.kind,
          'type', 'permanent-non-commercial',
          'normalizedFootprint', jsonb_build_object(
            'centerX', 0.02 + ((support.left_m + support.width_m / 2) / 25.5) * 0.96,
            'centerZ', 0.02 + ((support.top_m + support.depth_m / 2) / 43.5) * 0.96,
            'width', (support.width_m / 25.5) * 0.96,
            'depth', (support.depth_m / 43.5) * 0.96
          )
        )
        ORDER BY support.id
      ) AS payload
      FROM _p135_b8_support_spaces support
    )
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = 'B8'
      AND pavilion.classification = 'PAVILION'
      AND pavilion.is_archived = false
    CROSS JOIN expected_support_spaces expected
    WHERE project.is_archived = false
      AND (
        pavilion.segment_id IS NOT NULL
        OR pavilion.metadata->'internalSupportSpaces' IS DISTINCT FROM expected.payload
      )
  ) THEN
    RAISE EXCEPTION 'PAVILION_5_SUPPORT_SPACE_PERSISTENCE_INVALID';
  END IF;

  IF public.resolve_commission_map_segment_slug(
      'B1-M189', jsonb_build_object('block', 'R', 'areaCode', 'EXPORURAL')
    ) IS DISTINCT FROM 'industria-comercio-servicos'
    OR public.resolve_commission_map_segment_slug(
      NULL, jsonb_build_object(
        'pavilionPublicIdentifier', 'B1',
        'pavilionModuleKey', 'B1:module:001',
        'areaCode', 'EXPORURAL'
      )
    ) IS DISTINCT FROM 'industria-comercio-servicos'
    OR public.resolve_commission_map_segment_slug(
      'B6-M111', jsonb_build_object('block', 'S', 'areaCode', 'EXPORURAL')
    ) IS DISTINCT FROM 'industria-comercio-servicos'
    OR public.resolve_commission_map_segment_slug(
      'B8-M001', jsonb_build_object('block', 'R', 'areaCode', 'EXPORURAL')
    ) IS NOT NULL
    OR public.resolve_commission_map_segment_slug(
      NULL, jsonb_build_object(
        'pavilionPublicIdentifier', 'B8',
        'pavilionModuleKey', 'B8:module:081',
        'areaCode', 'EXPORURAL'
      )
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'PAVILIONS_1_3_5_CANONICAL_RESOLVER_INVALID';
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
          'Plantas oficiais dos Pavilhões 1, 3, 5, 12 e 14 — Fenasoja 2026'
        OR segment.boundary_data->>'expectedEntityCount' IS DISTINCT FROM '986'
        OR segment.boundary_data->>'expectedLotCount' IS DISTINCT FROM '949'
        OR NOT public.map_segment_is_complete(segment.id)
      )
  ) THEN
    RAISE EXCEPTION 'INDUSTRY_SEGMENT_FINAL_INVENTORY_INVALID';
  END IF;

  IF (SELECT count(*) FROM _p135_exporural_snapshot)
      <> (SELECT count(*) FROM public.map_segments WHERE slug = 'exporural')
    OR EXISTS (
      SELECT 1
      FROM _p135_exporural_snapshot previous
      LEFT JOIN public.map_segments current ON current.id = previous.id
      WHERE current.id IS NULL OR to_jsonb(current) IS DISTINCT FROM previous.row_state
    )
  THEN
    RAISE EXCEPTION 'EXPORURAL_STATE_CHANGED_OUTSIDE_SCOPE';
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
      JOIN _p135_existing_target_lots target ON target.lot_id = lot.id
    )
    SELECT 1
    FROM _p135_commercial_snapshot previous
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
    RAISE EXCEPTION 'PAVILIONS_1_3_5_COMMERCIAL_STATE_CHANGED';
  END IF;
END;
$$;

COMMIT;
